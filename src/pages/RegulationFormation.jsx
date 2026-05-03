import { useState, useEffect, useMemo } from "react";
import Layout from "../components/Layout";
import { rtdb } from "../firebase";
import { ref as dbRef, set, get, onValue, update } from "firebase/database";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { formatProgDisplay, formatProgrammeKey } from "../lib/utils";
import { Trash2, CheckCircle2, ChevronDown, Check, Save, Plus, Settings } from "lucide-react";
import CIAConfigPage from "../components/CIAConfigPage";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

export default function RegulationFormation() {
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { regulations, addRegulation } = useRegulations();

  const [syllabusProgramme, setSyllabusProgramme] = useState("");
  const [regulation, setRegulation] = useState("");
  const [newRegulation, setNewRegulation] = useState("");
  const [configType, setConfigType] = useState("");

  const [allCiaConfigs, setAllCiaConfigs] = useState({});
  const [updatingSet, setUpdatingSet] = useState(null);

  const [weightageConfigs, setWeightageConfigs] = useState({});

  useEffect(() => {
    const wRef = dbRef(rtdb, 'course_type_weightage');
    const unsubscribe = onValue(wRef, (snapshot) => {
      setWeightageConfigs(snapshot.val() || {});
    });
    return () => unsubscribe();
  }, []);

  // Fetch CIA Configs to manage exam sets
  useEffect(() => {
    const ciaRef = dbRef(rtdb, 'cia_configs');
    const unsubscribe = onValue(ciaRef, (snapshot) => {
      if (snapshot.exists()) {
        setAllCiaConfigs(snapshot.val());
      } else {
        setAllCiaConfigs({});
      }
    });
    return () => unsubscribe();
  }, []);

  const handleUpdateNumSets = async (configId, num) => {
    setUpdatingSet(configId);
    try {
      await update(dbRef(rtdb, `cia_configs/${configId}`), { numSets: parseInt(num) || 1 });
      setSuccessMessage("Exam set count updated successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) { console.error(err); }
    setUpdatingSet(null);
  };

  const handleWeightageChange = (regKey, type, examId, value) => {
    setWeightageConfigs(prev => ({
      ...prev,
      [regKey]: {
        ...(prev[regKey] || {}),
        [type]: {
          ...(prev[regKey]?.[type] || {}),
          [examId]: value === "" ? "" : parseInt(value)
        }
      }
    }));
  };

  const handleSaveWeightage = async (regKey, type) => {
    const data = weightageConfigs[regKey]?.[type] || {};
    const total = Object.values(data).reduce((sum, v) => sum + (parseInt(v) || 0), 0);
    
    if (total !== 100) {
      setMessage({ type: "error", text: `Total weightage for "${type}" must be exactly 100%. Current: ${total}%` });
      return;
    }

    try {
      await set(dbRef(rtdb, `course_type_weightage/${regKey}/${type}`), data);
      setSuccessMessage("Exam set count updated successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) { console.error(err); }
    setUpdatingSet(null);
  };

  const syllabusDuration = useMemo(() => {
    if (!syllabusProgramme) return 4;
    const progKey = formatProgrammeKey(syllabusProgramme);
    return durations[progKey] || 4;
  }, [syllabusProgramme, durations]);

  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });

  const [gradeReg, setGradeReg] = useState("");
  const [newGrade, setNewGrade] = useState({ grade: "", gradePoint: "", mark: "" });
  const [gradeConfigs, setGradeConfigs] = useState({});

  const [newCourseType, setNewCourseType] = useState("");
  const [courseTypeConfigs, setCourseTypeConfigs] = useState({});

  useEffect(() => {
    const ctRef = dbRef(rtdb, 'course_type_configs');
    const unsubscribe = onValue(ctRef, (snapshot) => {
      if (snapshot.exists()) {
        setCourseTypeConfigs(snapshot.val());
      } else {
        setCourseTypeConfigs({});
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAddCourseType = async () => {
    if (!regulation || !newCourseType.trim()) return;
    const regKey = sanitizeKey(regulation);
    const currentTypes = courseTypeConfigs[regKey] || [];
    
    if (currentTypes.includes(newCourseType.trim())) {
      setMessage({ type: "error", text: "Course type already exists for this regulation." });
      return;
    }
    
    const updatedTypes = [...currentTypes, newCourseType.trim()];
    await set(dbRef(rtdb, `course_type_configs/${regKey}`), updatedTypes);
    setNewCourseType("");
    setSuccessMessage("Course type added successfully!");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleRemoveCourseType = async (regKey, index) => {
    const typeToRemove = courseTypeConfigs[regKey][index];
    const currentTypes = [...(courseTypeConfigs[regKey] || [])];
    currentTypes.splice(index, 1);
    await set(dbRef(rtdb, `course_type_configs/${regKey}`), currentTypes.length > 0 ? currentTypes : null);
    
    if (typeToRemove) {
      await set(dbRef(rtdb, `course_type_weightage/${regKey}/${typeToRemove}`), null);
    }
    
    setSuccessMessage("Course type removed successfully!");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  useEffect(() => {
    const gradeRef = dbRef(rtdb, 'grade_configs');
    const unsubscribeData = onValue(gradeRef, (snapshot) => {
      if (snapshot.exists()) {
        setGradeConfigs(snapshot.val());
      } else {
        setGradeConfigs({});
      }
    });
    return () => unsubscribeData();
  }, []);

  const handleAddGrade = async () => {
    if (!gradeReg || !newGrade.grade.trim() || !newGrade.gradePoint.trim()) return;
    const currentGrades = gradeConfigs[sanitizeKey(gradeReg)] || [];
    const gradePoint = Number(newGrade.gradePoint);
    const mark = newGrade.mark !== "" ? Number(newGrade.mark) : (gradePoint * 10);
    
    const updatedGrades = [...currentGrades, { 
      grade: newGrade.grade.trim(), 
      gradePoint: gradePoint,
      mark: mark 
    }];
    await set(dbRef(rtdb, `grade_configs/${sanitizeKey(gradeReg)}`), updatedGrades);
    setNewGrade({ grade: "", gradePoint: "", mark: "" });
    setSuccessMessage("Grade added successfully!");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleRemoveGrade = async (reg, index) => {
    const currentGrades = [...(gradeConfigs[sanitizeKey(reg)] || [])];
    currentGrades.splice(index, 1);
    await set(dbRef(rtdb, `grade_configs/${sanitizeKey(reg)}`), currentGrades.length > 0 ? currentGrades : null);
    setSuccessMessage("Grade removed successfully!");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleAddRegulation = async () => {
    if (!newRegulation.trim()) return;
    await addRegulation(newRegulation.trim());
    setSuccessMessage("Regulation added successfully!");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
    setNewRegulation("");
  };

  return (
    <Layout title="Regulation Formation">
      <style>{`
        input[type='number']::-webkit-outer-spin-button,
        input[type='number']::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type='number'] {
          -moz-appearance: textfield;
          appearance: textfield;
        }
      `}</style>
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* Add Regulation */}
        <div className="bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-2">
            <h2 className="text-white font-bold text-lg">Add New Regulation</h2>
          </div>
          <div className="p-6">
            
            {showSuccess && !syllabusProgramme && (
              <div className="mb-4 p-4 rounded-xl flex items-center gap-2 font-medium border bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 size={18} />
                {successMessage}
              </div>
            )}

            <div className="flex gap-2">
              <input 
                type="text" 
                className="flex-1 px-4 py-2 text-sm border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] outline-none" 
                placeholder="e.g., R2021, R2025" 
                value={newRegulation}
                onChange={(e) => setNewRegulation(e.target.value)}
              />
              <button 
                className="px-6 py-2 bg-[#120c7a] text-white text-sm font-bold rounded-lg hover:bg-[#0e095e] transition-colors flex items-center gap-2"
                onClick={handleAddRegulation}
              >
                <Plus size={18} /> Add
              </button>
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Existing Regulations:</p>
              <div className="flex flex-wrap gap-2">
                {regulations.map(reg => (
                  <span key={reg} className="px-3 py-1 bg-zinc-100 text-zinc-700 border border-zinc-200 rounded font-medium text-xs">{reg}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-2 flex justify-between items-center">
            <h2 className="text-white font-bold text-lg">
              {(configType && syllabusProgramme && regulation) ? (
                <>
                  {configType === "grade" && "Grade to Mark Configuration"}
                  {configType === "cia" && "CIA Configuration"}
                  {configType === "course_type" && "Course Type Configuration"}
                  {configType === "exam_sets" && "Exam Set Configuration"}
                </>
              ) : "Regulation Configuration"}
            </h2>
          </div>

          <div className="p-8 space-y-8">
            {message.text && (
              <div className={`p-4 rounded-xl flex items-center justify-between font-medium border ${message.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                <span className="flex items-center gap-2">
                  {message.type === 'error' ? '✗' : '✓'} {message.text}
                </span>
                <button onClick={() => setMessage({ type: "", text: "" })} className="text-lg font-bold leading-none hover:opacity-75">&times;</button>
              </div>
            )}

            {showSuccess && (
              <div className="p-4 rounded-xl flex items-center gap-2 font-medium border bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 size={18} />
                {successMessage}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-zinc-50 p-6 rounded-xl border border-zinc-200 mt-2">
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Configuration Type</label>
                <div className="relative">
                  <select 
                    className="w-full appearance-none bg-white border border-zinc-300 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-[#120c7a] transition-all font-medium text-sm"
                    value={configType}
                    onChange={(e) => setConfigType(e.target.value)}
                  ><option value="">--select--</option>
                    <option value="grade">Grade Configuration</option>
                    <option value="cia">CIA Configuration</option>
                    <option value="course_type">Course Type</option>
                    <option value="exam_sets">Exam Set Configuration</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Programme Name</label>
                <div className="relative">
                  <select 
                    className="w-full appearance-none bg-white border border-zinc-300 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-[#120c7a] transition-all font-medium text-sm"
                    value={syllabusProgramme}
                    onChange={(e) => {
                      setSyllabusProgramme(e.target.value);
                    }}
                  >
                    <option value="">Select Programme</option>
                    {Object.keys(PROGRAMME_DEPARTMENTS).map(prog => (
                      <option key={prog} value={prog}>{formatProgDisplay(prog)}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Regulation</label>
                <div className="relative">
                  <select 
                    className="w-full appearance-none bg-white border border-zinc-300 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-[#120c7a] transition-all font-medium text-sm"
                    value={regulation}
                    onChange={(e) => setRegulation(e.target.value)}
                  >
                    <option value="">Select Regulation</option>
                    {regulations.map(reg => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>
            </div>

            {configType === "cia" && syllabusProgramme && regulation && (
              <div className="mt-8 border-t border-zinc-200 pt-8">
                <CIAConfigPage 
                  program={syllabusProgramme}
                  department={""} // Department dropdown removed, passing empty string
                  regulation={regulation}
                />
              </div>
            )}

            {configType === "course_type" && syllabusProgramme && regulation && (
              <div className="mt-8 border-t border-zinc-200 pt-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-bold text-lg flex items-center gap-2 text-zinc-800">
                    <Settings className="text-[#120c7a]" size={20} />
                    Course Type Configuration
                  </h2>
                </div>
                <p className="text-sm text-zinc-500 mb-6 italic">* Define different categories of courses available under each regulation (e.g. Theory, Practical, Integrated, Project, Seminar).</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-zinc-50 p-5 rounded-xl border border-zinc-200">
                    <h3 className="font-bold text-zinc-800 text-sm mb-4 uppercase tracking-wider">Add Course Type</h3>
                    <div className="flex flex-col gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase">Selected Regulation</label>
                        <div className="w-full bg-zinc-100 border border-zinc-300 rounded-lg px-4 py-2.5 font-medium text-zinc-600 text-sm">
                          {regulation || "No Regulation Selected"}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase">Course Type Name</label>
                        <input 
                          type="text" 
                          className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] outline-none"
                          placeholder="e.g. Theory with Practical" 
                          value={newCourseType}
                          onChange={(e) => setNewCourseType(e.target.value)}
                        />
                      </div>
                      
                      <button 
                        className="w-full px-4 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-lg hover:bg-[#0e095e] transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                        onClick={handleAddCourseType}
                        disabled={!regulation || !newCourseType.trim()}
                      >
                        <Plus size={18} /> Add Course Type
                      </button>
                    </div>
                  </div>

                  <div className="bg-zinc-50 p-5 rounded-xl border border-zinc-200">
                    <h3 className="font-bold text-zinc-800 text-sm mb-4 uppercase tracking-wider">Configured Types</h3>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                      {Object.entries(courseTypeConfigs).length > 0 ? (
                        Object.entries(courseTypeConfigs).map(([regKey, types]) => (
                          <div key={regKey} className="bg-white p-4 rounded-lg border border-zinc-200 shadow-sm">
                            <p className="text-xs font-black text-[#120c7a] uppercase mb-3 border-b border-zinc-100 pb-2">{regKey}</p>
                            <div className="space-y-4">
                              {Array.isArray(types) && types.map((type, idx) => (
                                <div key={idx} className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm font-black text-zinc-700">{type}</span>
                                    <button
                                      className="text-zinc-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                                      onClick={() => handleRemoveCourseType(regKey, idx)}
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                  
                                  <div className="bg-white p-4 rounded-xl border border-zinc-100 shadow-inner">
                                    <div className="flex justify-between items-center mb-3">
                                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Internal Weightage Split (Total 100%)</p>
                                      <button 
                                        onClick={() => handleSaveWeightage(regKey, type)}
                                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                      >
                                        <Save size={12} /> Save Split
                                      </button>
                                    </div>
                                    <div className="space-y-2">
                                      {Object.entries(allCiaConfigs)
                                        .filter(([id, config]) => sanitizeKey(config.regulation) === regKey && config.courseTypes?.includes(type))
                                        .map(([id, config]) => (
                                          <div key={id} className="flex items-center justify-between gap-4 py-1 border-b border-zinc-50 last:border-0">
                                            <span className="text-xs font-bold text-zinc-600">{config.examName}</span>
                                            <div className="flex items-center gap-2">
                                              <input 
                                                type="number" 
                                                className="w-16 px-2 py-1 text-xs border border-zinc-200 rounded text-center font-black text-[#120c7a] outline-none focus:ring-2 focus:ring-blue-100"
                                                value={weightageConfigs[regKey]?.[type]?.[id] ?? ""}
                                                onChange={(e) => handleWeightageChange(regKey, type, id, e.target.value)}
                                                placeholder="0"
                                              />
                                              <span className="text-[10px] font-bold text-zinc-400">%</span>
                                            </div>
                                          </div>
                                        ))}
                                      {Object.entries(allCiaConfigs).filter(([id, config]) => sanitizeKey(config.regulation) === regKey && config.courseTypes?.includes(type)).length === 0 && (
                                        <p className="text-[10px] text-amber-500 italic">No exams configured for this course type yet.</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                         <p className="text-sm italic text-zinc-400 text-center py-8">No course types defined yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {configType === "grade" && syllabusProgramme && regulation && (
              <div className="mt-8 border-t border-zinc-200 pt-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-bold text-lg flex items-center gap-2 text-zinc-800">
                    <Settings className="text-[#120c7a]" size={20} />
                    Grade to Mark Configuration
                  </h2>
                </div>
                <p className="text-sm text-zinc-500 mb-6 italic">* Define grades and their corresponding marks for each regulation. These will be used in Mark Entry for University Exams.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-zinc-50 p-5 rounded-xl border border-zinc-200">
                <h3 className="font-bold text-zinc-800 text-sm mb-4 uppercase tracking-wider">Add Grade Definition</h3>
                <div className="flex flex-col gap-4">
                  <div className="relative">
                    <select 
                      className="w-full appearance-none bg-white border border-zinc-300 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-[#120c7a] transition-all font-medium text-sm"
                      value={gradeReg}
                      onChange={(e) => setGradeReg(e.target.value)}
                    >
                      <option value="">Select Regulation</option>
                      {regulations.map(reg => (
                        <option key={reg} value={reg}>{reg}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] outline-none"
                      placeholder="Grade (e.g. O)" 
                      value={newGrade.grade}
                      onChange={(e) => setNewGrade({ ...newGrade, grade: e.target.value })}
                    />
                    <input 
                      type="number" 
                      className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a] outline-none"
                      placeholder="GP (e.g. 10)" 
                      value={newGrade.gradePoint}
                      onChange={(e) => {
                        const gp = e.target.value;
                        setNewGrade({ 
                          ...newGrade, 
                          gradePoint: gp, 
                          mark: gp !== "" ? Number(gp) * 10 : "" 
                        });
                      }}
                    />
                    <input 
                      type="number" 
                      className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-zinc-100 text-zinc-500 cursor-not-allowed outline-none"
                      placeholder="Mark" 
                      value={newGrade.mark}
                      readOnly
                    />
                  </div>
                  
                  <button 
                    className="w-full px-4 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-lg hover:bg-[#0e095e] transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                    onClick={handleAddGrade}
                    disabled={!gradeReg || !newGrade.grade || !newGrade.gradePoint}
                  >
                    <Plus size={18} /> Add Grade
                  </button>
                </div>
              </div>

              <div className="bg-zinc-50 p-5 rounded-xl border border-zinc-200">
                <h3 className="font-bold text-zinc-800 text-sm mb-4 uppercase tracking-wider">Existing Definitions</h3>
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                  {Object.entries(gradeConfigs).length > 0 ? (
                    Object.entries(gradeConfigs).map(([regKey, grades]) => (
                      <div key={regKey} className="bg-white p-4 rounded-lg border border-zinc-200 shadow-sm">
                        <p className="text-xs font-black text-[#120c7a] uppercase mb-3 border-b border-zinc-100 pb-2">{regKey}</p>
                        <div className="flex flex-wrap gap-2">
                          {Array.isArray(grades) && grades.map((g, idx) => (
                            <div key={idx} className="px-2.5 py-1.5 bg-zinc-50 text-zinc-700 border border-zinc-200 rounded-md text-xs font-bold flex items-center gap-2">
                              <span>{g.grade}: <span className="text-blue-600">{g.gradePoint} GP</span> | <span className="text-emerald-600">{g.mark} M</span></span>
                              <button
                                className="text-zinc-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                                onClick={() => handleRemoveGrade(regKey, idx)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                     <p className="text-sm italic text-zinc-400 text-center py-8">No grades defined yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}

          {configType === "exam_sets" && syllabusProgramme && regulation && (
            <div className="mt-8 border-t border-zinc-200 pt-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-bold text-lg flex items-center gap-2 text-zinc-800">
                  <Settings className="text-[#120c7a]" size={20} />
                  Exam Version (Sets) Configuration
                </h2>
              </div>
              <p className="text-sm text-zinc-500 mb-6 italic">* Configure how many sets of question papers are required for each exam under the selected regulation.</p>
              
              <div className="overflow-x-auto rounded-xl border border-zinc-200">
                <table className="w-full text-sm text-left">
                  <thead className="bg-zinc-50">
                    <tr className="text-zinc-600 border-b border-zinc-200">
                      <th className="px-6 py-4 font-bold uppercase tracking-wider text-[11px]">Exam Name</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider text-[11px]">Course Types</th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider text-[11px] text-center">Required QP Sets</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {Object.entries(allCiaConfigs)
                      .filter(([id, config]) => 
                        formatProgrammeKey(config.program) === formatProgrammeKey(syllabusProgramme) &&
                        sanitizeKey(config.regulation) === sanitizeKey(regulation)
                      ).length > 0 ? (
                        Object.entries(allCiaConfigs)
                          .filter(([id, config]) => 
                            formatProgrammeKey(config.program) === formatProgrammeKey(syllabusProgramme) &&
                            sanitizeKey(config.regulation) === sanitizeKey(regulation)
                          )
                          .map(([id, config]) => (
                            <tr key={id} className="hover:bg-zinc-50 transition-colors">
                              <td className="px-6 py-4 font-bold text-zinc-800">{config.examName}</td>
                              <td className="px-6 py-4 text-zinc-500 font-medium">
                                {config.courseTypes && Array.isArray(config.courseTypes) 
                                  ? config.courseTypes.join(", ") 
                                  : "N/A"}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-3">
                                  <input 
                                    type="number"
                                    min="1"
                                    max="10"
                                    className="w-20 px-3 py-1.5 border border-zinc-300 rounded-lg text-center font-black text-[#120c7a] focus:ring-2 focus:ring-blue-100 outline-none"
                                    value={config.numSets || 1}
                                    onChange={(e) => handleUpdateNumSets(id, e.target.value)}
                                    disabled={updatingSet === id}
                                  />
                                  {updatingSet === id && <div className="w-4 h-4 border-2 border-[#120c7a] border-t-transparent rounded-full animate-spin" />}
                                </div>
                              </td>
                            </tr>
                          ))
                      ) : (
                        <tr><td colSpan="3" className="px-6 py-12 text-center text-zinc-400 italic font-medium">No exams configured for this program and regulation.</td></tr>
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </div>
        </div>

      </div>
    </Layout>
  );
}
