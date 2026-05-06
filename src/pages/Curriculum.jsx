import { useState, useMemo, useEffect } from "react";
import { rtdb, auth } from "../firebase";
import { ref, set, onValue, get } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import { 
  Trash2,
  CheckCircle2,
  Plus,
  Settings,
  AlertCircle
} from "lucide-react";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";

import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatProgDisplay, formatProgrammeKey, getRecentBatches as getRecentBatchesUtil, formatBatchDisplay } from "../lib/utils";

export default function Curriculum() {
  const { departments, durations, addDepartment, removeDepartment, removeProgram, setDuration } = useDepartments();
  const { regulations, batchRegulations, addRegulation, mapBatchToRegulation } = useRegulations();
  const { batchStatus, toggleBatchStatus } = useBatches(durations);

  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [modal, setModal] = useState({
    show: false,
    type: 'confirm',
    title: '',
    message: '',
    onConfirm: null
  });

  const showAlert = (title, message) => {
    setModal({ show: true, type: 'alert', title, message, onConfirm: null });
  };

  const showConfirm = (title, message, onConfirm) => {
    setModal({ show: true, type: 'confirm', title, message, onConfirm });
  };

  // Program Config States
  const [newProgram, setNewProgram] = useState("");
  const [newDuration, setNewDuration] = useState(4);
  const [selectedProgram, setSelectedProgram] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [newRegulation, setNewRegulation] = useState("");
  const [editingDurations, setEditingDurations] = useState({});
  const [mappingProgram, setMappingProgram] = useState("");
  const [mappingBatch, setMappingBatch] = useState("");
  const [mappingRegulation, setMappingRegulation] = useState("");

  // Grade Config States
  const [gradeReg, setGradeReg] = useState("");
  const [gradeConfigs, setGradeConfigs] = useState({}); // { reg: [{grade, gradePoint, mark}] }
  const [newGrade, setNewGrade] = useState({ grade: "", gradePoint: "", mark: "" });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = ref(rtdb, `users/${currentUser.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setUserData(snapshot.val());
        }
      }
      setLoading(false);
    });

    const gradeRef = ref(rtdb, 'grade_configs');
    const unsubscribeData = onValue(gradeRef, (snapshot) => {
      if (snapshot.exists()) {
        setGradeConfigs(snapshot.val());
      } else {
        setGradeConfigs({});
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeData();
    };
  }, []);

  const handleAddGrade = async () => {
    if (!gradeReg || !newGrade.grade.trim() || !newGrade.gradePoint.trim()) return;
    const currentGrades = gradeConfigs[sanitizeKey(gradeReg)] || [];
    const gradePoint = Number(newGrade.gradePoint);
    const mark = gradePoint * 10;
    const updatedGrades = [...currentGrades, { 
      grade: newGrade.grade.trim(), 
      gradePoint: gradePoint,
      mark: mark 
    }];
    await set(ref(rtdb, `grade_configs/${sanitizeKey(gradeReg)}`), updatedGrades);
    setNewGrade({ grade: "", gradePoint: "", mark: "" });
    setSuccessMessage("Grade added successfully!");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleRemoveGrade = async (reg, index) => {
    const currentGrades = [...(gradeConfigs[sanitizeKey(reg)] || [])];
    currentGrades.splice(index, 1);
    await set(ref(rtdb, `grade_configs/${sanitizeKey(reg)}`), currentGrades.length > 0 ? currentGrades : null);
    setSuccessMessage("Grade removed successfully!");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const sanitizeKey = (key) => {
    if (!key) return '';
    return String(key).replace(/[.#$[\]]/g, '_');
  };

  const getRecentBatches = (prog) => {
    const progKey = formatProgrammeKey(prog);
    const duration = durations[progKey] || 4;
    return getRecentBatchesUtil(duration);
  };

  const mappedBatches = useMemo(() => {
    if (!mappingProgram || !mappingRegulation) return [];
    const progKey = formatProgrammeKey(mappingProgram);
    const mappings = batchRegulations[progKey] || {};
    return Object.entries(mappings)
      .filter(([, reg]) => reg === mappingRegulation)
      .map(([batch]) => batch)
      .sort();
  }, [mappingProgram, mappingRegulation, batchRegulations]);

  const groupedBatchRegulations = useMemo(() => {
    const grouped = [];
    Object.entries(batchRegulations).forEach(([progKey, mappings]) => {
      const regMap = {};
      Object.entries(mappings).forEach(([batch, regulation]) => {
        if (!regMap[regulation]) regMap[regulation] = [];
        regMap[regulation].push(batch);
      });
      
      Object.entries(regMap).forEach(([regulation, batches]) => {
        grouped.push({
          progKey,
          regulation,
          batches: batches.sort((a, b) => b.localeCompare(a))
        });
      });
    });
    return grouped.sort((a, b) => {
      const progA = formatProgDisplay(a.progKey);
      const progB = formatProgDisplay(b.progKey);
      if (progA !== progB) return progA.localeCompare(progB);
      return b.regulation.localeCompare(a.regulation);
    });
  }, [batchRegulations]);

  const handleAddProgram = async () => {
    if (!newProgram.trim()) return;
    const progKey = formatProgrammeKey(newProgram.trim());
    if (!departments[progKey]) {
      await set(ref(rtdb, `programme_departments/${progKey}`), []);
      await set(ref(rtdb, `programme_durations/${progKey}`), parseInt(newDuration) || 4);
      setSuccessMessage("Program added successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setNewProgram("");
      setNewDuration(4);
    }
  };

  const handleAddDepartment = async () => {
    if (!selectedProgram || !newDepartment.trim()) return;
    const progKey = formatProgrammeKey(selectedProgram);
    await addDepartment(progKey, newDepartment.trim());
    setSuccessMessage("Department added successfully!");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
    setNewDepartment("");
  };

  const handleAddRegulation = async () => {
    if (!newRegulation.trim()) return;
    await addRegulation(newRegulation.trim());
    setSuccessMessage("Regulation added successfully!");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
    setNewRegulation("");
  };

  const handleMapRegulation = async () => {
    if (!mappingProgram || !mappingBatch || !mappingRegulation) return;
    const progKey = formatProgrammeKey(mappingProgram);
    await mapBatchToRegulation(progKey, mappingBatch, mappingRegulation);
    setSuccessMessage("Regulation mapping updated successfully!");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
    setMappingProgram("");
    setMappingBatch("");
    setMappingRegulation("");
  };

  const cancelMappingEdit = () => {
    setMappingProgram("");
    setMappingBatch("");
    setMappingRegulation("");
  };

  if (loading) {
    return (
      <Layout title="General Config">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]"></div>
        </div>
      </Layout>
    );
  }

  const isAdmin = userData?.role === 'Admin' || user?.email === 'cselab2022@gmail.com';

  if (!isAdmin) {
    return (
      <Layout title="General Config">
        <div className="max-w-4xl mx-auto mt-10 p-8 bg-red-50 border border-red-200 rounded-2xl text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h2 className="text-2xl font-bold text-red-800 mb-2">Access Denied</h2>
          <p className="text-red-600">This page is restricted to Administrators only.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="General Config">
      <style>{`
        .bottom-space {
          margin-top: 40px;
        }
        .form-label {
          font-weight: 600;
          color: #333;
          margin-bottom: 0.5rem;
        }
        .form-control, .form-select {
          border-radius: 8px;
          border: 1px solid #ced4da;
          padding: 0.75rem 1rem;
          font-size: 1rem;
          transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
        }
        .form-control:focus, .form-select:focus {
          border-color: #80bdff;
          box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
        }
        .trash-btn {
          color: #dc3545;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          transition: color 0.2s;
        }
        .trash-btn:hover {
          color: #a71d2a;
        }
      `}</style>
      <div className="container-fluid p-4">
        {/* Program & Regulation Configuration Card */}
        <div className="card shadow-sm border-0 rounded-3">
          <div className="card-body p-4 p-md-5">
            <h2 className="card-title mb-4 font-bold text-2xl text-zinc-800">Program & Regulation Configuration</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Add Program */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="font-semibold text-lg mb-3">Add New Program</h3>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g., B.E., B.Tech., M.E." 
                      value={newProgram}
                      onChange={(e) => setNewProgram(e.target.value)}
                    />
                    <input 
                      type="number" 
                      className="form-control" 
                      style={{ width: '100px' }}
                      placeholder="Duration" 
                      value={newDuration}
                      onChange={(e) => setNewDuration(e.target.value)}
                      title="Duration in Years"
                    />
                    <button 
                      className="btn btn-primary flex items-center gap-2"
                      style={{ backgroundColor: '#120c7a', border: 'none' }}
                      onClick={handleAddProgram}
                    >
                      <Plus size={18} /> Add
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">* Duration determines batch end year (e.g., 2022 + 4 = 2026)</p>
                </div>
                <div className="mt-3">
                  <p className="text-sm text-slate-500 mb-1">Existing Programs:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(durations).map(prog => (
                      <div key={prog} className="px-2 py-1 bg-white border rounded text-sm flex items-center gap-2 shadow-sm">
                        <span className="font-bold text-[#120c7a]">{formatProgDisplay(prog)}</span>
                        <div className="flex items-center gap-1 border-l pl-2">
                          <input 
                            type="number" 
                            className="border-0 bg-transparent w-8 text-center text-xs font-bold focus:ring-0 p-0"
                            value={editingDurations[prog] !== undefined ? editingDurations[prog] : (durations[prog] || 4)}
                            onChange={(e) => setEditingDurations({ ...editingDurations, [prog]: e.target.value })}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val) && val > 0 && val !== durations[prog]) {
                                setDuration(prog, val);
                              }
                              const next = { ...editingDurations };
                              delete next[prog];
                              setEditingDurations(next);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                            title="Edit Duration"
                          />
                          <span className="text-[10px] text-slate-400">yrs</span>
                        </div>
                        <Trash2 
                          size={12} 
                          className="cursor-pointer hover:text-red-500 ml-1" 
                          onClick={() => {
                            const depts = departments[prog] || [];
                            if (depts.length > 0) {
                              showAlert("Action Blocked", "Cannot delete program with departments. Remove departments first.");
                              return;
                            }
                            showConfirm(
                              "Delete Program", 
                              `Are you sure you want to delete the program ${formatProgDisplay(prog)}?`,
                              () => removeProgram(prog)
                            );
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Add Department */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="font-semibold text-lg mb-3">Add New Department</h3>
                <div className="flex flex-col gap-2">
                  <select 
                    className="form-select"
                    value={selectedProgram}
                    onChange={(e) => setSelectedProgram(e.target.value)}
                  >
                    <option value="">Select Program</option>
                    {Object.keys(durations).map(prog => (
                      <option key={prog} value={prog}>{formatProgDisplay(prog)}</option>
                    ))}
                  </select>

                  {selectedProgram && (
                    <div className="mt-2 mb-2 p-3 bg-white border rounded-lg">
                      <p className="text-xs font-bold text-slate-500 uppercase mb-2">Departments in {formatProgDisplay(selectedProgram)}:</p>
                      <div className="flex flex-wrap gap-2">
                        {departments[selectedProgram] && departments[selectedProgram].length > 0 ? (
                          departments[selectedProgram].map((dept, idx) => (
                            <span key={idx} className="px-2 py-1 bg-slate-50 text-slate-700 border border-slate-100 rounded text-xs font-bold flex items-center gap-1">
                              {dept}
                              <Trash2 
                                size={12} 
                                className="cursor-pointer hover:text-red-500 ml-1" 
                                onClick={() => {
                                  showConfirm(
                                    "Delete Department",
                                    `Remove department ${dept} from ${formatProgDisplay(selectedProgram)}?`,
                                    () => removeDepartment(selectedProgram, dept)
                                  );
                                }}
                              />
                            </span>
                          ))
                        ) : (
                          <span className="text-xs italic text-slate-400">No departments added yet</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g., CSE, ECE, IT" 
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value)}
                    />
                    <button 
                      className="btn btn-primary flex items-center gap-2"
                      style={{ backgroundColor: '#120c7a', border: 'none' }}
                      onClick={handleAddDepartment}
                    >
                      <Plus size={18} /> Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Add Regulation */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="font-semibold text-lg mb-3">Add New Regulation</h3>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g., R2021, R2025" 
                    value={newRegulation}
                    onChange={(e) => setNewRegulation(e.target.value)}
                  />
                  <button 
                    className="btn btn-primary flex items-center gap-2"
                    style={{ backgroundColor: '#120c7a', border: 'none' }}
                    onClick={handleAddRegulation}
                  >
                    <Plus size={18} /> Add
                  </button>
                </div>
                <div className="mt-3">
                  <p className="text-sm text-slate-500 mb-1">Existing Regulations:</p>
                  <div className="flex flex-wrap gap-2">
                    {regulations.map(reg => (
                      <span key={reg} className="px-2 py-1 bg-white border rounded text-sm">{reg}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Map Regulation to Batch */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="font-semibold text-lg mb-3">Map Regulation to Batch</h3>
                <div className="flex flex-col gap-3">
                  <select 
                    className="form-select"
                    value={mappingProgram}
                    onChange={(e) => setMappingProgram(e.target.value)}
                  >
                    <option value="">Select Program</option>
                    {Object.keys(durations).map(prog => (
                      <option key={prog} value={prog}>{formatProgDisplay(prog)}</option>
                    ))}
                  </select>
                  
                  <select 
                    className="form-select"
                    value={mappingRegulation}
                    onChange={(e) => setMappingRegulation(e.target.value)}
                  >
                    <option value="">Select Regulation</option>
                    {regulations.map(reg => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>

                  {mappingProgram && mappingRegulation && (
                    <div className="mt-2 p-3 bg-white border rounded-lg shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-xs font-bold text-slate-500 uppercase">
                          {mappingBatch ? `Editing Mapping for ${mappingBatch}` : `Mapped Batches for ${mappingRegulation}:`}
                        </p>
                        {mappingBatch && (
                          <button 
                            className="text-xs text-blue-600 hover:underline font-semibold"
                            onClick={cancelMappingEdit}
                          >
                            Cancel Edit
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {mappedBatches.length > 0 ? (
                          mappedBatches.map(b => (
                            <span key={b} className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs font-bold flex items-center gap-1">
                              {formatBatchDisplay(b)}
                              <Trash2 
                                size={12} 
                                className="cursor-pointer hover:text-red-500" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  showConfirm(
                                    "Unmap Batch",
                                    `Unmap batch ${b} from ${mappingRegulation}?`,
                                    async () => {
                                      const progKey = formatProgrammeKey(mappingProgram);
                                      await set(ref(rtdb, `batch_regulations/${progKey}/${b}`), null);
                                    }
                                  );
                                }}
                              />
                            </span>
                          ))
                        ) : (
                          <span className="text-xs italic text-slate-400">No other batches mapped to this regulation</span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <select 
                          className="form-select form-select-sm"
                          value={mappingBatch}
                          onChange={(e) => setMappingBatch(e.target.value)}
                        >
                          <option value="">{mappingBatch ? formatBatchDisplay(mappingBatch) : "Select Batch..."}</option>
                          {getRecentBatches(mappingProgram).map(b => (
                            <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                          ))}
                        </select>
                        <button 
                          className="btn btn-sm btn-primary px-3"
                          style={{ backgroundColor: '#120c7a', border: 'none' }}
                          onClick={handleMapRegulation}
                        >
                          {mappingBatch ? "Update" : "Map"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Side-by-Side Tables Section */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mt-6 mb-5">
          {/* Left: Program & Department Overview Table */}
          <div className="xl:col-span-5">
            <div className="card shadow-sm border-0 rounded-3 h-full">
              <div className="card-body p-4">
                <h2 className="card-title mb-4 font-bold text-xl text-zinc-800 flex items-center gap-2">
                  <i className="bi bi-diagram-3 text-blue-600"></i>
                  Program & Departments
                </h2>
                <div className="table-responsive">
                  <table className="table table-hover align-middle border-top">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Program</th>
                        <th className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Departments</th>
                      </tr>
                    </thead>
                    <tbody className="border-top-0">
                      {Object.keys(durations).map((progKey) => {
                        const depts = departments[progKey] || [];
                        return (
                        <tr key={progKey}>
                          <td className="px-3 py-3">
                            <span className="font-bold text-[#120c7a]">{formatProgDisplay(progKey)}</span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {depts && depts.length > 0 ? (
                                depts.map((dept, idx) => (
                                  <span key={idx} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold border border-slate-200">
                                    {dept}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs italic text-slate-400">No departments</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )})}
                      {Object.keys(durations).length === 0 && (
                        <tr>
                          <td colSpan="2" className="text-center py-5 text-slate-400 italic">
                            No programs configured.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Current Batch-Regulation Mappings Table */}
          <div className="xl:col-span-7">
            <div className="card shadow-sm border-0 rounded-3 h-full">
              <div className="card-body p-4">
                <h2 className="card-title mb-4 font-bold text-xl text-zinc-800 flex items-center gap-2">
                  <i className="bi bi-link-45deg text-blue-600"></i>
                  Batch-Regulation Mappings
                </h2>
                <div className="table-responsive">
                  <table className="table table-hover align-middle border-top">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Program</th>
                        <th className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Batch</th>
                        <th className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Regulation</th>
                        <th className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="border-top-0">
                      {groupedBatchRegulations.map((mapping, idx) => (
                        <tr key={`${mapping.progKey}-${mapping.regulation}-${idx}`}>
                          <td className="px-3 py-3 font-medium text-slate-600">{formatProgDisplay(mapping.progKey)}</td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              {mapping.batches.map(batch => (
                                <span key={batch} className="group px-2 py-1 bg-blue-50 text-blue-700 rounded text-[10px] font-bold border border-blue-100 flex items-center gap-1">
                                  {formatBatchDisplay(batch)}
                                  <Trash2 
                                    size={10} 
                                    className="cursor-pointer text-blue-300 hover:text-red-500 transition-colors" 
                                    onClick={() => {
                                      showConfirm(
                                        "Unmap Batch",
                                        `Unmap batch ${formatBatchDisplay(batch)} from ${mapping.regulation}?`,
                                        async () => {
                                          await set(ref(rtdb, `batch_regulations/${mapping.progKey}/${batch}`), null);
                                          setSuccessMessage("Mapping removed successfully!");
                                          setShowSuccess(true);
                                          setTimeout(() => setShowSuccess(false), 3000);
                                        }
                                      );
                                    }}
                                  />
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold border border-emerald-100">
                              {mapping.regulation}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-end">
                            <div className="flex justify-end gap-1">
                              <button 
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Add/Edit Batch for this Regulation"
                                onClick={() => {
                                  setMappingProgram(mapping.progKey);
                                  setMappingRegulation(mapping.regulation);
                                  // Pick the most recent batch or just let the user pick
                                  setMappingBatch(""); 
                                  window.scrollTo({ top: 400, behavior: 'smooth' });
                                }}
                              >
                                <Plus size={18} />
                              </button>
                              <button 
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete All Mappings for this Regulation"
                                onClick={() => {
                                  showConfirm(
                                    "Delete All Mappings",
                                    `Are you sure you want to remove all batch mappings for ${mapping.regulation} in ${formatProgDisplay(mapping.progKey)}?`,
                                    async () => {
                                      const updates = {};
                                      mapping.batches.forEach(b => {
                                        updates[b] = null;
                                      });
                                      await set(ref(rtdb, `batch_regulations/${mapping.progKey}`), {
                                        ...(batchRegulations[mapping.progKey] || {}),
                                        ...updates
                                      });
                                      setSuccessMessage("All mappings removed successfully!");
                                      setShowSuccess(true);
                                      setTimeout(() => setShowSuccess(false), 3000);
                                    }
                                  );
                                }}
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {groupedBatchRegulations.length === 0 && (
                        <tr>
                          <td colSpan="4" className="text-center py-5 text-slate-400 italic">
                            No mappings found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Grade Configuration Section */}
        <div className="card shadow-sm border-0 rounded-3 mt-6">
          <div className="card-body p-4 p-md-5">
            <h2 className="card-title mb-4 font-bold text-2xl text-zinc-800 flex items-center gap-2">
              <Settings className="text-blue-600" size={24} />
              Grade to Mark Configuration
            </h2>
            <p className="text-sm text-slate-500 mb-4 italic">* Define grades and their corresponding marks for each regulation. These will be used in Mark Entry for University Exams.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="font-semibold text-lg mb-3">Add Grade Definition</h3>
                <div className="flex flex-col gap-3">
                  <select 
                    className="form-select"
                    value={gradeReg}
                    onChange={(e) => setGradeReg(e.target.value)}
                  >
                    <option value="">Select Regulation</option>
                    {regulations.map(reg => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                  
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Grade (e.g., A+)" 
                      value={newGrade.grade}
                      onChange={(e) => setNewGrade({ ...newGrade, grade: e.target.value })}
                    />
                    <input 
                      type="number" 
                      className="form-control" 
                      placeholder="Grade Point (e.g., 9)" 
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
                      className="form-control bg-slate-100" 
                      placeholder="Mark" 
                      value={newGrade.mark}
                      readOnly
                    />
                    <button 
                      className="btn btn-primary flex items-center gap-2"
                      style={{ backgroundColor: '#120c7a', border: 'none' }}
                      onClick={handleAddGrade}
                      disabled={!gradeReg}
                    >
                      <Plus size={18} /> Add
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="font-semibold text-lg mb-3">Existing Grade Definitions</h3>
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                  {Object.entries(gradeConfigs).length > 0 ? (
                    Object.entries(gradeConfigs).map(([regKey, grades]) => (
                      <div key={regKey} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                        <p className="text-xs font-bold text-[#120c7a] uppercase mb-2 border-b pb-1">{regKey}</p>
                        <div className="flex flex-wrap gap-2">
                          {Array.isArray(grades) && grades.map((g, idx) => (
                            <div key={idx} className="px-2 py-1 bg-slate-50 text-slate-700 border border-slate-100 rounded text-xs font-bold flex items-center gap-2">
                              <span>{g.grade}: <span className="text-blue-600">{g.gradePoint} GP</span> | <span className="text-emerald-600">{g.mark} M</span></span>
                              <Trash2 
                                size={12} 
                                className="cursor-pointer hover:text-red-500" 
                                onClick={() => handleRemoveGrade(regKey, idx)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm italic text-slate-400 text-center py-4">No grades defined yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Batch Visibility Management Section */}
        <div className="card shadow-sm border-0 rounded-3 mt-6 mb-5">
          <div className="card-body p-4 p-md-5">
            <h2 className="card-title mb-4 font-bold text-2xl text-zinc-800 flex items-center gap-2">
              <i className="bi bi-eye text-blue-600"></i>
              Batch Visibility Management
            </h2>
            <p className="text-sm text-slate-500 mb-4 italic">* Toggle off batches to hide them from user dropdowns. New batches are auto-created and cannot be deleted.</p>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Object.keys(durations).map(progKey => (
                <div key={progKey} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <h3 className="font-bold text-lg text-[#120c7a] mb-3 border-b pb-2">
                    {formatProgDisplay(progKey)}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.entries(batchStatus[progKey] || {})
                      .sort((a, b) => b[0].localeCompare(a[0]))
                      .map(([batchId, status]) => (
                        <div key={batchId} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex flex-col gap-2">
                          <span className="text-xs font-bold text-slate-600">{formatBatchDisplay(batchId)}</span>
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-bold ${status.isActive ? 'text-green-600' : 'text-red-500'}`}>
                              {status.isActive ? 'ACTIVE' : 'HIDDEN'}
                            </span>
                            <div 
                              className={`relative inline-flex h-5 w-10 items-center rounded-full cursor-pointer transition-colors duration-200 ease-in-out ${status.isActive ? 'bg-green-500' : 'bg-slate-300'}`}
                              onClick={() => toggleBatchStatus(progKey, batchId, status.isActive)}
                            >
                              <span
                                className={`inline-block h-3 w-3 transform rounded-full bg-white transition duration-200 ease-in-out ${status.isActive ? 'translate-x-6' : 'translate-x-1'}`}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
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
}
