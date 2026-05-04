import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { rtdb, auth } from "../firebase";
import { ref, onValue, set, get } from "firebase/database";
import { 
  Check,
  ChevronDown, 
  Plus, 
  Minus, 
  GripVertical,
  Upload,
  X,
  CheckCircle2,
  Eye,
  Download,
  FileText,
  Edit2,
  Users,
  FileX,
  AlertCircle
} from "lucide-react";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { useSemesterType } from "../hooks/useSemesterType";
import { formatProgDisplay, formatProgrammeKey, formatBatchDisplay } from "../lib/utils";
import { getQuestionPaperHTML } from '../utils/questionPaperUtils'; // Import the utility function

import Layout from "../components/Layout";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

const deriveSemesterNumber = (semStr) => {
  if (!semStr) return null;
  const romanToNum = { "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10 };
  if (romanToNum[semStr]) return romanToNum[semStr];
  const match = semStr.match(/\d+/);
  return match ? parseInt(match[0]) : null;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);
  const semesterType = useSemesterType();
  // Selection States
  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [module, setModule] = useState("");
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [extraSubject, setExtraSubject] = useState("");
  const [selectedExam, setSelectedExam] = useState("");

  // Student List States
  const [students, setStudents] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [syllabusData, setSyllabusData] = useState(null);
  const [loadingSyllabus, setLoadingSyllabus] = useState(false);
  const [questionPapers, setQuestionPapers] = useState([]);
  const [loadingQPs, setLoadingQPs] = useState(false);
  const [selectedQP, setSelectedQP] = useState(null);
  const [showQPModal, setShowQPModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [modal, setModal] = useState({ show: false, type: 'alert', title: '', message: '', onConfirm: null });
  const [facultySignatureForQP, setFacultySignatureForQP] = useState('');
  const [hodSignatureForQP, setHodSignatureForQP] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [userAssignments, setUserAssignments] = useState([]);
  const [assignedProgs, setAssignedProgs] = useState([]);
  const [assignedDepts, setAssignedDepts] = useState([]);
  const [ciaConfigs, setCiaConfigs] = useState({});

  // Fetch CIA Configs for exam name mapping
  useEffect(() => {
    const ciaRef = ref(rtdb, 'cia_configs');
    const unsubscribe = onValue(ciaRef, (snapshot) => {
      if (snapshot.exists()) {
        setCiaConfigs(snapshot.val());
      }
    }, (error) => {
      console.error("CIA Configs Fetch Error:", error);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      const userRef = ref(rtdb, `users/${user.uid}`);
      onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.val();
          setUserRole(userData.role);

          if (userData.role === 'Faculty') {
            const assignmentsRef = ref(rtdb, 'subject_assignments');
            onValue(assignmentsRef, (assignSnap) => {
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
          }
        }
      });
    }
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (user && programme && department && batch && academicYear && semester) {
      const progKey = formatProgrammeKey(programme);
      const semNum = deriveSemesterNumber(semester);
      const assignmentPath = `subject_assignments/${progKey}/${sanitizeKey(department)}/${sanitizeKey(batch)}/${sanitizeKey(academicYear)}/${semNum}`;
      const assignmentRef = ref(rtdb, assignmentPath);
      
      const unsubscribe = onValue(assignmentRef, (snapshot) => {
        if (snapshot.exists()) {
          const assignments = snapshot.val();
          if (userRole === 'Admin' || userRole === 'HOD' || userRole === 'Principal') {
            const allAllocatedCodes = new Set();
            Object.values(assignments).forEach(codes => {
              if (Array.isArray(codes)) codes.forEach(c => allAllocatedCodes.add(c));
            });
            setUserAssignments(Array.from(allAllocatedCodes));
          } else {
            setUserAssignments(assignments[user.uid] || []);
          }
        } else {
          setUserAssignments([]);
        }
      });
      return () => unsubscribe();
    } else if (userAssignments.length > 0) {
      setTimeout(() => setUserAssignments([]), 0);
    }
  }, [programme, department, batch, academicYear, semester, userAssignments.length, userRole]);

  // Fetch COs for the selected QP's subject when modal opens
  const [modalCourseOutcomes, setModalCourseOutcomes] = useState([]);
  useEffect(() => {
    const fetchModalCOs = async () => {
      if (!selectedQP || !selectedQP.programme || !selectedQP.department || !selectedQP.batch || !selectedQP.subject || !selectedQP.academic_year) {
        setModalCourseOutcomes([]);
        return;
      }
      const progKey = formatProgrammeKey(selectedQP.programme);
      const regulation = getRegulationForBatch(progKey, selectedQP.batch);
      if (!regulation) {
        setModalCourseOutcomes([]);
        return;
      }
      const coKey = `${sanitizeKey(selectedQP.department)}_${sanitizeKey(regulation)}_${sanitizeKey(selectedQP.subject)}_${sanitizeKey(selectedQP.academic_year)}`;
      const coRef = ref(rtdb, `course_outcomes/${coKey}`);
      const coSnapshot = await get(coRef);
      if (coSnapshot.exists()) {
        const data = coSnapshot.val();
        const loadedCOs = Object.entries(data)
          .map(([code, val]) => ({ code, description: typeof val === 'object' && val !== null ? val.description : val }))
          .sort((a, b) => (parseInt(a.code.replace(/\D/g, '')) || 0) - (parseInt(b.code.replace(/\D/g, '')) || 0));
        setModalCourseOutcomes(loadedCOs);
      } else {
        setModalCourseOutcomes([]);
      }
    };
    fetchModalCOs();
  }, [selectedQP, getRegulationForBatch]);

  // Fetch signatures for the selected QP when modal opens
  useEffect(() => {
    const fetchSignatures = async () => {
      if (!selectedQP) {
        setFacultySignatureForQP('');
        setHodSignatureForQP('');
        return;
      }

      // Fetch Faculty Signature (forwarded_by)
      if (selectedQP.forwarded_by) {
        const userRef = ref(rtdb, `users/${selectedQP.forwarded_by}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setFacultySignatureForQP(snapshot.val().signatureUrl || '');
        } else {
          setFacultySignatureForQP('');
        }
      } else {
        setFacultySignatureForQP('');
      }

      // HOD Signature (if approved and available in QP data)
      setHodSignatureForQP(selectedQP.hod_signature_url || '');
    };
    fetchSignatures(); // This effect depends on selectedQP, so it should run when selectedQP changes
  }, [selectedQP]);


  const showAlert = (title, message) => {
    setModal({ show: true, type: 'alert', title, message, onConfirm: null });
  };

  const showConfirm = (title, message, onConfirm) => {
    setModal({ show: true, type: 'confirm', title, message, onConfirm });
  };

  const [removeStudentModal, setRemoveStudentModal] = useState({ show: false, index: null, reason: '', confirmReg: '' });
  const [consolidationData, setConsolidationData] = useState(null);
  const [loadingConsolidation, setLoadingConsolidation] = useState(false);
  const [consolidationChildren, setConsolidationChildren] = useState([]); // [{ key, data, isUniversity, label }]
  const [consolidationView, setConsolidationView] = useState('latest'); // 'latest' | 'overall' | 'final' | examKey
  const [mappingPercentageSplit, setMappingPercentageSplit] = useState({ internal: 100, university: 0 });
  const [mappingDirectIndirectSplit, setMappingDirectIndirectSplit] = useState({ direct: 100, indirect: 0 });
  const [mappingCutoff, setMappingCutoff] = useState("");
  const [mappingThresholds, setMappingThresholds] = useState([]);

  const expectedExams = useMemo(() => {
    if (!programme || !department || !batch || !academicYear || !semester) return [];
    const semNum = String(deriveSemesterNumber(semester));
    const progKey = formatProgrammeKey(programme);
    return Object.entries(ciaConfigs || {}).map(([id, val]) => ({id, ...val})).filter(c => 
      formatProgrammeKey(c.program) === progKey && 
      (c.department === department || !c.department) &&
      (!c.batch || c.batch === batch) &&
      (!c.academicYear || c.academicYear === academicYear) &&
      (!c.semester || String(c.semester) === semNum)
    );
  }, [ciaConfigs, programme, department, batch, academicYear, semester]);

  const allExamsCompleted = useMemo(() => {
    if (expectedExams.length === 0) return false;
    // Exclude indirect assessments from the mandatory check
    const mandatoryExams = expectedExams.filter(ex => !ex.isIndirectAssessment);
    
    if (mandatoryExams.length === 0) return false;

    return mandatoryExams.every(examConfig => {
      return consolidationChildren.some(child => {
        return child.label === examConfig.examName || 
               child.key === examConfig.id || 
               child.data._meta?.exam === examConfig.id || 
               child.data._meta?.qpaper_name === examConfig.id ||
               child.data._meta?.exam === examConfig.examName;
      });
    });
  }, [expectedExams, consolidationChildren]);

  const missingMandatoryExams = useMemo(() => {
    if (!expectedExams.length) return [];
    const mandatoryExams = expectedExams.filter(ex => !ex.isIndirectAssessment);
    return mandatoryExams.filter(examConfig => {
      const isPresent = consolidationChildren.some(child => {
        return child.label === examConfig.examName ||
               child.key === examConfig.id ||
               child.data._meta?.exam === examConfig.id ||
               child.data._meta?.qpaper_name === examConfig.id ||
               child.data._meta?.exam === examConfig.examName;
      });
      return !isPresent;
    });
  }, [expectedExams, consolidationChildren]);

  const getAcademicYears = () => {
    if (!batch) return [];
    const [startYear] = batch.split("-").map(Number);
    const progKey = formatProgrammeKey(programme);
    const duration = durations[progKey] || 4;
    const years = [];
    for (let i = 0; i < duration; i++) {
      years.push(`${startYear + i}-${startYear + i + 1}`);
    }
    return years;
  };

  const filteredProgrammes = Object.keys(PROGRAMME_DEPARTMENTS).filter(prog => {
    if (userRole !== 'Faculty') return true;
    return assignedProgs.includes(formatProgrammeKey(prog));
  });

  const filteredDepartments = (PROGRAMME_DEPARTMENTS[programme] || []).filter(dept => {
    if (userRole !== 'Faculty') return true;
    return assignedDepts.includes(sanitizeKey(dept));
  });

  const getSemesters = () => {
    if (!academicYear || !batch) return [];
    const [batchStart] = batch.split("-").map(Number);
    const [yearStart] = academicYear.split("-").map(Number);
    const yearIndex = yearStart - batchStart;
    
    const sem1 = (yearIndex * 2) + 1;
    const sem2 = (yearIndex * 2) + 2;
    
    const allSems = [sem1, sem2];
    const filteredSems = allSems.filter(num => {
      if (semesterType === "Odd") return num % 2 !== 0;
      return num % 2 === 0;
    });

    const getLabel = (num) => {
      const suffixes = ["th", "st", "nd", "rd", "th", "th", "th", "th", "th"];
      const suffix = suffixes[num] || "th";
      return `${num}${suffix} Semester`;
    };

    return filteredSems.map(getLabel);
  };

  const getQPFilterOptions = (field) => {
    if (!questionPapers.length) return [];
    
    let filtered = questionPapers;
    if (userRole !== 'Admin') {
      filtered = filtered.filter(qp => userAssignments.includes(qp.subject));
    }
    if (field === 'academic_year') filtered = filtered.filter(qp => !batch || qp.batch === batch);
    if (field === 'semester') filtered = filtered.filter(qp => (!batch || qp.batch === batch) && (!academicYear || qp.academic_year === academicYear));
    if (field === 'subject') filtered = filtered.filter(qp => (!batch || qp.batch === batch) && (!academicYear || qp.academic_year === academicYear) && (!semester || getSemesterLabel(qp.semester) === getSemesterLabel(deriveSemesterNumber(semester))));
    if (field === 'exam') filtered = filtered.filter(qp => (!batch || qp.batch === batch) && (!academicYear || qp.academic_year === academicYear) && (!semester || getSemesterLabel(qp.semester) === getSemesterLabel(deriveSemesterNumber(semester))) && (!selectedSubject || `${qp.subject} - ${qp.subject_name}` === selectedSubject));

    const options = [...new Set(filtered.map(qp => {
      if (field === 'semester') {
        const num = qp.semester;
        const suffixes = ["th", "st", "nd", "rd", "th", "th", "th", "th", "th"];
        const suffix = suffixes[parseInt(num)] || "th";
        return `${num}${suffix} Semester`;
      }
      if (field === 'subject') return `${qp.subject} - ${qp.subject_name}`;
      if (field === 'exam') {
        // Use exam_name if available, otherwise look up from ciaConfigs using qpaper_name as config ID
        if (qp.exam_name) return qp.exam_name;
        const configId = qp.qpaper_name;
        const examName = ciaConfigs[configId]?.examName || configId;
        return examName;
      }
      return qp[field];
    }))].sort((a, b) => {
      if (field === 'semester') {
        return deriveSemesterNumber(a) - deriveSemesterNumber(b);
      }
      if (typeof a === 'string') return a.localeCompare(b);
      return a - b;
    });
    
    return options;
  };

  const handleStudentChange = (index, field, value) => {
    const newStudents = [...students];
    newStudents[index][field] = value;
    setStudents(newStudents);
  };

  const handleAddRow = (index) => {
    const newStudents = [...students];
    newStudents.splice(index + 1, 0, { reg: "", name: "" });
    setStudents(newStudents);
  };

  const handleRemoveRow = (index) => {
    setRemoveStudentModal({ show: true, index, reason: '', confirmReg: '' });
  };

  const confirmRemoveRow = () => {
    const { index, reason, confirmReg } = removeStudentModal;
    const student = students[index];
    
    if (confirmReg !== student.reg) {
      showAlert("Error", "Register number does not match. Deletion cancelled.");
      return;
    }
    
    if (!reason.trim()) {
      showAlert("Error", "Please provide a reason for removal.");
      return;
    }

    const newStudents = students.filter((_, i) => i !== index);
    setStudents(newStudents);
    setRemoveStudentModal({ show: false, index: null, reason: '', confirmReg: '' });
  };

  const getSemesterLabel = (semNum) => {
    const labels = {
      "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V", "6": "VI", "7": "VII", "8": "VIII", "9": "IX", "10": "X"
    };
    return labels[String(semNum)] || semNum;
  };

  const getYearLabel = (semNum) => {
    const labels = {
      "1": "I", "2": "I", "3": "II", "4": "II", "5": "III", "6": "III", "7": "IV", "8": "IV", "9": "V", "10": "V"
    };
    return labels[String(semNum)] || "";
  };

  const renderQuestionPaper = useCallback((qp, cos, facultySig, hodSig, ciaConf) => {
    if (!qp) return "";
    return getQuestionPaperHTML(
      qp,
      cos, // Pass fetched COs
      facultySig, // facultySignatureForQP
      hodSig,     // hodSignatureForQP (this is the HOD signature from the QP itself)
      ciaConf
    );
  }, []); // Dependencies are now passed as arguments, so this callback itself has no external deps

  const handleDownloadQP = useCallback((qp) => {
    try {
      const content = renderQuestionPaper(qp);
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
    </style>
</head>
<body>
    ${content}
</body>
</html>`;

      const blob = new Blob(['\ufeff', wordHTML], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${qp.qpaper_name}_${qp.subject}.doc`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        if (link.parentNode) link.parentNode.removeChild(link);
      }, 1000);
    } catch (err) {
      console.error('Word export failed:', err);
    }
  }, [renderQuestionPaper]);
  
  // Fetch Students when filters change
  useEffect(() => {
    if ((module === "students" || module === "consolidation") && programme && department && batch) {
      const progKey = formatProgrammeKey(programme);
      const compositeKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}`;
      const studentRef = ref(rtdb, `students/${compositeKey}`);
      
      const unsubscribe = onValue(studentRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          // Filter out metadata keys and convert to array
          const studentList = Object.entries(data)
            .filter(([key]) => !key.startsWith('_'))
            .map(([reg, name]) => ({ reg, name }));
            
          // Sort by order if it exists in the data
          const order = data._order || data.order;
          if (order && Array.isArray(order)) {
            studentList.sort((a, b) => order.indexOf(a.reg) - order.indexOf(b.reg));
          } else {
            // Default sort by register number
            studentList.sort((a, b) => a.reg.localeCompare(b.reg));
          }
          
          setStudents(studentList);
        } else {
          setStudents([]);
        }
        setLoadingStudents(false);
      }, (error) => {
        console.error("RTDB Fetch Error:", error);
        setLoadingStudents(false);
      });

      return () => unsubscribe();
    }
  }, [module, programme, department, batch]);

  // Fetch Syllabus when filters change
  useEffect(() => {
    if ((module === "syllabus" || module === "consolidation") && programme && department && batch && semester) {
      const progKey = formatProgrammeKey(programme);
      const regulation = getRegulationForBatch(progKey, batch);
      if (!regulation) return; // Wait until regulation is loaded
      const syllabusKey = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(regulation)}`;
      const syllabusRef = ref(rtdb, `syllabus_data/${syllabusKey}`);

      const unsubscribe = onValue(syllabusRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setSyllabusData(data);
        } else {
          setSyllabusData(null);
        }
        setLoadingSyllabus(false);
      }, (error) => {
        console.error("Syllabus Fetch Error:", error);
        setLoadingSyllabus(false);
      });

      return () => unsubscribe();
    }
  }, [module, programme, department, batch, semester, getRegulationForBatch]);

  // Fetch Question Papers when filters change
  useEffect(() => {
    if (module === "questionpaper" && programme && department) {
      const qpRef = ref(rtdb, `generated_qps`);
      
      const unsubscribe = onValue(qpRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const allQPs = [];
          Object.entries(data).forEach(([key, versions]) => {
            Object.entries(versions).forEach(([vId, qp]) => {
              if (qp.programme === programme && qp.department === department) {
                allQPs.push({ ...qp, id: vId, compositeKey: key });
              }
            });
          });
          
          // Sort by saved_at descending
          allQPs.sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
          setQuestionPapers(allQPs);
        } else {
          setQuestionPapers([]);
        }
        setLoadingQPs(false);
      }, (error) => {
        console.error("QP Fetch Error:", error);
        setLoadingQPs(false);
      });

      return () => unsubscribe();
    }
  }, [module, programme, department]);

  // Fetch Consolidation Data
  useEffect(() => {
    if (module === "consolidation" && programme && department && batch && academicYear && semester && extraSubject && students.length > 0) {
      const subjectKeyParts = [batch, programme, department, extraSubject, academicYear, semester].map(sanitizeKey);
      const subjectKey = subjectKeyParts.join('_');
      const attainmentRef = ref(rtdb, `co_attainment/${subjectKey}`);
      
      const unsubscribe = onValue(attainmentRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
          setConsolidationChildren([]);
          setConsolidationData(null);
          setLoadingConsolidation(false);
          return;
        }

        // If data already contains students/co_max_marks at root (legacy format), use it
        if (data.co_max_marks || data.students) {
          setConsolidationChildren([{ key: '_legacy', data, isUniversity: !!data._meta?.is_university, label: data._meta?.exam || 'Legacy' }]);
          setConsolidationData({
            studentTotals: data.students || {},
            maxMarks: data.co_max_marks || { CO1: 0, CO2: 0, CO3: 0, CO4: 0, CO5: 0 }
          });
          setLoadingConsolidation(false);
          return;
        }

        // Otherwise assume per-exam children exist: pick the most recent exam entry
        try {
          const entries = Object.entries(data).filter(([, v]) => v && (v.students || v.co_max_marks)).map(([k, v]) => ({ key: k, data: v }));
          if (entries.length === 0) {
            setConsolidationChildren([]);
            setConsolidationData(null);
            setLoadingConsolidation(false);
            return;
          }

          // Build children list with metadata and label
          const children = entries.map(e => {
            const m = e.data._meta || {};
            // Resolve friendly exam label: prefer explicit meta.exam (mapped via ciaConfigs if needed),
            // then resolve qpaper_name via ciaConfigs, else fallback to key
            let label = m.exam || m.qpaper_name || e.key;
            // If exam field is actually a config id, prefer its examName
            if (m.exam && ciaConfigs[m.exam] && ciaConfigs[m.exam].examName) {
              label = ciaConfigs[m.exam].examName;
            } else if (m.qpaper_name && ciaConfigs[m.qpaper_name] && ciaConfigs[m.qpaper_name].examName) {
              label = ciaConfigs[m.qpaper_name].examName;
            }
            const isUniversity = !!(
              m.is_university ||
              (m.qpaper_name && ciaConfigs[m.qpaper_name] && (ciaConfigs[m.qpaper_name].is_university || ciaConfigs[m.qpaper_name].isUniversity)) ||
              (m.exam && ciaConfigs[m.exam] && (ciaConfigs[m.exam].is_university || ciaConfigs[m.exam].isUniversity)) ||
              String(m.exam || '').toLowerCase().includes('uni') ||
              String(m.qpaper_name || '').toLowerCase().includes('uni')
            );
            const isIndirect = !!(
              m.isIndirectAssessment ||
              (m.qpaper_name && ciaConfigs[m.qpaper_name]?.isIndirectAssessment) ||
              (m.exam && ciaConfigs[m.exam]?.isIndirectAssessment)
            );
            return { key: e.key, data: e.data, isUniversity, isIndirect, label };
          });

          // sort by updated_at/saved_at desc
          children.sort((a, b) => {
            const ta = new Date(a.data._meta?.updated_at || a.data._meta?.saved_at || 0).getTime();
            const tb = new Date(b.data._meta?.updated_at || b.data._meta?.saved_at || 0).getTime();
            return tb - ta;
          });

          setConsolidationChildren(children);

          // Default: if current consolidationView is 'latest' or not set, pick latest INTERNAL child if available
          if (!consolidationView || consolidationView === 'latest') {
            const latestInternal = children.find(c => !c.isUniversity) || children[0];
            if (latestInternal) {
              setConsolidationData({ studentTotals: latestInternal.data.students || {}, maxMarks: latestInternal.data.co_max_marks || {} });
              // Set consolidation view to the actual exam key so dropdown shows the exam name instead of a 'Latest' placeholder
              setConsolidationView(latestInternal.key);
            }
          }
        } catch (err) {
          console.error('Consolidation parse error:', err);
          setConsolidationChildren([]);
          setConsolidationData(null);
        }
        setLoadingConsolidation(false);
      }, (error) => {
        console.error("Consolidation Fetch Error:", error);
        setLoadingConsolidation(false);
      });

      return () => unsubscribe();
    }
  }, [module, programme, department, batch, academicYear, semester, extraSubject, students, ciaConfigs, consolidationView]);

  // Fetch mapping_summary for final attainment computation
  useEffect(() => {
    const fetchMappingData = async () => {
      if (!(module === 'consolidation' && programme && batch && department && academicYear && semester && extraSubject)) return;
      const progKey = formatProgrammeKey(programme);
      const mappingKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(getRegulationForBatch(progKey, batch))}_${sanitizeKey(extraSubject)}_${sanitizeKey(academicYear)}_${sanitizeKey(semester)}`;
      try {
        const snap = await get(ref(rtdb, `mapping_summary/${mappingKey}`));
        if (snap.exists()) {
          const data = snap.val();
          if (data.percentageSplit) {
            setMappingPercentageSplit({ internal: Number(data.percentageSplit.internal || 100), university: Number(data.percentageSplit.university || 0) });
          } else {
            setMappingPercentageSplit({ internal: 100, university: 0 });
          }
          if (data.directIndirectSplit) {
            setMappingDirectIndirectSplit({ direct: Number(data.directIndirectSplit.direct || 100), indirect: Number(data.directIndirectSplit.indirect || 0) });
          } else {
            setMappingDirectIndirectSplit({ direct: 100, indirect: 0 });
          }
          setMappingCutoff(data.cutoff !== undefined ? data.cutoff : "");
          setMappingThresholds(data.thresholds || []);
        } else {
          setMappingPercentageSplit({ internal: 100, university: 0 });
          setMappingCutoff("");
          setMappingThresholds([]);
        }
      } catch (err) {
        console.error('Failed to fetch mapping data:', err);
        setMappingPercentageSplit({ internal: 100, university: 0 });
        setMappingCutoff("");
        setMappingThresholds([]);
      }
    };
    fetchMappingData();
  }, [module, programme, batch, department, academicYear, semester, extraSubject, getRegulationForBatch]);

  // Compute consolidationData when user changes the selected view or children or mapping split
  useEffect(() => {
    if (!consolidationChildren || consolidationChildren.length === 0) return;

    const computeForView = (view) => {
      if (view === 'latest' || view === undefined) {
        const chosen = consolidationChildren.find(c => !c.isUniversity) || consolidationChildren[0];
        return { studentTotals: chosen.data.students || {}, maxMarks: chosen.data.co_max_marks || {} };
      }

      if (view === 'overall') {
        // Aggregate across internal children only: average per CO across internal exams
        const all = consolidationChildren.filter(c => !c.isUniversity);
        // If there are no internal children, fall back to all children
        if (all.length === 0) all.push(...consolidationChildren);
        const studentAcc = {};
        const coCounts = {};

        all.forEach(child => {
          const studs = child.data.students || {};
          Object.entries(studs).forEach(([reg, sdata]) => {
            studentAcc[reg] = studentAcc[reg] || { name: sdata.name || '' };
            Object.entries(sdata).forEach(([k, v]) => {
              if (/^CO\d+/i.test(k) && typeof v === 'number') {
                studentAcc[reg][k] = (studentAcc[reg][k] || 0) + v;
                coCounts[k] = (coCounts[k] || 0) + 1;
              }
            });
          });
        });

        // Average
        Object.keys(studentAcc).forEach(reg => {
          Object.keys(studentAcc[reg]).forEach(k => {
            if (/^CO\d+/i.test(k)) {
              const cnt = coCounts[k] || consolidationChildren.length;
              studentAcc[reg][k] = Math.round((studentAcc[reg][k] || 0) / cnt);
            }
          });
        });

        // Average max marks per CO
        const maxAcc = {};
        consolidationChildren.forEach(child => {
          const mm = child.data.co_max_marks || {};
          Object.entries(mm).forEach(([k, v]) => {
            maxAcc[k] = (maxAcc[k] || 0) + Number(v || 0);
          });
        });
        Object.keys(maxAcc).forEach(k => { maxAcc[k] = Math.round(maxAcc[k] / consolidationChildren.length); });

        return { studentTotals: studentAcc, maxMarks: maxAcc };
      }

      if (view === 'final') {
        const internalChildren = consolidationChildren.filter(c => !c.isUniversity && !c.isIndirect);
        const uniChild = consolidationChildren.find(c => c.isUniversity);
        
        if (internalChildren.length === 0 && !uniChild) return null;

        const split = mappingPercentageSplit || { internal: 100, university: 0 };
        const pctI = (split.internal || 100) / 100;
        const pctU = (split.university || 0) / 100;

        // Compute aggregate internal attainment per student
        const avgInternal = {};
        const avgIMax = {};
        const childCount = internalChildren.length;

        if (childCount > 0) {
          internalChildren.forEach(child => {
            Object.entries(child.data.students || {}).forEach(([reg, sdata]) => {
              if (!avgInternal[reg]) avgInternal[reg] = { name: sdata.name || '' };
              Object.entries(sdata).forEach(([k, v]) => {
                if (/^CO\d+/i.test(k) && typeof v === 'number') {
                  avgInternal[reg][k] = (avgInternal[reg][k] || 0) + v;
                }
              });
            });
            Object.entries(child.data.co_max_marks || {}).forEach(([k, v]) => {
              avgIMax[k] = (avgIMax[k] || 0) + Number(v || 0);
            });
          });

          // Average the internal scores
          Object.keys(avgInternal).forEach(reg => {
            Object.keys(avgInternal[reg]).forEach(k => {
              if (/^CO\d+/i.test(k)) {
                avgInternal[reg][k] = Math.round(avgInternal[reg][k] / childCount);
              }
            });
          });
          Object.keys(avgIMax).forEach(k => { avgIMax[k] = Math.round(avgIMax[k] / childCount); });
        }

        const studentRegs = new Set([
          ...Object.keys(avgInternal), 
          ...Object.keys(uniChild?.data.students || {})
        ]);
        const result = {};
        const uMax = uniChild?.data.co_max_marks || {};

        studentRegs.forEach(reg => {
          const iData = avgInternal[reg] || {};
          const uData = uniChild?.data.students?.[reg] || {};
          const entry = { name: iData.name || uData.name || '' };
          
          const coKeys = Array.from(new Set([
            ...Object.keys(iData).filter(k=>/^CO\d+/i.test(k)), 
            ...Object.keys(uData).filter(k=>/^CO\d+/i.test(k))
          ]));

          coKeys.forEach(k => {
            const iv = Number(iData[k] || 0);
            const uv = Number(uData[k] || 0);

            const im = Number(avgIMax[k] || 0);
            const um = Number(uMax[k] || 0);

            const iv_pct = im > 0 ? (iv / im) * 100 : 0;
            const uv_pct = um > 0 ? (uv / um) * 100 : 0;

            const finalPct = Math.round((iv_pct * pctI) + (uv_pct * pctU));
            entry[k] = finalPct;
          });
          result[reg] = entry;
        });

        const maxMarks = {};
        const allCoKeys = Array.from(new Set([...Object.keys(avgIMax), ...Object.keys(uMax)]));
        allCoKeys.forEach(k => { maxMarks[k] = 100; });

        return { studentTotals: result, maxMarks };
      }

      // view is examKey
      const pick = consolidationChildren.find(c => c.key === view);
      if (pick) return { studentTotals: pick.data.students || {}, maxMarks: pick.data.co_max_marks || {} };
      return null;
    };

    const computed = computeForView(consolidationView);
    if (computed && JSON.stringify(computed) !== JSON.stringify(consolidationData)) {
      // Wrap in setTimeout to avoid synchronous setState in effect warning/error
      setTimeout(() => {
        setConsolidationData(computed);
      }, 0);
    }
  }, [consolidationChildren, consolidationView, mappingPercentageSplit, mappingDirectIndirectSplit, consolidationData]);

  const attainmentSummary = useMemo(() => {
    if (!consolidationData || !mappingCutoff || !mappingThresholds.length) return null;

    const coKeys = Object.keys(consolidationData.maxMarks || {}).sort((a, b) => {
      const na = Number(a.replace(/[^0-9]/g, '')) || 0;
      const nb = Number(b.replace(/[^0-9]/g, '')) || 0;
      return na - nb;
    });
    const stats = {};

    coKeys.forEach(co => {
      let countGreaterEqual = 0;
      let countLess = 0;
      const studentTotals = Object.values(consolidationData.studentTotals);
      const totalStudents = studentTotals.length;

      studentTotals.forEach(s => {
        const mark = s[co] || 0;
        const maxMark = consolidationData.maxMarks[co] || 100;
        const markPct = maxMark > 0 ? (mark / maxMark) * 100 : 0;
        
        if (markPct >= Number(mappingCutoff)) {
          countGreaterEqual++;
        } else {
          countLess++;
        }
      });

      const percentage = totalStudents > 0 ? (countGreaterEqual / totalStudents) * 100 : 0;
      
      // Find threshold level
      let attainmentLevel = 0;
      const threshold = mappingThresholds.find(t => percentage >= t.min && percentage <= t.max);
      if (threshold) {
        attainmentLevel = threshold.level;
      }

      stats[co] = {
        countGreaterEqual,
        countLess,
        percentage: percentage.toFixed(2),
        attainmentLevel
      };
    });

    return stats;
  }, [consolidationData, mappingCutoff, mappingThresholds]);

  const finalOverallAttainment = useMemo(() => {
    if (!attainmentSummary || !mappingDirectIndirectSplit || consolidationView !== 'final') return null;

    const indirectChildren = consolidationChildren.filter(c => c.isIndirect);
    if (indirectChildren.length === 0) return null;

    const stats = {};
    const coKeys = Object.keys(attainmentSummary).sort((a, b) => {
      const na = Number(a.replace(/[^0-9]/g, '')) || 0;
      const nb = Number(b.replace(/[^0-9]/g, '')) || 0;
      return na - nb;
    });

    const diSplit = mappingDirectIndirectSplit || { direct: 100, indirect: 0 };
    const pctDirectTotal = (diSplit.direct || 100) / 100;
    const pctIndirectTotal = (diSplit.indirect || 0) / 100;

    coKeys.forEach(co => {
      // Direct Attainment Level (from summary)
      const directLevel = attainmentSummary[co]?.attainmentLevel || 0;

      // Indirect Attainment Mean
      let indirectTotalVal = 0;
      let totalIndirectSubmissions = 0;
      
      indirectChildren.forEach(child => {
        const studs = child.data.students || {};
        const maxMarksMap = child.data.co_max_marks || {};
        const mm = Number(maxMarksMap[co] || 3);

        Object.values(studs).forEach(s => {
          if (s[co] !== undefined && s[co] !== null) {
            // Note: We use the raw score divided by max marks * 3 if they aren't already on 3-point scale
            // But usually users enter 3,2,1 for surveys. 
            // If they enter 0-100, we should normalize to 3.
            const raw = Number(s[co]);
            const normalized = mm > 0 ? (raw / mm) * 3 : 0;
            indirectTotalVal += normalized;
            totalIndirectSubmissions++;
          }
        });
      });

      const indirectMean = totalIndirectSubmissions > 0 ? (indirectTotalVal / totalIndirectSubmissions) : 0;

      // Result = (DirectLevel * %Direct) + (IndirectMean * %Indirect)
      const finalLevel = (directLevel * pctDirectTotal) + (indirectMean * pctIndirectTotal);

      stats[co] = {
        directLevel,
        indirectMean: indirectMean.toFixed(2),
        finalLevel: finalLevel.toFixed(2),
        directPct: diSplit.direct,
        indirectPct: diSplit.indirect
      };
    });

    return stats;
  }, [attainmentSummary, mappingDirectIndirectSplit, consolidationChildren, consolidationView]);

  const selectedConsolidationChild = useMemo(() => {
    if (!consolidationChildren || !consolidationChildren.length) return null;
    return consolidationChildren.find(c => c.key === consolidationView) || null;
  }, [consolidationChildren, consolidationView]);

  const indirectCoAverages = useMemo(() => {
    const isIndirectView = !!selectedConsolidationChild?.isIndirect;
    if (!isIndirectView || !consolidationData?.studentTotals) return null;

    const coKeys = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'];
    const regs = students?.length
      ? students.map(s => s.reg)
      : Object.keys(consolidationData.studentTotals || {});
    const totalStudents = regs.length;

    const averages = {};
    coKeys.forEach(co => {
      const sum = regs.reduce((acc, reg) => {
        const val = Number(consolidationData.studentTotals?.[reg]?.[co] || 0);
        return acc + val;
      }, 0);
      averages[co] = totalStudents > 0 ? (sum / totalStudents) : 0;
    });

    return { totalStudents, averages };
  }, [selectedConsolidationChild, consolidationData, students]);

  // Download consolidation as CSV (Excel can open CSV)
  const downloadConsolidationCSV = () => {
    if (!consolidationData) return;
    // Determine CO keys (sorted)
    const coKeys = Object.keys(consolidationData.maxMarks || {}).sort((a, b) => {
      const na = Number(a.replace(/[^0-9]/g, '')) || 0;
      const nb = Number(b.replace(/[^0-9]/g, '')) || 0;
      return na - nb;
    });

    const rows = [];
    // Header
    const header = ['S.No', 'Register Number', 'Name', ...coKeys];
    rows.push(header);

    // Max marks row (show max per CO similar to screenshot)
    const maxMarksRow = ['', '', 'Max Marks', ...coKeys.map(k => consolidationData.maxMarks?.[k] ?? '')];
    rows.push(maxMarksRow);

    // Use students array order; fallback to keys from consolidationData
    const studentRegs = students && students.length ? students.map(s => s.reg) : Object.keys(consolidationData.studentTotals || {});

    studentRegs.forEach((reg, idx) => {
      const sdata = consolidationData.studentTotals?.[reg] || {};
      const row = [idx + 1, reg || '', sdata.name || ''];
      coKeys.forEach(k => {
        const v = sdata[k];
        row.push(v === undefined || v === null ? '' : v);
      });
      rows.push(row);
    });

    // Convert to CSV
    const csvContent = rows.map(r => r.map(cell => {
      if (cell === null || cell === undefined) return '';
      if (typeof cell === 'string') {
        // escape quotes
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `consolidation_${extraSubject || 'subject'}_${consolidationView || 'view'}.csv`.replace(/\s+/g, '_');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSaveStudents = async () => {
    if (!batch || !programme || !department) return;
    
    const progKey = formatProgrammeKey(programme);
    const compositeKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}`;
    const studentPath = `students/${compositeKey}`;
    
    const dataToSave = {
      _meta: {
        batch: batch,
        count: students.length,
        department: department,
        programme_name: programme
      },
      _order: students.map(s => s.reg)
    };
    
    // Add each student to the object
    students.forEach(s => {
      if (s.reg && s.name) {
        dataToSave[s.reg] = s.name;
      }
    });

    try {
      await set(ref(rtdb, studentPath), dataToSave);
      setIsEditing(false);
      setSuccessMessage("Student list saved successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Save error:", error);
      showAlert("Error", "Failed to save students. Check your database rules.");
    }
  };

  return (
    <Layout title="Dashboard">
      {/* Main Content */}
      <div className="p-6 md:p-10 max-w-6xl mx-auto">
        {/* Selection Card */}
        <div className="bg-white rounded-3xl shadow-xl p-8 mb-10 border border-white/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
            {/* Programme */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-600 ml-1">Select Programme Name</label>
              <div className="relative">
                <select 
                  value={programme}
                  onChange={(e) => { 
                    setProgramme(e.target.value); 
                    setDepartment(""); 
                    setSyllabusData(null);
                    setBatch("");
                    setAcademicYear("");
                    setSemester("");
                    setSelectedSubject("");
                    setExtraSubject("");
                    setSelectedExam("");
                    setConsolidationData(null);
                    if (module === "students") setLoadingStudents(true);
                    if (module === "syllabus" || module === "consolidation") setLoadingSyllabus(true);
                    if (module === "questionpaper") setLoadingQPs(true);
                  }}
                  className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                >
                  <option value="">Choose Programme</option>
                  {filteredProgrammes.map(prog => (
                    <option key={prog} value={prog}>{formatProgDisplay(prog)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
              </div>
            </div>

            {/* Department */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-600 ml-1">Select Department</label>
              <div className="relative">
                <select 
                  disabled={!programme}
                  value={department}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    setSyllabusData(null);
                    setBatch("");
                    setAcademicYear("");
                    setSemester("");
                    setSelectedSubject("");
                    setExtraSubject("");
                    setSelectedExam("");
                    setConsolidationData(null);
                    if (module === "students") setLoadingStudents(true);
                    if (module === "syllabus" || module === "consolidation") setLoadingSyllabus(true);
                    if (module === "questionpaper") setLoadingQPs(true);
                  }}
                  className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                >
                  <option value="">Choose Department</option>
                  {filteredDepartments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
              </div>
            </div>

            {/* Module */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-600 ml-1">Select Module</label>
              <div className="relative">
                <select 
                  value={module}
                  onChange={(e) => {
                    setModule(e.target.value);
                    setSyllabusData(null);
                    setBatch("");
                    setAcademicYear("");
                    setSemester("");
                    setSelectedSubject("");
                    setExtraSubject("");
                    setSelectedExam("");
                    setConsolidationData(null);
                    if (e.target.value === "students") setLoadingStudents(true);
                    if (e.target.value === "syllabus" || e.target.value === "consolidation") setLoadingSyllabus(true);
                    if (e.target.value === "questionpaper") setLoadingQPs(true);
                    if (e.target.value === "consolidation") setLoadingConsolidation(true);
                  }}
                  className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                >
                  <option value="">Choose Module</option>
                  <option value="syllabus">Syllabus</option>
                  <option value="students">Student Name List</option>
                  <option value="questionpaper">Question Paper</option>
                  <option value="timetable">Time Table</option>
                  <option value="consolidation">Consolidation</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
              </div>
            </div>

            {/* Batch */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-600 ml-1">Select Batch</label>
              <div className="relative">
                <select 
                  value={batch}
                  onChange={(e) => { 
                    setBatch(e.target.value); 
                    setAcademicYear(""); 
                    setSemester(""); 
                    setSelectedSubject("");
                    setExtraSubject("");
                    setSelectedExam("");
                    setSyllabusData(null);
                    setConsolidationData(null);
                    if (module === "students") setLoadingStudents(true);
                    if (module === "syllabus" || module === "consolidation") setLoadingSyllabus(true);
                  }}
                  className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                >
                  <option value="">Choose Batch</option>
                  {getActiveBatches(formatProgrammeKey(programme)).map(b => (
                    <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
              </div>
            </div>

            {/* Academic Year */}
            {module !== "students" && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600 ml-1">Select Academic Year</label>
                <div className="relative">
                  <select 
                    disabled={!batch}
                    value={academicYear}
                    onChange={(e) => { 
                      setAcademicYear(e.target.value); 
                      setSemester(""); 
                      setSelectedSubject("");
                      setExtraSubject("");
                      setSelectedExam("");
                      setSyllabusData(null);
                      setConsolidationData(null);
                      if (module === "syllabus" || module === "consolidation") setLoadingSyllabus(true);
                    }}
                    className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                  >
                    <option value="">Select Academic Year</option>
                    {getAcademicYears().map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>
            )}

            {/* Semester */}
            {module !== "students" && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600 ml-1">Select Semester Type</label>
                <div className="relative">
                  <select 
                    disabled={!academicYear}
                    value={semester}
                    onChange={(e) => {
                      setSemester(e.target.value);
                      setSelectedSubject("");
                      setExtraSubject("");
                      setSelectedExam("");
                      setSyllabusData(null);
                      setConsolidationData(null);
                      if (module === "syllabus" || module === "consolidation") setLoadingSyllabus(true);
                    }}
                    className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                  >
                    <option value="">Choose Semester</option>
                    {getSemesters().map(sem => (
                      <option key={sem} value={sem}>{sem}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>
            )}

            {/* Subject (Consolidation only) */}
            {module === "consolidation" && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600 ml-1">Select Subject</label>
                <div className="relative">
                  <select 
                    disabled={!semester}
                    value={extraSubject}
                    onChange={(e) => {
                      setExtraSubject(e.target.value);
                      if (e.target.value) setLoadingConsolidation(true);
                    }}
                    className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                  >
                    <option value="">Choose Subject</option>
                    {syllabusData?.semesters?.[deriveSemesterNumber(semester)]
                      ?.filter(sub => sub != null && sub.isActive !== false)
                      ?.filter(sub => userAssignments.includes(sub.code))
                      ?.map(sub => (
                      <option key={sub.code} value={sub.code}>{sub.code} - {sub.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>
            )}

            {/* Consolidation View Selector */}
            {module === "consolidation" && extraSubject && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600 ml-1">Consolidation View</label>
                <div className="relative">
                  <select
                    value={consolidationView}
                    onChange={(e) => setConsolidationView(e.target.value)}
                    className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                  >
                    {allExamsCompleted && (
                      <option value="final">Final Attainment (Direct + Indirect)</option>
                    )}
                    {consolidationChildren.map(c => (
                      <option key={c.key} value={c.key}>{c.label || c.key}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
                {!allExamsCompleted && expectedExams.length > 0 && (
                  <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Final attainment is not available because mark entry is not completed for this subject.
                    {missingMandatoryExams.length > 0 && (
                      <span> Pending exam(s): {missingMandatoryExams.map(e => e.examName || e.id).join(', ')}.</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Subject (Question Paper only) */}
            {module === "questionpaper" && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600 ml-1">Select Subject</label>
                <div className="relative">
                  <select 
                    disabled={!semester}
                    value={selectedSubject}
                    onChange={(e) => {
                      setSelectedSubject(e.target.value);
                      setSelectedExam("");
                    }}
                    className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                  >
                    <option value="">Choose Subject</option>
                    {getQPFilterOptions('subject').map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>
            )}

            {/* Exam (Question Paper only) */}
            {module === "questionpaper" && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600 ml-1">Select Exam</label>
                <div className="relative">
                  <select 
                    disabled={!selectedSubject}
                    value={selectedExam}
                    onChange={(e) => setSelectedExam(e.target.value)}
                    className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                  >
                    <option value="">Choose Exam</option>
                    {getQPFilterOptions('exam').map(ex => (
                      <option key={ex} value={ex}>{ex}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Student List Section */}
        {module === "students" && programme && department && batch && (
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-zinc-50 px-8 py-4 border-b border-zinc-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-zinc-800">Student Name List</h3>
                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  {batch} • {programme} • {department}
                </span>
              </div>
              <div className="flex gap-2">
                {!isEditing ? (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-all shadow-sm"
                  >
                    Edit
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => {
                        showConfirm(
                          "Clear Students",
                          "Are you sure you want to clear all students?",
                          () => setStudents([])
                        );
                      }}
                      className="bg-red-100 hover:bg-red-200 text-red-600 px-4 py-1.5 rounded-lg text-sm font-bold transition-all"
                    >
                      Clear All
                    </button>
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="bg-zinc-200 hover:bg-zinc-300 text-zinc-700 px-4 py-1.5 rounded-lg text-sm font-bold transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSaveStudents}
                      className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-all shadow-sm"
                    >
                      Save
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="p-8">
              {loadingStudents ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-400 italic">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                  Loading students...
                </div>
              ) : students.length === 0 && !isEditing ? (
                <div className="text-center py-20 text-zinc-400 italic">
                  No students found for the selected filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-zinc-50">
                        {isEditing && <th className="w-10 p-4"></th>}
                        <th className="text-left p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">Register Number</th>
                        <th className="text-left p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">Name</th>
                        {isEditing && <th className="w-24 p-4 text-center text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student, idx) => (
                        <tr key={idx} className="group border-b border-zinc-50 hover:bg-blue-50/30 transition-colors">
                          {isEditing && (
                            <td className="p-4 text-center">
                              <GripVertical className="text-zinc-300 cursor-grab active:cursor-grabbing" size={18} />
                            </td>
                          )}
                          <td className="p-4">
                            {isEditing ? (
                              <input 
                                value={student.reg}
                                onChange={(e) => handleStudentChange(idx, "reg", e.target.value)}
                                className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Reg No"
                              />
                            ) : (
                              <span className="text-sm font-mono text-zinc-600">{student.reg}</span>
                            )}
                          </td>
                          <td className="p-4">
                            {isEditing ? (
                              <input 
                                value={student.name}
                                onChange={(e) => handleStudentChange(idx, "name", e.target.value)}
                                className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Student Name"
                              />
                            ) : (
                              <span className="text-sm font-medium text-zinc-800">{student.name}</span>
                            )}
                          </td>
                          {isEditing && (
                            <td className="p-4 flex justify-center gap-2">
                              <button 
                                onClick={() => handleAddRow(idx)}
                                className="p-1.5 text-blue-500 hover:bg-blue-100 rounded-lg transition-colors"
                                title="Add Row Below"
                              >
                                <Plus size={16} />
                              </button>
                              <button 
                                onClick={() => handleRemoveRow(idx)}
                                className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                                title="Remove Row"
                              >
                                <Minus size={16} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {isEditing && students.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-4 text-center">
                            <button 
                              onClick={() => setStudents([{ reg: "", name: "" }])}
                              className="text-blue-500 hover:underline text-sm font-bold"
                            >
                              + Add First Student
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Syllabus Section */}
        {module === "syllabus" && programme && department && batch && semester && (
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-zinc-50 px-8 py-4 border-b border-zinc-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-zinc-800">Syllabus Details</h3>
                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  {semester} • {getRegulationForBatch(formatProgrammeKey(programme), batch)} • {department}
                </span>
              </div>
              {syllabusData?.file_url && (
                <a 
                  href={syllabusData.file_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                >
                  <Upload size={14} className="rotate-180" /> View Full Syllabus
                </a>
              )}
            </div>

            <div className="p-8">
              {loadingSyllabus ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-400 italic">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                  Loading syllabus...
                </div>
              ) : !syllabusData || !syllabusData.semesters || !syllabusData.semesters[deriveSemesterNumber(semester)] || syllabusData.semesters[deriveSemesterNumber(semester)].length === 0 ? (
                <div className="text-center py-20 text-zinc-400 italic">
                  No syllabus data found for the selected filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-zinc-50">
                        <th className="text-left p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">Subject Code</th>
                        <th className="text-left p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">Subject Name</th>
                        <th className="text-center p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">Credits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syllabusData.semesters[deriveSemesterNumber(semester)]
                        .filter(subject => subject != null && subject.isActive !== false)
                        .map((subject, idx) => (
                        <tr key={idx} className="group border-b border-zinc-50 hover:bg-blue-50/30 transition-colors">
                          <td className="p-4">
                            <span className="text-sm font-mono text-zinc-600">{subject.code}</span>
                          </td>
                          <td className="p-4">
                            <span className="text-sm font-medium text-zinc-800">{subject.name}</span>
                          </td>
                          <td className="p-4 text-center">
                            <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">{subject.credits}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Question Paper Section */}
        {module === "questionpaper" && programme && department && (
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-zinc-50 px-8 py-4 border-b border-zinc-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-zinc-800">Generated Question Papers</h3>
                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  {programme} • {department}
                </span>
              </div>
            </div>

            <div className="p-8">
              {loadingQPs ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-400 italic">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                  Loading question papers...
                </div>
              ) : (
                (() => {
                  const filteredQPs = questionPapers
                    .filter(qp => userAssignments.includes(qp.subject))
                    .filter(qp => !batch || qp.batch === batch)
                    .filter(qp => !academicYear || qp.academic_year === academicYear)
                    .filter(qp => !semester || getSemesterLabel(qp.semester) === getSemesterLabel(deriveSemesterNumber(semester)))
                    .filter(qp => !selectedSubject || `${qp.subject} - ${qp.subject_name}` === selectedSubject)
                    .filter(qp => {
                      // HOD can see everything in their dept OR papers forwarded to them
                      if (userRole === 'HOD') {
                        return qp.department === department || qp.forwarded_to === auth.currentUser?.uid;
                      }
                      // Faculty only sees their assignments
                      return userAssignments.includes(qp.subject);
                    })
                    .filter(qp => {
                      if (!selectedExam) return true;
                      // Get the exam name for this QP
                      let qpExamName = qp.exam_name;
                      if (!qpExamName) {
                        const configId = qp.qpaper_name;
                        qpExamName = ciaConfigs[configId]?.examName || configId;
                      }
                      // Compare with selected exam
                      return qpExamName === selectedExam || qp.qpaper_name === selectedExam;
                    });

                  if (filteredQPs.length === 0) {
                    return (
                      <div className="text-center py-20 text-zinc-400 italic">
                        No generated question papers found for the selected filters.
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-zinc-50">
                            <th className="text-left p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">Batch</th>
                            <th className="text-left p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">Academic Year</th>
                            <th className="text-center p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">Semester</th>
                            <th className="text-left p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">Subject</th>
                            <th className="text-left p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">Exam</th>
                            <th className="text-center p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">Status</th>
                            <th className="text-center p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredQPs.map((qp, idx) => (
                            <tr key={idx} className="group border-b border-zinc-50 hover:bg-blue-50/30 transition-colors">
                              <td className="p-4">
                                <span className="text-sm font-medium text-zinc-800">{qp.batch}</span>
                              </td>
                              <td className="p-4">
                                <span className="text-sm text-zinc-600">{qp.academic_year}</span>
                              </td>
                              <td className="p-4 text-center">
                                <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">{getSemesterLabel(qp.semester)}</span>
                              </td>
                              <td className="p-4">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-zinc-800">{qp.subject}</span>
                                  <span className="text-xs text-zinc-500 truncate max-w-[200px]">{qp.subject_name}</span>
                                </div>
                              </td>
                              <td className="p-4">
                                <span className="text-sm font-medium text-zinc-700">
                                  {(() => {
                                    if (qp.exam_name) return qp.exam_name;
                                    const configId = qp.qpaper_name;
                                    return ciaConfigs[configId]?.examName || configId;
                                  })()}
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  qp.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                  qp.status === 'forwarded' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                                  'bg-zinc-100 text-zinc-500'
                                }`}>
                                  {qp.status || 'Draft'}
                                </span>
                              </td>
                              <td className="p-4">
                                <div className="flex justify-center gap-2">
                                  <button 
                                    onClick={() => {
                                      setSelectedQP(qp);
                                      setShowQPModal(true);
                                    }}
                                    className="p-2 text-blue-500 hover:bg-blue-100 rounded-xl transition-all"
                                    title="View Question Paper"
                                  >
                                    <Eye size={18} />
                                  </button>
                                  <button 
                                    onClick={() => handleDownloadQP(qp)}
                                    className="p-2 text-green-500 hover:bg-green-100 rounded-xl transition-all"
                                    title="Download as Word"
                                  >
                                    <Download size={18} />
                                  </button>
                                  <button 
                                    onClick={() => navigate(`/questionpaper?id=${qp.id}&compositeKey=${qp.compositeKey}`)}
                                    className="p-2 text-amber-500 hover:bg-amber-100 rounded-xl transition-all"
                                    title="Continue Editing"
                                  >
                                    <Edit2 size={18} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {/* Consolidation Section */}
        {module === "consolidation" && programme && department && batch && semester && extraSubject && (
          <div className="space-y-6">
            {/* CO Max Marks Summary */}
            <div className="bg-white rounded-3xl shadow-xl p-6 border border-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-2 mb-4 ml-1">
                <div className="w-2 h-6 bg-blue-500 rounded-full" />
                <h4 className="text-sm font-bold text-zinc-600 uppercase tracking-wider">CO Max Marks</h4>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].map(co => (
                  <div key={co} className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100/50 text-center group hover:bg-blue-50 transition-all duration-300">
                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1 group-hover:text-blue-500">{co}</p>
                    <p className="text-2xl font-black text-blue-600">
                      {loadingConsolidation ? "..." : (consolidationData?.maxMarks?.[co] || 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Student Marks Table */}
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
              <div className="bg-zinc-50 px-8 py-4 border-b border-zinc-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                    <Users size={18} />
                  </div>
                  <h3 className="font-bold text-zinc-800 tracking-tight">Student-wise CO Marks</h3>
                  <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">
                    {extraSubject}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadConsolidationCSV}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                    title="Download consolidation as Excel/CSV"
                  >
                    Download as Excel
                  </button>
                </div>
              </div>
              
              <div className="p-6 overflow-x-auto">
                {loadingConsolidation ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    <p className="text-zinc-500 font-medium animate-pulse">Fetching marks from co_attainment...</p>
                  </div>
                ) : consolidationData ? (
                  <table className="w-full border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-zinc-100/50">
                        <th className="border border-zinc-200 px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider w-16 text-center">s.no</th>
                        <th className="border border-zinc-200 px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider text-left">Register number</th>
                        <th className="border border-zinc-200 px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider text-left">name</th>
                        <th className="border border-zinc-200 px-4 py-3 text-xs font-bold text-blue-600 uppercase tracking-wider text-center">co1</th>
                        <th className="border border-zinc-200 px-4 py-3 text-xs font-bold text-blue-600 uppercase tracking-wider text-center">co2</th>
                        <th className="border border-zinc-200 px-4 py-3 text-xs font-bold text-blue-600 uppercase tracking-wider text-center">co3</th>
                        <th className="border border-zinc-200 px-4 py-3 text-xs font-bold text-blue-600 uppercase tracking-wider text-center">co4</th>
                        <th className="border border-zinc-200 px-4 py-3 text-xs font-bold text-blue-600 uppercase tracking-wider text-center">co5</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student, idx) => {
                        const totals = consolidationData.studentTotals[student.reg] || {};
                        return (
                          <tr key={student.reg} className="hover:bg-blue-50/30 transition-colors group">
                            <td className="border border-zinc-100 px-4 py-3 text-center text-sm text-zinc-500 font-medium">{idx + 1}</td>
                            <td className="border border-zinc-100 px-4 py-3 text-sm font-mono text-zinc-600">{student.reg}</td>
                            <td className="border border-zinc-100 px-4 py-3 text-sm text-zinc-700 font-medium">{student.name}</td>
                            <td className="border border-zinc-100 px-4 py-3 text-center text-sm font-bold text-blue-600/80 group-hover:text-blue-600">{totals.CO1 || 0}</td>
                            <td className="border border-zinc-100 px-4 py-3 text-center text-sm font-bold text-blue-600/80 group-hover:text-blue-600">{totals.CO2 || 0}</td>
                            <td className="border border-zinc-100 px-4 py-3 text-center text-sm font-bold text-blue-600/80 group-hover:text-blue-600">{totals.CO3 || 0}</td>
                            <td className="border border-zinc-100 px-4 py-3 text-center text-sm font-bold text-blue-600/80 group-hover:text-blue-600">{totals.CO4 || 0}</td>
                            <td className="border border-zinc-100 px-4 py-3 text-center text-sm font-bold text-blue-600/80 group-hover:text-blue-600">{totals.CO5 || 0}</td>
                          </tr>
                        );
                      })}
                      {indirectCoAverages && (
                        <tr className="bg-emerald-50/60 border-t-2 border-emerald-200">
                          <td className="border border-zinc-200 px-4 py-3 text-center text-sm font-bold text-emerald-700" colSpan={3}>
                            CO Average ({indirectCoAverages.totalStudents} Students)
                          </td>
                          <td className="border border-zinc-200 px-4 py-3 text-center text-sm font-black text-emerald-700">{indirectCoAverages.averages.CO1.toFixed(2)}</td>
                          <td className="border border-zinc-200 px-4 py-3 text-center text-sm font-black text-emerald-700">{indirectCoAverages.averages.CO2.toFixed(2)}</td>
                          <td className="border border-zinc-200 px-4 py-3 text-center text-sm font-black text-emerald-700">{indirectCoAverages.averages.CO3.toFixed(2)}</td>
                          <td className="border border-zinc-200 px-4 py-3 text-center text-sm font-black text-emerald-700">{indirectCoAverages.averages.CO4.toFixed(2)}</td>
                          <td className="border border-zinc-200 px-4 py-3 text-center text-sm font-black text-emerald-700">{indirectCoAverages.averages.CO5.toFixed(2)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-20 text-center">
                    <div className="bg-zinc-50 inline-block p-4 rounded-full mb-4">
                      <FileX size={32} className="text-zinc-300" />
                    </div>
                    <p className="text-zinc-400 italic font-medium">No attainment data found for this subject.</p>
                    <p className="text-xs text-zinc-300 mt-1">Please ensure marks are entered in the Mark Entry module.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Attainment Summary Section */}
            {module === 'consolidation' && consolidationData && consolidationView === 'final' && (
              <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 mt-8">
                <div className="bg-zinc-50 px-8 py-4 border-b border-zinc-100 flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                    <CheckCircle2 size={18} />
                  </div>
                  <h3 className="font-bold text-zinc-800 tracking-tight">CO Attainment Summary</h3>
                  {mappingCutoff && (
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cutoff:</span>
                      <span className="text-sm font-black text-[#120c7a]">{mappingCutoff}%</span>
                    </div>
                  )}
                </div>
                
                <div className="p-8">
                  {!mappingCutoff || !mappingThresholds.length ? (
                    <div className="text-center py-10">
                      <AlertCircle className="mx-auto text-amber-500 mb-3" size={32} />
                      <p className="text-zinc-600 font-medium">Cutoff or Thresholds not configured.</p>
                      <p className="text-sm text-zinc-400 mt-1">Please set them in the CO Configuration page to see attainment summary.</p>
                    </div>
                  ) : attainmentSummary ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                      {Object.entries(attainmentSummary).map(([co, stats]) => (
                        <div key={co} className="bg-zinc-50 rounded-2xl p-5 border border-zinc-100 hover:border-blue-200 transition-all group">
                          <div className="flex justify-between items-start mb-4">
                            <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded text-[10px] font-black uppercase tracking-widest">{co}</span>
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Attainment</p>
                              <p className="text-xl font-black text-[#120c7a]">Level {stats.attainmentLevel}</p>
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-zinc-500 font-medium">≥ {mappingCutoff}%</span>
                              <span className="font-bold text-green-600">{stats.countGreaterEqual} Students</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-zinc-500 font-medium">&lt; {mappingCutoff}%</span>
                              <span className="font-bold text-red-500">{stats.countLess} Students</span>
                            </div>
                            <div className="pt-3 border-t border-zinc-200">
                              <div className="flex justify-between items-center mb-1.5">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Success Rate</span>
                                <span className="text-xs font-black text-blue-600">{stats.percentage}%</span>
                              </div>
                              <div className="w-full h-2 bg-zinc-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-blue-600 transition-all duration-1000" 
                                  style={{ width: `${stats.percentage}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* Final Overall Attainment Summary (Combined Direct + Indirect) */}
            {module === 'consolidation' && finalOverallAttainment && consolidationView === 'final' && (
              <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400 mt-8">
                <div className="bg-zinc-50 px-8 py-4 border-b border-zinc-100 flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
                    <CheckCircle2 size={18} />
                  </div>
                  <h3 className="font-bold text-zinc-800 tracking-tight">Final Overall CO Attainment (Direct + Indirect)</h3>
                </div>
                
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                    {Object.entries(finalOverallAttainment).map(([co, data]) => (
                      <div key={co} className="bg-emerald-50/30 rounded-2xl p-5 border border-emerald-100 hover:border-emerald-200 transition-all group">
                        <div className="flex justify-between items-start mb-4">
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-600 rounded text-[10px] font-black uppercase tracking-widest">{co}</span>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Final Attainment</p>
                            <p className="text-xl font-black text-emerald-700">{data.finalLevel}</p>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-500 font-medium">Direct ({data.directPct}%)</span>
                            <span className="font-bold text-zinc-700">{data.directLevel} = {(Number(data.directLevel) * data.directPct / 100).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-500 font-medium">Indirect ({data.indirectPct}%)</span>
                            <span className="font-bold text-zinc-700">{data.indirectMean} = {(Number(data.indirectMean) * data.indirectPct / 100).toFixed(2)}</span>
                          </div>
                          <div className="pt-3 border-t border-emerald-100">
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Weighted Score</span>
                              <span className="text-xs font-black text-emerald-600">{(Number(data.finalLevel) / 3 * 100).toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-emerald-600 transition-all duration-1000" 
                                style={{ width: `${(Number(data.finalLevel) / 3 * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Question Paper View Modal */}
        {showQPModal && selectedQP && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
              <div className="bg-zinc-50 px-8 py-4 border-b border-zinc-100 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-800 leading-tight">
                      {(() => {
                        if (selectedQP.exam_name) return selectedQP.exam_name;
                        const configId = selectedQP.qpaper_name;
                        return ciaConfigs[configId]?.examName || configId;
                      })()}
                    </h3>
                    <p className="text-xs text-zinc-500">{selectedQP.subject} • {selectedQP.subject_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleDownloadQP(selectedQP)}
                    className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"
                  >
                    <Download size={16} />
                    Download Word
                  </button>
                  <button 
                    onClick={() => setShowQPModal(false)}
                    className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-all"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 bg-zinc-50">
                <style>{`
                  .qp-print-wrapper table { border-collapse: collapse; width: 100%; border-color: #000 !important; }
                  .qp-print-wrapper td, .qp-print-wrapper th { border: 1px solid #000 !important; padding: 6px; font-family: 'Times New Roman', serif; }
                  .qp-print-wrapper .logo-img { max-width: 100%; height: 70px !important; }
                  .qp-print-wrapper p { margin: 0 0 5px 0; }
                  .qp-preview-container { background: white; }
                `}</style>
                <div 
                  className="bg-white shadow-2xl mx-auto qp-print-wrapper" 
                  style={{ width: '210mm', minHeight: '297mm', padding: '15mm', boxSizing: 'border-box' }}
                >
                  <div dangerouslySetInnerHTML={{ __html: renderQuestionPaper(selectedQP, modalCourseOutcomes, facultySignatureForQP, hodSignatureForQP, ciaConfigs) }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success Toast */}
        {showSuccess && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 z-[1000]">
            <div className="bg-green-500 p-1 rounded-full">
              <CheckCircle2 size={18} />
            </div>
            <span className="font-semibold">{successMessage}</span>
          </div>
        )}
        {/* Remove Student Modal */}
        {removeStudentModal.show && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <h3 className="text-xl font-bold text-slate-800 mb-4">Remove Student</h3>
              <p className="text-sm text-slate-600 mb-4">
                You are about to remove <strong>{students[removeStudentModal.index]?.name}</strong> ({students[removeStudentModal.index]?.reg}).
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reason for removal</label>
                  <textarea 
                    value={removeStudentModal.reason}
                    onChange={(e) => setRemoveStudentModal({...removeStudentModal, reason: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-red-500 outline-none"
                    rows="3"
                    placeholder="Why are you removing this student?"
                  ></textarea>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type register number to confirm</label>
                  <input 
                    type="text"
                    value={removeStudentModal.confirmReg}
                    onChange={(e) => setRemoveStudentModal({...removeStudentModal, confirmReg: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-red-500 outline-none"
                    placeholder={students[removeStudentModal.index]?.reg}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button 
                  onClick={() => setRemoveStudentModal({ show: false, index: null, reason: '', confirmReg: '' })}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmRemoveRow}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Delete Student
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal UI */}
        {modal.show && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6">
                <h3 className="text-xl font-bold text-zinc-800 mb-2">{modal.title}</h3>
                <p className="text-zinc-600">{modal.message}</p>
              </div>
              <div className="bg-zinc-50 px-6 py-4 flex justify-end gap-3">
                {modal.type === 'confirm' && (
                  <button 
                    className="px-4 py-2 text-zinc-600 font-semibold hover:bg-zinc-100 rounded-xl transition-colors"
                    onClick={() => setModal({ ...modal, show: false })}
                  >
                    Cancel
                  </button>
                )}
                <button 
                  className="px-6 py-2 bg-[#120c7a] text-white font-semibold rounded-xl hover:bg-opacity-90 transition-all shadow-lg shadow-blue-900/20"
                  onClick={async () => {
                    if (modal.onConfirm) {
                      await modal.onConfirm();
                    }
                    setModal({ ...modal, show: false });
                  }}
                >
                  {modal.type === 'confirm' ? 'Confirm' : 'OK'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
