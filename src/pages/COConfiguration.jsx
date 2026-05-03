import { useState, useEffect, useMemo } from "react";
import Layout from "../components/Layout";
import { rtdb, auth } from "../firebase";
import { ref, onValue, set, get, update } from "firebase/database";
import { Trash2, Save, Plus, ChevronDown, CheckCircle2, Download } from "lucide-react";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { useSemesterType } from "../hooks/useSemesterType";
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, formatProgDisplay } from "../lib/utils";

const COConfiguration = () => {
  const { departments: deptMap, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);
  const semesterType = useSemesterType();
  // Filter States
  const [batch, setBatch] = useState("");
  const [programme, setProgramme] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [department, setDepartment] = useState("");
  const [subject, setSubject] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [userRole, setUserRole] = useState(null);
  const [assignedProgs, setAssignedProgs] = useState([]);
  const [assignedDepts, setAssignedDepts] = useState([]);

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

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

const deriveSemesterNumber = (label) => {
    if (!label) return '';
    const m = String(label).match(/(\d+)/);
    return m ? m[1] : '';
  };

  // Derive regulation automatically
  const regulation = useMemo(() => {
    if (batch && programme) {
      const progKey = formatProgrammeKey(programme);
      return getRegulationForBatch(progKey, batch) || "";
    }
    return "";
  }, [batch, programme, getRegulationForBatch]);

  // Data States
  const [coData, setCoData] = useState([{ code: "CO1", description: "", domain: "", level: "" }]);
  const [poPsoData, setPoPsoData] = useState(null);
  const [mapping, setMapping] = useState({}); // { "PO1_PI1_CO1": true }
  const [thresholds, setThresholds] = useState([
    { level: 3, min: 71, max: 100 },
    { level: 2, min: 61, max: 70 },
    { level: 1, min: 51, max: 60 },
    { level: 0, min: 0, max: 50 },
  ]);
  const [cutoff, setCutoff] = useState("");
  const [percentageSplit, setPercentageSplit] = useState({ internal: 100, university: 0 });
  const [directIndirectSplit, setDirectIndirectSplit] = useState({ direct: 100, indirect: 0 });
  const [loading, setLoading] = useState(false);
  const [isAiMappingActive, setIsAiMappingActive] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [modal, setModal] = useState({ show: false, type: 'alert', title: '', message: '', onConfirm: null });
  const [bloomsTaxonomy, setBloomsTaxonomy] = useState({});

  const [isCourseBankSubject, setIsCourseBankSubject] = useState(false);

  const handleAIMap = async () => {
    if (!poPsoData || !coData || coData.length === 0 || !coData[0].description) {
      showAlert("Error", "Please ensure POs/PSOs are loaded and Course Outcomes are filled out first.");
      return;
    }

    setIsAiMappingActive(true);
    try {
      const { GoogleGenAI, Type } = await import('@google/genai');
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

      if (!apiKey) {
        throw new Error("Gemini API Key is missing. Check your .env file.");
      }
      const ai = new GoogleGenAI({ apiKey });

      // Fetch Course Content from courses node for enriched AI mapping
      const progKey = formatProgrammeKey(programme);
      const courseRef = ref(rtdb, `courses/${progKey}/${sanitizeKey(department)}/${sanitizeKey(regulation)}/${sanitizeKey(subject)}`);
      const overallCourseRef = ref(rtdb, `courses/${progKey}/Overall/${sanitizeKey(regulation)}/${sanitizeKey(subject)}`);

      let courseDataObj = null;
      try {
        const snap = await get(courseRef);
        if (snap.exists()) {
          courseDataObj = snap.val();
        } else {
          const overallSnap = await get(overallCourseRef);
          if (overallSnap.exists()) {
            courseDataObj = overallSnap.val();
          }
        }
      } catch (e) {
        console.error("Failed to fetch course data for mapping", e);
      }

      const coContentMap = {};
      if (courseDataObj && Array.isArray(courseDataObj.co)) {
         courseDataObj.co.forEach(c => {
           coContentMap[c.id] = c.content || "";
         });
      }

      // Structure data for prompt
      const coList = coData.map(co => ({
        code: co.code,
        description: co.description,
        domain: co.domain || "Not specified",
        level: co.level || "Not specified",
        content: coContentMap[co.code] || "Content not available"
      }));
      const piList = [];

      poPsoData.po_statements?.forEach((po, poIdx) => {
        po.competencies.forEach((comp, compIdx) => {
          comp.pis.forEach((pi, piIdx) => {
            const piVal = `${poIdx + 1}.${compIdx + 1}.${piIdx + 1}`;
            const piDesc = typeof pi === 'object' ? pi.description : pi;
            piList.push({ typeKey: `PO${poIdx+1}`, piCode: piVal, description: piDesc });
          });
        });
      });

      poPsoData.pso_statements?.forEach((pso, psoIdx) => {
        const poCount = poPsoData.po_statements?.length || 0;
        const psoDataCode = poCount + psoIdx + 1;
        pso.competencies.forEach((comp, compIdx) => {
          comp.pis.forEach((pi, piIdx) => {
            const piVal = `${psoDataCode}.${compIdx + 1}.${piIdx + 1}`;
            const piDesc = typeof pi === 'object' ? pi.description : pi;
            piList.push({ typeKey: `PSO${psoDataCode}`, piCode: piVal, description: piDesc });
          });
        });
      });

      const prompt = `You are a highly experienced academic coordinator and accreditation expert working on Outcome-Based Education (OBE).
Your task is to comprehensively evaluate and map Course Outcomes (COs) to the specific Performance Indicators (PIs) of POs and PSOs.

To provide the maximum accurate mapping, you MUST deeply analyze the following for each CO:
1. The formal CO Description.
2. The cognitive Domain (e.g., Cognitive, Affective, Psychomotor).
3. The specific Taxonomy Level (e.g., K3: Apply).
4. The detailed Syllabus Content/Topics associated with that CO.

Here are the Course Outcomes (COs) for the subject, highly enriched with context:
${JSON.stringify(coList, null, 2)}

Here are all available Performance Indicators (PIs) across POs and PSOs:
${JSON.stringify(piList, null, 2)}

Instructions:
Evaluate each CO against every PI. You should map a CO to a PI if there is ANY reasonable, logical, or practical connection between the CO's content/skills and the PI, even if the coverage is partial or foundational. 
Do not be overly strict. If the syllabus content logically contributes to the PI's goal, include the mapping. Your goal is to maximize the discovery of all valid mapping intersections to ensure the course's contributions to the program are fully recognized.
Return an exhaustive list of all plausible mappings.`;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an experienced academic coordinator and accreditation expert. Map COs to PIs accurately using deep comprehensive analysis. Do not be overly strict; include all plausible mappings. Output only JSON with a 'mappings' key.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              mappings: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    coCode: { type: Type.STRING },
                    typeKey: { type: Type.STRING },
                    piCode: { type: Type.STRING }
                  },
                  required: ["coCode", "typeKey", "piCode"]
                }
              }
            },
            required: ["mappings"]
          }
        }
      });

      const responseContent = response.text;
      let rawMappings;
      try {
        const parsed = JSON.parse(responseContent);
        rawMappings = parsed.mappings;
      } catch {
        throw new Error("Invalid format from AI");
      }

      if (!Array.isArray(rawMappings)) {
        throw new Error("Invalid format from AI");
      }

      // Let's replace the whole grid to reflect the AI's pure thoughts, user can adjust afterward.
      const freshMapping = {};
      rawMappings.forEach(m => {
        if (m.typeKey && m.piCode && m.coCode) {
          const key = `${m.typeKey}_${m.piCode}_${m.coCode}`;
          freshMapping[key] = true;
        }
      });

      setMapping(freshMapping);

      setSuccessMessage("AI Mapping successful! Please review and adjust as needed.");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);

    } catch (error) {
      console.error("AI Mapping generation error:", error);
      if (error && error.status === 429) {
        showAlert("API Quota Exceeded", "The Gemini API key has exceeded its quota limits. Please use a different key or wait for the quota to reset.");
      } else {
        showAlert("AI Error", "Failed to automatically map using AI.");
      }
    } finally {
      setIsAiMappingActive(false);
    }
  };

  useEffect(() => {
    const bloomsRef = ref(rtdb, "blooms_taxonomy");
    const unsubscribe = onValue(bloomsRef, (snapshot) => {
      if (snapshot.exists()) {
        setBloomsTaxonomy(snapshot.val());
      } else {
        setBloomsTaxonomy({});
      }
    });
    return () => unsubscribe();
  }, []);

  const domains = useMemo(() => {
    return Object.values(bloomsTaxonomy).map(d => d.name);
  }, [bloomsTaxonomy]);

  const getLevelsForDomain = (domainName) => {
    const domain = Object.values(bloomsTaxonomy).find(d => d.name === domainName);
    if (domain && Array.isArray(domain.levels)) {
      return domain.levels;
    }
    return [];
  };

  const showAlert = (title, message) => {
    setModal({ show: true, type: 'alert', title, message, onConfirm: null });
  };

  const batches = useMemo(() => {
    const progKey = formatProgrammeKey(programme);
    return getActiveBatches(progKey);
  }, [programme, getActiveBatches]);

  const academicYears = useMemo(() => getAcademicYears(batch), [batch]);

  const getSemesters = () => {
    if (!batch || !academicYear) return [];
    const index = academicYears.indexOf(academicYear);
    if (index === -1) return [];
    
    const sem1 = (index * 2) + 1;
    const sem2 = (index * 2) + 2;

    const allSems = [sem1, sem2];
    const filteredSems = allSems.filter(num => {
      if (semesterType === "Odd") return num % 2 !== 0;
      return num % 2 === 0;
    });
    
    const getOrdinal = (n) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    return filteredSems.map(semNum => `${getOrdinal(semNum)} Semester`);
  };

  const filteredProgrammes = Object.keys(deptMap).filter(prog => {
    if (userRole !== 'Faculty') return true;
    return assignedProgs.includes(formatProgrammeKey(prog));
  });

  const filteredDepartments = (deptMap[programme] || []).filter(dept => {
    if (userRole !== 'Faculty') return true;
    return assignedDepts.includes(sanitizeKey(dept));
  });

  // Fetch Subjects from Syllabus
  useEffect(() => {
    const fetchSubjects = async () => {
      const progKey = formatProgrammeKey(programme);
      const currentReg = regulation || getRegulationForBatch(progKey, batch);
      if (!programme || !department || !currentReg || !semester || !academicYear) {
        setSubjects([]);
        return;
      }
      const deptKey = sanitizeKey(department);
      const regKey = sanitizeKey(currentReg);
      const syllabusKey = `${progKey}_${deptKey}_${regKey}`;
      const semNum = deriveSemesterNumber(semester);

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
            id: s.code,
            name: `${s.code} - ${s.name}`
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
            const filteredSubjects = fetchedSubjects.filter(s => allAllocatedCodes.has(s.id));
            setSubjects(filteredSubjects);
          } else {
            const userAssignments = assignments[currentUser.uid] || [];
            const filteredSubjects = fetchedSubjects.filter(s => userAssignments.includes(s.id));
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
  }, [programme, department, batch, academicYear, semester, regulation, getRegulationForBatch]);

  // Fetch COs and PO/PSO data
  useEffect(() => {
    if (batch && programme && regulation && department && academicYear && subject) {
      const progKey = formatProgrammeKey(programme);
      
      // Path for COs
      const coKey = `${sanitizeKey(department)}_${sanitizeKey(regulation)}_${sanitizeKey(subject)}_${sanitizeKey(academicYear)}`;
      const coRef = ref(rtdb, `course_outcomes/${coKey}`);
      
      // Path for PO/PSO (using the key format from POConfiguration)
      const poPsoKey = `${progKey}_${sanitizeKey(regulation)}__${sanitizeKey(department)}`;
      const poPsoRef = ref(rtdb, `po_pso/${poPsoKey}`);

      // Path for saved mapping
      const mappingKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(regulation)}_${sanitizeKey(subject)}_${sanitizeKey(academicYear)}_${sanitizeKey(semester)}`;
      const mappingRef = ref(rtdb, `mapping_summary/${mappingKey}`);

      const courseRef = ref(rtdb, `courses/${progKey}/${sanitizeKey(department)}/${sanitizeKey(regulation)}/${sanitizeKey(subject)}`);
      const overallCourseRef = ref(rtdb, `courses/${progKey}/Overall/${sanitizeKey(regulation)}/${sanitizeKey(subject)}`);

      setLoading(true);

      const checkCourseBank = async () => {
        try {
          const snap = await get(courseRef);
          if (snap.exists()) {
             setIsCourseBankSubject(true);
             return;
          }
          const overallSnap = await get(overallCourseRef);
          if (overallSnap.exists()) {
            setIsCourseBankSubject(true);
          } else {
            setIsCourseBankSubject(false);
          }
        } catch (e) {
          setIsCourseBankSubject(false);
        }
      };

      checkCourseBank();

      // Fetch COs
      onValue(coRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const loadedCOs = Object.entries(data)
            .map(([code, val]) => {
              if (typeof val === 'object' && val !== null) {
                return { 
                  code, 
                  description: val.description || "", 
                  domain: val.domain || "", 
                  level: val.level || "" 
                };
              }
              return { code, description: val, domain: "", level: "" };
            })
            .sort((a, b) => parseInt(a.code.replace("CO", "")) - parseInt(b.code.replace("CO", "")));
          setCoData(loadedCOs.length > 0 ? loadedCOs : [{ code: "CO1", description: "", domain: "", level: "" }]);
        } else {
          setCoData([{ code: "CO1", description: "", domain: "", level: "" }]);
        }
      });

      // Fetch PO/PSO
      onValue(poPsoRef, (snapshot) => {
        setPoPsoData(snapshot.val());
      });

      // Fetch Mapping
      onValue(mappingRef, (snapshot) => {
        const data = snapshot.val();
        
        // Reset to defaults first
        setMapping({});
        setThresholds([
          { level: 3, min: 71, max: 100 },
          { level: 2, min: 61, max: 70 },
          { level: 1, min: 51, max: 60 },
          { level: 0, min: 0, max: 50 },
        ]);
        setCutoff("");
        setPercentageSplit({ internal: 100, university: 0 });

        if (data) {
          if (data.summary) {
            const newMapping = {};
            Object.entries(data.summary).forEach(([key, val]) => {
              if (val.checked_map) {
                Object.entries(val.checked_map).forEach(([coCode, pis]) => {
                  pis.forEach(piCode => {
                    newMapping[`${key}_${piCode}_${coCode}`] = true;
                  });
                });
              }
            });
            setMapping(newMapping);
          }
          
          if (data.thresholds) {
            setThresholds(data.thresholds);
          }
          
          if (data.cutoff !== undefined) {
            setCutoff(data.cutoff);
          }
          
          if (data.percentageSplit) {
            setPercentageSplit({
              internal: Number(data.percentageSplit.internal || 0),
              university: Number(data.percentageSplit.university || 0)
            });
          }

          if (data.directIndirectSplit) {
            setDirectIndirectSplit({
              direct: Number(data.directIndirectSplit.direct || 0),
              indirect: Number(data.directIndirectSplit.indirect || 0)
            });
          } else {
            setDirectIndirectSplit({ direct: 100, indirect: 0 });
          }
        }
        setLoading(false);
      });
    }
  }, [batch, programme, regulation, department, academicYear, subject, semester]);

  const handleAddCO = () => {
    const nextNum = coData.length + 1;
    setCoData([...coData, { code: `CO${nextNum}`, description: "", domain: "", level: "" }]);
  };

  const handleRemoveCO = (idx) => {
    const newData = coData.filter((_, i) => i !== idx).map((co, i) => ({
      ...co,
      code: `CO${i + 1}`
    }));
    setCoData(newData);
  };

  const handleCOChange = (idx, field, val) => {
    setCoData(prev => prev.map((co, i) => i === idx ? { ...co, [field]: val } : co));
  };

  const handleSaveCOs = async () => {
    if (!department || !regulation || !subject || !academicYear) {
      showAlert("Validation Error", "Please select all filters");
      return;
    }
    const coKey = `${sanitizeKey(department)}_${sanitizeKey(regulation)}_${sanitizeKey(subject)}_${sanitizeKey(academicYear)}`;
    const coDict = {};
    coData.forEach(co => {
      if (co.description.trim()) {
        coDict[co.code] = {
          description: co.description,
          domain: co.domain || "",
          level: co.level || ""
        };
      }
    });

    try {
      await set(ref(rtdb, `course_outcomes/${coKey}`), coDict);
      setSuccessMessage("Course Outcomes saved successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      showAlert("Error", "Error saving COs: " + error.message);
    }
  };

  const toggleMapping = (type, typeCode, piCode, coCode) => {
    const key = `${type}${typeCode}_${piCode}_${coCode}`;
    setMapping(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSaveMapping = async () => {
    if (!batch || !programme || !regulation || !subject || !academicYear) {
      showAlert("Validation Error", "Please select all filters");
      return;
    }

    const progKey = formatProgrammeKey(programme);
    const mappingKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(regulation)}_${sanitizeKey(subject)}_${sanitizeKey(academicYear)}_${sanitizeKey(semester)}`;
    
    const summary = {};
    
    // Process POs
    poPsoData?.po_statements?.forEach((po, poIdx) => {
      const poCode = poIdx + 1;
      const key = `PO${poCode}`;
      let totalPIs = 0;
      const coCounts = {};
      const checkedMap = {};

      po.competencies.forEach((comp, compIdx) => {
        comp.pis.forEach((pi, piIdx) => {
          const piVal = `${poCode}.${compIdx + 1}.${piIdx + 1}`;
          totalPIs++;
          coData.forEach(co => {
            if (mapping[`${key}_${piVal}_${co.code}`]) {
              coCounts[co.code] = (coCounts[co.code] || 0) + 1;
              checkedMap[co.code] = checkedMap[co.code] || [];
              checkedMap[co.code].push(piVal);
            }
          });
        });
      });

      summary[key] = { total_pis: totalPIs, co_counts: coCounts, checked_map: checkedMap };
    });

    // Process PSOs
    const poCount = poPsoData?.po_statements?.length || 0;
    poPsoData?.pso_statements?.forEach((pso, psoIdx) => {
      const psoCode = psoIdx + 1;
      const psoDataCode = poCount + psoCode;
      const key = `PSO${psoDataCode}`;
      let totalPIs = 0;
      const coCounts = {};
      const checkedMap = {};

      pso.competencies.forEach((comp, compIdx) => {
        comp.pis.forEach((pi, piIdx) => {
          const piVal = `${psoDataCode}.${compIdx + 1}.${piIdx + 1}`;
          totalPIs++;
          coData.forEach(co => {
            if (mapping[`${key}_${piVal}_${co.code}`]) {
              coCounts[co.code] = (coCounts[co.code] || 0) + 1;
              checkedMap[co.code] = checkedMap[co.code] || [];
              checkedMap[co.code].push(piVal);
            }
          });
        });
      });

      summary[key] = { total_pis: totalPIs, co_counts: coCounts, checked_map: checkedMap };
    });

    try {
      await set(ref(rtdb, `mapping_summary/${mappingKey}`), {
        summary,
        thresholds,
        cutoff: cutoff === "" ? "" : Number(cutoff),
        percentageSplit: {
          internal: Number(percentageSplit.internal || 0),
          university: Number(percentageSplit.university || 0)
        },
        directIndirectSplit: {
          direct: Number(directIndirectSplit.direct || 0),
          indirect: Number(directIndirectSplit.indirect || 0)
        },
        meta: {
          updatedAt: new Date().toISOString()
        }
      });
      setSuccessMessage("Mapping summary saved successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      showAlert("Error", "Error saving mapping: " + error.message);
    }
  };

  const handleSaveThresholds = async () => {
    if (!batch || !programme || !regulation || !subject || !academicYear) {
      showAlert("Validation Error", "Please select all filters");
      return;
    }

    const progKey = formatProgrammeKey(programme);
    const mappingKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(regulation)}_${sanitizeKey(subject)}_${sanitizeKey(academicYear)}_${sanitizeKey(semester)}`;

    try {
      await update(ref(rtdb, `mapping_summary/${mappingKey}`), {
        thresholds,
        cutoff: cutoff === "" ? "" : Number(cutoff),
        percentageSplit: {
          internal: Number(percentageSplit.internal || 0),
          university: Number(percentageSplit.university || 0)
        },
        directIndirectSplit: {
          direct: Number(directIndirectSplit.direct || 0),
          indirect: Number(directIndirectSplit.indirect || 0)
        },
        "meta/updatedAt": new Date().toISOString()
      });
      setSuccessMessage("Thresholds and cutoff saved successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      showAlert("Error", "Error saving thresholds: " + error.message);
    }
  };

  const handleLoadExisting = async () => {
    if (!regulation || !subject) {
      showAlert("Validation Error", "Please select Regulation and Subject first");
      return;
    }
    setLoading(true);
    try {
      // 1. Find any other course outcomes for this regulation and subject
      const coRef = ref(rtdb, 'course_outcomes');
      const coSnap = await get(coRef);
      let foundCOs = null;
      let foundMapping = null;

      if (coSnap.exists()) {
        const allCOs = coSnap.val();
        // Look for keys containing _regulation_subject_
        const searchStr = `_${sanitizeKey(regulation)}_${sanitizeKey(subject)}_`;
        const matchingKey = Object.keys(allCOs).find(key => key.includes(searchStr));
        if (matchingKey) {
          foundCOs = allCOs[matchingKey];
        }
      }

      // 2. Find any other mapping for this regulation and subject
      const mappingRef = ref(rtdb, 'mapping_summary');
      const mappingSnap = await get(mappingRef);
      if (mappingSnap.exists()) {
        const allMappings = mappingSnap.val();
        const progKey = formatProgrammeKey(programme);
        const searchStr = `_${progKey}_${sanitizeKey(regulation)}_${sanitizeKey(subject)}_`;
        const matchingKey = Object.keys(allMappings).find(key => key.includes(searchStr));
        if (matchingKey) {
          foundMapping = allMappings[matchingKey].summary;
        }
      }

      if (foundCOs) {
        const loadedCOs = Object.entries(foundCOs)
          .map(([code, val]) => {
            if (typeof val === 'object' && val !== null) {
              return { 
                code, 
                description: val.description || "", 
                domain: val.domain || "", 
                level: val.level || "" 
              };
            }
            return { code, description: val, domain: "", level: "" };
          })
          .sort((a, b) => parseInt(a.code.replace("CO", "")) - parseInt(b.code.replace("CO", "")));
        setCoData(loadedCOs);
      }

      if (foundMapping) {
        const newMapping = {};
        Object.entries(foundMapping).forEach(([key, val]) => {
          if (val.checked_map) {
            Object.entries(val.checked_map).forEach(([coCode, pis]) => {
              pis.forEach(piCode => {
                newMapping[`${key}_${piCode}_${coCode}`] = true;
              });
            });
          }
        });
        setMapping(newMapping);
      }

      if (foundCOs || foundMapping) {
        setSuccessMessage("Existing configuration loaded! Review and save to apply to this batch.");
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        showAlert("Not Found", "No existing configuration found for this subject and regulation in other batches.");
      }
    } catch (error) {
      console.error("Load Error:", error);
      showAlert("Error", "Failed to load existing data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="CO Configuration">
      <div className="max-w-7xl mx-auto p-6 space-y-8 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-50 flex items-center justify-center rounded-2xl">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 border-4 border-[#120c7a] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-bold text-[#120c7a]">Loading...</p>
            </div>
          </div>
        )}

        {/* Filter Card */}
        <div className="bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-2">
            <h2 className="text-white font-bold text-sm">CO - Configuration Parameters</h2>
          </div>
          <div className="p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Programme Name</label>
                <div className="relative">
                  <select value={programme} onChange={(e) => { setProgramme(e.target.value); setDepartment(""); setBatch(""); }} className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium">
                    <option value="">Select Programme</option>
                    {filteredProgrammes.map(progKey => (
                      <option key={progKey} value={progKey}>{formatProgDisplay(progKey)}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Batch</label>
                <div className="relative">
                  <select disabled={!programme} value={batch} onChange={(e) => setBatch(e.target.value)} className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium disabled:opacity-50">
                    <option value="">Select Batch</option>
                    {batches.map(b => <option key={b} value={b}>{formatBatchDisplay(b)}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Regulation</label>
                <div className="w-full bg-zinc-100 border border-zinc-200 rounded-lg px-4 py-2.5 font-medium text-zinc-500">
                  {regulation || "Regulation not mapped"}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Academic Year</label>
                <div className="relative">
                  <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium">
                    <option value="">Select Academic Year</option>
                    {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Semester</label>
                <div className="relative">
                  <select value={semester} onChange={(e) => setSemester(e.target.value)} className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium">
                    <option value="">Select Semester</option>
                    {getSemesters().map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Department</label>
                <div className="relative">
                  <select disabled={!programme} value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium disabled:opacity-50">
                    <option value="">Select Department</option>
                    {filteredDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-bold text-zinc-600">Subject *</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium">
                      <option value="">Select Subject</option>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CO Configuration Card */}
        <div className="bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-2 flex justify-between items-center">
            <h2 className="text-white font-bold text-sm">CO - Configuration</h2>
            {regulation && subject && !isCourseBankSubject && (
              <button 
                onClick={handleLoadExisting}
                className="flex items-center gap-2 px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-all border border-white/20"
              >
                <Download size={14} /> Load from Previous Year / Batch
              </button>
            )}
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-6">
              {coData.map((co, idx) => (
                <div key={idx} className="bg-zinc-50 p-5 rounded-xl border border-zinc-200 shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 flex items-center justify-center bg-[#120c7a] text-white rounded-lg font-bold text-xs shadow-sm">
                        {co.code}
                      </span>
                      <h3 className="text-sm font-bold text-zinc-700">Course Outcome Details</h3>
                    </div>
                    <button 
                      onClick={() => handleRemoveCO(idx)} 
                      className={`text-zinc-400 p-1.5 rounded-lg transition-all ${isCourseBankSubject ? 'opacity-50 cursor-not-allowed hidden' : 'hover:text-red-500 hover:bg-red-50'}`}
                      disabled={isCourseBankSubject}
                      title="Remove CO"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-6 space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Description</label>
                      <textarea
                        className="w-full bg-white border border-zinc-300 rounded-lg px-4 py-2.5 outline-none focus:border-[#120c7a] focus:ring-4 focus:ring-blue-50 transition-all text-sm min-h-[100px] disabled:opacity-50 disabled:bg-zinc-100"
                        placeholder="Enter the course outcome description..."
                        value={co.description}
                        onChange={(e) => handleCOChange(idx, 'description', e.target.value)}
                        disabled={isCourseBankSubject}
                      />
                    </div>

                    <div className="lg:col-span-3 space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Domain</label>
                      <div className="relative">
                        <select
                          value={co.domain}
                          onChange={(e) => {
                            handleCOChange(idx, 'domain', e.target.value);
                            handleCOChange(idx, 'level', ''); // Reset level when domain changes
                          }}
                          className="w-full appearance-none bg-white border border-zinc-300 rounded-lg px-4 py-2.5 pr-10 outline-none focus:border-[#120c7a] focus:ring-4 focus:ring-blue-50 transition-all text-sm font-medium disabled:opacity-50 disabled:bg-zinc-100"
                          disabled={isCourseBankSubject}
                        >
                          <option value="">Select Domain</option>
                          {domains.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={16} />
                      </div>
                      <p className="text-[10px] text-zinc-400 italic">e.g., Cognitive, Affective</p>
                    </div>

                    <div className="lg:col-span-3 space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Level</label>
                      <div className="relative">
                        <select
                          value={co.level}
                          onChange={(e) => handleCOChange(idx, 'level', e.target.value)}
                          className="w-full appearance-none bg-white border border-zinc-300 rounded-lg px-4 py-2.5 pr-10 outline-none focus:border-[#120c7a] focus:ring-4 focus:ring-blue-50 transition-all text-sm font-medium disabled:opacity-50 disabled:bg-zinc-100"
                          disabled={isCourseBankSubject}
                        >
                          <option value="">Select Level</option>
                          {getLevelsForDomain(co.domain).map(l => (
                            <option key={l.code || l.name} value={l.code || l.name}>
                              {l.code ? `${l.code} - ${l.name}` : l.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={16} />
                      </div>
                      <p className="text-[10px] text-zinc-400 italic">e.g., K3: Apply, K4: Analyze</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!isCourseBankSubject && (
              <button onClick={handleAddCO} className="flex items-center gap-2 px-4 py-2 bg-[#120c7a] hover:bg-[#100b6e] text-white font-bold rounded-lg shadow transition-all">
                <Plus size={18} /> Add CO
              </button>
            )}
            {!isCourseBankSubject && (
              <div className="flex justify-end gap-4 pt-4 border-t border-zinc-100">
                <button onClick={handleSaveCOs} className="px-8 py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg shadow-md transition-all flex items-center gap-2">
                  <Save size={18} /> Save COs
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Threshold Configuration Card */}
        {poPsoData && coData.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden mb-8">
            <div className="bg-[#120c7a] px-6 py-2 flex justify-between items-center">
              <h2 className="text-white font-bold text-sm">Threshold value for CO Attainment</h2>
            </div>
            <div className="p-8">
              <div className="mb-6 flex items-center justify-end gap-4 max-w-2xl mx-auto">
                <label className="text-sm font-bold text-zinc-700">Cutoff Percentage (%):</label>
                <input 
                  type="number" 
                  value={cutoff} 
                  onChange={(e) => setCutoff(e.target.value)} 
                  className="border border-zinc-300 rounded px-3 py-1.5 outline-none focus:border-[#120c7a] w-24 text-center font-semibold" 
                  placeholder="e.g. 50"
                />
              </div>

              <div className="mb-4 flex items-center justify-end gap-4 max-w-2xl mx-auto">
                <label className="text-sm font-bold text-zinc-700">Percentage Split (Internals / University):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={percentageSplit.internal}
                    onChange={(e) => {
                      let v = Number(e.target.value);
                      if (isNaN(v)) v = 0;
                      v = Math.max(0, Math.min(100, v));
                      setPercentageSplit({ internal: v, university: 100 - v });
                    }}
                    className="border border-zinc-300 rounded px-3 py-1.5 outline-none focus:border-[#120c7a] w-20 text-center font-semibold"
                  />
                  <span className="font-medium">%</span>
                  <span className="text-zinc-500"> / </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={percentageSplit.university}
                    onChange={(e) => {
                      let v = Number(e.target.value);
                      if (isNaN(v)) v = 0;
                      v = Math.max(0, Math.min(100, v));
                      setPercentageSplit({ university: v, internal: 100 - v });
                    }}
                    className="border border-zinc-300 rounded px-3 py-1.5 outline-none focus:border-[#120c7a] w-20 text-center font-semibold"
                  />
                  <span className="font-medium">%</span>
                </div>
              </div>
              <div className="max-w-2xl mx-auto text-xs text-zinc-500 mb-4">Set how CO attainment is computed from internals and university marks; values sum to 100%.</div>

              <div className="mb-4 flex items-center justify-end gap-4 max-w-2xl mx-auto">
                <label className="text-sm font-bold text-zinc-700">Percentage Split (Direct / Indirect):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={directIndirectSplit.direct}
                    onChange={(e) => {
                      let v = Number(e.target.value);
                      if (isNaN(v)) v = 0;
                      v = Math.max(0, Math.min(100, v));
                      setDirectIndirectSplit({ direct: v, indirect: 100 - v });
                    }}
                    className="border border-zinc-300 rounded px-3 py-1.5 outline-none focus:border-[#120c7a] w-20 text-center font-semibold"
                  />
                  <span className="font-medium">%</span>
                  <span className="text-zinc-500"> / </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={directIndirectSplit.indirect}
                    onChange={(e) => {
                      let v = Number(e.target.value);
                      if (isNaN(v)) v = 0;
                      v = Math.max(0, Math.min(100, v));
                      setDirectIndirectSplit({ indirect: v, direct: 100 - v });
                    }}
                    className="border border-zinc-300 rounded px-3 py-1.5 outline-none focus:border-[#120c7a] w-20 text-center font-semibold"
                  />
                  <span className="font-medium">%</span>
                </div>
              </div>
              <div className="max-w-2xl mx-auto text-xs text-zinc-500 mb-4">Set how CO attainment is computed from direct assessments (internal+uni exams) and indirect assessments (surveys/etc); values sum to 100%.</div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-zinc-200 text-sm max-w-2xl mx-auto">
                  <thead>
                    <tr className="bg-zinc-50">
                      <th className="border border-zinc-200 p-3 text-center font-bold text-zinc-700" colSpan={3}>Range</th>
                      <th className="border border-zinc-200 p-3 text-center font-bold text-zinc-700">Attainment Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {thresholds.map((t, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="border border-zinc-200 p-3 text-center font-bold text-zinc-600 w-1/4">Between</td>
                        <td className="border border-zinc-200 p-3 text-center w-1/4">
                          <input 
                            type="number" 
                            value={t.min} 
                            onChange={(e) => {
                              const newThresholds = [...thresholds];
                              newThresholds[idx].min = Number(e.target.value);
                              setThresholds(newThresholds);
                            }}
                            className="w-full text-center border border-zinc-300 rounded px-2 py-1 outline-none focus:border-[#120c7a]"
                          />
                        </td>
                        <td className="border border-zinc-200 p-3 text-center w-1/4">
                          <input 
                            type="number" 
                            value={t.max} 
                            onChange={(e) => {
                              const newThresholds = [...thresholds];
                              newThresholds[idx].max = Number(e.target.value);
                              setThresholds(newThresholds);
                            }}
                            className="w-full text-center border border-zinc-300 rounded px-2 py-1 outline-none focus:border-[#120c7a]"
                          />
                        </td>
                        <td className="border border-zinc-200 p-3 text-center font-bold text-zinc-800 w-1/4">
                          {t.level}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-6 max-w-2xl mx-auto">
                <button onClick={handleSaveThresholds} className="px-6 py-2 bg-[#120c7a] hover:bg-[#100b6e] text-white font-bold rounded-lg shadow-md transition-all flex items-center gap-2">
                  <Save size={18} /> Save Thresholds & Cutoff
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mapping Table Card */}
        {poPsoData && coData.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
            <div className="bg-[#120c7a] px-6 py-2 flex justify-between items-center">
              <h2 className="text-white font-bold text-sm">CO-PO / CO-PSO Mapping</h2>
              <button
                onClick={handleAIMap}
                disabled={isAiMappingActive}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isAiMappingActive ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Mapping...
                  </>
                ) : (
                  "Auto Map with AI"
                )}
              </button>
            </div>
            <div className="p-8 overflow-x-auto">
              <table className="w-full border-collapse border border-zinc-200 text-sm">
                <thead>
                  <tr className="bg-zinc-50">
                    <th className="border border-zinc-200 p-3 text-center font-bold text-zinc-700">PO/PSO</th>
                    <th className="border border-zinc-200 p-3 text-center font-bold text-zinc-700">Competency</th>
                    <th className="border border-zinc-200 p-3 text-center font-bold text-zinc-700">Performance Indicators (PIs)</th>
                    {coData.map(co => (
                      <th key={co.code} className="border border-zinc-200 p-3 text-center font-bold text-zinc-700">{co.code}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* PO Blocks */}
                  {poPsoData.po_statements?.map((po, poIdx) => {
                    const poCode = poIdx + 1;
                    const poKey = `PO${poCode}`;
                    const totalRows = po.competencies.reduce((acc, c) => acc + (c.pis.length || 1), 0);
                    
                    return po.competencies.map((comp, compIdx) => (
                      comp.pis.map((pi, piIdx) => {
                        const piCalculatedCode = `${poIdx + 1}.${compIdx + 1}.${piIdx + 1}`;
                        const piDesc = typeof pi === 'object' ? pi.description : '';
                        return (
                        <tr key={`${poKey}_${compIdx}_${piIdx}`} className="hover:bg-blue-50/30 transition-colors">
                          {compIdx === 0 && piIdx === 0 && (
                            <td rowSpan={totalRows} className="border border-zinc-200 p-3 font-bold text-zinc-800 align-middle">
                              PO {poIdx + 1}: {po.statement}
                            </td>
                          )}
                          {piIdx === 0 && (
                            <td rowSpan={comp.pis.length || 1} className="border border-zinc-200 p-3 text-zinc-600 align-middle">
                              {poIdx + 1}.{compIdx + 1}: {comp.statement}
                            </td>
                          )}
                          <td className="border border-zinc-200 p-3 text-zinc-600 italic">
                            {piCalculatedCode} {piDesc ? `- ${piDesc}` : ''}
                          </td>
                          {coData.map(co => (
                            <td key={co.code} className="border border-zinc-200 p-3 text-center">
                              <input
                                type="checkbox"
                                className="w-4 h-4 text-blue-600 border-zinc-300 rounded focus:ring-blue-500"
                                checked={!!mapping[`${poKey}_${piCalculatedCode}_${co.code}`]}
                                onChange={() => toggleMapping("PO", poCode, piCalculatedCode, co.code)}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })
                    )).flat().concat(
                      <tr key={`${poKey}_summary`} className="bg-zinc-100 font-bold">
                        <td className="border border-zinc-200 p-3"></td>
                        <td className="border border-zinc-200 p-3 text-center">Total PIs:</td>
                        <td className="border border-zinc-200 p-3 text-center">
                          {po.competencies.reduce((acc, c) => acc + c.pis.length, 0)}
                        </td>
                        {coData.map(co => {
                          let count = 0;
                          po.competencies.forEach((c, cIdx) => {
                            c.pis.forEach((pi, pIdx) => {
                              const piCalculatedCode = `${poIdx + 1}.${cIdx + 1}.${pIdx + 1}`;
                              if (mapping[`${poKey}_${piCalculatedCode}_${co.code}`]) count++;
                            });
                          });
                          return <td key={co.code} className="border border-zinc-200 p-3 text-center">{count}</td>;
                        })}
                      </tr>
                    );
                  })}

                  {/* PSO Blocks */}
                  {poPsoData.pso_statements?.map((pso, psoIdx) => {
                    const poCount = poPsoData.po_statements?.length || 0;
                    const psoLabelCode = psoIdx + 1;
                    const psoDataCode = poCount + psoIdx + 1;
                    const psoKey = `PSO${psoDataCode}`;
                    const totalRows = pso.competencies.reduce((acc, c) => acc + (c.pis.length || 1), 0);
                    
                    return pso.competencies.map((comp, compIdx) => (
                      comp.pis.map((pi, piIdx) => {
                        const piCalculatedCode = `${psoDataCode}.${compIdx + 1}.${piIdx + 1}`;
                        const piDesc = typeof pi === 'object' ? pi.description : '';
                        return (
                        <tr key={`${psoKey}_${compIdx}_${piIdx}`} className="hover:bg-blue-50/30 transition-colors">
                          {compIdx === 0 && piIdx === 0 && (
                            <td rowSpan={totalRows} className="border border-zinc-200 p-3 font-bold text-zinc-800 align-middle">
                              PSO {psoLabelCode}: {pso.statement}
                            </td>
                          )}
                          {piIdx === 0 && (
                            <td rowSpan={comp.pis.length || 1} className="border border-zinc-200 p-3 text-zinc-600 align-middle">
                              {psoDataCode}.{compIdx + 1}: {comp.statement}
                            </td>
                          )}
                          <td className="border border-zinc-200 p-3 text-zinc-600 italic">
                            {piCalculatedCode} {piDesc ? `- ${piDesc}` : ''}
                          </td>
                          {coData.map(co => (
                            <td key={co.code} className="border border-zinc-200 p-3 text-center">
                              <input
                                type="checkbox"
                                className="w-4 h-4 text-blue-600 border-zinc-300 rounded focus:ring-blue-500"
                                checked={!!mapping[`${psoKey}_${piCalculatedCode}_${co.code}`]}
                                onChange={() => toggleMapping("PSO", psoDataCode, piCalculatedCode, co.code)}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })
                    )).flat().concat(
                      <tr key={`${psoKey}_summary`} className="bg-zinc-100 font-bold">
                        <td className="border border-zinc-200 p-3"></td>
                        <td className="border border-zinc-200 p-3 text-center">Total PIs:</td>
                        <td className="border border-zinc-200 p-3 text-center">
                          {pso.competencies.reduce((acc, c) => acc + c.pis.length, 0)}
                        </td>
                        {coData.map(co => {
                          let count = 0;
                          pso.competencies.forEach((c, cIdx) => {
                            c.pis.forEach((pi, pIdx) => {
                              const piCalculatedCode = `${psoDataCode}.${cIdx + 1}.${pIdx + 1}`;
                              if (mapping[`${psoKey}_${piCalculatedCode}_${co.code}`]) count++;
                            });
                          });
                          return <td key={co.code} className="border border-zinc-200 p-3 text-center">{count}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-8 flex justify-end gap-4 border-t border-zinc-100">
              <button onClick={handleSaveMapping} className="px-8 py-2.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg shadow-md transition-all flex items-center gap-2">
                <Save size={18} /> Save Mapping Summary
              </button>
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
};

export default COConfiguration;
