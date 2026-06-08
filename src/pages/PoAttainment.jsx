import { useState, useEffect, useMemo, Fragment } from "react";
import { auth, db } from "../firebase";
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, deleteField } from "firebase/firestore";
import { 
  BarChart, 
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend
} from "recharts";
import { 
  BarChart3, 
  Download, 
  Target, 
  AlertCircle,
  FileText,
  Calculator,
  PlusCircle,
  Edit2,
  Trash2,
  Save,
  X
} from "lucide-react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatBatchDisplay, formatProgrammeKey, formatProgDisplay } from "../lib/utils";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

export default function PoAttainment() {
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);
  
  const [batch, setBatch] = useState("");
  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [userRole, setUserRole] = useState(null);
  
  const [poResults, setPoResults] = useState([]);
  const [psoResults, setPsoResults] = useState([]);
  const [matrixData, setMatrixData] = useState([]);
  const [targetMatrixData, setTargetMatrixData] = useState([]);
  const [poList, setPoList] = useState([]);
  const [psoList, setPsoList] = useState([]);
  const [isMobile, setIsMobile] = useState(false);
  const [actionsTaken, setActionsTaken] = useState({});
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [actionText, setActionText] = useState("");
  const [isSavingAction, setIsSavingAction] = useState(false);

  const [attainmentConfig, setAttainmentConfig] = useState({ directWeight: 80, indirectWeight: 20, surveys: [] });
  const [surveyScores, setSurveyScores] = useState({});
  const [isSavingSurveys, setIsSavingSurveys] = useState(false);

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
    
    const compositeKey = `${progKey}_${deptKey}_${batchKey}_${regKey}`;
    const actionsRef = doc(db, "po_actions_taken", compositeKey);

    const unsubscribe = onSnapshot(actionsRef, (snapshot) => {
      if (snapshot.exists()) {
        setActionsTaken(snapshot.data());
      } else {
        setActionsTaken({});
      }
    });

    return () => unsubscribe();
  }, [batch, programme, department, regulation]);

  const handleOpenActionModal = (res) => {
    setSelectedOutcome(res);
    setActionText(actionsTaken[res.name]?.action || "");
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
      
      const compositeKey = `${progKey}_${deptKey}_${batchKey}_${regKey}`;
      
      await setDoc(doc(db, "po_actions_taken", compositeKey), {
        [selectedOutcome.name]: {
          batch,
          programme,
          department,
          regulation,
          outcomeCode: selectedOutcome.name,
          action: actionText,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid
        }
      }, { merge: true });
      setIsActionModalOpen(false);
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
      
      const compositeKey = `${progKey}_${deptKey}_${batchKey}_${regKey}`;
      await updateDoc(doc(db, "po_actions_taken", compositeKey), {
        [outcomeCode]: deleteField()
      });
    } catch (error) {
      console.error("Error deleting action plan:", error);
      alert("Failed to delete action plan.");
    }
  };

  const handleUpdateSurveyScore = (outcomeCode, surveyIndex, value) => {
    setSurveyScores(prev => ({
      ...prev,
      [outcomeCode]: {
        ...(prev[outcomeCode] || {}),
        [surveyIndex]: value
      }
    }));
  };

  const handleSaveSurveyScores = async () => {
    setIsSavingSurveys(true);
    try {
      const progKey = sanitizeKey(programme);
      const deptKey = sanitizeKey(department);
      const batchKey = sanitizeKey(batch);
      const regKey = sanitizeKey(regulation);
      
      const compositeKey = `${progKey}_${deptKey}_${batchKey}_${regKey}`;
      await setDoc(doc(db, "survey_scores", compositeKey), surveyScores);
      alert("Survey scores saved successfully!");
    } catch (error) {
      console.error("Error saving survey scores:", error);
      alert("Failed to save survey scores.");
    } finally {
      setIsSavingSurveys(false);
    }
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      const userRef = doc(db, "users", user.uid);
      getDoc(userRef).then(snapshot => {
        if (snapshot.exists()) {
          setUserRole(snapshot.data().role);
        }
      });
    }
  }, []);

  useEffect(() => {
    const fetchAndCompute = async () => {
      if (!programme || !department || !batch || !regulation) {
        setPoResults([]);
        setPsoResults([]);
        setMatrixData([]);
        setTargetMatrixData([]);
        return;
      }
      
      setLoading(true);
      try {
        const progKey = formatProgrammeKey(programme);
        const deptKey = sanitizeKey(department);
        const regKey = sanitizeKey(regulation);
        const batchKey = sanitizeKey(batch);

        // Fetch PO/PSO configuration
        const poConfigRef = doc(db, "po_configuration", `${progKey}_${deptKey}_${regKey}`);
        const poConfigSnap = await getDoc(poConfigRef);
        const poConfig = poConfigSnap.data() || {};
        
        const posSet = new Set();
        const psosSet = new Set();
        if (poConfig.pos) poConfig.pos.forEach(po => po.code && posSet.add(po.code));
        if (poConfig.psos) poConfig.psos.forEach(pso => pso.code && psosSet.add(pso.code));
        
        const summaryRef = collection(db, `mapping_summary`);
        const summarySnap = await getDocs(summaryRef);

        const summariesMap = {};
        const prefix = `${batchKey}_${progKey}_${regKey}_`;
        summarySnap.forEach(doc_ => {
          const key = doc_.id;
          const summaryData = doc_.data();
          if (key.startsWith(prefix)) {
             summariesMap[key] = summaryData;
             if (summaryData.summary) {
               Object.keys(summaryData.summary).forEach(outcomeCode => {
                 if (outcomeCode.startsWith('PO')) posSet.add(outcomeCode);
                 if (outcomeCode.startsWith('PSO')) psosSet.add(outcomeCode);
               });
             }
          }
        });
        
        const sortedPos = Array.from(posSet).sort((a, b) => (parseInt(a.replace(/[^0-9]/g, '')) || 0) - (parseInt(b.replace(/[^0-9]/g, '')) || 0));
        const sortedPsos = Array.from(psosSet).sort((a, b) => (parseInt(a.replace(/[^0-9]/g, '')) || 0) - (parseInt(b.replace(/[^0-9]/g, '')) || 0));
        
        setPoList(sortedPos);
        setPsoList(sortedPsos);

        // Fetch Attainment Configuration from po_pso
        const compositeKey = `${progKey}_${regKey}__${deptKey}`;
        const poPsoConfigRef = doc(db, "po_pso", compositeKey);
        const poPsoConfigSnap = await getDoc(poPsoConfigRef);
        const poPsoConfig = poPsoConfigSnap.data() || {};
        
        const dWeight = parseFloat(poPsoConfig.direct_weight) || 80;
        const iWeight = parseFloat(poPsoConfig.indirect_weight) || 20;
        const survs = poPsoConfig.surveys || [];
        setAttainmentConfig({ directWeight: dWeight, indirectWeight: iWeight, surveys: survs });

        // Fetch existing survey scores
        const surveyScoresRef = doc(db, "survey_scores", `${progKey}_${deptKey}_${batchKey}_${regKey}`);
        const surveyScoresSnap = await getDoc(surveyScoresRef);
        setSurveyScores(surveyScoresSnap.data() || {});

        // Fetch Syllabus to map subCode -> semester
        const syllabusRef = doc(db, "syllabus_data", `${progKey}_${deptKey}_${regKey}`);
        const syllabusSnap = await getDoc(syllabusRef);
        const syllabus = syllabusSnap.data();
        
        const ciaRef = collection(db, 'cia_configs');
        const ciaSnap = await getDocs(ciaRef);
        const ciaConfigs = {};
        ciaSnap.forEach(doc_ => {
          ciaConfigs[doc_.id] = doc_.data();
        });
        
        const subToSem = {};
        const subMetadata = {};
        if (syllabus && syllabus.semesters) {
          Object.entries(syllabus.semesters).forEach(([semNum, subjects]) => {
            if (Array.isArray(subjects)) {
              subjects.forEach(sub => {
                if (sub != null && sub.isActive !== false) {
                  const sKey = sanitizeKey(sub.code);
                  subToSem[sKey] = semNum;
                  subMetadata[sKey] = sub;
                }
              });
            }
          });
        }

        const posMap = {}; 
        const psoMap = {}; 
        const poCounts = {}; 
        const psoCounts = {}; 
        const subjectOutcomes = {}; // subCode -> { [poCode]: value }
        const subjectMappingOutcomes = {}; // subCode -> { [poCode]: value }

        const subjectPromises = [];

        Object.keys(subToSem).forEach(subCode => {
            // Initialize
            subjectOutcomes[subCode] = {};
            subjectMappingOutcomes[subCode] = {};

            // Find matching summary key
            const summaryEntry = Object.entries(summariesMap).find(([key]) => key.includes(`_${subCode}_`));
            
            if (summaryEntry) {
              const [key, summaryData] = summaryEntry;
              const rest = key.substring(prefix.length);
              const parts = rest.split('_');
              const semKey = parts.pop();
              const ayKey = parts.pop();
              
              const coAttKey = `${batchKey}_${sanitizeKey(programme)}_${deptKey}_${subCode}_${ayKey}_${semKey}`;
              
              const promise = getDoc(doc(db, "co_attainment", coAttKey)).then(coAttSnap => {
                   const coAttData = coAttSnap.data();
                   
                   // 1. Calculate Mapping Averages (Targets) regardless of attainment existence
                   const subMappingResults = {};
                   if (summaryData.summary) {
                     Object.entries(summaryData.summary).forEach(([outcomeCode, summaryItem]) => {
                       const totalPIs = summaryItem.total_pis || 0;
                       let sumMappingGrades = 0;
                       let countMappingGrades = 0;

                       // Need to know COs for this subject to validate mapping
                       // Actually we can just use the keys in summaryItem.co_counts
                       if (summaryItem.co_counts) {
                         Object.values(summaryItem.co_counts).forEach((mc) => {
                           const grade = (mc / totalPIs) * 100 >= 66 ? 3 : (mc / totalPIs) * 100 >= 33 ? 2 : (mc / totalPIs) * 100 >= 1 ? 1 : 0;
                           if (grade > 0) {
                             sumMappingGrades += grade;
                             countMappingGrades++;
                           }
                         });
                       }

                       if (countMappingGrades > 0) {
                          subMappingResults[outcomeCode] = Number((sumMappingGrades / countMappingGrades).toFixed(2));
                       }
                     });
                   }
                   subjectMappingOutcomes[subCode] = subMappingResults;

                   // 2. Calculate Attainment if data exists
                   if (!coAttData) return;

                   let children = [];
                   if (coAttData.co_max_marks || coAttData.students) {
                     const m = coAttData._meta || {};
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
                     children = [{ key: '_legacy', data: coAttData, isUniversity, isIndirect }];
                   } else {
                     const entries = Object.entries(coAttData).filter(([, v]) => v && (v.students || v.co_max_marks)).map(([k, v]) => ({ key: k, data: v }));
                     children = entries.map(e => {
                       const m = e.data._meta || {};
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
                       return { key: e.key, data: e.data, isUniversity, isIndirect };
                     });
                   }
                   children.sort((a, b) => {
                     const ta = new Date(a.data._meta?.updated_at || a.data._meta?.saved_at || 0).getTime();
                     const tb = new Date(b.data._meta?.updated_at || b.data._meta?.saved_at || 0).getTime();
                     return tb - ta;
                   });
                   const internalChildren = children.filter(c => !c.isUniversity && !c.isIndirect);
                   const chosen = internalChildren[0] || children[0];
                   if (!chosen) return;

                   const studentTotals = Object.values(chosen.data.students || {});
                   const maxMarks = chosen.data.co_max_marks || {};
                   const coKeys = Object.keys(maxMarks).sort();
                   const coAttLevels = {};

                   coKeys.forEach(co => {
                     let countGE = 0;
                     let countLess = 0;
                     const cutoff = summaryData.cutoff !== undefined && summaryData.cutoff !== "" ? Number(summaryData.cutoff) : 50;
                     studentTotals.forEach(s => {
                       const rawVal = s[co] ?? s[co.toLowerCase()] ?? s[co.toUpperCase()];
                       if (rawVal !== undefined && rawVal !== null) {
                         const mVal = Number(rawVal);
                         const max = maxMarks[co] ?? maxMarks[co.toLowerCase()] ?? maxMarks[co.toUpperCase()] ?? Number.MAX_VALUE;
                         if (max > 0) {
                           const perc = (mVal / max) * 100;
                           if (perc >= cutoff) {
                             countGE++;
                           } else {
                             countLess++;
                           }
                         }
                       }
                     });
                     const totalValid = countGE + countLess;
                     const percentage = totalValid > 0 ? (countGE / totalValid) * 100 : 0;
                     const thresholdsToUse = summaryData.thresholds && summaryData.thresholds.length > 0 ? summaryData.thresholds : [
                       { level: 3, min: 71, max: 100 },
                       { level: 2, min: 61, max: 70 },
                       { level: 1, min: 51, max: 60 },
                       { level: 0, min: 0, max: 50 },
                     ];
                     const threshold = thresholdsToUse.find(t => percentage >= t.min && percentage <= t.max);
                     coAttLevels[co] = threshold ? threshold.level : 0;
                   });

                   const finalCoLevels = {};
                   const indirectChildren = children.filter(c => c.isIndirect);
                   const diSplit = summaryData.directIndirectSplit || { direct: 100, indirect: 0 };
                   
                   coKeys.forEach(co => {
                     const directLevel = coAttLevels[co] || 0;
                     let indirectVal = 0;
                     let indirectSub = 0;
                     indirectChildren.forEach(child => {
                       const studs = child.data.students || {};
                       const maxMarksMap = child.data.co_max_marks || {};
                       const mm = Number(maxMarksMap[co] ?? maxMarksMap[co.toLowerCase()] ?? maxMarksMap[co.toUpperCase()] ?? 3);
                       Object.values(studs).forEach(s => {
                         const rawVal = s?.[co] ?? s?.[co.toLowerCase()] ?? s?.[co.toUpperCase()];
                         if (rawVal !== undefined && rawVal !== null) {
                           indirectVal += mm > 0 ? (Number(rawVal) / mm) * 3 : 0;
                           indirectSub++;
                         }
                       });
                     });
                     const indirectMean = indirectSub > 0 ? indirectVal / indirectSub : 0;
                     const finalLevel = (directLevel * (diSplit.direct / 100)) + (indirectMean * (diSplit.indirect / 100));
                     finalCoLevels[co] = Number(finalLevel.toFixed(2));
                   });

                   const subResults = {};

                   if (summaryData.summary) {
                     Object.entries(summaryData.summary).forEach(([outcomeCode, summaryItem]) => {
                       const totalPIs = summaryItem.total_pis || 0;
                       let sumContrib = 0;
                       let countContrib = 0;

                       coKeys.forEach(co => {
                         const mc = summaryItem.co_counts?.[co] || summaryItem.co_counts?.[co.toUpperCase()] || summaryItem.co_counts?.[co.toLowerCase()] || 0;
                         const grade = (mc / totalPIs) * 100 >= 66 ? 3 : (mc / totalPIs) * 100 >= 33 ? 2 : (mc / totalPIs) * 100 >= 1 ? 1 : 0;
                         
                         if (grade > 0 && finalCoLevels[co] > 0) {
                           sumContrib += (grade * finalCoLevels[co]) / 3;
                           countContrib++;
                         }
                       });

                       if (countContrib > 0) {
                          const subjectOutcomeAtt = sumContrib / countContrib;
                          subResults[outcomeCode] = Number(subjectOutcomeAtt.toFixed(2));
                          if (outcomeCode.startsWith('PSO')) {
                            psoMap[outcomeCode] = (psoMap[outcomeCode] || 0) + subResults[outcomeCode];
                            psoCounts[outcomeCode] = (psoCounts[outcomeCode] || 0) + 1;
                          } else {
                            posMap[outcomeCode] = (posMap[outcomeCode] || 0) + subResults[outcomeCode];
                            poCounts[outcomeCode] = (poCounts[outcomeCode] || 0) + 1;
                          }
                       }
                     });
                   }
                   subjectOutcomes[subCode] = subResults;
                 });
              subjectPromises.push(promise);
            } else {
              // Even if no summaryData, we mark mapping as empty
              subjectMappingOutcomes[subCode] = {};
            }
        });

        await Promise.all(subjectPromises);

        // Calculate Final PO Results
        const poResultsArray = sortedPos.map((code, idx) => {
          let mapSum = 0;
          let mapCount = 0;
          Object.values(subjectMappingOutcomes).forEach(mOutcomes => {
            if (mOutcomes[code]) {
              mapSum += mOutcomes[code];
              mapCount++;
            }
          });
          const targetAvg = mapCount > 0 ? Number((mapSum / mapCount).toFixed(2)) : 0;
          const attainmentAvg = poCounts[code] > 0 ? Number((posMap[code] / poCounts[code]).toFixed(2)) : 0;

          let status = 'NA';
          if (targetAvg > 0) {
            status = attainmentAvg >= targetAvg ? 'A' : 'NA';
          } else if (targetAvg === 0 && attainmentAvg > 0) {
            status = 'A';
          } else if (targetAvg === 0 && attainmentAvg === 0) {
            status = '-'; // No target, no attainment
          }

          return {
            name: `PO${idx + 1}`,
            value: attainmentAvg,
            targetValue: targetAvg,
            status: status
          };
        });

        const psoResultsArray = sortedPsos.map((code, idx) => {
          let mapSum = 0;
          let mapCount = 0;
          Object.values(subjectMappingOutcomes).forEach(mOutcomes => {
            if (mOutcomes[code]) {
              mapSum += mOutcomes[code];
              mapCount++;
            }
          });
          const targetAvg = mapCount > 0 ? Number((mapSum / mapCount).toFixed(2)) : 0;
          const attainmentAvg = psoCounts[code] > 0 ? Number((psoMap[code] / psoCounts[code]).toFixed(2)) : 0;

          let status = 'NA';
          if (targetAvg > 0) {
            status = attainmentAvg >= targetAvg ? 'A' : 'NA';
          } else if (targetAvg === 0 && attainmentAvg > 0) {
            status = 'A';
          } else if (targetAvg === 0 && attainmentAvg === 0) {
            status = '-'; // No target, no attainment
          }

          return {
            name: `PSO${idx + 1}`,
            value: attainmentAvg,
            targetValue: targetAvg,
            status: status
          };
        });

        setPoResults(poResultsArray);
        setPsoResults(psoResultsArray);

        // Build Attainment matrixData (only include subjects that have mapping or attainment data for this batch)
        const semesterGroupsAtt = {};
        Object.entries(subjectOutcomes).forEach(([subCode, outcomes]) => {
           const hasMapping = subjectMappingOutcomes[subCode] && Object.keys(subjectMappingOutcomes[subCode]).length > 0;
           const hasOutcome = outcomes && Object.keys(outcomes).length > 0;
           if (!hasMapping && !hasOutcome) return; // skip subjects not mapped to this batch and with no attainment
           const sem = subToSem[subCode] || "Unknown";
           if (!semesterGroupsAtt[sem]) semesterGroupsAtt[sem] = { semester: sem, subjects: [] };
           const subMeta = subMetadata[subCode];
           semesterGroupsAtt[sem].subjects.push({
             code: subMeta?.code || subCode,
             name: subMeta?.name || subCode,
             outcomes: outcomes
           });
        });

        const sortedSemestersAtt = Object.values(semesterGroupsAtt).sort((a, b) => {
          if (a.semester === "Unknown") return 1;
          if (b.semester === "Unknown") return -1;
          return parseInt(a.semester) - parseInt(b.semester);
        });
        setMatrixData(sortedSemestersAtt);

        // Build Target matrixData (only include subjects that have mapping entries for this batch)
        const semesterGroupsTarget = {};
        Object.entries(subjectMappingOutcomes).forEach(([subCode, outcomes]) => {
           if (!outcomes || Object.keys(outcomes).length === 0) return; // skip unmapped subjects
           const sem = subToSem[subCode] || "Unknown";
           if (!semesterGroupsTarget[sem]) semesterGroupsTarget[sem] = { semester: sem, subjects: [] };
           const subMeta = subMetadata[subCode];
           semesterGroupsTarget[sem].subjects.push({
             code: subMeta?.code || subCode,
             name: subMeta?.name || subCode,
             outcomes: outcomes
           });
        });

        const sortedSemestersTarget = Object.values(semesterGroupsTarget).sort((a, b) => {
          if (a.semester === "Unknown") return 1;
          if (b.semester === "Unknown") return -1;
          return parseInt(a.semester) - parseInt(b.semester);
        });
        setTargetMatrixData(sortedSemestersTarget);

      } catch (error) {
        console.error("Error computing PO data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAndCompute();
  }, [programme, department, batch, regulation]);


  const computedResults = useMemo(() => {
    return [...poResults, ...psoResults].map(res => {
      const isNotMapped = res.targetValue === 0;
      
      let indirectSum = 0;
      attainmentConfig.surveys.forEach((s, sIdx) => {
        const rawScore = parseFloat((surveyScores[res.name] || {})[sIdx]) || 0;
        const weight = parseFloat(s.weight) || 0;
        indirectSum += (rawScore * weight) / 100;
      });

      const finalAttainment = ((res.value * attainmentConfig.directWeight) / 100) + ((indirectSum * attainmentConfig.indirectWeight) / 100);

      let newStatus = res.status;
      if (!isNotMapped && res.targetValue > 0) {
        newStatus = finalAttainment >= res.targetValue ? 'A' : 'NA';
      } else if (!isNotMapped && res.targetValue === 0 && finalAttainment > 0) {
        newStatus = 'A';
      } else if (isNotMapped) {
        newStatus = '-';
      }

      return {
        ...res,
        indirectSum,
        finalAttainment,
        status: newStatus
      };
    });
  }, [poResults, psoResults, attainmentConfig, surveyScores]);

  // Dynamic chart height
  // Keep PO entries first (do not reverse) so chart X-axis starts with PO items
  const chartDataDesktop = [...computedResults];
  const chartData = isMobile ? computedResults : chartDataDesktop;
  const chartHeight = Math.max(300, Math.min(1400, (chartData.length || 0) * 36));

  // Responsive table classes: only enforce minimum widths on small screens
  const tableClass = `w-full text-sm ${isMobile ? 'min-w-[600px]' : ''}`;
  const headerSemesterClass = `border border-slate-300 p-4 bg-slate-100 ${isMobile ? 'min-w-[100px]' : ''} text-center`;
  const headerSubjectClass = `border border-slate-300 p-4 bg-slate-100 ${isMobile ? 'min-w-[250px]' : ''} text-left`;
  const outcomeThClass = `border border-slate-300 p-4 ${isMobile ? 'min-w-[80px]' : ''} hover:bg-slate-200 transition-colors cursor-help group relative text-center`;
  const psoThClass = `border border-slate-300 p-4 ${isMobile ? 'min-w-[80px]' : ''} bg-blue-50 hover:bg-blue-100 transition-colors cursor-help group relative text-center`;

  const handleDownloadExcel = () => {
    const data = computedResults.map(r => {
      const isNotMapped = r.targetValue === 0;
      
      const row = {
        Outcome: r.name,
        "Direct Attainment Level": isNotMapped ? 'N/A' : r.value.toFixed(2),
        "Direct Weight (%)": attainmentConfig.directWeight,
      };

      attainmentConfig.surveys.forEach((s, sIdx) => {
        row[`Survey: ${s.name} Score`] = isNotMapped ? 'N/A' : ((surveyScores[r.name] || {})[sIdx] || 0);
        row[`Survey: ${s.name} Weight (%)`] = s.weight;
      });

      row["Indirect Attainment Level"] = isNotMapped ? 'N/A' : r.indirectSum.toFixed(2);
      row["Indirect Weight (%)"] = attainmentConfig.indirectWeight;
      row["Final Overall Attainment"] = isNotMapped ? 'N/A' : r.finalAttainment.toFixed(2);
      
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Final Attainment");
    XLSX.writeFile(wb, `Final_PO_Attainment_${batch}.xlsx`);
  };

  const handleDownloadMatrixExcel = () => {
    const table = document.getElementById("po-matrix-table-attainment");
    if (!table) return;
    const wb = XLSX.utils.table_to_book(table);
    XLSX.writeFile(wb, `PO_Attainment_Matrix_${batch}.xlsx`);
  };

  return (
    <Layout title="PO Calculation & Attainment">
      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Programme</label>
              <select 
                value={programme}
                onChange={(e) => { setProgramme(e.target.value); setDepartment(""); setBatch(""); }}
                className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
              >
                <option value="">Select Programme</option>
                {Object.keys(PROGRAMME_DEPARTMENTS).map(p => <option key={p} value={p}>{formatProgDisplay(p)}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Department</label>
              <select 
                disabled={!programme}
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
              >
                <option value="">Select Department</option>
                {programme && PROGRAMME_DEPARTMENTS[programme].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Batch</label>
              <select 
                disabled={!programme}
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                className="w-full appearance-none bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium disabled:opacity-50"
              >
                <option value="">Select Batch</option>
                {batches.map(b => <option key={b} value={b}>{formatBatchDisplay(b)}</option>)}
              </select>
            </div>
          </div>
        </div>

        {batch && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              {/* Chart Card */}
              <div className="lg:col-span-5 bg-white rounded-3xl shadow-xl p-8 border border-zinc-100 flex flex-col h-full">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                      <BarChart3 size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-800">Outcome Visualization</h3>
                      <p className="text-zinc-500 text-sm">Batch {formatBatchDisplay(batch)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex-grow relative">
                  {loading ? (
                    <div className="h-full flex items-center justify-center min-h-[300px]">
                      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (poResults.length > 0 || psoResults.length > 0) ? (
                    <div className="p-6 sm:p-8 flex flex-col h-full bg-white">
                      <div className="flex justify-end items-center gap-6 mb-8 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm bg-emerald-500 shadow-sm" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">A (Attained)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm bg-red-500 shadow-sm" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">NA (Not Attained)</span>
                        </div>
                      </div>

                      <div className="h-full w-full min-h-[400px]">
                        <ResponsiveContainer width="99.9%" height={chartHeight}>
                          <BarChart 
                            data={chartData}
                            margin={{ top: 20, right: 30, left: isMobile ? 20 : 40, bottom: isMobile ? 20 : 40 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={!isMobile} horizontal={isMobile} stroke="#f1f5f9" />
                            <XAxis type="category" dataKey="name" axisLine={false} tickLine={false} interval={0} height={isMobile ? 40 : 40} />
                            <YAxis type="number" domain={[0, 3]} axisLine={false} tickLine={false} ticks={[0, 1, 2, 3]} width={60} />
                            <Tooltip 
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  const isAttained = data.status === 'A';
                                  const isNotMapped = data.targetValue === 0;
                                  
                                  return (
                                    <div className="bg-white p-4 rounded-2xl shadow-2xl border border-zinc-100 min-w-[200px] animate-in fade-in zoom-in-95 duration-200">
                                      <p className="font-bold text-zinc-900 border-b border-zinc-100 pb-2 mb-2">{data.name}</p>
                                      <div className="space-y-1.5">
                                        <div className="flex justify-between text-xs items-center">
                                          <span className="text-zinc-500">Final Attainment:</span>
                                          <span className="font-mono font-bold text-zinc-800">{isNotMapped ? '-' : data.finalAttainment.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs items-center">
                                          <span className="text-zinc-500">Target Level:</span>
                                          <span className="font-mono text-zinc-500">{isNotMapped ? 'Not Mapped' : data.targetValue.toFixed(2)}</span>
                                        </div>
                                        <div className="pt-2 mt-2 border-t border-zinc-100">
                                          {isNotMapped ? (
                                            <div className="flex items-center gap-1.5 text-zinc-400">
                                              <div className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                                              <span className="text-[10px] font-bold uppercase tracking-wider">Not Mapped</span>
                                            </div>
                                          ) : isAttained ? (
                                            <div className="flex items-center gap-1.5 text-emerald-600">
                                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                              <span className="text-[10px] font-bold uppercase tracking-wider">Attained</span>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-1.5 text-red-600">
                                              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                              <span className="text-[10px] font-bold uppercase tracking-wider">Not Attained</span>
                                            </div>
                                          )}
                                          <p className="text-[9px] text-zinc-400 mt-1.5 leading-relaxed italic">
                                            {isNotMapped 
                                              ? "This outcome is not mapped to any subjects."
                                              : isAttained 
                                                ? "The attainment level meets or exceeds the target level." 
                                                : "The attainment level is below the target level requirements."}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                              cursor={{ fill: '#f8fafc', radius: 8 }}
                            />
                            
                            <Bar 
                              dataKey="finalAttainment" 
                              radius={isMobile ? [8, 8, 0, 0] : [0, 8, 8, 0]} 
                              barSize={isMobile ? 30 : 40}
                            >
                              {chartData.map((entry, index) => (
                                 <Cell 
                                   key={`cell-${index}`} 
                                   fill={entry.status === 'A' ? '#10b981' : '#ef4444'} 
                                 />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400 italic">
                      <AlertCircle size={48} className="mb-4 opacity-20" />
                      <p>No attainment data available for this batch selection.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats Table Card */}
              <div className="lg:col-span-5 bg-white rounded-3xl shadow-xl p-8 border border-zinc-100 flex flex-col h-full">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                      <Target size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-800">Final PO Attainment</h3>
                      <p className="text-zinc-500 text-sm">Quantitative Analysis</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleDownloadExcel}
                    className="p-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-2xl transition-all"
                    title="Export results"
                  >
                    <Download size={20} />
                  </button>
                </div>

                <div className="flex-grow space-y-4">
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-6 bg-blue-50/50 rounded-3xl border border-blue-100">
                         <p className="text-[11px] font-bold text-blue-400 uppercase tracking-widest mb-1">Total Outcomes</p>
                         <p className="text-3xl font-black text-blue-900">{poResults.length + psoResults.length}</p>
                      </div>
                      <div className="p-6 bg-emerald-50/50 rounded-3xl border border-emerald-100">
                         <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Status</p>
                         <div className="flex items-center gap-4">
                           <div className="flex items-baseline gap-1">
                             <span className="text-3xl font-black text-emerald-900">
                               {computedResults.filter(r => r.status === 'A').length}
                             </span>
                             <span className="text-sm font-bold text-emerald-600 uppercase">A</span>
                           </div>
                           <div className="flex items-baseline gap-1">
                             <span className="text-3xl font-black text-rose-900">
                               {computedResults.filter(r => r.status === 'NA').length}
                             </span>
                             <span className="text-sm font-bold text-rose-600 uppercase">NA</span>
                           </div>
                         </div>
                      </div>
                   </div>

                   <div className="mt-8 border border-zinc-100 rounded-2xl overflow-x-auto">
                     <table className={tableClass}>
                        <thead className="bg-zinc-50">
                          <tr>
                            <th className="px-6 py-4 text-left font-bold text-zinc-600">Program Outcome</th>
                            <th className="px-6 py-4 text-right font-bold text-zinc-600">Target Level</th>
                            <th className="px-6 py-4 text-right font-bold text-zinc-600">Direct Attainment<br/><span className="text-[10px] text-zinc-400">({attainmentConfig.directWeight}%)</span></th>
                            <th className="px-6 py-4 text-right font-bold text-zinc-600 bg-purple-50/50">Indirect Attainment<br/><span className="text-[10px] text-zinc-400">({attainmentConfig.indirectWeight}%)</span></th>
                            <th className="px-6 py-4 text-right font-bold text-zinc-800 bg-emerald-50/50">Final Attainment</th>
                            <th className="px-6 py-4 text-center font-bold text-zinc-600">Status</th>
                             <th className="px-6 py-4 text-center font-bold text-zinc-600">Action Plan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {computedResults.map((res) => {
                            const isNotMapped = res.targetValue === 0;
                            return (
                              <tr key={res.name} className={`hover:bg-zinc-50/50 transition-colors ${isNotMapped ? 'opacity-50 grayscale-[0.5]' : ''}`}>
                                <td className="px-6 py-4 font-bold text-zinc-800">{res.name}</td>
                                <td className="px-6 py-4 text-right font-mono text-zinc-500">
                                  {isNotMapped ? (
                                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-tight italic">not mapped</span>
                                  ) : (
                                    res.targetValue.toFixed(2)
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right font-mono font-bold text-zinc-600">
                                  {isNotMapped && res.value === 0 ? '-' : (!isNotMapped && res.value === 0) ? (
                                    <span className="text-[9px] text-zinc-400 font-medium italic block leading-tight">questions are not taken from po</span>
                                  ) : res.value.toFixed(2)}
                                </td>
                                <td className="px-6 py-4 text-right font-mono font-bold text-purple-600 bg-purple-50/10">
                                  {isNotMapped ? '-' : res.indirectSum.toFixed(2)}
                                </td>
                                <td className={res.status === 'A' ? 'px-6 py-4 text-right font-mono font-black text-emerald-700 bg-emerald-50/10' : res.status === 'NA' ? 'px-6 py-4 text-right font-mono font-black text-rose-700 bg-rose-50/10' : 'px-6 py-4 text-right font-mono font-black text-zinc-700'}>
                                  {isNotMapped ? '-' : res.finalAttainment.toFixed(2)}
                                </td>
                                <td className="px-6 py-4 text-center relative">
                                  {isNotMapped ? (
                                    <span className="inline-flex z-10 whitespace-nowrap bg-zinc-50 text-zinc-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">N/A</span>
                                  ) : res.status === 'A' ? (
                                    <span className="inline-flex z-10 whitespace-nowrap bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">A</span>
                                  ) : res.status === '-' ? (
                                    <span className="inline-flex z-10 whitespace-nowrap bg-zinc-100 text-zinc-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">-</span>
                                  ) : (
                                    <span className="inline-flex z-10 whitespace-nowrap bg-red-100 text-red-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">NA</span>
                                  )}
                                </td>
                                 <td className="px-6 py-4 text-center">
                                   {res.status === 'NA' && !isNotMapped ? (
                                   <div className="flex justify-center items-center gap-2">
                                     {actionsTaken[res.name] ? (
                                       <div className="flex items-center gap-2">
                                         <button 
                                           onClick={() => handleOpenActionModal(res)}
                                           className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors group relative"
                                           title="Edit Action Plan"
                                         >
                                           <Edit2 size={14} />
                                           {actionsTaken[res.name]?.action && (
                                              <div className="absolute hidden group-hover:block bg-zinc-800 text-white p-2 rounded text-[10px] bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 z-50 overflow-hidden text-ellipsis whitespace-nowrap">
                                                {actionsTaken[res.name].action}
                                              </div>
                                           )}
                                         </button>
                                         <button 
                                           onClick={() => handleDeleteAction(res.name)}
                                           className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                           title="Delete Action Plan"
                                         >
                                           <Trash2 size={14} />
                                         </button>
                                       </div>
                                     ) : (
                                       <button 
                                         onClick={() => handleOpenActionModal(res)}
                                         className="flex items-center gap-2 px-3 py-1 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all"
                                       >
                                         <PlusCircle size={12} /> Add Plan
                                       </button>
                                     )}
                                   </div>
                                 ) : (
                                   <span className="text-zinc-300 text-xs">-</span>
                                 )}
                               </td>
                            </tr>
                          );
                        })}
                      </tbody>
                     </table>
                   </div>
                </div>
              </div>
            </div>

            

            {/* PO Calculation Matrix (Targets) */}
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-zinc-100 mb-8">
              <div className="bg-[#120c7a] px-8 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Calculator className="text-white opacity-80" size={20} />
                  <h4 className="text-white font-bold text-lg">PO Calculation Matrix (Targets) - Batch {formatBatchDisplay(batch)}</h4>
                </div>
                <button 
                  onClick={() => {
                    const table = document.getElementById("po-matrix-table-target");
                    if (!table) return;
                    const wb = XLSX.utils.table_to_book(table);
                    XLSX.writeFile(wb, `PO_Calculation_Matrix_${batch}.xlsx`);
                  }}
                  className="bg-white hover:bg-zinc-100 text-[#120c7a] px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                >
                  <Download size={16} /> Export Excel
                </button>
              </div>
              
              <div className="overflow-x-auto p-4">
                {loading ? (
                  <div className="p-20 text-center text-slate-400 italic">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    Computing calculation matrix...
                  </div>
                ) : targetMatrixData.length === 0 ? (
                  <div className="p-20 text-center text-slate-400 italic font-medium">
                    No subject mapping data found for this batch. Ensure CO-PO mappings are saved for subjects.
                  </div>
                ) : (
                  <table id="po-matrix-table-target" className={`w-full border-collapse border border-slate-200`}>
                    <thead>
                      <tr className="bg-slate-100 border-b-2 border-slate-300">
                        <th className={headerSemesterClass}>Semester</th>
                        <th className={headerSubjectClass}>Subject</th>
                        {poList.map(po => (
                          <th key={po} className={outcomeThClass}>
                            {po}
                            <div className="absolute hidden group-hover:block bg-zinc-800 text-white p-2 rounded-lg text-[10px] -bottom-12 left-1/2 -translate-x-1/2 w-48 z-20 shadow-xl font-normal text-center">
                              Program Outcome {po.replace('PO', '')}
                            </div>
                          </th>
                        ))}
                        {psoList.map((pso, idx) => (
                          <th key={pso} className={psoThClass}>
                            PSO{idx + 1}
                            <div className="absolute hidden group-hover:block bg-zinc-800 text-white p-2 rounded-lg text-[10px] -bottom-12 left-1/2 -translate-x-1/2 w-48 z-20 shadow-xl font-normal text-center">
                              Program Specific Outcome {idx + 1}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {targetMatrixData.map((group) => (
                        <Fragment key={`target-group-${group.semester}`}>
                          {group.subjects.map((sub, sIdx) => (
                            <tr key={`${group.semester}-${sub.code}`} className="hover:bg-slate-50 transition-colors border-b border-slate-200">
                              {sIdx === 0 && (
                                <td 
                                  rowSpan={group.subjects.length + 1} 
                                  className="border border-slate-300 p-4 text-center font-bold text-slate-700 bg-slate-50/50"
                                >
                                  {group.semester === "Unknown" ? "External" : `Semester ${group.semester}`}
                                </td>
                              )}
                              <td className="border border-slate-300 p-4 text-left font-medium text-slate-700">
                                <span className="font-bold text-blue-800 mr-2">{sub.code}</span>
                                <span className="text-slate-500 uppercase text-[12px]">{sub.name}</span>
                              </td>
                              {poList.map(po => (
                                <td key={po} className={`border border-slate-300 p-4 text-center font-medium ${sub.outcomes[po] ? 'text-zinc-900 bg-emerald-50/10' : 'text-zinc-300'}`}>
                                  {sub.outcomes[po] || '-'}
                                </td>
                              ))}
                              {psoList.map(pso => (
                                <td key={pso} className={`border border-slate-300 p-4 text-center font-medium bg-blue-50/20 ${sub.outcomes[pso] ? 'text-blue-900' : 'text-zinc-300'}`}>
                                  {sub.outcomes[pso] || '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {/* Semester Average Row */}
                          <tr className="bg-slate-50/80 font-semibold border-b-2 border-slate-200">
                            <td className="border border-slate-300 p-3 text-right text-slate-600 italic">
                              {group.semester === "Unknown" ? "External" : `Semester ${group.semester}`} Average
                            </td>
                            {[...poList, ...psoList].map(outcome => {
                              let sum = 0;
                              let count = 0;
                              group.subjects.forEach(sub => {
                                if (sub.outcomes[outcome]) {
                                  sum += Number(sub.outcomes[outcome]);
                                  count++;
                                }
                              });
                              const avg = count > 0 ? (sum / count).toFixed(2) : '-';
                              return (
                                <td key={`sem-avg-${outcome}`} className="border border-slate-300 p-3 text-center text-slate-700">
                                  {avg}
                                </td>
                              );
                            })}
                          </tr>
                        </Fragment>
                      ))}
                      {/* Summary Row: Average of each column */}
                      <tr className="bg-[#f0f9ff] font-bold border-t-2 border-slate-400">
                        <td colSpan={2} className="border border-slate-300 p-4 bg-[#f0f9ff] text-right">
                          Average Mapping (Targets)
                        </td>
                        {[...poList, ...psoList].map(outcome => {
                           let sum = 0;
                           let count = 0;
                           targetMatrixData.forEach(group => {
                             group.subjects.forEach(sub => {
                               if (sub.outcomes[outcome]) {
                                 sum += Number(sub.outcomes[outcome]);
                                 count++;
                               }
                             });
                           });
                           const avg = count > 0 ? (sum / count).toFixed(2) : '-';
                           return (
                             <td 
                               key={outcome} 
                               className={`border border-slate-300 p-4 text-center text-blue-800 ${outcome.startsWith('PSO') ? 'bg-blue-100/50' : ''}`}
                             >
                               {avg}
                             </td>
                           );
                        })}
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Matrix Table Card */}
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-zinc-100">
              <div className="bg-[#120c7a] px-8 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <FileText className="text-white opacity-80" size={20} />
                  <h4 className="text-white font-bold text-lg">PO Attainment Matrix - Batch {formatBatchDisplay(batch)}</h4>
                </div>
                <button 
                  onClick={handleDownloadMatrixExcel}
                  className="bg-white hover:bg-zinc-100 text-[#120c7a] px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                >
                  <Download size={16} /> Export Excel
                </button>
              </div>
              
              <div className="overflow-x-auto p-4">
                {loading ? (
                  <div className="p-20 text-center text-slate-400 italic">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    Computing attainment matrix...
                  </div>
                ) : matrixData.length === 0 ? (
                  <div className="p-20 text-center text-slate-400 italic font-medium">
                    No subject attainment data found for this batch. Ensure CO-PO mappings are saved for subjects.
                  </div>
                ) : (
                  <table id="po-matrix-table-attainment" className={`w-full border-collapse border border-slate-200`}>
                    <thead>
                      <tr className="bg-slate-100 border-b-2 border-slate-300">
                        <th className={headerSemesterClass}>Semester</th>
                        <th className={headerSubjectClass}>Subject</th>
                        {poList.map(po => (
                          <th key={po} className={outcomeThClass}>
                            {po}
                            <div className="absolute hidden group-hover:block bg-zinc-800 text-white p-2 rounded-lg text-[10px] -bottom-12 left-1/2 -translate-x-1/2 w-48 z-20 shadow-xl font-normal text-center">
                              Program Outcome {po.replace('PO', '')}
                            </div>
                          </th>
                        ))}
                        {psoList.map((pso, idx) => (
                          <th key={pso} className={psoThClass}>
                            PSO{idx + 1}
                            <div className="absolute hidden group-hover:block bg-zinc-800 text-white p-2 rounded-lg text-[10px] -bottom-12 left-1/2 -translate-x-1/2 w-48 z-20 shadow-xl font-normal text-center">
                              Program Specific Outcome {idx + 1}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixData.map((group) => (
                        <Fragment key={`att-group-${group.semester}`}>
                          {group.subjects.map((sub, sIdx) => (
                            <tr key={`${group.semester}-${sub.code}`} className="hover:bg-slate-50 transition-colors border-b border-slate-200">
                              {sIdx === 0 && (
                                <td 
                                  rowSpan={group.subjects.length + 1} 
                                  className="border border-slate-300 p-4 text-center font-bold text-slate-700 bg-slate-50/50"
                                >
                                  {group.semester === "Unknown" ? "External" : `Semester ${group.semester}`}
                                </td>
                              )}
                              <td className="border border-slate-300 p-4 text-left font-medium text-slate-700">
                                <span className="font-bold text-blue-800 mr-2">{sub.code}</span>
                                <span className="text-slate-500 uppercase text-[12px]">{sub.name}</span>
                              </td>
                              {poList.map(po => (
                                <td key={po} className={`border border-slate-300 p-4 text-center font-medium ${sub.outcomes[po] ? 'text-zinc-900 bg-emerald-50/10' : 'text-zinc-300'}`}>
                                  {sub.outcomes[po] || '-'}
                                </td>
                              ))}
                              {psoList.map(pso => (
                                <td key={pso} className={`border border-slate-300 p-4 text-center font-medium bg-blue-50/20 ${sub.outcomes[pso] ? 'text-blue-900' : 'text-zinc-300'}`}>
                                  {sub.outcomes[pso] || '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {/* Semester Average Row */}
                          <tr className="bg-slate-50/80 font-semibold border-b-2 border-slate-200">
                            <td className="border border-slate-300 p-3 text-right text-slate-600 italic">
                              {group.semester === "Unknown" ? "External" : `Semester ${group.semester}`} Average
                            </td>
                            {[...poList, ...psoList].map(outcome => {
                              let sum = 0;
                              let count = 0;
                              group.subjects.forEach(sub => {
                                if (sub.outcomes[outcome]) {
                                  sum += Number(sub.outcomes[outcome]);
                                  count++;
                                }
                              });
                              const avg = count > 0 ? (sum / count).toFixed(2) : '-';
                              return (
                                <td key={`sem-avg-${outcome}`} className="border border-slate-300 p-3 text-center text-slate-700">
                                  {avg}
                                </td>
                              );
                            })}
                          </tr>
                        </Fragment>
                      ))}
                      {/* Summary Row: Average of each column */}
                      <tr className="bg-[#f0f9ff] font-bold border-t-2 border-slate-400">
                        <td colSpan={2} className="border border-slate-300 p-4 bg-[#f0f9ff] text-right">
                          Average PO/PSO Attainment
                        </td>
                        {[...poList, ...psoList].map(outcome => {
                           let sum = 0;
                           let count = 0;
                           matrixData.forEach(group => {
                             group.subjects.forEach(sub => {
                               if (sub.outcomes[outcome]) {
                                 sum += Number(sub.outcomes[outcome]);
                                 count++;
                               }
                             });
                           });
                           const avg = count > 0 ? (sum / count).toFixed(2) : '-';
                           return (
                             <td 
                               key={outcome} 
                               className={`border border-slate-300 p-4 text-center text-blue-800 ${outcome.startsWith('PSO') ? 'bg-blue-100/50' : ''}`}
                             >
                               {avg}
                             </td>
                           );
                        })}
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Action Taken Modal */}
      {isActionModalOpen && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-6 transition-all duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden border border-zinc-100 flex flex-col animate-in zoom-in-95 duration-200">
            <div className="bg-[#120c7a] px-6 py-2 sm:px-8 sm:py-2.5 flex justify-between items-center text-white shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-bold leading-tight">Action Taken Form</h3>
                <p className="text-blue-100 text-[10px] sm:text-xs opacity-80 leading-tight">Proposed action plan for {selectedOutcome?.name}</p>
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
                  <p className="font-bold">Reason: Attainment ({Number(selectedOutcome?.finalAttainment || 0).toFixed(2)}) &lt; Target ({Number(selectedOutcome?.targetValue || 0).toFixed(2)})</p>
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
    </Layout>
  );
}
