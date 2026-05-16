import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { rtdb, auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ref, onValue, set, get } from "firebase/database";
import { Trash2, Save, ChevronDown, CheckCircle2 } from "lucide-react";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { formatProgrammeKey, formatProgDisplay, sanitizeKey } from "../lib/utils";

const POConfiguration = () => {
  const { departments: deptMap, durations } = useDepartments();
  const { regulations } = useRegulations();
  const [programme, setProgramme] = useState("");
  const [regulation, setRegulation] = useState("");
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [poData, setPoData] = useState([
    { statement: "", competencies: [{ statement: "", pis: [{ value: "1.1.1", description: "" }] }] },
  ]);
  const [psoData, setPsoData] = useState([
    { statement: "", competencies: [{ statement: "", pis: [{ value: "1.1.1", description: "" }] }] },
  ]);
  const [directWeight, setDirectWeight] = useState("80");
  const [indirectWeight, setIndirectWeight] = useState("20");
  const [surveys, setSurveys] = useState([{ name: "Alumni Survey", weight: "100" }]);

  const [modal, setModal] = useState({ show: false, type: 'alert', title: '', message: '', onConfirm: null });

  const [isGeneratingAI, setIsGeneratingAI] = useState({ active: false, section: '', idx: -1, compIdx: -1 });

  const showAlert = (title, message) => {
    setModal({ show: true, type: 'alert', title, message, onConfirm: null });
  };

  const showConfirm = (title, message, onConfirm) => {
    setModal({ show: true, type: 'confirm', title, message, onConfirm });
  };

  const departments = programme ? (deptMap[formatProgrammeKey(programme)] || []) : [];

  const handleGenerateCompsAndPIsWithAI = async (type, statementIdx) => {
    const dataList = type === 'PO' ? poData : psoData;
    const item = dataList[statementIdx];

    if (!item.statement || item.statement.trim() === '') {
      showAlert("Error", "Please enter a PO/PSO statement first before generating Competencies and PIs.");
      return;
    }

    setIsGeneratingAI({ active: true, section: type, idx: statementIdx, compIdx: -1 });

    try {
      const { GoogleGenAI, Type } = await import('@google/genai');
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API Key is missing. Please add VITE_GEMINI_API_KEY to your secrets.");
      }
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `As an expert OBE coordinator, break down the following PO/PSO statement into logical Competencies and specific, measurable Performance Indicators (PIs).
Be highly efficient, precise, and concise to save tokens. Generate only the naturally required number of competencies and PIs based strictly on the statement's scope (do not force exactly 3).
Statement: "${item.statement}"`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an expert Outcome-Based Education (OBE) coordinator. Output only JSON containing an array of 'competencies'. Each competency must have a concise 'statement' (string) and 'pis' (array of crisp strings).",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              competencies: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    statement: { type: Type.STRING },
                    pis: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: ["statement", "pis"]
                }
              }
            },
            required: ["competencies"]
          }
        }
      });

      const responseContent = response.text;
      let compsArray;
      try {
        const parsed = JSON.parse(responseContent);
        compsArray = parsed.competencies;
      } catch {
        throw new Error("Invalid format from AI");
      }

      if (!Array.isArray(compsArray) || compsArray.length === 0) {
        throw new Error("Invalid format from AI");
      }

      const prefixIdx = type === 'PO' ? statementIdx : poData.length + statementIdx;
      
      const newCompetencies = compsArray.map((compData, cIdx) => ({
        statement: compData.statement,
        pis: compData.pis.map((piText, pIdx) => ({
          value: `${prefixIdx + 1}.${cIdx + 1}.${pIdx + 1}`,
          description: piText
        }))
      }));

      if (type === 'PO') {
        const newData = [...poData];
        newData[statementIdx].competencies = newCompetencies;
        setPoData(newData);
      } else {
        const newData = [...psoData];
        newData[statementIdx].competencies = newCompetencies;
        setPsoData(newData);
      }

      setSuccessMessage("Competencies and PIs generated successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);

    } catch (error) {
      console.error("AI Generation Error: ", error);
      if (error && error.status === 429) {
        showAlert("API Quota Exceeded", "The Gemini API key has exceeded its quota limits. Please use a different key or wait for the quota to reset.");
      } else {
        showAlert("Error", "Failed to generate Competencies and PIs using AI.");
      }
    } finally {
      setIsGeneratingAI({ active: false, section: '', idx: -1, compIdx: -1 });
    }
  };

  // Fetch data when filters change
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = ref(rtdb, `users/${currentUser.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) setUserData(snapshot.val());
      }
    });
    return () => unsubscribeAuth();
  }, []);
  useEffect(() => {
    const progKey = formatProgrammeKey(programme);
    if (programme && regulation && department) {
      const compositeKey = `${progKey}_${sanitizeKey(regulation)}__${sanitizeKey(department)}`;
      const dbPath = `po_pso/${compositeKey}`;
      const dataRef = ref(rtdb, dbPath);
      
      const unsubscribe = onValue(dataRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setPoData(data.po_statements || [{ statement: "", competencies: [{ statement: "", pis: [{ value: "1.1.1", description: "" }] }] }]);
          setPsoData(data.pso_statements || [{ statement: "", competencies: [{ statement: "", pis: [{ value: "1.1.1", description: "" }] }] }]);
          setDirectWeight(data.direct_weight || "80");
          setIndirectWeight(data.indirect_weight || "20");
          setSurveys(data.surveys || [{ name: "Alumni Survey", weight: "100" }]);
        } else {
          setPoData([{ statement: "", competencies: [{ statement: "", pis: [{ value: "1.1.1", description: "" }] }] }]);
          setPsoData([{ statement: "", competencies: [{ statement: "", pis: [{ value: "1.1.1", description: "" }] }] }]);
          setDirectWeight("80");
          setIndirectWeight("20");
          setSurveys([{ name: "Alumni Survey", weight: "100" }]);
        }
        setLoading(false);
      }, (error) => {
        console.error("Firebase fetch error:", error);
        setLoading(false);
      });
      return () => unsubscribe();
    }
  }, [programme, regulation, department]);

  const recalculateValues = (data, offset = 0) => {
    return data.map((item, i) => ({
      ...item,
      competencies: item.competencies.map((comp, j) => ({
        ...comp,
        pis: comp.pis.map((pi, k) => {
          const desc = typeof pi === 'object' ? pi.description : pi;
          return {
            value: `${offset + i + 1}.${j + 1}.${k + 1}`,
            description: desc || ""
          };
        })
      }))
    }));
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();

    if (!programme || !regulation || !department) {
      showAlert("Validation Error", "Please select all filters (Programme, Regulation, Department)");
      return;
    }

    const progKey = formatProgrammeKey(programme);
    const compositeKey = `${progKey}_${sanitizeKey(regulation)}__${sanitizeKey(department)}`;
    const dbPath = `po_pso/${compositeKey}`;
    
    // Validations for attainment and surveys
    const dWeight = parseFloat(directWeight);
    const iWeight = parseFloat(indirectWeight);
    if (isNaN(dWeight) || isNaN(iWeight) || (dWeight + iWeight !== 100)) {
      showAlert("Validation Error", "Direct and Indirect Attainment weights must sum to 100.");
      return;
    }
    
    const totalSurveyWeight = surveys.reduce((sum, s) => sum + (parseFloat(s.weight) || 0), 0);
    if (surveys.length > 0 && Math.abs(totalSurveyWeight - 100) > 0.01) {
      showAlert("Validation Error", "The sum of all survey weights must be 100%.");
      return;
    }

    const formattedPoData = recalculateValues(poData);
    const formattedPsoData = recalculateValues(psoData, poData.length);

    try {
      await set(ref(rtdb, dbPath), {
        programme_name: programme,
        regulation,
        department,
        direct_weight: dWeight,
        indirect_weight: iWeight,
        surveys: surveys,
        po_statements: formattedPoData,
        pso_statements: formattedPsoData,
        updatedAt: new Date().toISOString(),
      });
      setSuccessMessage("PO and PSO Configuration saved successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving data:", error);
      showAlert("Error", `Failed to save configuration: ${error.message}`);
    }
  };

  // PO Handlers
  const addPO = () => {
    setPoData([...poData, { statement: "", competencies: [{ statement: "", pis: [{ value: `${poData.length + 1}.1.1`, description: "" }] }] }]);
  };

  const removePO = (idx) => {
    setPoData(poData.filter((_, i) => i !== idx));
  };

  const updatePOStatement = (idx, val) => {
    const newData = poData.map((po, i) => 
      i === idx ? { ...po, statement: val } : po
    );
    setPoData(newData);
  };

  const addCompetencyToPO = (poIdx) => {
    const newData = poData.map((po, i) => 
      i === poIdx ? { 
        ...po, 
        competencies: [...po.competencies, { statement: "", pis: [{ value: `${poIdx + 1}.${po.competencies.length + 1}.1`, description: "" }] }] 
      } : po
    );
    setPoData(newData);
  };

  const removeCompetencyFromPO = (poIdx, compIdx) => {
    const newData = poData.map((po, i) => 
      i === poIdx ? { 
        ...po, 
        competencies: po.competencies.filter((_, j) => j !== compIdx) 
      } : po
    );
    setPoData(newData);
  };

  const updateCompetencyPO = (poIdx, compIdx, val) => {
    const newData = poData.map((po, i) => 
      i === poIdx ? { 
        ...po, 
        competencies: po.competencies.map((comp, j) => 
          j === compIdx ? { ...comp, statement: val } : comp
        ) 
      } : po
    );
    setPoData(newData);
  };

  const addPIToPO = (poIdx, compIdx) => {
    const newData = poData.map((po, i) => 
      i === poIdx ? { 
        ...po, 
        competencies: po.competencies.map((comp, j) => 
          j === compIdx ? { ...comp, pis: [...comp.pis, { value: `${poIdx + 1}.${compIdx + 1}.${comp.pis.length + 1}`, description: "" }] } : comp
        ) 
      } : po
    );
    setPoData(newData);
  };

  const removePIFromPO = (poIdx, compIdx, piIdx) => {
    const newData = poData.map((po, i) => 
      i === poIdx ? { 
        ...po, 
        competencies: po.competencies.map((comp, j) => 
          j === compIdx ? { ...comp, pis: comp.pis.filter((_, k) => k !== piIdx) } : comp
        ) 
      } : po
    );
    setPoData(newData);
  };

  const updatePIPO = (poIdx, compIdx, piIdx, val) => {
    const newData = poData.map((po, i) => 
      i === poIdx ? { 
        ...po, 
        competencies: po.competencies.map((comp, j) => 
          j === compIdx ? { 
            ...comp, 
            pis: comp.pis.map((pi, k) => k === piIdx ? { ...(typeof pi === 'object' ? pi : {}), value: `${poIdx + 1}.${compIdx + 1}.${piIdx + 1}`, description: val } : pi) 
          } : comp
        ) 
      } : po
    );
    setPoData(newData);
  };

  // PSO Handlers (Similar to PO)
  const addPSO = () => {
    setPsoData([...psoData, { statement: "", competencies: [{ statement: "", pis: [{ value: `${poData.length + psoData.length + 1}.1.1`, description: "" }] }] }]);
  };

  const removePSO = (idx) => {
    setPsoData(psoData.filter((_, i) => i !== idx));
  };

  const updatePSOStatement = (idx, val) => {
    const newData = psoData.map((pso, i) => 
      i === idx ? { ...pso, statement: val } : pso
    );
    setPsoData(newData);
  };

  const addCompetencyToPSO = (psoIdx) => {
    const newData = psoData.map((pso, i) => 
      i === psoIdx ? { 
        ...pso, 
        competencies: [...pso.competencies, { statement: "", pis: [{ value: `${poData.length + psoIdx + 1}.${pso.competencies.length + 1}.1`, description: "" }] }] 
      } : pso
    );
    setPsoData(newData);
  };

  const removeCompetencyFromPSO = (psoIdx, compIdx) => {
    const newData = psoData.map((pso, i) => 
      i === psoIdx ? { 
        ...pso, 
        competencies: pso.competencies.filter((_, j) => j !== compIdx) 
      } : pso
    );
    setPsoData(newData);
  };

  const updateCompetencyPSO = (psoIdx, compIdx, val) => {
    const newData = psoData.map((pso, i) => 
      i === psoIdx ? { 
        ...pso, 
        competencies: pso.competencies.map((comp, j) => 
          j === compIdx ? { ...comp, statement: val } : comp
        ) 
      } : pso
    );
    setPsoData(newData);
  };

  const addPIToPSO = (psoIdx, compIdx) => {
    const newData = psoData.map((pso, i) => 
      i === psoIdx ? { 
        ...pso, 
        competencies: pso.competencies.map((comp, j) => 
          j === compIdx ? { ...comp, pis: [...comp.pis, { value: `${poData.length + psoIdx + 1}.${compIdx + 1}.${comp.pis.length + 1}`, description: "" }] } : comp
        ) 
      } : pso
    );
    setPsoData(newData);
  };

  const removePIFromPSO = (psoIdx, compIdx, piIdx) => {
    const newData = psoData.map((pso, i) => 
      i === psoIdx ? { 
        ...pso, 
        competencies: pso.competencies.map((comp, j) => 
          j === compIdx ? { ...comp, pis: comp.pis.filter((_, k) => k !== piIdx) } : comp
        ) 
      } : pso
    );
    setPsoData(newData);
  };

  const updatePIPSO = (psoIdx, compIdx, piIdx, val) => {
    const newData = psoData.map((pso, i) => 
      i === psoIdx ? { 
        ...pso, 
        competencies: pso.competencies.map((comp, j) => 
          j === compIdx ? { 
            ...comp, 
            pis: comp.pis.map((pi, k) => k === piIdx ? { ...(typeof pi === 'object' ? pi : {}), value: `${poData.length + psoIdx + 1}.${compIdx + 1}.${piIdx + 1}`, description: val } : pi) 
          } : comp
        ) 
      } : pso
    );
    setPsoData(newData);
  };

  // Survey Handlers
  const addSurvey = () => {
    setSurveys([...surveys, { name: "", weight: "0" }]);
  };

  const removeSurvey = (idx) => {
    setSurveys(surveys.filter((_, i) => i !== idx));
  };

  const updateSurvey = (idx, field, value) => {
    const newData = surveys.map((s, i) => i === idx ? { ...s, [field]: value } : s);
    setSurveys(newData);
  };

  return (
    <Layout title="PO's Configuration">
      <div className="max-w-7xl mx-auto p-6 space-y-8 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-50 flex items-center justify-center rounded-2xl">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 border-4 border-[#120c7a] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-bold text-[#120c7a]">Loading Configuration...</p>
            </div>
          </div>
        )}
        
        {/* Framework Selection */}
        <div className="bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-2">
            <h4 className="text-white font-bold text-sm">OBE Framework Selection</h4>
          </div>
          <div className="p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Programme Name *</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                    value={programme}
                    onChange={(e) => {
                      setProgramme(e.target.value);
                      setDepartment("");
                      setRegulation("");
                    }}
                  >
                    <option value="">Choose Programme</option>
                    {Object.keys(durations).map(progKey => (
                      <option key={progKey} value={progKey}>{formatProgDisplay(progKey)}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Regulation *</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                    value={regulation}
                    onChange={(e) => setRegulation(e.target.value)}
                  >
                    <option value="">Choose Regulation</option>
                    {regulations.map((reg) => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Department *</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium disabled:opacity-50"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    disabled={!programme}
                  >
                    <option value="">Choose Department</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Attainment & Survey Configuration */}
        <div className="bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-2">
            <h4 className="text-white font-bold text-sm">Attainment & Survey Configuration</h4>
          </div>
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Direct Attainment Weight (%) *</label>
                <div className="relative">
                  <input
                    type="number"
                    className="w-full bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                    value={directWeight}
                    onChange={(e) => setDirectWeight(e.target.value)}
                    placeholder="e.g., 80"
                  />
                </div>
                <p className="text-xs text-zinc-500">Percentage for calculating Direct PO attainment</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Indirect Attainment Weight (%) *</label>
                <div className="relative">
                  <input
                    type="number"
                    className="w-full bg-[#f0f0fa] border border-zinc-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                    value={indirectWeight}
                    onChange={(e) => setIndirectWeight(e.target.value)}
                    placeholder="e.g., 20"
                  />
                </div>
                <p className="text-xs text-zinc-500">Percentage for calculating Indirect PO attainment</p>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-md font-bold text-zinc-800">Indirect Surveys Configuration</h3>
                <button
                  onClick={addSurvey}
                  className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-1.5 rounded text-sm font-semibold transition-colors"
                >
                  + Add Survey
                </button>
              </div>
              <div className="space-y-4">
                {surveys.map((survey, sIdx) => (
                  <div key={sIdx} className="flex gap-4 items-end">
                    <div className="flex-1 space-y-1">
                      <label className="text-sm font-medium text-zinc-700">Survey Name</label>
                      <input
                        type="text"
                        className="w-full bg-white border border-zinc-300 rounded px-3 py-2 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-blue-100 transition-all"
                        placeholder="e.g., Alumni Survey"
                        value={survey.name}
                        onChange={(e) => updateSurvey(sIdx, 'name', e.target.value)}
                      />
                    </div>
                    <div className="w-48 space-y-1">
                      <label className="text-sm font-medium text-zinc-700">Weight (%)</label>
                      <input
                        type="number"
                        className="w-full bg-white border border-zinc-300 rounded px-3 py-2 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-blue-100 transition-all"
                        placeholder="e.g., 50"
                        value={survey.weight}
                        onChange={(e) => updateSurvey(sIdx, 'weight', e.target.value)}
                      />
                    </div>
                    {surveys.length > 1 && (
                      <button
                        onClick={() => removeSurvey(sIdx)}
                        className="mb-1 text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 transition-colors"
                        title="Remove Survey"
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-2">Note: The sum of survey weights must equal 100%.</p>
            </div>
          </div>
        </div>

        {/* PO / PSO Configuration */}
        <div className="bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-2">
            <h4 className="text-white font-bold text-sm">PO / PSO Configuration</h4>
          </div>
          <div className="p-6 space-y-8">
            {/* PO Statements */}
            <div className="space-y-4">
              <h5 className="text-md font-bold text-zinc-800">PO Statements</h5>
              
              <div className="space-y-6">
                {poData.map((po, poIdx) => (
                  <div key={poIdx} className="p-4 border border-zinc-200 rounded space-y-4">
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-bold text-zinc-700">PO Statement - {poIdx + 1}</label>
                        <button
                          onClick={() => handleGenerateCompsAndPIsWithAI('PO', poIdx)}
                          disabled={isGeneratingAI.active}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {isGeneratingAI.active && isGeneratingAI.section === 'PO' && isGeneratingAI.idx === poIdx ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Generating...
                            </>
                          ) : (
                            "Generate with AI"
                          )}
                        </button>
                      </div>
                      <div className="relative">
                        <textarea
                          className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-blue-100 transition-all pr-10"
                          rows="2"
                          placeholder="Enter PO Statement"
                          value={po.statement}
                          onChange={(e) => updatePOStatement(poIdx, e.target.value)}
                        />
                        <button
                          onClick={() => removePO(poIdx)}
                          className="absolute right-2 bottom-2 text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>

                    {/* Competencies */}
                    <div className="space-y-4 ml-4">
                      {po.competencies.map((comp, compIdx) => (
                        <div key={compIdx} className="p-4 bg-zinc-50 border border-zinc-200 rounded space-y-3">
                          <div className="space-y-1">
                            <label className="text-sm font-bold text-zinc-700">Competency {poIdx + 1}.{compIdx + 1}</label>
                            <div className="relative">
                              <textarea
                                className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-blue-100 transition-all pr-10"
                                rows="2"
                                placeholder="Enter Competency"
                                value={comp.statement}
                                onChange={(e) => updateCompetencyPO(poIdx, compIdx, e.target.value)}
                              />
                              <button
                                onClick={() => removeCompetencyFromPO(poIdx, compIdx)}
                                className="absolute right-2 bottom-2 text-red-500 hover:text-red-700 p-1"
                              >
                                <Trash2 size={20} />
                              </button>
                            </div>
                          </div>

                          {/* PIs */}
                          <div className="space-y-3 ml-4">
                            <div className="flex gap-2 mb-2">
                              <button
                                onClick={() => addPIToPO(poIdx, compIdx)}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold transition-all"
                              >
                                Add PI
                              </button>
                            </div>
                            {comp.pis.map((pi, piIdx) => (
                              <div key={piIdx} className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg space-y-1">
                                <label className="text-sm font-bold text-blue-900">PI {poIdx + 1}.{compIdx + 1}.{piIdx + 1}</label>
                                <div className="relative">
                                  <textarea
                                    className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-blue-100 transition-all pr-10"
                                    rows="2"
                                    placeholder="Enter PI Description"
                                    value={typeof pi === 'object' ? pi.description : pi}
                                    onChange={(e) => updatePIPO(poIdx, compIdx, piIdx, e.target.value)}
                                  />
                                  <button
                                    onClick={() => removePIFromPO(poIdx, compIdx, piIdx)}
                                    className="absolute right-2 bottom-2 text-red-500 hover:text-red-700 p-1"
                                  >
                                    <Trash2 size={20} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => addCompetencyToPO(poIdx)}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold transition-all"
                      >
                        Add Competency
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={addPO}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold transition-all"
                >
                  Add PO
                </button>
              </div>
            </div>

            <hr className="border-zinc-200" />

            {/* PSO Statements */}
            <div className="space-y-4">
              <h5 className="text-md font-bold text-zinc-800">PSO Statements</h5>
              
              <div className="space-y-6">
                {psoData.map((pso, psoIdx) => (
                  <div key={psoIdx} className="p-4 border border-zinc-200 rounded space-y-4">
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-sm font-bold text-zinc-700">PSO Statement - {poData.length + psoIdx + 1}</label>
                        <button
                          onClick={() => handleGenerateCompsAndPIsWithAI('PSO', psoIdx)}
                          disabled={isGeneratingAI.active}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {isGeneratingAI.active && isGeneratingAI.section === 'PSO' && isGeneratingAI.idx === psoIdx ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Generating...
                            </>
                          ) : (
                            "Generate with AI"
                          )}
                        </button>
                      </div>
                      <div className="relative">
                        <textarea
                          className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-blue-100 transition-all pr-10"
                          rows="2"
                          placeholder="Enter PSO Statement"
                          value={pso.statement}
                          onChange={(e) => updatePSOStatement(psoIdx, e.target.value)}
                        />
                        <button
                          onClick={() => removePSO(psoIdx)}
                          className="absolute right-2 bottom-2 text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>

                    {/* Competencies */}
                    <div className="space-y-4 ml-4">
                      {pso.competencies.map((comp, compIdx) => (
                        <div key={compIdx} className="p-4 bg-zinc-50 border border-zinc-200 rounded space-y-3">
                          <div className="space-y-1">
                            <label className="text-sm font-bold text-zinc-700">Competency {poData.length + psoIdx + 1}.{compIdx + 1}</label>
                            <div className="relative">
                              <textarea
                                className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-blue-100 transition-all pr-10"
                                rows="2"
                                placeholder="Enter Competency"
                                value={comp.statement}
                                onChange={(e) => updateCompetencyPSO(psoIdx, compIdx, e.target.value)}
                              />
                              <button
                                onClick={() => removeCompetencyFromPSO(psoIdx, compIdx)}
                                className="absolute right-2 bottom-2 text-red-500 hover:text-red-700 p-1"
                              >
                                <Trash2 size={20} />
                              </button>
                            </div>
                          </div>

                          {/* PIs */}
                          <div className="space-y-3 ml-4">
                            <div className="flex gap-2 mb-2">
                              <button
                                onClick={() => addPIToPSO(psoIdx, compIdx)}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold transition-all"
                              >
                                Add PI
                              </button>
                            </div>
                            {comp.pis.map((pi, piIdx) => (
                              <div key={piIdx} className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg space-y-1">
                                <label className="text-sm font-bold text-blue-900">PI {poData.length + psoIdx + 1}.{compIdx + 1}.{piIdx + 1}</label>
                                <div className="relative">
                                  <textarea
                                    className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-blue-100 transition-all pr-10"
                                    rows="2"
                                    placeholder="Enter PI Description"
                                    value={typeof pi === 'object' ? pi.description : pi}
                                    onChange={(e) => updatePIPSO(psoIdx, compIdx, piIdx, e.target.value)}
                                  />
                                  <button
                                    onClick={() => removePIFromPSO(psoIdx, compIdx, piIdx)}
                                    className="absolute right-2 bottom-2 text-red-500 hover:text-red-700 p-1"
                                  >
                                    <Trash2 size={20} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => addCompetencyToPSO(psoIdx)}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold transition-all"
                      >
                        Add Competency
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={addPSO}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold transition-all"
                >
                  Add PSO
                </button>
              </div>
            </div>

            <div className="flex gap-4 pt-6">
              <button
                onClick={handleSave}
                className="px-8 py-2.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Save size={18} /> Save
              </button>
              <button
                onClick={() => {
                  showConfirm(
                    "Reset Data",
                    "Are you sure you want to reset all data?",
                    () => {
                      setPoData([{ statement: "", competencies: [{ statement: "", pis: [""] }] }]);
                      setPsoData([{ statement: "", competencies: [{ statement: "", pis: [""] }] }]);
                    }
                  );
                }}
                className="px-8 py-2.5 bg-zinc-500 hover:bg-zinc-600 text-white font-bold rounded-lg shadow-md transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

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

export default POConfiguration;
