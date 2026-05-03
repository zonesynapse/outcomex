import { useState, useEffect, useMemo } from "react";
import Layout from "../components/Layout";
import { rtdb } from "../firebase";
import { ref as dbRef, set, get, onValue } from "firebase/database";
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
  const [syllabusDept, setSyllabusDept] = useState("");
  const [regulation, setRegulation] = useState("");
  const [newRegulation, setNewRegulation] = useState("");
  const [configType, setConfigType] = useState("curriculum");

  const syllabusDuration = useMemo(() => {
    if (!syllabusProgramme) return 4;
    const progKey = formatProgrammeKey(syllabusProgramme);
    return durations[progKey] || 4;
  }, [syllabusProgramme, durations]);

  const [semestersData, setSemestersData] = useState({});
  const [availableCourses, setAvailableCourses] = useState([]);
  const [fetchingSyllabus, setFetchingSyllabus] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });

  const [saving, setSaving] = useState(false);

  const [gradeReg, setGradeReg] = useState("");
  const [newGrade, setNewGrade] = useState({ grade: "", gradePoint: "", mark: "" });
  const [gradeConfigs, setGradeConfigs] = useState({});

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

  // Fetch courses from Course Bank
  useEffect(() => {
    if (!syllabusProgramme || !syllabusDept || !regulation) {
      setAvailableCourses([]);
      return;
    }

    const progKey = formatProgrammeKey(syllabusProgramme);
    const regKey = sanitizeKey(regulation);
    
    const deptRefs = [
      { dept: syllabusDept, ref: dbRef(rtdb, `courses/${progKey}/${syllabusDept}/${regKey}`) },
      { dept: "Overall", ref: dbRef(rtdb, `courses/${progKey}/Overall/${regKey}`) }
    ];

    const unsubs = [];
    const combined = new Map();

    const rebuild = () => {
      const list = Array.from(combined.values()).sort((a, b) => {
        const ac = (a.code || a.key || "").toUpperCase();
        const bc = (b.code || b.key || "").toUpperCase();
        return ac.localeCompare(bc);
      });
      setAvailableCourses(list);
    };

    deptRefs.forEach(({ dept, ref: refPath }) => {
      const unsub = onValue(refPath, (snap) => {
        for (const [k, v] of combined.entries()) {
           if (v._sourceDept === dept) combined.delete(k);
        }
        if (snap.exists()) {
          const data = snap.val();
          Object.entries(data).forEach(([key, course]) => {
            combined.set(`${dept}:${key}`, {
              key,
              code: course?.code || key,
              name: course?.name || "",
              credits: course?.credits || 0,
              type: course?.type,
              _sourceDept: dept,
            });
          });
        }
        rebuild();
      });
      unsubs.push(unsub);
    });

    return () => unsubs.forEach(u => u && u());
  }, [syllabusProgramme, syllabusDept, regulation]);

  // Fetch Existing Regulation / Syllabus structure
  useEffect(() => {
    const fetchExistingSyllabus = async () => {
      if (syllabusProgramme && syllabusDept && regulation) {
        setFetchingSyllabus(true);
        const progKey = formatProgrammeKey(syllabusProgramme);
        const syllabusKey = `${progKey}_${sanitizeKey(syllabusDept)}_${sanitizeKey(regulation)}`;
        const syllabusRef = dbRef(rtdb, `syllabus_data/${syllabusKey}`);
        
        try {
          const snapshot = await get(syllabusRef);
          if (snapshot.exists()) {
            const data = snapshot.val();
            setIsUpdating(true);
            if (data.semesters) {
              const totalSems = syllabusDuration * 2;
              const fullSemesters = Object.fromEntries(
                Array.from({ length: totalSems }, (_, i) => {
                  const subjects = (data.semesters[i + 1] || [])
                    .filter(sub => sub != null)
                    .map(sub => ({
                      ...sub,
                      saved: true,
                      isActive: sub.isActive !== undefined ? sub.isActive : true,
                      isElective: sub.isElective !== undefined ? sub.isElective : false
                    }));
                  return [i + 1, subjects];
                })
              );
              setSemestersData(fullSemesters);
            }
          } else {
            setIsUpdating(false);
            const totalSems = syllabusDuration * 2;
            setSemestersData(Object.fromEntries(Array.from({ length: totalSems }, (_, i) => [i + 1, []])));
          }
        } catch (error) {
          console.error("Error fetching existing syllabus:", error);
        } finally {
          setFetchingSyllabus(false);
        }
      }
    };

    fetchExistingSyllabus();
  }, [syllabusProgramme, syllabusDept, regulation, syllabusDuration]);

  const updateSubjectFromBank = (sem, index, selectedCode) => {
    if (!selectedCode) {
      setSemestersData(prev => {
        const updatedSem = [...prev[sem]];
        updatedSem[index] = { ...updatedSem[index], code: "", name: "", credits: "" };
        return { ...prev, [sem]: updatedSem };
      });
      return;
    }

    const match = availableCourses.find(c => c.code === selectedCode);
    if (match) {
      setSemestersData(prev => {
        const updatedSem = [...prev[sem]];
        updatedSem[index] = {
          ...updatedSem[index],
          code: match.code,
          name: match.name,
          credits: match.credits
        };
        return { ...prev, [sem]: updatedSem };
      });
    }
  };

  const addSubject = (sem) => {
    setSemestersData(prev => ({
      ...prev,
      [sem]: [...(prev[sem] || []), { code: "", name: "", credits: "", saved: false, isActive: true, isElective: false }]
    }));
  };

  const removeSubject = (sem, index) => {
    setSemestersData(prev => {
      const updatedSem = [...prev[sem]];
      updatedSem.splice(index, 1);
      return { ...prev, [sem]: updatedSem };
    });
  };

  const toggleSubjectStatus = (sem, index) => {
    setSemestersData(prev => {
      const updatedSem = [...prev[sem]];
      const sub = updatedSem[index];
      sub.isActive = !sub.isActive;
      return { ...prev, [sem]: updatedSem };
    });
  };

  const toggleSubjectElective = (sem, index) => {
    setSemestersData(prev => {
      const updatedSem = [...prev[sem]];
      const sub = updatedSem[index];
      sub.isElective = !sub.isElective;
      return { ...prev, [sem]: updatedSem };
    });
  };

  const handleSave = async () => {
    if (!syllabusProgramme || !syllabusDept || !regulation) {
      setMessage({ type: "error", text: "Programme, Department, and Regulation are required." });
      return;
    }

    setSaving(true);
    try {
      const progKey = formatProgrammeKey(syllabusProgramme);
      const syllabusKey = `${progKey}_${sanitizeKey(syllabusDept)}_${sanitizeKey(regulation)}`;
      const syllabusRef = dbRef(rtdb, `syllabus_data/${syllabusKey}`);
      
      const existingSnapshot = await get(syllabusRef);
      const existingData = existingSnapshot.exists() ? existingSnapshot.val() : null;
      
      await set(syllabusRef, {
        programme: syllabusProgramme,
        department: syllabusDept,
        regulation: regulation,
        academic_year: existingData?.academic_year || "",
        file_name: existingData?.file_name || "",
        file_url: existingData?.file_url || "",
        semesters: semestersData,
        uploaded_at: existingData?.uploaded_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      setSuccessMessage(isUpdating ? "Regulation Structure updated successfully!" : "Regulation Structure saved successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      
      // Update all inputs as saved
      setSemestersData(prev => {
        const next = {};
        for (const sem in prev) {
          next[sem] = prev[sem].map(sub => ({ ...sub, saved: true }));
        }
        return next;
      });
      setIsUpdating(true);
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: `An error occurred: ${error.message}` });
    }
    setSaving(false);
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
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* Add Regulation */}
        <div className="bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-4">
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
          <div className="bg-[#120c7a] px-6 py-4 flex justify-between items-center">
            <h2 className="text-white font-bold text-lg">
              {configType === "curriculum" && "Regulation Structure"}
              {configType === "grade" && "Grade to Mark Configuration"}
              {configType === "cia" && "CIA Configuration"}
              {configType === "course_type" && "Course Type Configuration"}
            </h2>
            {(configType === "curriculum" && syllabusProgramme && syllabusDept && regulation && !fetchingSyllabus) && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save Regulation"}
              </button>
            )}
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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-zinc-50 p-6 rounded-xl border border-zinc-200 mt-2">
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-600">Configuration Type</label>
                <div className="relative">
                  <select 
                    className="w-full appearance-none bg-white border border-zinc-300 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-[#120c7a] transition-all font-medium text-sm"
                    value={configType}
                    onChange={(e) => setConfigType(e.target.value)}
                  >
                    <option value="curriculum">Regulation Structure</option>
                    <option value="grade">Grade Configuration</option>
                    <option value="cia">CIA Configuration</option>
                    <option value="course_type">Course Type Configuration</option>
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
                      setSyllabusDept("");
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
                <label className="text-sm font-bold text-zinc-600">Department</label>
                <div className="relative">
                  <select 
                    className="w-full appearance-none bg-white border border-zinc-300 rounded-lg px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-[#120c7a] transition-all font-medium text-sm disabled:opacity-50"
                    value={syllabusDept}
                    onChange={(e) => setSyllabusDept(e.target.value)}
                    disabled={!syllabusProgramme}
                  >
                    <option value="">Select Department</option>
                    {syllabusProgramme && PROGRAMME_DEPARTMENTS[syllabusProgramme]?.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
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

            {configType === "curriculum" && fetchingSyllabus && (
              <div className="flex justify-center items-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-4 border-[#120c7a] border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm font-bold text-zinc-500">Loading Configuration...</p>
                </div>
              </div>
            )}

            {configType === "curriculum" && syllabusProgramme && syllabusDept && regulation && !fetchingSyllabus && (
              <div className="space-y-8 mt-6">
                {Array.from({ length: syllabusDuration * 2 }, (_, i) => i + 1).map(sem => (
                  <div key={sem} className="bg-white border text-sm border-zinc-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
                      <h3 className="font-bold text-zinc-800">Semester {sem}</h3>
                      <button
                        type="button"
                        onClick={() => addSubject(sem)}
                        className="px-3 py-1.5 bg-[#120c7a] text-white text-xs font-bold rounded-lg hover:bg-[#100b6e] transition-colors"
                      >
                        + Add Subject
                      </button>
                    </div>
                    <div className="p-5">
                      {semestersData[sem]?.length === 0 ? (
                        <p className="text-sm text-zinc-400 italic text-center py-4 bg-zinc-50/50 rounded-lg border border-dashed border-zinc-200">No subjects added for this semester.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead>
                              <tr className="text-zinc-500 border-b border-zinc-100 uppercase tracking-wider text-[11px] font-black">
                                <th className="pb-3 text-center">Status</th>
                                <th className="pb-3 px-2">Course Pick</th>
                                <th className="pb-3 px-2">Subject Code & Name</th>
                                <th className="pb-3 px-2 text-center">Credits</th>
                                <th className="pb-3 px-2 text-center">Elective</th>
                                <th className="pb-3"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-50">
                              {semestersData[sem]?.map((sub, idx) => (
                                <tr key={idx} className={!sub.isActive ? "opacity-50 grayscale" : "hover:bg-zinc-50 transition-colors"}>
                                  <td className="py-3 px-2 text-center w-16">
                                    <button
                                      type="button"
                                      onClick={() => toggleSubjectStatus(sem, idx)}
                                      className={`group relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:ring-offset-2 transition-all duration-200 ${sub.isActive ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                                      title={sub.isActive ? "Active" : "Inactive"}
                                    >
                                      <span className="sr-only">Toggle subject status</span>
                                      <span
                                        aria-hidden="true"
                                        className={`pointer-events-none absolute h-full w-full rounded-md bg-transparent transition-all duration-200`}
                                      />
                                      <span
                                        aria-hidden="true"
                                        className={`pointer-events-none flex items-center justify-center h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${sub.isActive ? 'translate-x-2.5' : '-translate-x-2.5'}`}
                                      >
                                        {sub.isActive && <Check className="text-emerald-500" size={10} strokeWidth={4} />}
                                      </span>
                                    </button>
                                  </td>
                                  
                                  <td className="py-3 px-2 w-64">
                                    {!sub.saved && (
                                      <div className="relative">
                                        <select
                                          className="w-full appearance-none px-3 py-1.5 border border-zinc-300 rounded focus:ring-1 focus:ring-[#120c7a] focus:border-[#120c7a] outline-none text-xs font-medium pr-8"
                                          value={sub.code || ""}
                                          onChange={(e) => updateSubjectFromBank(sem, idx, e.target.value)}
                                        >
                                          <option value="">Select from Course Bank</option>
                                          {availableCourses.map(c => (
                                            <option key={c.key} value={c.code}>{c.code} - {c.name}</option>
                                          ))}
                                        </select>
                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
                                      </div>
                                    )}
                                  </td>

                                  <td className="py-3 px-2">
                                    {sub.saved ? (
                                      <div className="font-bold text-zinc-800">
                                        {sub.code} <span className="font-medium text-zinc-500">— {sub.name}</span>
                                      </div>
                                    ) : (
                                      <div className="flex gap-2">
                                        <input
                                          type="text"
                                          className="w-24 px-2 py-1 border border-zinc-200 rounded text-zinc-700 bg-white focus:ring-1 focus:ring-[#120c7a] outline-none text-xs font-mono"
                                          value={sub.code}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setSemestersData(prev => {
                                              const updated = [...prev[sem]];
                                              updated[idx].code = val;
                                              return { ...prev, [sem]: updated };
                                            });
                                          }}
                                          placeholder="Code"
                                        />
                                        <input
                                          type="text"
                                          className="flex-1 px-2 py-1 border border-zinc-200 rounded text-zinc-700 bg-white focus:ring-1 focus:ring-[#120c7a] outline-none text-xs"
                                          value={sub.name}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setSemestersData(prev => {
                                              const updated = [...prev[sem]];
                                              updated[idx].name = val;
                                              return { ...prev, [sem]: updated };
                                            });
                                          }}
                                          placeholder="Course Name"
                                        />
                                      </div>
                                    )}
                                  </td>
                                  
                                  <td className="py-3 px-2 w-20 text-center">
                                    <input
                                      type="number"
                                      className="w-12 mx-auto px-2 py-1 border border-zinc-200 rounded text-zinc-700 bg-white focus:ring-1 focus:ring-[#120c7a] outline-none text-xs text-center font-bold"
                                      value={sub.credits}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setSemestersData(prev => {
                                          const updated = [...prev[sem]];
                                          updated[idx].credits = val;
                                          return { ...prev, [sem]: updated };
                                        });
                                      }}
                                      disabled={sub.saved}
                                    />
                                  </td>
                                  
                                  <td className="py-3 px-2 text-center w-24">
                                     <button
                                        type="button"
                                        onClick={() => toggleSubjectElective(sem, idx)}
                                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors ${sub.isElective ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}
                                      >
                                        {sub.isElective ? 'Yes' : 'No'}
                                      </button>
                                  </td>
                                  
                                  <td className="py-3 pl-2 w-10 text-right">
                                    <button
                                      type="button"
                                      title="Remove Subject"
                                      onClick={() => removeSubject(sem, idx)}
                                      className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {configType === "cia" && (
              <div className="mt-8 border-t border-zinc-200 pt-8">
                <CIAConfigPage 
                  program={syllabusProgramme}
                  department={syllabusDept}
                  regulation={regulation}
                />
              </div>
            )}

            {configType === "course_type" && (
              <div className="mt-8 border-t border-zinc-200 pt-8 flex justify-center py-12">
                <p className="text-zinc-500 italic">Course Type Configuration coming soon...</p>
              </div>
            )}
            
            {configType === "grade" && (
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
          </div>
        </div>

      </div>
    </Layout>
  );
}
