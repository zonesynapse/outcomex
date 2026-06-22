import { useState, useEffect, useMemo, useRef } from "react";
import { db, auth } from "../firebase";
import { doc, collection, setDoc, getDoc, onSnapshot, getDocs } from "firebase/firestore";
import { 
  ChevronDown, 
  Save, 
  CheckCircle2,
  AlertCircle,
  Keyboard,
  Upload,
  Download
} from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatProgDisplay, formatBatchDisplay, formatProgrammeKey } from "../lib/utils";

const MARK_TYPES = ["Internal", "Assignment"];

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]/ ]/g, '_');
};

const deriveSemesterNumber = (label) => {
  if (!label) return '';
  const m = String(label).match(/(\d+)/);
  return m ? m[1] : '';
};

export default function MarkEntry() {
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);
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
        if (userData.role === 'Faculty' || userData.role === 'HOD') {
          const assignmentsRef = collection(db, 'subject_assignments');
          unsubscribeAssignments = onSnapshot(assignmentsRef, (assignSnap) => {
            const prefixes = [];
            assignSnap.forEach(d => {
              if (d.data()?.[auth.currentUser.uid]) {
                const yearMatch = d.id.match(/\d{4}-\d{4}/);
                if (yearMatch && yearMatch.index >= 2) {
                  prefixes.push(d.id.slice(0, yearMatch.index - 1));
                }
              }
            });
            setFacultyAssignPrefixes(prefixes);
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

  const handleDownloadTemplate = () => {
    if (!students.length) {
      showToastMsg("No students found to generate template.", "error");
      return;
    }

    const csvData = students.map(s => ({
      "Register Number": s.regNo || s.reg,
      "Name": s.name,
      "CO1": "",
      "CO2": "",
      "CO3": "",
      "CO4": "",
      "CO5": ""
    }));

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

  // Fetch CIA Configs
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const configsRef = collection(db, 'cia_configs'); // Firestore collection reference
        const snapshot = await getDocs(configsRef); // Use getDocs for collection
        if (!snapshot.empty) {
          const data = {}; // Convert QuerySnapshot to object
          snapshot.forEach(doc => { data[doc.id] = doc.data(); });
          const configsArray = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          setCiaConfigs(configsArray);
        }
      } catch (error) {
        console.error("Error fetching CIA configs:", error);
      }
    };
    fetchConfigs();
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

  // Filter Available Batches based on generated QPs
  useEffect(() => {
    if (!programme || !department || allQPs.length === 0) {
      setAvailableBatches([]);
      return;
    }
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/[–—]/g, '-');
    const needDept = norm(department);
    const needProg = norm(programme);

    const qpBatches = allQPs
      .filter(qp => 
        norm(qp.department || qp.dept || '') === needDept && 
        (!qp.programme || norm(qp.programme) === needProg)
      )
      .map(qp => qp.batch)
      .filter(Boolean);

    setAvailableBatches([...new Set(qpBatches)]);
  }, [programme, department, allQPs]);

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

  const filteredProgrammes = Object.keys(PROGRAMME_DEPARTMENTS).filter(prog => {
    if (userRole !== 'Faculty' && userRole !== 'HOD') return true;
    const progKey = formatProgrammeKey(prog);
    if (userRole === 'HOD' && formatProgrammeKey(userProgramme) === progKey) return true;
    return derivedProgs.includes(progKey);
  });

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
  }, [facultyAssignPrefixes, programme, PROGRAMME_DEPARTMENTS]);

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

  // Filter Academic Years based on batch and QPs
  useEffect(() => {
    if (!batch || !programme || !department || allQPs.length === 0) {
      setAcademicYears([]);
      return;
    }
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/[–—]/g, '-');
    const needDept = norm(department);
    const needProg = norm(programme);
    const needBatch = norm(batch);

    const qpAys = allQPs
      .filter(qp => 
        norm(qp.department || qp.dept || '') === needDept && 
        (!qp.programme || norm(qp.programme) === needProg) &&
        norm(qp.batch || '') === needBatch
      )
      .map(qp => qp.academic_year || qp.academicYear)
      .filter(Boolean);

    setAcademicYears([...new Set(qpAys)]);
    setAcademicYear("");
  }, [batch, programme, department, allQPs]);

  // Filter Semesters based on batch/AY and QPs
  useEffect(() => {
    if (!academicYear || !batch || !programme || !department || allQPs.length === 0) {
      setSemesters([]);
      return;
    }
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/[–—]/g, '-');
    const needDept = norm(department);
    const needProg = norm(programme);
    const needBatch = norm(batch);
    const needAy = norm(academicYear);

    const qpSems = allQPs
      .filter(qp => 
        norm(qp.department || qp.dept || '') === needDept && 
        (!qp.programme || norm(qp.programme) === needProg) &&
        norm(qp.batch || '') === needBatch &&
        norm(qp.academic_year || qp.academicYear || '') === needAy
      )
      .map(qp => qp.semester)
      .filter(Boolean);

    const uniqueSems = [...new Set(qpSems.map(s => String(s).trim()))];

    const sems = uniqueSems.map(s => `${s}${s === '1' ? 'st' : s === '2' ? 'nd' : s === '3' ? 'rd' : 'th'} Semester`);
    
    setSemesters(sems);
    setSemester("");
  }, [academicYear, batch, programme, department, allQPs]);

  // Filter Subjects based on assignments and QPs
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
      const needDept = norm(department);
      const needProg = norm(programme);
      const needBatch = norm(batch);
      const needAy = norm(academicYear);

      // Get subjects that have QPs
      const qpSubjects = allQPs
        .filter(qp => 
          norm(qp.department || qp.dept || '') === needDept && 
          (!qp.programme || norm(qp.programme) === needProg) &&
          norm(qp.batch || '') === needBatch &&
          norm(qp.academic_year || qp.academicYear || '') === needAy &&
          String(qp.semester || '').trim() === needSem
        )
        .map(qp => qp.subject || qp.course)
        .filter(Boolean);

      const uniqueQpSubjects = [...new Set(qpSubjects.map(s => norm(s)))];

      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userRole = userSnap.exists() ? userSnap.data().role : null;

        const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
        const assignmentCompositeKey = `${progKey}_${deptKey}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${needSem}${sectionSuffix}`;
        const assignmentDocRef = doc(db, 'subject_assignments', assignmentCompositeKey);
        const assignmentSnap = await getDoc(assignmentDocRef);
        
        let assignedCodes = [];
        if (assignmentSnap.exists()) {
          const assignments = assignmentSnap.data();
          if (userRole === 'Admin' || userRole === 'HOD' || userRole === 'Principal') {
            Object.values(assignments).forEach(userAssignments => {
              if (Array.isArray(userAssignments)) assignedCodes.push(...userAssignments);
            });
          } else {
            assignedCodes = assignments[currentUser.uid] || [];
          }
        }
        
        // Filter assigned codes by those that have QPs
        const filteredAssignedCodes = assignedCodes.filter(code => uniqueQpSubjects.includes(norm(code)));
        const uniqueCodes = [...new Set(filteredAssignedCodes)];
        
        // Fetch syllabus names
        const regulation = getRegulationForBatch(progKey, batch); // Ensure regulation is available
        const syllabusDocId = `${progKey}_${deptKey}_${sanitizeKey(regulation)}`;
        const syllabusSnap = await getDoc(doc(db, 'syllabus_data', syllabusDocId)); // Firestore doc reference
        const syllabusData = syllabusSnap.data(); // Use .data() for Firestore documents
        const syllabusMap = {};
        if (syllabusData && syllabusData.semesters && syllabusData.semesters[needSem]) {
          syllabusData.semesters[needSem].forEach(s => {
            syllabusMap[s.code] = s.name;
          });
        }

        const mappedSubjects = uniqueCodes.map(code => ({
          value: code,
          text: syllabusMap[code] ? `${code} - ${syllabusMap[code]}` : code
        }));

        setSubjects(mappedSubjects);
      } catch (error) {
        console.error("Error fetching subjects:", error);
        setSubjects([]);
      }
      setSubject("");
    };
    fetchSubjectNames();
  }, [batch, academicYear, semester, programme, department, section, getRegulationForBatch, allQPs]);

  // Filter Available Exams based on generated QPs and University Configs
  useEffect(() => {
    if (!batch || !academicYear || !semester || !subject || !programme || !department) {
      setAvailableExams([]);
      return;
    }

    const norm = (s) => String(s || '').trim().toLowerCase().replace(/[–—]/g, '-');
    const needDept = norm(department);
    const needProg = norm(programme);
    const needBatch = norm(batch);
    const needAy = norm(academicYear);
    const needSem = deriveSemesterNumber(semester);
    const needSub = norm(subject);

    // 1. Get exams from generated QPs
    const qpExams = allQPs
      .filter(qp => {
        return norm(qp.department || qp.dept || '') === needDept && 
          (!qp.programme || norm(qp.programme) === needProg) && 
          norm(qp.batch || '') === needBatch &&
          norm(qp.academic_year || qp.academicYear || '') === needAy &&
          String(qp.semester || '').trim() === needSem &&
          norm(qp.subject || '') === needSub;
      })
      .map(qp => {
        const rawName = qp.qpaper_name || qp.qpaperName;
        const matchedConfig = ciaConfigs.find(c => c.id === rawName || c.examName === rawName);
        return {
          value: rawName,
          text: matchedConfig ? matchedConfig.examName : rawName,
          type: matchedConfig?.isUniversity ? 'University' : (qp.assessment_type === 'Assignment' ? 'Assignment' : 'Internal'),
          hasQP: true
        };
      })
      .filter(e => e.type !== 'University'); // University exams must be configured in CIA to show up

    // 2. Get University / Indirect Assessment Exams from ciaConfigs
    const uniExams = ciaConfigs
      .filter(c => 
        (c.isUniversity || c.isIndirectAssessment) &&
        formatProgDisplay(c.program) === formatProgDisplay(programme) &&
        c.department === department &&
        c.batch === batch &&
        c.academicYear === academicYear &&
        String(c.semester) === needSem
      )
      .map(c => {
        // Check if a QP exists for this university exam
        const qpExists = allQPs.some(qp => 
          norm(qp.department || qp.dept || '') === needDept && 
          (!qp.programme || norm(qp.programme) === needProg) && 
          norm(qp.batch || '') === needBatch &&
          norm(qp.academic_year || qp.academicYear || '') === needAy &&
          String(qp.semester || '').trim() === needSem &&
          norm(qp.subject || '') === needSub &&
          norm(qp.qpaper_name || qp.qpaperName || '') === norm(c.id || c.examName)
        );

        return {
          value: c.id,
          text: c.examName,
          type: 'University',
          isIndirectAssessment: !!c.isIndirectAssessment,
          hasQP: qpExists
        };
      });

    const combined = [...uniExams, ...qpExams];

    // Remove duplicates based on value, prioritizing hasQP
    const uniqueExams = [];
    const seen = new Set();
    for (const e of combined) {
      if (e.value && !seen.has(e.value)) {
        seen.add(e.value);
        uniqueExams.push(e);
      } else if (e.value && seen.has(e.value)) {
        const existing = uniqueExams.find(ex => ex.value === e.value);
        if (e.hasQP) existing.hasQP = true;
      }
    }

    setAvailableExams(uniqueExams);
    setExam("");
  }, [batch, academicYear, semester, subject, programme, department, allQPs, ciaConfigs]);

  // Auto-set Mark Type when Exam is selected
  useEffect(() => {
    if (exam && availableExams.length > 0) {
      const selectedExam = availableExams.find(e => e.value === exam);
      if (selectedExam) {
        const isUni = selectedExam.type === 'University';
        setIsUniversityExam(isUni);
        setIsIndirectAssessment(!!selectedExam.isIndirectAssessment);

        if (isUni || selectedExam.isIndirectAssessment) {
          if (selectedExam.isIndirectAssessment || selectedExam.hasQP) {
            setMarkType("CO Wise");
          } else {
            setMarkType("Overall");
          }
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

  // Fetch Question Paper
  useEffect(() => {
    const fetchQP = async () => {
      if (!department || !academicYear || !subject || !exam || !semester) {
        setQpParts([]);
        setQpMeta({});
        return;
      }

      setLoading(true);
      try {
        const norm = (s) => String(s || '').trim().toLowerCase().replace(/[–—]/g, '-'); // Normalize string for comparison
        const needDept = norm(department);
        const needAy = norm(academicYear);
        const needSub = norm(subject);
        const targetExam = norm(exam);
        const targetSem = deriveSemesterNumber(semester);

        // Find matching summary in allQPs to get composite keys
        const match = allQPs.find(qp => {
          const qpDept = norm(qp.department || qp.dept || '');
          const qpAy = norm(qp.academic_year || qp.academicYear || '');
          const qpSub = norm(qp.subject || qp.course || '');
          const qpExam = norm(qp.qpaper_name || qp.qpaperName || '');
          const qpSem = String(qp.semester || '').trim();
          
          return qpSub === needSub && 
                 qpAy === needAy && 
                 qpDept === needDept && 
                 qpExam === targetExam && 
                 qpSem === targetSem;
        });

        if (match) {
          // Full data already in match (parent doc stores full payload)
          setQpParts(Array.isArray(match.parts) ? match.parts : []);
          setAssignmentConfig(Array.isArray(match.assignment_config) ? match.assignment_config : []);
          
          setQpMeta({ 
            qpaper_name: match.qpaper_name,
            semester: match.semester,
            co_weightage: match.co_weightage || {}
          });
        } else {
          setQpParts([]);
          setAssignmentConfig([]);
          setQpMeta({});
        }
      } catch (error) {
        console.error("QP Fetch Error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchQP();
  }, [department, academicYear, subject, exam, semester, markType, allQPs]);

  // Fetch Grade Configs when regulation changes
  useEffect(() => {
    if (programme && batch) {
      const progKey = formatProgrammeKey(programme);
      const regulation = getRegulationForBatch(progKey, batch);
      if (regulation) { // Ensure regulation is available
        const gradeRef = doc(db, 'grade_configs', sanitizeKey(regulation)); // Firestore doc reference
        onSnapshot(gradeRef, (snapshot) => { // Use onSnapshot for real-time updates
          if (snapshot.exists()) {
            setGradeConfigs(snapshot.data()); // Use .data() for Firestore documents
          } else {
            setGradeConfigs([]);
          }
        });
      }
    }
  }, [programme, batch, getRegulationForBatch]);

  // Fetch Students and Saved Marks
  useEffect(() => {
    const loadData = async () => {
      if (!programme || !department || !batch || !academicYear || !semester || !subject || !exam || !markType) {
        setStudents([]);
        setMarksData({});
        return;
      }

      setLoading(true);
      try {
        // 1. Fetch Students
        const progKey = formatProgrammeKey(programme);
        const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
        const studentDocId = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}${sectionSuffix}`;
        const studentRef = doc(db, 'students', studentDocId); // Firestore doc reference
        const studentSnapshot = await getDoc(studentRef); // Use getDoc for Firestore
        const studentData = studentSnapshot.data(); // Use .data() for Firestore documents
        
        let studentList = [];
        if (studentData) {
          studentList = Object.entries(studentData)
            .filter(([key]) => !key.startsWith('_'))
            .map(([reg, name]) => ({ reg, name }));
            
          const order = studentData._order || studentData.order;
          if (order && Array.isArray(order)) {
            studentList.sort((a, b) => order.indexOf(a.reg) - order.indexOf(b.reg));
          } else {
            studentList.sort((a, b) => a.reg.localeCompare(b.reg));
          }
        }
        setStudents(studentList);

        // Check course enrollments for this subject and semester
        if (subject) {
          const sectionSuffix = section ? `_${sanitizeKey(section)}` : '';
          const enrollDocId = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${deriveSemesterNumber(semester)}_${subject}${sectionSuffix}`;
          const enrollSnap = await getDoc(doc(db, 'course_enrollments', enrollDocId)); // Firestore doc reference
          const enrolled = {};
          if (enrollSnap.exists()) {
            const obj = enrollSnap.data(); // Use .data() for Firestore documents
            Object.keys(obj).forEach(k => { enrolled[k] = true; });
            // Filter students to only enrolled ones
            studentList = studentList.filter(s => enrolled[s.reg]);
            setStudents(studentList);
          }
          setEnrolledRegs(enrolled);
        } else {
          setEnrolledRegs({});
        }

        // Enrich studentList with regNo from student_section_index
        try {
          const sectionIndexRef = doc(db, 'student_section_index', studentDocId);
          const sectionIndexSnap = await getDoc(sectionIndexRef);
          if (sectionIndexSnap.exists()) {
            const sectionIndexData = sectionIndexSnap.data();
            studentList = studentList.map(s => ({
              ...s,
              regNo: sectionIndexData[s.reg]?.regNo || ""
            }));
            setStudents(studentList);
          }
        } catch (e) {
          // Non-critical — index may not exist yet
        }

        const marksKey = [batch, programme, department, subject, exam, academicYear, semester, markType]
          .map(sanitizeKey)
          .join('_') + (section ? `_${sanitizeKey(section)}` : '');
        
        const marksDocRef = doc(db, 'marks', marksKey);
        const marksSnapshot = await getDoc(marksDocRef);
        const savedMarks = marksSnapshot.data() || {};

        const initialMarks = {};
        studentList.forEach(s => {
          const saved = savedMarks?.students?.[s.reg] || {};
          initialMarks[s.reg] = {
            partA: saved.partA || {},
            partB: saved.partB || {},
            partC: saved.partC || {},
            assignment: saved.assignment || {},
            overall: saved.overall || "",
            grade: saved.grade || "",
            gradePoint: saved.gradePoint || "",
            absent: !!saved.absent,
            total: saved.total || 0,
            CO1: saved.CO1 ?? "",
            CO2: saved.CO2 ?? "",
            CO3: saved.CO3 ?? "",
            CO4: saved.CO4 ?? "",
            CO5: saved.CO5 ?? ""
          };
        });
        setMarksData(initialMarks);

      } catch (error) {
        console.error("Data Load Error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [programme, department, batch, academicYear, semester, subject, exam, markType]);

  const calculateTotal = (regno, currentMarks) => {
    const s = currentMarks[regno];
    if (s.absent) return "AB";

    if (markType === 'Overall') {
      return isNaN(Number(s.overall)) ? s.overall : Number(s.overall);
    }

    if (markType === 'CO Wise') {
      const coSum = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].reduce((a, co) => a + Number(s[co] || 0), 0);
      return coSum;
    }
    
    if (markType === 'Assignment') {
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
      const enrollRef = doc(db, 'course_enrollments', progKey, sanitizeKey(department), sanitizeKey(batch), sanitizeKey(academicYear), deriveSemesterNumber(semester), subject, reg);
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

    const marksDocId = [batch, programme, department, subject, exam, academicYear, semester, markType]
      .filter(Boolean)
      .map(sanitizeKey)
      .join('_') + (section ? `_${sanitizeKey(section)}` : '');
    
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
      entry_mode: isUniversityExam ? markType : 'CO Wise',
      qpaper_meta: qpMeta
    };

    const enrichedMarksData = {};
    
    Object.keys(marksData).forEach(regno => {
      const sData = marksData[regno];
      const coTotals = {};
      
      if (!sData.absent) {
        if (markType === 'CO Wise') {
          ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].forEach(co => {
            coTotals[co] = Number(sData[co] || 0);
          });
        } else if (markType === 'Overall' && isUniversityExam) {
          ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].forEach(co => {
            coTotals[co] = Number(sData.overall || 0);
          });
        } else if (markType === 'Assignment') {
          Object.entries(sData.assignment || {}).forEach(([qKey, mark]) => {
            const qIndex = parseInt(qKey.replace('Q', '')) - 1;
            const co = assignmentConfig[qIndex]?.co;
            if (co && mark !== '') {
              const coKeys = String(co).split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
              coKeys.forEach(coKey => {
                coTotals[coKey] = (coTotals[coKey] || 0) + Number(mark || 0);
              });
            }
          });
        } else {
          // Part A
          Object.entries(sData.partA || {}).forEach(([qKey, mark]) => {
            const qNo = qKey.replace('Q', '');
            const co = getCOForQuestion('A', qNo);
            if (co && mark !== '') {
              const coKeys = String(co).split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
              coKeys.forEach(coKey => {
                coTotals[coKey] = (coTotals[coKey] || 0) + Number(mark || 0);
              });
            }
          });
          
          // Part B
          Object.entries(sData.partB || {}).forEach(([qKey, data]) => {
            const qNo = qKey.replace('Q', '');
            const co = getCOForQuestion('B', qNo, data.radio);
            if (co && data.mark !== '' && data.mark !== undefined) {
              const coKeys = String(co).split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
              coKeys.forEach(coKey => {
                coTotals[coKey] = (coTotals[coKey] || 0) + Number(data.mark || 0);
              });
            }
          });
          
          // Part C
          Object.entries(sData.partC || {}).forEach(([qKey, data]) => {
            const qNo = qKey.replace('Q', '');
            const co = getCOForQuestion('C', qNo, data.radio);
            if (co && data.mark !== '' && data.mark !== undefined) {
              const coKeys = String(co).split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
              coKeys.forEach(coKey => {
                coTotals[coKey] = (coTotals[coKey] || 0) + Number(data.mark || 0);
              });
            }
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

    try {
      await setDoc(doc(db, 'marks', marksDocId), payload); // Use setDoc for Firestore
      
      // Calculate and update CO attainment for this specific exam only
      const coAttainmentDocId = [batch, programme, department, subject, academicYear, semester].map(sanitizeKey).join('_') + (section ? `_${sanitizeKey(section)}` : '');
      const examDocId = sanitizeKey(exam || (meta.qpaper_meta?.qpaper_name || 'exam'));

      // Determine CO max marks for this exam
      // co weightage for this exam
      let coMaxMarks = {};
      if (meta.qpaper_meta?.co_weightage && Object.keys(meta.qpaper_meta.co_weightage).length > 0) {
        coMaxMarks = Object.entries(meta.qpaper_meta.co_weightage).reduce((acc, [k, v]) => {
          acc[k.trim().toUpperCase()] = Number(v || 0);
          return acc;
        }, {});
      } else if (isUniversityExam || isIndirectAssessment) {
        // Default max marks for university (100) or indirect (3)
        const maxVal = isIndirectAssessment ? 3 : 100;
        ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].forEach(co => {
          coMaxMarks[co] = maxVal;
        });
      } else {
        // Fallback for regular internal exams: derive max marks from qpParts structure
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
        coMaxMarks = derived;
      }

      // Ensure keys exist for common COs to prevent dashboard rendering issues
      ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].forEach(co => { if (!(co in coMaxMarks)) coMaxMarks[co] = 0; });

      // Build per-student CO totals from the enrichedMarksData we just saved
      const studentsCo = {};
      Object.entries(enrichedMarksData).forEach(([regno, sData]) => {
        const studentName = (students.find(st => st.reg === regno)?.name) || '';
        const entry = { name: studentName };
        Object.keys(sData).forEach(k => {
          if (/^CO\d+/i.test(k) && typeof sData[k] === 'number') {
            entry[k.trim().toUpperCase()] = sData[k];
          }
        });
        studentsCo[regno] = entry;
      });

      // Write per-exam attainment under subjectKey / examKey
      await setDoc(doc(db, 'co_attainment', coAttainmentDocId, 'exams', examDocId), { // Firestore subcollection path
        _meta: {
          batch, programme, department, subject, academicYear, semester,
          exam: exam, exam_name: matchedAvail?.text || exam, updated_at: new Date().toISOString()
        },
        co_max_marks: coMaxMarks,
        students: studentsCo
      });

      showToastMsg("Marks Saved and CO Attainment Updated!", "success");
    } catch (error) {
      console.error("Save Error:", error);
      showToastMsg("Failed to save marks.", "error");
    }
  };

  const handleDownloadExcel = () => {
    const partA = qpParts.find(p => p.part === 'A');
    const partB = qpParts.find(p => p.part === 'B');
    const partC = qpParts.find(p => p.part === 'C');

    const isAssignment = markType === 'Assignment';
    const isOverall = markType === 'Overall';
    const isCOWise = markType === 'CO Wise';

    let mainHeader = ["Register Number", "Student Name", "Absent"];
    let subHeader = ["", "", ""];

    if (isOverall) {
      mainHeader.push("Grade", "Grade Point", "Mark");
      subHeader.push("", "", "");
    } else if (isCOWise) {
      ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].forEach(co => {
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
        ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].forEach(co => {
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
        const cos = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'];
        const idx = cos.indexOf(qNo);
        if (idx < cos.length - 1) target = { regno, part: 'CO', qNo: cos[idx + 1] };
      } else if (part === 'Assignment') {
        if (qNo < assignmentConfig.length) target = { regno, part: 'Assignment', qNo: qNo + 1 };
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
        const cos = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'];
        const idx = cos.indexOf(qNo);
        if (idx > 0) target = { regno, part: 'CO', qNo: cos[idx - 1] };
      } else if (part === 'Assignment') {
        if (qNo > 1) target = { regno, part: 'Assignment', qNo: qNo - 1 };
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
                         markType === 'Assignment' ? 'Assignment' :
                         qnosA.length > 0 ? 'A' :
                         qnosB.length > 0 ? 'B' :
                         qnosC.length > 0 ? 'C' : null;
        
        const firstQ = firstPart === 'CO' ? 'CO1' :
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
                    <option key={b} value={b}>{formatBatchDisplay(b)}</option>
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
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Subject</label>
              <div className="relative">
                <select 
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
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
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Exam</label>
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

            {!isIndirectAssessment && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Mark Type</label>
                <div className="relative">
                  <select 
                    disabled={!exam}
                    value={markType}
                    onChange={(e) => setMarkType(e.target.value)}
                    className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
                  >
                    <option value="">Select Mark Type</option>
                    {isUniversityExam ? (
                      <>
                        {availableExams.find(e => e.value === exam)?.hasQP && <option value="CO Wise">CO Wise</option>}
                        <option value="Overall">Overall</option>
                      </>
                    ) : (
                      MARK_TYPES.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-zinc-100">
          {(isUniversityExam || isIndirectAssessment) && (
            <div className="bg-blue-50 px-6 py-2 border-b border-blue-100 text-blue-700 text-xs font-bold">
              Note: values of each co&apos;s taken by 3 scale
            </div>
          )}
          <div className="bg-[#120c7a] px-6 py-2 flex justify-between items-center">
            <h4 className="text-white font-bold text-sm">Mark Entry Table</h4>
            <div className="flex gap-2">
              {isIndirectAssessment && (
                <div className="flex items-center gap-3">
                  <div className="hidden lg:flex flex-col text-[10px] text-white/80 leading-tight text-right mr-2 border-r border-white/20 pr-3">
                    <span className="font-bold opacity-60 text-[8px] uppercase tracking-widest">CSV Format:</span>
                    <span className="italic font-medium">Reg No, Name, CO1, CO2, CO3...</span>
                  </div>
                  <button 
                    onClick={handleDownloadTemplate}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-900/20"
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
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-blue-900/20"
                  >
                    <Upload size={14} /> Upload CO Marks (CSV)
                  </button>
                </div>
              )}
              <button 
                onClick={handleDownloadExcel}
                className="bg-white hover:bg-zinc-100 text-[#120c7a] px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Download size={14} /> Download as Excel
              </button>
              <button 
                onClick={handleSave}
                className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Save size={14} /> Save to Dashboard
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#f8fafc]">
                  <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-left w-48">Register Number</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-left">Student Name</th>
                  {markType !== 'Assignment' && <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-24">Absent</th>}
                  
                  {markType === 'Overall' ? (
                    <>
                      <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-32">Grade</th>
                      <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-32">Grade Point</th>
                      <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-32">Mark</th>
                    </>
                  ) : markType === 'CO Wise' ? (
                    <>
                      {['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].map(co => (
                        <th key={co} className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-24">{co}</th>
                      ))}
                    </>
                  ) : markType === 'Assignment' ? (
                    <>
                      {assignmentConfig.map((q, idx) => (
                        <th key={idx} className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-24">
                          Q{idx + 1} ({q.marks}m)
                        </th>
                      ))}
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
                {loading ? (
                  <tr>
                    <td colSpan={10} className="p-20 text-center text-slate-400 italic">
                      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      Loading data...
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-20 text-center text-slate-400 italic">
                      Select all filters to view student list.
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
                        {markType !== 'Assignment' && (
                          <td className="px-6 py-3 text-center border-r border-slate-50">
                            <input 
                              type="checkbox" 
                              checked={isAbsent}
                              onChange={(e) => handleAbsentChange(s.reg, e.target.checked)}
                              className="absent-checkbox w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mx-auto block cursor-pointer"
                            />
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
                            {['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].map(co => (
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
                                    setMarksData(prev => ({
                                      ...prev,
                                      [s.reg]: {
                                        ...prev[s.reg],
                                        [co]: parsed
                                      }
                                    }));
                                  }}
                                  className="w-16 h-8 border border-slate-200 rounded-md text-center focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-50 mx-auto block"
                                />
                              </td>
                            ))}
                          </>
                        ) : markType === 'Assignment' ? (
                          <>
                            {assignmentConfig.map((q, idx) => (
                              <td key={idx} className={`px-6 py-3 border-r border-slate-50 ${isAbsent ? 'opacity-40 grayscale' : ''}`}>
                                <div className="flex items-center justify-center gap-3">
                                  <input 
                                    id={`input-Assignment-${idx + 1}-${s.reg}`}
                                    type="text"
                                    inputMode="decimal"
                                    disabled={isAbsent}
                                    value={data.assignment?.[`Q${idx + 1}`] ?? ""}
                                    onKeyDown={(e) => handleKeyDown(e, s.reg, 'Assignment', idx + 1)}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val !== '' && isNaN(val)) return;
                                      const max = q.marks || 100;
                                      let parsed = val === '' ? '' : Number(val);
                                      if (parsed !== '' && parsed > max) {
                                        showToastMsg(`Mark limit exceeded! Maximum is ${max}.`, 'error');
                                        parsed = '';
                                      }
                                      if (parsed !== '' && parsed < 0) parsed = 0;
                                      handleAssignmentMark(s.reg, idx, parsed);
                                    }}
                                    className="w-16 h-8 border border-slate-200 rounded-md text-center focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                                  />
                                </div>
                              </td>
                            ))}
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