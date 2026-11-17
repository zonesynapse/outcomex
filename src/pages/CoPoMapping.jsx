import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../firebase"; // Import db for Firestore
import { doc, getDoc, collection, onSnapshot, setDoc, updateDoc, deleteField, getDocs } from "firebase/firestore"; // Firestore imports
import { 
  ChevronDown, 
  Download, 
  CheckCircle2, 
  X, 
  AlertCircle,
  PlusCircle,
  Edit2,
  Trash2,
  Save
} from "lucide-react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, formatProgDisplay } from "../lib/utils";

const SEMESTER_MAPPING = {
  0: ["1st Semester", "2nd Semester"],
  1: ["3rd Semester", "4th Semester"],
  2: ["5th Semester", "6th Semester"],
  3: ["7th Semester", "8th Semester"]
};

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

const parseSubjectCodeKey = (val) => {
  if (!val) return '';
  if (typeof val === 'object') {
    val = val.code || val.CODE || val.subjectCode || val.courseCode || '';
  }
  let str = String(val).trim();
  if (!str || str.startsWith('{') || str.startsWith('[') || str.includes('OBJECT')) return '';
  if (str.includes(' - ')) {
    str = str.split(' - ')[0].trim();
  }
  return str.split(/\s+/)[0].trim().toUpperCase();
};

const yearStartOf = (s) => String(s || '').match(/(19|20)\d{2}/)?.[0] || '';

const extractMarksDocMeta = (d) => {
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
    exam: data.exam || m.exam || qm.exam || qm.qpaper_name || '',
    examName: data.exam_name || m.exam_name || qm.exam_name || '',
    isUniversity: !!(data.is_university || m.is_university || data.isUniversity || m.isUniversity),
    isIndirectAssessment: !!(data.is_indirect || m.is_indirect || data.isIndirectAssessment || m.isIndirectAssessment),
    students: data.students || {}
  };
};

const matchesMarksSelection = (docMeta, { programme, department, batch, academicYear, semester, subject, section }) => {
  const norm = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');

  if (programme && docMeta.programme && norm(docMeta.programme) !== norm(programme)) return false;
  if (department && docMeta.department && norm(docMeta.department) !== norm(department)) return false;
  if (batch && docMeta.batch) {
    const y1 = yearStartOf(docMeta.batch), y2 = yearStartOf(batch);
    if (y1 && y2) { if (y1 !== y2) return false; }
    else if (norm(docMeta.batch) !== norm(batch)) return false;
  }
  if (academicYear && docMeta.academicYear) {
    const y1 = yearStartOf(docMeta.academicYear), y2 = yearStartOf(academicYear);
    if (y1 && y2) { if (y1 !== y2) return false; }
    else if (norm(docMeta.academicYear) !== norm(academicYear)) return false;
  }
  if (semester && docMeta.semesterLabel) {
    const m1 = String(docMeta.semesterLabel).match(/(\d+)/);
    const m2 = String(semester).match(/(\d+)/);
    if (m1 && m2 && m1[1] !== m2[1]) return false;
  }
  if (section && docMeta.section && docMeta.section !== 'all' && norm(docMeta.section) !== norm(section)) return false;

  if (subject && docMeta.subject) {
    const selectedSubCode = parseSubjectCodeKey(subject);
    const docSubCode = parseSubjectCodeKey(docMeta.subject);
    if (selectedSubCode && docSubCode && selectedSubCode !== docSubCode) return false;
  }

  return true;
};

export default function CoPoMapping() {
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);
  const [batch, setBatch] = useState("");
  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [subject, setSubject] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [userRole, setUserRole] = useState(null);
  const [assignedProgs, setAssignedProgs] = useState([]);
  const [assignedDepts, setAssignedDepts] = useState([]);
  const [section, setSection] = useState("");
  const [sectionConfigs, setSectionConfigs] = useState({});

  useEffect(() => {
    let unsubscribeAssignments = null;

    const user = auth.currentUser;
    if (user) {
      const userRef = doc(db, 'users', user.uid); // Firestore doc reference
      getDoc(userRef).then(snapshot => { // Use getDoc for Firestore
        if (snapshot.exists()) {
          const userData = snapshot.data(); // Use .data() for Firestore documents
          setUserRole(userData.role);
          const assignmentsRef = collection(db, 'subject_assignments');
            const unsubscribe = onSnapshot(assignmentsRef, (assignSnap) => {
              const progs = new Set();
              const depts = new Set();

              assignSnap.forEach(d => {
                const assignmentData = d.data();
                if (assignmentData[user.uid]) {
                  const idParts = d.id.split('_');
                  if (idParts.length >= 5) {
                    progs.add(idParts[0]);
                    // structure: PROG_DEPT_BATCH_AY_SEM[_SEC]
                    // if SEC exists, length is 6+, else 5
                    const hasSec = idParts.length > 5;
                    const deptKey = idParts.slice(1, hasSec ? -4 : -3).join('_');
                    depts.add(deptKey);
                  }
                }
              });
              setAssignedProgs(Array.from(progs));
              setAssignedDepts(Array.from(depts));
            });
            unsubscribeAssignments = unsubscribe;
        }
      });
    }

    return () => {
      if (unsubscribeAssignments) {
        unsubscribeAssignments();
      }
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

  const [poList, setPoList] = useState([]);
  const [psoList, setPsoList] = useState([]);
  const [coList, setCoList] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [mappingCutoff, setMappingCutoff] = useState(50);
  const [mappingThresholds, setMappingThresholds] = useState([
    { level: 3, min: 71, max: 100 },
    { level: 2, min: 61, max: 70 },
    { level: 1, min: 51, max: 60 },
    { level: 0, min: 0, max: 50 },
  ]);
  const [mappingPercentageSplit, setMappingPercentageSplit] = useState({ internal: 40, university: 60 });
  const [mappingDirectIndirectSplit, setMappingDirectIndirectSplit] = useState({ direct: 80, indirect: 20 });

  const [finalOverallAtt, setFinalOverallAtt] = useState({});
  // eslint-disable-next-line no-unused-vars
  const [loadingFinal, setLoadingFinal] = useState(false);
  const [ciaConfigs, setCiaConfigs] = useState({});

  const [actionsTaken, setActionsTaken] = useState({});
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [actionText, setActionText] = useState("");
  const [isSavingAction, setIsSavingAction] = useState(false);

  const batches = useMemo(() => {
    const progKey = formatProgrammeKey(programme);
    return getActiveBatches(progKey);
  }, [programme, getActiveBatches]);

  const regulation = useMemo(() => {
    if (batch && programme) {
      const progKey = formatProgrammeKey(programme);
      return getRegulationForBatch(progKey, batch) || "";
    }
    return "";
  }, [batch, programme, getRegulationForBatch]);

  useEffect(() => {
    if (!batch || !programme || !department || !regulation) {
      setActionsTaken({});
      return;
    }

    const progKey = sanitizeKey(programme);
    const deptKey = sanitizeKey(department);
    const batchKey = sanitizeKey(batch);
    const regKey = sanitizeKey(regulation);
    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    
    const actionsRef = doc(db, 'po_actions_taken', `${progKey}_${deptKey}_${batchKey}_${regKey}${sectionSuffix}`);

    const unsubscribe = onSnapshot(actionsRef, (snapshot) => { // Use onSnapshot for real-time updates
      if (snapshot.exists()) {
        setActionsTaken(snapshot.data()); // Use .data() for Firestore documents
      } else {
        setActionsTaken({});
      }
    });

    return () => unsubscribe();
  }, [batch, programme, department, regulation, section]);

  const handleOpenActionModal = (outcomeCode, name, currentValue, targetValue) => {
    setSelectedOutcome({ code: outcomeCode, name: name, value: currentValue, targetValue: targetValue });
    setActionText(actionsTaken[outcomeCode]?.action || "");
    setIsActionModalOpen(true);
  };

  const handleSaveAction = async () => {
    if (!selectedOutcome || !actionText.trim()) return;
    setIsSavingAction(true);
    try {
      const progKey = sanitizeKey(programme);
      const deptKey = sanitizeKey(department);
      const batchKey = sanitizeKey(batch);
      const regKey = sanitizeKey(regulation);
      const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';

      const actionRef = doc(db, 'po_actions_taken', `${progKey}_${deptKey}_${batchKey}_${regKey}${sectionSuffix}`);

      await setDoc(actionRef, {
        [selectedOutcome.code]: {
          outcomeCode: selectedOutcome.code,
          action: actionText,
          updatedAt: new Date().toISOString(),
          updatedBy: auth.currentUser?.uid
        }
      }, { merge: true });
      
      setIsActionModalOpen(false); // Close modal after saving
    } catch (error) {
      console.error("Error saving action taken:", error);
      alert("Failed to save action plan. Please try again.");
    } finally {
      setIsSavingAction(false);
    }
  };

  const handleDeleteAction = async (outcomeCode) => {
    if (!outcomeCode || !window.confirm("Are you sure you want to delete this action plan?")) return;
    try {
      const progKey = sanitizeKey(programme);
      const deptKey = sanitizeKey(department);
      const batchKey = sanitizeKey(batch);
      const regKey = sanitizeKey(regulation);
      const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';

      const actionRef = doc(db, 'po_actions_taken', `${progKey}_${deptKey}_${batchKey}_${regKey}${sectionSuffix}`);
      await updateDoc(actionRef, { [outcomeCode]: deleteField() });
    } catch (error) {
      console.error("Error deleting action plan:", error);
      alert("Failed to delete action plan.");
    }
  };

  // Fetch cia_configs once so we can resolve indirect/university flags reliably
  useEffect(() => {
    const fetchCiaConfigs = async () => {
      try {
        const snap = await getDocs(collection(db, 'cia_configs'));
        const data = {};
        snap.forEach(doc => {
          const d = doc.data();
          data[doc.id] = d;
          if (d.examName) {
            data[d.examName] = d;
            data[d.examName.toLowerCase()] = d;
          }
        });
        setCiaConfigs(data);
      } catch (err) {
        console.error('Error fetching cia_configs:', err);
        setCiaConfigs({});
      }
    };
    fetchCiaConfigs();
  }, []);

  const academicYears = useMemo(() => getAcademicYears(batch), [batch]);
  
  const summaryKey = useMemo(() => {
    if (!batch || !programme || !regulation || !subject || !academicYear || !semester) return "";
    const progKey = formatProgrammeKey(programme);
    const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
    return `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(regulation)}_${sanitizeKey(subject)}_${sanitizeKey(academicYear)}_${sanitizeKey(semester)}${sectionSuffix}`;
  }, [batch, programme, regulation, subject, academicYear, semester, section]);

  const getSemesters = () => {
    if (!academicYear || !batch) return [];
    const [batchStart] = batch.split("-").map(Number);
    const [yearStart] = academicYear.split("-").map(Number);
    const yearIndex = yearStart - batchStart;
    return SEMESTER_MAPPING[yearIndex] || [];
  };

  const hasAssignments = assignedProgs.length > 0;

  const filteredProgrammes = Object.keys(PROGRAMME_DEPARTMENTS).filter(prog => {
    if (hasAssignments) return assignedProgs.includes(formatProgrammeKey(prog));
    return true;
  });

  const filteredDepartments = (PROGRAMME_DEPARTMENTS[programme] || []).filter(dept => {
    if (hasAssignments) return assignedDepts.includes(sanitizeKey(dept));
    return true;
  });

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

  const deriveSemesterNumber = (label) => {
    if (!label) return '';
    const m = String(label).match(/(\d+)/);
    return m ? m[1] : '';
  };

  // Fetch Subjects from Syllabus
  useEffect(() => {
    const fetchSubjects = async () => {
      const progKey = formatProgrammeKey(programme);
      const currentReg = regulation || getRegulationForBatch(progKey, batch);
      if (!programme || !department || !currentReg || !semester) {
        setSubjects([]);
        return;
      }
      const deptKey = sanitizeKey(department);
      const regKey = sanitizeKey(currentReg);
      const syllabusKey = `${progKey}_${deptKey}_${regKey}`;
      const semNum = deriveSemesterNumber(semester);

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

        const userRef = doc(db, 'users', currentUser.uid); // Firestore doc reference
        const userSnap = await getDoc(userRef); // Use getDoc for Firestore
        const userRole = userSnap.exists() ? userSnap.data().role : null;

        const sectionSuffixAssignment = section ? `_${sanitizeKey(section)}` : '';
        const assignmentCompositeKey = `${progKey}_${deptKey}_${sanitizeKey(batch)}_${sanitizeKey(academicYear || '')}_${semNum}${sectionSuffixAssignment}`;
        const assignmentRef = doc(db, 'subject_assignments', assignmentCompositeKey); // Firestore flat key path
        const assignmentSnap = await getDoc(assignmentRef); // Use getDoc for Firestore
        
        if (assignmentSnap.exists()) {
          const assignments = assignmentSnap.data(); // Use .data() for Firestore documents
          
          if (userRole === 'Admin' || userRole === 'Principal') {
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
  }, [programme, department, batch, regulation, semester, academicYear, section, getRegulationForBatch]);

  useEffect(() => {
    const fetchData = async () => {
      if (!batch || !programme || !department || !regulation || !subject || !academicYear || !semester) {
        setPoList([]);
        setPsoList([]);
        setCoList([]);
        setSummary({});
        return;
      }

      setLoading(true);
      try {
        const progKey = formatProgrammeKey(programme);
        
        // Fetch PO/PSO
        const poPsoKey = `${progKey}_${sanitizeKey(regulation)}__${sanitizeKey(department)}`;
        const poPsoRef = doc(db, 'po_pso', poPsoKey);
        const poPsoSnap = await getDoc(poPsoRef);
        const poPsoData = poPsoSnap.data() || {};

        const pos = (poPsoData.po_statements || []).map((po, idx) => ({
          code: `PO${idx + 1}`,
          description: po.statement,
          label: `PO${idx + 1}`
        }));
        const psos = (poPsoData.pso_statements || []).map((pso, idx) => ({
          code: `PSO${pos.length + idx + 1}`,
          label: `PSO${idx + 1}`,
          description: pso.statement
        }));

        setPoList(pos);
        setPsoList(psos);

        // Fetch COs
        const coKey = `${sanitizeKey(department)}_${sanitizeKey(regulation)}_${sanitizeKey(subject)}_${sanitizeKey(academicYear)}`;
        const coRef = doc(db, 'course_outcomes', coKey);
        const coSnap = await getDoc(coRef);
        const coData = coSnap.data() || {};
        
        const cos = Object.keys(coData)
          .filter(k => k.startsWith('CO'))
          .sort((a, b) => parseInt(a.replace('CO', '')) - parseInt(b.replace('CO', '')))
          .map(k => {
            const val = coData[k];
            return { 
              code: k, 
              description: typeof val === 'object' && val !== null ? val.description : val 
            };
          });
        
        setCoList(cos);
        
        // Fetch Summary
        if (summaryKey) {
          const summaryRef = doc(db, 'mapping_summary', summaryKey);
          const summarySnap = await getDoc(summaryRef);
          let summaryData = summarySnap.data() || {};

          // Fallback if section-specific key does not have thresholds or split configured
          if ((!summaryData.thresholds || !summaryData.directIndirectSplit || !summaryData.percentageSplit) && section) {
            const progKey = formatProgrammeKey(programme);
            const noSecKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(regulation)}_${sanitizeKey(subject)}_${sanitizeKey(academicYear)}_${sanitizeKey(semester)}`;
            const fallbackSnap = await getDoc(doc(db, 'mapping_summary', noSecKey));
            if (fallbackSnap.exists()) {
              const fbData = fallbackSnap.data() || {};
              summaryData = { ...fbData, ...summaryData };
              if (!summaryData.thresholds && fbData.thresholds) summaryData.thresholds = fbData.thresholds;
              if (!summaryData.directIndirectSplit && fbData.directIndirectSplit) summaryData.directIndirectSplit = fbData.directIndirectSplit;
              if (!summaryData.percentageSplit && fbData.percentageSplit) summaryData.percentageSplit = fbData.percentageSplit;
              if (summaryData.cutoff === undefined && fbData.cutoff !== undefined) summaryData.cutoff = fbData.cutoff;
            }
          }
          
          setSummary(summaryData.summary || {});
          if (summaryData.cutoff !== undefined && summaryData.cutoff !== "" && summaryData.cutoff !== null) {
            setMappingCutoff(Number(summaryData.cutoff));
          } else {
            setMappingCutoff(50);
          }
          if (summaryData.thresholds && Array.isArray(summaryData.thresholds) && summaryData.thresholds.length > 0) {
            setMappingThresholds(summaryData.thresholds);
          }
          if (summaryData.percentageSplit) {
            setMappingPercentageSplit({
              internal: Number(summaryData.percentageSplit.internal ?? 40),
              university: Number(summaryData.percentageSplit.university ?? 60)
            });
          }
          if (summaryData.directIndirectSplit) {
            setMappingDirectIndirectSplit({
              direct: Number(summaryData.directIndirectSplit.direct ?? 80),
              indirect: Number(summaryData.directIndirectSplit.indirect ?? 20)
            });
          }
        }

      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [batch, programme, department, regulation, subject, academicYear, semester, section, summaryKey]);

  // Compute final CO attainment (Direct + Indirect) for this subject so PO attainment can be calculated
  useEffect(() => {
    if (!batch || !programme || !department || !subject || !academicYear || !semester) {
      setFinalOverallAtt({});
      return;
    }

    setLoadingFinal(true);
    let isCancelled = false;

    const subCode = parseSubjectCodeKey(subject);
    const targetSubjects = Array.from(new Set([subject, subCode].filter(Boolean)));
    const targetSections = section ? [section, ''] : [''];

    const candidateDocIds = [];
    targetSubjects.forEach(sub => {
      targetSections.forEach(sec => {
        const id = [batch, programme, department, sub, academicYear, semester].map(sanitizeKey).join('_') + (sec ? `_${sanitizeKey(sec)}` : '');
        if (!candidateDocIds.includes(id)) candidateDocIds.push(id);
      });
    });

    const primaryDocId = candidateDocIds[0] || [batch, programme, department, subject, academicYear, semester].map(sanitizeKey).join('_') + (section ? `_${sanitizeKey(section)}` : '');

    const unsub = onSnapshot(collection(db, 'co_attainment', primaryDocId, 'exams'), async (snap) => {
      if (isCancelled) return;

      let children = [];
      const seenExamKeys = new Set();

      const parseChildDoc = (docSnap, isLegacy = false) => {
        const eData = typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data;
        if (!eData) return null;
        const m = eData._meta || {};
        let label = m.exam_name || m.exam || m.qpaper_name || docSnap.id;
        if (m.exam && ciaConfigs[m.exam]?.examName) label = ciaConfigs[m.exam].examName;
        if (m.qpaper_name && ciaConfigs[m.qpaper_name]?.examName) label = ciaConfigs[m.qpaper_name].examName;

        const isUniversity = !!(
          m.is_university ||
          m.isUniversity ||
          (m.qpaper_name && ciaConfigs[m.qpaper_name] && (ciaConfigs[m.qpaper_name].is_university || ciaConfigs[m.qpaper_name].isUniversity)) ||
          (m.exam && ciaConfigs[m.exam] && (ciaConfigs[m.exam].is_university || ciaConfigs[m.exam].isUniversity)) ||
          String(m.exam || '').toLowerCase().includes('uni') ||
          String(m.exam_name || '').toLowerCase().includes('uni') ||
          String(label || '').toLowerCase().includes('uni')
        );

        const isIndirect = !!(
          m.isIndirectAssessment ||
          m.is_indirect ||
          m.isIndirect ||
          (m.qpaper_name && (ciaConfigs[m.qpaper_name]?.isIndirectAssessment || ciaConfigs[m.qpaper_name]?.isIndirect)) ||
          (m.exam && (ciaConfigs[m.exam]?.isIndirectAssessment || ciaConfigs[m.exam]?.isIndirect)) ||
          (m.exam_name && (ciaConfigs[m.exam_name]?.isIndirectAssessment || ciaConfigs[m.exam_name]?.isIndirect)) ||
          /indirect|survey|exit|ces/i.test(String(label || m.exam || m.exam_name || docSnap.id || '')) ||
          Object.values(ciaConfigs || {}).some(cfg => 
            (cfg?.isIndirectAssessment || cfg?.isIndirect) && (
              cfg?.examName === m.exam ||
              cfg?.examName === m.exam_name ||
              cfg?.examName === label ||
              (cfg?.examName && String(label || m.exam || '').toLowerCase().includes(String(cfg.examName).toLowerCase()))
            )
          )
        );

        return { key: docSnap.id, data: eData, isUniversity, isIndirect, label };
      };

      // Add exams from primary collection snapshot
      snap.forEach(eDoc => {
        const parsed = parseChildDoc(eDoc);
        if (parsed) {
          const normKey = String(parsed.label || parsed.key).toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!seenExamKeys.has(normKey)) {
            seenExamKeys.add(normKey);
            children.push(parsed);
          }
        }
      });

      // If primary doc was empty or missing indirect, probe other candidate IDs
      for (const candId of candidateDocIds) {
        if (candId === primaryDocId) continue;
        const hasIndirectChild = children.some(c => c.isIndirect);
        if (children.length > 0 && hasIndirectChild) break;
        try {
          const candExamsSnap = await getDocs(collection(db, 'co_attainment', candId, 'exams'));
          candExamsSnap.forEach(eDoc => {
            const parsed = parseChildDoc(eDoc);
            if (parsed) {
              const normKey = String(parsed.label || parsed.key).toLowerCase().replace(/[^a-z0-9]/g, '');
              if (!seenExamKeys.has(normKey)) {
                seenExamKeys.add(normKey);
                children.push(parsed);
              }
            }
          });
        } catch (_) {}
      }

      // Root doc check
      try {
        const rootSnap = await getDoc(doc(db, 'co_attainment', primaryDocId));
        if (rootSnap.exists()) {
          const rData = rootSnap.data();
          if (rData?.co_max_marks || rData?.students) {
            const parsed = parseChildDoc({ id: '_legacy', data: rData }, true);
            if (parsed) {
              const normKey = String(parsed.label || parsed.key).toLowerCase().replace(/[^a-z0-9]/g, '');
              if (!seenExamKeys.has(normKey)) {
                seenExamKeys.add(normKey);
                children.push(parsed);
              }
            }
          }
        }
      } catch (_) {}

      // Fallback: check `marks` collection for any exams not already present (especially indirect survey)
      try {
        const mSnap = await getDocs(collection(db, 'marks'));
        mSnap.forEach(d => {
          const docMeta = extractMarksDocMeta(d);
          if (!matchesMarksSelection(docMeta, { programme, department, batch, academicYear, semester, subject, section })) return;
          const data = d.data() || {};
          const students = data.students || {};
          const label = docMeta.examName || docMeta.exam || d.id;
          const normLabel = String(label).toLowerCase().replace(/[^a-z0-9]/g, '');
          if (seenExamKeys.has(normLabel)) return;

          const isIndirect = docMeta.isIndirectAssessment || /indirect|survey|exit|ces/i.test(String(label));
          const isUni = docMeta.isUniversity || /university|ese|end\s*sem/i.test(String(label));

          const studentCoMarks = {};
          Object.entries(students).forEach(([reg, sData]) => {
            if (reg.startsWith('_') || !sData) return;
            const entry = { name: sData.name || '' };
            Object.keys(sData).forEach(k => {
              if (/^CO\d+/i.test(k)) {
                const val = Number(sData[k]);
                if (!isNaN(val)) entry[k.trim().toUpperCase()] = val;
              }
            });
            studentCoMarks[reg] = entry;
          });

          const coMax = {};
          ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].forEach(co => {
            coMax[co] = isIndirect ? 3 : (data.co_max_marks?.[co] || 100);
          });

          seenExamKeys.add(normLabel);
          children.push({
            key: d.id,
            data: {
              _meta: { ...data._meta, exam: label, exam_name: label, is_indirect: isIndirect, is_university: isUni },
              students: studentCoMarks,
              co_max_marks: data.co_max_marks || coMax
            },
            isUniversity: isUni,
            isIndirect,
            label
          });
        });
      } catch (err) {
        console.warn('Marks fallback error in CoPoMapping:', err);
      }

      if (children.length === 0) {
        setFinalOverallAtt({});
        setLoadingFinal(false);
        return;
      }

      // sort by saved/updated desc
      children.sort((a, b) => {
        const ta = new Date(a.data._meta?.updated_at || a.data._meta?.saved_at || 0).getTime();
        const tb = new Date(b.data._meta?.updated_at || b.data._meta?.saved_at || 0).getTime();
        return tb - ta;
      });

      // Separate into internal, university, and indirect assessments
      const internalChildren = children.filter(c => !c.isUniversity && !c.isIndirect);
      const uniChild = children.find(c => c.isUniversity);
      const indirectChildren = children.filter(c => c.isIndirect);

      if (internalChildren.length === 0 && !uniChild) {
        setFinalOverallAtt({});
        setLoadingFinal(false);
        return;
      }

      const split = mappingPercentageSplit || { internal: 40, university: 60 };
      const pctI = (split.internal || 100) / 100;
      const pctU = (split.university || 0) / 100;

      // 1. Direct cumulative internal marks & cumulative max marks per student
      const totalInternal = {};
      const totalIMax = {};

      if (internalChildren.length > 0) {
        internalChildren.forEach(child => {
          Object.entries(child.data.students || {}).forEach(([reg, sdata]) => {
            if (!totalInternal[reg]) totalInternal[reg] = { name: sdata.name || '' };
            Object.entries(sdata).forEach(([k, v]) => {
              if (/^CO\d+/i.test(k) && typeof v === 'number') {
                totalInternal[reg][k.toUpperCase()] = (totalInternal[reg][k.toUpperCase()] || 0) + v;
              }
            });
          });
          Object.entries(child.data.co_max_marks || {}).forEach(([k, v]) => {
            totalIMax[k.toUpperCase()] = (totalIMax[k.toUpperCase()] || 0) + Number(v || 0);
          });
        });
      }

      const studentRegs = new Set([
        ...Object.keys(totalInternal),
        ...Object.keys(uniChild?.data.students || {})
      ]);
      const consolidationStudentTotals = {};
      const uMax = {};
      Object.entries(uniChild?.data.co_max_marks || {}).forEach(([k, v]) => {
        uMax[k.toUpperCase()] = Number(v || 0);
      });

      studentRegs.forEach(reg => {
        const iData = totalInternal[reg] || {};
        const uData = uniChild?.data.students?.[reg] || {};
        const entry = { name: iData.name || uData.name || '' };

        const coKeys = Array.from(new Set([
          ...Object.keys(iData).filter(k => /^CO\d+/i.test(k)),
          ...Object.keys(uData).filter(k => /^CO\d+/i.test(k)).map(k => k.toUpperCase())
        ]));

        coKeys.forEach(k => {
          const iv = Number(iData[k] || 0);
          const uv = Number(uData[k] || uData[k.toLowerCase()] || 0);

          let im = Number(totalIMax[k] || 0);
          let um = Number(uMax[k] || 0);

          const observedIMax = Math.max(0, ...Object.values(totalInternal).map(s => Number(s[k] || 0)));
          if (im <= 1 || (observedIMax > 0 && im < observedIMax)) {
            if (observedIMax <= 20.5) im = 20;
            else if (observedIMax <= 25) im = 25;
            else if (observedIMax <= 50) im = 50;
            else if (observedIMax <= 100) im = 100;
            else im = Math.ceil(observedIMax);
          }

          const observedUMax = Math.max(0, ...Object.values(uniChild?.data.students || {}).map(s => Number(s[k] || s[k.toLowerCase()] || 0)));
          if (um <= 1 || (observedUMax > 0 && um < observedUMax)) {
            if (observedUMax <= 50) um = 50;
            else if (observedUMax <= 100) um = 100;
            else um = Math.ceil(observedUMax);
          }

          const iv_pct = im > 0 ? (iv / im) * 100 : 0;
          const uv_pct = um > 0 ? (uv / um) * 100 : 0;

          const finalPct = uniChild 
            ? Math.round((iv_pct * pctI) + (uv_pct * pctU))
            : Math.round(iv_pct);
          entry[k] = Math.min(100, Math.max(0, finalPct));
        });
        consolidationStudentTotals[reg] = entry;
      });

      // 2. Direct Attainment per CO
      const allCoKeys = Array.from(new Set([
        ...Object.keys(totalIMax),
        ...Object.keys(uMax)
      ])).sort((a, b) => {
        const na = Number(a.replace(/[^0-9]/g, '')) || 0;
        const nb = Number(b.replace(/[^0-9]/g, '')) || 0;
        return na - nb;
      });

      const effectiveCutoff = Number(mappingCutoff) > 0 ? Number(mappingCutoff) : 50;
      const effectiveThresholds = mappingThresholds.length > 0 ? mappingThresholds : [
        { min: 71, max: 100, level: 3 },
        { min: 61, max: 70, level: 2 },
        { min: 51, max: 60, level: 1 },
        { min: 0, max: 50, level: 0 }
      ];

      const directAttainmentStats = {};
      const studentTotalValues = Object.values(consolidationStudentTotals);
      const totalStudents = studentTotalValues.length;

      allCoKeys.forEach(co => {
        let countGreaterEqual = 0;
        let countLess = 0;

        studentTotalValues.forEach(s => {
          const markPct = s[co] || 0;
          if (markPct >= effectiveCutoff) {
            countGreaterEqual++;
          } else {
            countLess++;
          }
        });

        const percentage = totalStudents > 0 ? (countGreaterEqual / totalStudents) * 100 : 0;
        let attainmentLevel = 0;
        const threshold = effectiveThresholds.find(t => percentage >= t.min && percentage <= t.max);
        if (threshold) attainmentLevel = threshold.level;

        directAttainmentStats[co] = {
          countGreaterEqual,
          countLess,
          percentage: percentage.toFixed(2),
          attainmentLevel
        };
      });

      // 3. Indirect Attainment Mean per CO
      const diSplit = mappingDirectIndirectSplit || { direct: 80, indirect: 20 };
      const pctDirectTotal = (diSplit.direct || 80) / 100;
      const pctIndirectTotal = (diSplit.indirect || 20) / 100;

      const finalStats = {};
      allCoKeys.forEach(co => {
        const directLevel = directAttainmentStats[co]?.attainmentLevel || 0;

        const studentIndirectScores = {};
        indirectChildren.forEach(child => {
          const studs = child.data.students || {};
          const maxMarksMap = child.data.co_max_marks || {};
          const mm = Number(maxMarksMap[co] ?? maxMarksMap[co.toLowerCase()] ?? maxMarksMap[co.toUpperCase()] ?? 3);
          Object.entries(studs).forEach(([regKey, s]) => {
            if (s?.absent) return;
            const rawVal = s?.[co] ?? s?.[co.toLowerCase()] ?? s?.[co.toUpperCase()];
            if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
              const raw = Number(rawVal);
              if (!isNaN(raw)) {
                const normalized = mm > 0 ? Math.min(3, (raw / mm) * 3) : Math.min(3, raw);
                if (studentIndirectScores[regKey] === undefined || normalized > studentIndirectScores[regKey]) {
                  studentIndirectScores[regKey] = normalized;
                }
              }
            }
          });
        });

        const indirectScores = Object.values(studentIndirectScores);
        const indirectMean = indirectScores.length > 0 
          ? (indirectScores.reduce((sum, v) => sum + v, 0) / indirectScores.length) 
          : 0;
        const hasIndirect = indirectChildren.length > 0 && indirectScores.length > 0;
        const finalLevel = hasIndirect 
          ? (directLevel * pctDirectTotal) + (indirectMean * pctIndirectTotal)
          : directLevel;

        finalStats[co] = {
          directLevel,
          indirectMean: Number(indirectMean.toFixed(2)),
          finalLevel: Number(finalLevel.toFixed(2)),
          directPct: diSplit.direct,
          indirectPct: diSplit.indirect
        };
      });

      setFinalOverallAtt(finalStats);
      setLoadingFinal(false);
    }, (error) => {
      console.error('Error listening to co_attainment:', error);
      setFinalOverallAtt({});
      setLoadingFinal(false);
    });

    return () => {
      isCancelled = true;
      unsub();
    };
  }, [batch, programme, department, subject, academicYear, semester, section, mappingDirectIndirectSplit, mappingPercentageSplit, mappingThresholds, mappingCutoff, ciaConfigs]);

  const calculateMappingGrade = (marked, total) => {
    if (!total || total === 0) return 0;
    const percentage = (marked / total) * 100;
    if (percentage >= 66) return 3;
    if (percentage >= 33) return 2;
    if (percentage >= 1) return 1;
    return 0;
  };

  const handleDownloadExcel = () => {
    const table = document.getElementById("copo-table");
    if (!table) {
      alert("No table available to download!");
      return;
    }

    const wb = XLSX.utils.table_to_book(table, { sheet: "CO-PO Mapping" });
    XLSX.writeFile(wb, `CO_PO_Mapping_${subject}_${batch}.xlsx`);
    
    setSuccessMessage("Downloaded successfully!");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const coCodes = useMemo(() => {
    const fromCoList = coList.map(co => co.code);
    if (fromCoList.length > 0) return fromCoList;
    // Fallback: use COs from summary or attainment data
    const codes = new Set();
    Object.values(summary || {}).forEach(data => {
      if (data.co_counts) Object.keys(data.co_counts).forEach(c => codes.add(c));
    });
    Object.keys(finalOverallAtt || {}).forEach(c => codes.add(c));
    return Array.from(codes).sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0));
  }, [coList, summary, finalOverallAtt]);

  const renderRow = (label, data) => {
    const totalPIs = data?.total_pis || 0;

    // Build marked counts and mapping grades per CO
    const markedCounts = coCodes.map(co => data?.co_counts?.[co] || 0);
    const mappingGrades = markedCounts.map(mc => calculateMappingGrade(mc, totalPIs));

    // Mapping average (average of non-zero mapping grades)
    const nonZeroMapping = mappingGrades.filter(v => v > 0);
    const mappingAvgNum = nonZeroMapping.length > 0 ? (nonZeroMapping.reduce((a, b) => a + b, 0) / nonZeroMapping.length) : 0;
    const mappingAvgStr = mappingAvgNum > 0 ? mappingAvgNum.toFixed(2) : '';

    // PO contributions per CO: (grade * coFinalLevel) / 3
    const contributions = coCodes.map((co, idx) => {
      const coFinalObj = finalOverallAtt && finalOverallAtt[co];
      const coFinalNum = coFinalObj ? Number(coFinalObj.finalLevel) : 0;
      const grade = mappingGrades[idx] || 0;
      const contrib = grade > 0 && coFinalNum > 0 ? (grade * coFinalNum) / 3 : 0;
      return contrib;
    });

    const mappedContribs = coCodes.map((_, idx) => mappingGrades[idx] > 0 ? contributions[idx] : null).filter(v => v !== null);
    const poAvgNum = mappedContribs.length > 0 ? (mappedContribs.reduce((a, b) => a + b, 0) / mappedContribs.length) : 0;
    const hasFirstAverage = mappingAvgNum > 0;
    const hasSecondAverage = mappedContribs.length > 0;
    const hasAnyMappedCo = markedCounts.some(mc => mc > 0);
    const mappedCoHasData = coCodes.some((co, idx) => markedCounts[idx] > 0 && finalOverallAtt && finalOverallAtt[co] !== undefined);
    const poAvgStr = hasSecondAverage ? poAvgNum.toFixed(2) : (hasAnyMappedCo ? '0.00' : '');
    const poAvgDisplay = hasFirstAverage && !mappedCoHasData ? 'Questions are not taken' : poAvgStr;

    // Determine attainment status: compare rounded averages (2 decimals)
    let statusElem = null;
    if (hasFirstAverage) {
      if (!hasSecondAverage) {
        statusElem = (
          <div className="flex flex-col items-center gap-1 p-1">
            <span className="text-red-600 font-bold">NA</span>
            <div className="flex flex-col items-center gap-1">
              {actionsTaken[label] ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleOpenActionModal(label, label, poAvgNum, mappingAvgNum)}
                      className="p-1 px-2 text-[9px] bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1 shadow-sm"
                      title="Edit Action Plan"
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                    <button 
                      onClick={() => handleDeleteAction(label)}
                      className="p-1 px-2 text-[9px] bg-rose-600 text-white rounded hover:bg-rose-700 transition-colors flex items-center gap-1 shadow-sm"
                      title="Delete Action Plan"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {actionsTaken[label]?.action && (
                    <div className="text-[9px] text-blue-600 font-medium bg-white/50 px-1 rounded truncate max-w-[80px]" title={actionsTaken[label].action}>
                      {actionsTaken[label].action}
                    </div>
                  )}
                </div>
              ) : (
                <button 
                  onClick={() => handleOpenActionModal(label, label, poAvgNum, mappingAvgNum)}
                  className="text-[9px] bg-indigo-600 text-white px-2 py-0.5 rounded hover:bg-indigo-700 transition-colors flex items-center gap-1 shadow-sm"
                >
                  <PlusCircle size={12} /> Action Taken
                </button>
              )}
            </div>
          </div>
        );
      } else {
      const mapRounded = Number(mappingAvgNum.toFixed(2));
      const poRounded = Number(poAvgNum.toFixed(2));
      if (mapRounded <= poRounded) {
        statusElem = <span className="text-emerald-700 font-bold">A</span>;
      } else {
        statusElem = (
          <div className="flex flex-col items-center gap-1 p-1">
            <span className="text-red-600 font-bold">NA</span>
            <div className="flex flex-col items-center gap-1">
              {actionsTaken[label] ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleOpenActionModal(label, label, poAvgNum, mappingAvgNum)}
                      className="p-1 px-2 text-[9px] bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1 shadow-sm"
                      title="Edit Action Plan"
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                    <button 
                      onClick={() => handleDeleteAction(label)}
                      className="p-1 px-2 text-[9px] bg-rose-600 text-white rounded hover:bg-rose-700 transition-colors flex items-center gap-1 shadow-sm"
                      title="Delete Action Plan"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {actionsTaken[label]?.action && (
                    <div className="text-[9px] text-blue-600 font-medium bg-white/50 px-1 rounded truncate max-w-[80px]" title={actionsTaken[label].action}>
                      {actionsTaken[label].action}
                    </div>
                  )}
                </div>
              ) : (
                <button 
                  onClick={() => handleOpenActionModal(label, label, poAvgNum, mappingAvgNum)}
                  className="text-[9px] bg-indigo-600 text-white px-2 py-0.5 rounded hover:bg-indigo-700 transition-colors flex items-center gap-1 shadow-sm"
                >
                  <PlusCircle size={12} /> Action Taken
                </button>
              )}
            </div>
          </div>
        );
      }
      }
    }

    return (
      <tr key={label} className="hover:bg-slate-50">
        <td className="px-4 py-2 border border-slate-500 font-medium bg-[#f3f3f3]">{label}</td>
        <td className="px-4 py-2 border border-slate-500 text-center bg-[#f3f3f3]">{totalPIs || ""}</td>

        {/* Marked PIs */}
        {markedCounts.map((mc, i) => (
          <td key={`mpi-${coCodes[i]}`} className="px-4 py-2 border border-slate-500 text-center bg-[#ffe599]">{mc || ""}</td>
        ))}

        {/* Mapping Grades */}
        {mappingGrades.map((g, i) => (
          <td key={`grade-${coCodes[i]}`} className="px-4 py-2 border border-slate-500 text-center bg-[#c9daf8]">{g || ""}</td>
        ))}

        {/* Average Mapping */}
        <td className="px-4 py-2 border border-slate-500 text-center font-medium bg-[#f3f3f3]">{mappingAvgStr}</td>

        {/* PO Attainment (computed from CO final attainment and mapping grades) */}
        {contributions.map((c, i) => (
          <td key={`attainment-${coCodes[i]}`} className="px-4 py-2 border border-slate-500 text-center bg-[#ffe599]">{markedCounts[i] > 0 ? c.toFixed(2) : ''}</td>
        ))}

        {/* Final Average (average of CO contributions for this PO) */}
        <td className="px-4 py-2 border border-slate-500 text-center font-medium bg-[#f3f3f3]">{poAvgDisplay}</td>

        {/* Status */}
        <td className="px-4 py-2 border border-slate-500 text-center font-bold bg-[#b6fcb6]">{statusElem}</td>
      </tr>
    );
  };

  return (
    <Layout title="CO-PO Mapping">
      <div className="p-6 md:p-10 max-w-[98%] mx-auto">
        {showSuccess && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1000] bg-green-100 border border-green-200 text-green-800 px-8 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
            <CheckCircle2 className="text-green-600" size={20} />
            <span className="font-bold">{successMessage}</span>
          </div>
        )}

        {/* Filters Card */}
        <div className="bg-white rounded-3xl shadow-xl p-6 mb-8 border border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Programme Name</label>
              <div className="relative">
                <select 
                  value={programme}
                  onChange={(e) => { setProgramme(e.target.value); setDepartment(""); setBatch(""); setSection(""); }}
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                >
                  <option value="">Select Programme</option>
                  {filteredProgrammes.map(progKey => (
                    <option key={progKey} value={progKey}>{formatProgDisplay(progKey)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Batch</label>
              <div className="relative">
                <select 
                  disabled={!programme}
                  value={batch}
                  onChange={(e) => { setBatch(e.target.value); setAcademicYear(""); setSemester(""); setSection(""); }}
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                >
                  <option value="">Select Batch</option>
                  {batches.map(b => <option key={b} value={b}>{formatBatchDisplay(b)}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Regulation</label>
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-medium text-slate-400">
                {regulation || "Regulation not mapped"}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Academic Year</label>
              <div className="relative">
                <select 
                  disabled={!batch}
                  value={academicYear}
                  onChange={(e) => { setAcademicYear(e.target.value); setSemester(""); }}
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                >
                  <option value="">Select Academic Year</option>
                  {academicYears.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Semester</label>
              <div className="relative">
                <select 
                  disabled={!academicYear}
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                >
                  <option value="">Select Semester</option>
                  {getSemesters().map(sem => <option key={sem} value={sem}>{sem}</option>)}
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
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Subject *</label>
              <div className="relative">
                <select 
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                >
                  <option value="">Select subject</option>
                  {subjects.map(s => (
                    <option key={s.value} value={s.value}>
                      {s.text}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-zinc-100">
          <div className="bg-[#120c7a] px-6 py-3 flex justify-between items-center">
            <h4 className="text-white font-bold text-sm">CO-PO Mapping Table</h4>
            <div className="flex gap-2">
              <button 
                onClick={handleDownloadExcel}
                className="bg-white hover:bg-zinc-100 text-[#120c7a] px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Download size={14} /> Download Report
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto p-4">
            {loading ? (
              <div className="p-20 text-center text-slate-400 italic">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                Loading data...
              </div>
            ) : coCodes.length === 0 ? (
              <div className="p-20 text-center text-slate-400 italic">
                Select all filters to view CO-PO Mapping.
              </div>
              ) : (
              <table id="copo-table" className="w-full border-collapse border border-slate-500 text-sm min-w-[1200px]">
                <thead>
                  <tr className="bg-gray-200">
                    <th rowSpan={2} className="border border-slate-500 px-4 py-2 bg-[#f3f3f3]">CO - PO</th>
                    <th rowSpan={2} className="border border-slate-500 px-4 py-2 bg-[#f3f3f3]">T.PIs</th>
                    <th colSpan={coCodes.length} className="border border-slate-500 px-4 py-2 bg-[#ffe599]">Marked PIs (MPIs)</th>
                    <th colSpan={coCodes.length} className="border border-slate-500 px-4 py-2 bg-[#c9daf8]">CO - PO Mapping</th>
                    <th rowSpan={2} className="border border-slate-500 px-4 py-2 bg-[#f3f3f3]">Average</th>
                    <th colSpan={coCodes.length} className="border border-slate-500 px-4 py-2 bg-[#ffe599]">PO attainment through this subject</th>
                    <th rowSpan={2} className="border border-slate-500 px-4 py-2 bg-[#f3f3f3]">Average</th>
                    <th rowSpan={2} className="border border-slate-500 px-4 py-2 bg-[#b6fcb6]">Attainment status</th>
                  </tr>
                  <tr className="bg-gray-200">
                    {coCodes.map(co => <th key={`mpi-h-${co}`} className="border border-slate-500 px-4 py-2 bg-[#ffe599]">{co}</th>)}
                    {coCodes.map(co => <th key={`map-h-${co}`} className="border border-slate-500 px-4 py-2 bg-[#c9daf8]">{co}</th>)}
                    {coCodes.map(co => <th key={`att-h-${co}`} className="border border-slate-500 px-4 py-2 bg-[#ffe599]">{co}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {poList.length > 0 || psoList.length > 0 ? (
                    <>
                      {poList.map((po) => renderRow(po.label, summary[po.code]))}
                      {psoList.map((pso) => renderRow(pso.label, summary[pso.code]))}
                    </>
                  ) : (
                    Object.keys(summary).filter(k => k.startsWith('PO') && !k.startsWith('PSO')).sort().map(k => renderRow(k, summary[k])).concat(
                      Object.keys(summary).filter(k => k.startsWith('PSO')).sort().map(k => renderRow(k, summary[k]))
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Action Taken Modal */}
        {isActionModalOpen && (
          <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-md z-[2000] flex items-center justify-center p-4 sm:p-6 transition-all duration-300">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden border border-zinc-100 flex flex-col animate-in zoom-in-95 duration-200">
              <div className="bg-[#120c7a] px-6 py-3 sm:px-8 sm:py-4 flex justify-between items-center text-white shrink-0">
                <div>
                  <h3 className="text-base sm:text-lg font-bold">Action Taken Form</h3>
                  <p className="text-blue-100 text-[10px] sm:text-xs opacity-80">Proposed action plan for {selectedOutcome?.name}</p>
                </div>
                <button 
                  onClick={() => setIsActionModalOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar">
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex gap-3 text-amber-800">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <div className="text-[11px] sm:text-xs">
                    <p className="font-bold">Reason: Attainment ({Number(selectedOutcome?.value || 0).toFixed(2)}) &lt; Target ({Number(selectedOutcome?.targetValue || 0).toFixed(2)})</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] sm:text-xs font-black text-zinc-400 uppercase tracking-widest px-1">Action Plan / Remedial Measures</label>
                  <textarea
                    value={actionText}
                    onChange={(e) => setActionText(e.target.value)}
                    placeholder="Describe the actions proposed to improve attainment for this outcome..."
                    className="w-full h-40 sm:h-48 p-4 sm:p-5 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all resize-none text-sm sm:text-base text-zinc-700 leading-relaxed shadow-inner"
                  />
                  <p className="text-[10px] text-zinc-400 text-right px-2 italic">Maximum 5000 characters</p>
                </div>
              </div>

              <div className="p-6 sm:p-8 bg-zinc-50/50 border-t border-zinc-100 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 shrink-0">
                <button
                  onClick={() => setIsActionModalOpen(false)}
                  className="w-full sm:w-auto px-6 py-3 text-zinc-600 font-bold hover:bg-zinc-100 rounded-2xl transition-all order-2 sm:order-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAction}
                  disabled={isSavingAction || !actionText.trim()}
                  className="w-full sm:w-auto px-10 py-3 bg-[#120c7a] hover:bg-blue-800 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 order-1 sm:order-2"
                >
                  {isSavingAction ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={18} /> Save Plan
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
