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

  useEffect(() => {
    let unsubscribeAssignments = null;

    const user = auth.currentUser;
    if (user) {
      const userRef = doc(db, 'users', user.uid); // Firestore doc reference
      getDoc(userRef).then(snapshot => { // Use getDoc for Firestore
        if (snapshot.exists()) {
          const userData = snapshot.data(); // Use .data() for Firestore documents
          setUserRole(userData.role);
          if (userData.role === 'Faculty') {
            const assignmentsRef = collection(db, 'subject_assignments');
            const unsubscribe = onSnapshot(assignmentsRef, (assignSnap) => {
              const data = {}; assignSnap.forEach(d => { data[d.id] = d.data(); });
              const progs = new Set();
              const depts = new Set();

              Object.entries(data).forEach(([progKey, deptData]) => {
                Object.entries(deptData || {}).forEach(([deptKey, batchData]) => {
                  if (JSON.stringify(batchData).includes(user.uid)) {
                    progs.add(progKey);
                    depts.add(deptKey);
                  }
                });
              });

              setAssignedProgs(Array.from(progs));
              setAssignedDepts(Array.from(depts));
            });
            unsubscribeAssignments = unsubscribe;
          }
        }
      });
    }

    return () => {
      if (unsubscribeAssignments) {
        unsubscribeAssignments();
      }
    };
  }, []);

  const [poList, setPoList] = useState([]);
  const [psoList, setPsoList] = useState([]);
  const [coList, setCoList] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [mappingCutoff, setMappingCutoff] = useState("");
  const [mappingThresholds, setMappingThresholds] = useState([
    { level: 3, min: 71, max: 100 },
    { level: 2, min: 61, max: 70 },
    { level: 1, min: 51, max: 60 },
    { level: 0, min: 0, max: 50 },
  ]);
  const [mappingDirectIndirectSplit, setMappingDirectIndirectSplit] = useState({ direct: 100, indirect: 0 });

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
    
    const actionsRef = doc(db, 'po_actions_taken', `${progKey}_${deptKey}_${batchKey}_${regKey}`);

    const unsubscribe = onSnapshot(actionsRef, (snapshot) => { // Use onSnapshot for real-time updates
      if (snapshot.exists()) {
        setActionsTaken(snapshot.data()); // Use .data() for Firestore documents
      } else {
        setActionsTaken({});
      }
    });

    return () => unsubscribe();
  }, [batch, programme, department, regulation]);

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

      const actionRef = doc(db, 'po_actions_taken', `${progKey}_${deptKey}_${batchKey}_${regKey}`);

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

      const actionRef = doc(db, 'po_actions_taken', `${progKey}_${deptKey}_${batchKey}_${regKey}`);
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
          data[doc.id] = doc.data();
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
    return `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(regulation)}_${sanitizeKey(subject)}_${sanitizeKey(academicYear)}_${sanitizeKey(semester)}`;
  }, [batch, programme, regulation, subject, academicYear, semester]);

  const getSemesters = () => {
    if (!academicYear || !batch) return [];
    const [batchStart] = batch.split("-").map(Number);
    const [yearStart] = academicYear.split("-").map(Number);
    const yearIndex = yearStart - batchStart;
    return SEMESTER_MAPPING[yearIndex] || [];
  };

  const filteredProgrammes = Object.keys(PROGRAMME_DEPARTMENTS).filter(prog => {
    if (userRole !== 'Faculty') return true;
    return assignedProgs.includes(formatProgrammeKey(prog));
  });

  const filteredDepartments = (PROGRAMME_DEPARTMENTS[programme] || []).filter(dept => {
    if (userRole !== 'Faculty') return true;
    return assignedDepts.includes(sanitizeKey(dept));
  });

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

        const assignmentCompositeKey = `${progKey}_${deptKey}_${sanitizeKey(batch)}_${sanitizeKey(academicYear || '')}_${semNum}`;
        const assignmentRef = doc(db, 'subject_assignments', assignmentCompositeKey); // Firestore flat key path
        const assignmentSnap = await getDoc(assignmentRef); // Use getDoc for Firestore
        
        if (assignmentSnap.exists()) {
          const assignments = assignmentSnap.data(); // Use .data() for Firestore documents
          
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
  }, [programme, department, batch, regulation, semester, academicYear, getRegulationForBatch]);

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
        if (summaryKey) { // summaryKey is the document ID
          const summaryRef = doc(db, 'mapping_summary', summaryKey); // Firestore doc reference
          const summarySnap = await getDoc(summaryRef); // Use getDoc for Firestore
          const summaryData = summarySnap.data() || {}; // Use .data() for Firestore documents
          
          setSummary(summaryData.summary || {});
          if (summaryData.cutoff !== undefined) setMappingCutoff(summaryData.cutoff);
          if (summaryData.thresholds) setMappingThresholds(summaryData.thresholds);
          if (summaryData.directIndirectSplit) {
            setMappingDirectIndirectSplit({
              direct: Number(summaryData.directIndirectSplit.direct || 100),
              indirect: Number(summaryData.directIndirectSplit.indirect || 0)
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
  }, [batch, programme, department, regulation, subject, academicYear, semester, summaryKey]);

  // Compute final CO attainment (Direct + Indirect) for this subject so PO attainment can be calculated
  useEffect(() => {
    

    const computeFinalAttainment = async () => {
      if (!batch || !programme || !department || !subject || !academicYear || !semester) {
        setFinalOverallAtt({});
        return;
      }

      setLoadingFinal(true);
      try {
        const coAttainmentDocId = [batch, programme, department, subject, academicYear, semester].map(sanitizeKey).join('_');
        const coAttainmentRef = doc(db, 'co_attainment', coAttainmentDocId); // Firestore doc reference
        const snap = await getDoc(coAttainmentRef); // Use getDoc for Firestore
        const data = snap.data(); // Use .data() for Firestore documents
        if (!data) {
          setFinalOverallAtt({});
          setLoadingFinal(false);
          return;
        }

        // Build children list (legacy or per-exam)
        let children = [];
        if (data.co_max_marks || data.students) {
          const m = data._meta || {};
          const isUniversity = !!(
            m.is_university ||
            (m.qpaper_name && ciaConfigs[m.qpaper_name] && (ciaConfigs[m.qpaper_name].is_university || ciaConfigs[m.qpaper_name].isUniversity)) ||
            String(m.exam || '').toLowerCase().includes('uni') ||
            String(m.qpaper_name || '').toLowerCase().includes('uni')
          );
          const isIndirect = !!(
            m.isIndirectAssessment ||
            (m.qpaper_name && ciaConfigs[m.qpaper_name]?.isIndirectAssessment) ||
            (m.exam && ciaConfigs[m.exam]?.isIndirectAssessment)
          );
          children = [{ key: '_legacy', data, isUniversity, isIndirect, label: m.exam || 'Legacy' }];
        } else { // Assuming data contains sub-documents for each exam
          // In Firestore, if data is a document, and its fields are exam IDs, then we need to iterate its fields.
          const entries = Object.entries(data).filter(([, v]) => v && (v.students || v.co_max_marks)).map(([k, v]) => ({ key: k, data: v })); // This assumes data is an object of exam documents
          children = entries.map(e => {
            const m = e.data._meta || {};
            let label = m.exam || m.qpaper_name || e.key;
            if (m.exam && ciaConfigs[m.exam] && ciaConfigs[m.exam].examName) label = ciaConfigs[m.exam].examName;
            if (m.qpaper_name && ciaConfigs[m.qpaper_name] && ciaConfigs[m.qpaper_name].examName) label = ciaConfigs[m.qpaper_name].examName;
            const isUniversity = !!(
              m.is_university ||
              (m.qpaper_name && ciaConfigs[m.qpaper_name] && (ciaConfigs[m.qpaper_name].is_university || ciaConfigs[m.qpaper_name].isUniversity)) ||
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
        }

        // sort by saved/updated desc
        children.sort((a, b) => {
          const ta = new Date(a.data._meta?.updated_at || a.data._meta?.saved_at || 0).getTime();
          const tb = new Date(b.data._meta?.updated_at || b.data._meta?.saved_at || 0).getTime();
          return tb - ta;
        });

        // choose latest internal (non-university, non-indirect) child for direct attainment
        const internalChildren = children.filter(c => !c.isUniversity && !c.isIndirect);
        const chosen = internalChildren.length > 0 ? internalChildren[0] : (children[0] || null);

        const consolidationData = chosen ? { studentTotals: chosen.data.students || {}, maxMarks: chosen.data.co_max_marks || {} } : { studentTotals: {}, maxMarks: {} };

        // Compute direct attainment summary
        const coKeysLocal = Object.keys(consolidationData.maxMarks || {}).sort((a, b) => {
          const na = Number(a.replace(/[^0-9]/g, '')) || 0;
          const nb = Number(b.replace(/[^0-9]/g, '')) || 0;
          return na - nb;
        });

        const attainmentStats = {};
        coKeysLocal.forEach(co => {
          let countGreaterEqual = 0;
          let countLess = 0;
          const studentTotals = Object.values(consolidationData.studentTotals || {});
          const totalStudents = studentTotals.length;

          studentTotals.forEach(s => {
            const mark = s[co] || 0;
            const maxMark = consolidationData.maxMarks[co] || 100;
            const markPct = maxMark > 0 ? (mark / maxMark) * 100 : 0;
            if (markPct >= Number(mappingCutoff || 0)) {
              countGreaterEqual++;
            } else {
              countLess++;
            }
          });

          const percentage = totalStudents > 0 ? (countGreaterEqual / totalStudents) * 100 : 0;
          let attainmentLevel = 0;
          const threshold = (mappingThresholds || []).find(t => percentage >= t.min && percentage <= t.max);
          if (threshold) attainmentLevel = threshold.level;

          attainmentStats[co] = {
            countGreaterEqual,
            countLess,
            percentage: percentage.toFixed(2),
            attainmentLevel
          };
        });

        // Compute indirect mean
        const indirectChildren = children.filter(c => c.isIndirect);
        const stats = {};
        const diSplit = mappingDirectIndirectSplit || { direct: 100, indirect: 0 };
        const pctDirectTotal = (diSplit.direct || 100) / 100;
        const pctIndirectTotal = (diSplit.indirect || 0) / 100;

        coKeysLocal.forEach(co => {
          const directLevel = attainmentStats[co]?.attainmentLevel || attainmentStats[String(co).toUpperCase()]?.attainmentLevel || 0;

          let indirectTotalVal = 0;
          let totalIndirectSubmissions = 0;
          indirectChildren.forEach(child => {
            const studs = child.data.students || {};
            const maxMarksMap = child.data.co_max_marks || {};
            const mm = Number(maxMarksMap[co] ?? maxMarksMap[co.toLowerCase()] ?? maxMarksMap[co.toUpperCase()] ?? 3);
            Object.values(studs).forEach(s => {
              const rawVal = s?.[co] ?? s?.[co.toLowerCase()] ?? s?.[co.toUpperCase()];
              if (rawVal !== undefined && rawVal !== null) {
                const raw = Number(rawVal);
                const normalized = mm > 0 ? (raw / mm) * 3 : 0;
                indirectTotalVal += normalized;
                totalIndirectSubmissions++;
              }
            });
          });

          const indirectMean = totalIndirectSubmissions > 0 ? (indirectTotalVal / totalIndirectSubmissions) : 0;
          const finalLevel = (directLevel * pctDirectTotal) + (indirectMean * pctIndirectTotal);

          const coKeyU = String(co).toUpperCase();
          stats[coKeyU] = {
            directLevel,
            indirectMean: Number(indirectMean.toFixed(2)),
            finalLevel: Number(finalLevel.toFixed(2)),
            directPct: diSplit.direct,
            indirectPct: diSplit.indirect
          };
        });

        setFinalOverallAtt(stats);
      } catch (err) {
        console.error('Error computing final attainment:', err);
      } finally {
        setLoadingFinal(false);
      }
    };

    computeFinalAttainment();
  }, [batch, programme, department, subject, academicYear, semester, mappingDirectIndirectSplit, mappingThresholds, mappingCutoff, ciaConfigs]);

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

  const coCodes = coList.map(co => co.code);
  if (coCodes.length === 0 && Object.keys(summary).length > 0) {
    const firstKey = Object.keys(summary)[0];
    if (summary[firstKey] && summary[firstKey].co_counts) {
      coCodes.push(...Object.keys(summary[firstKey].co_counts).sort());
    }
  }

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

    const nonZeroContrib = contributions.filter(c => c > 0);
    const poAvgNum = nonZeroContrib.length > 0 ? (nonZeroContrib.reduce((a, b) => a + b, 0) / nonZeroContrib.length) : 0;
    const hasFirstAverage = mappingAvgNum > 0;
    const hasSecondAverage = nonZeroContrib.length > 0;
    const poAvgStr = hasSecondAverage ? poAvgNum.toFixed(2) : '';
    const poAvgDisplay = hasFirstAverage && !hasSecondAverage ? 'Questions are not taken' : poAvgStr;

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
          <td key={`attainment-${coCodes[i]}`} className="px-4 py-2 border border-slate-500 text-center bg-[#ffe599]">{c > 0 ? c.toFixed(2) : ''}</td>
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
                  onChange={(e) => { setProgramme(e.target.value); setDepartment(""); setBatch(""); }}
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
                  onChange={(e) => { setBatch(e.target.value); setAcademicYear(""); setSemester(""); }}
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
                  onChange={(e) => setDepartment(e.target.value)}
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

            <div className="space-y-1.5 lg:col-span-2">
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
