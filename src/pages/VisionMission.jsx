import { useState } from "react";
import { db } from "../firebase"; // Import db for Firestore
import { doc, setDoc, onSnapshot } from "firebase/firestore"; // Firestore imports
import { 
  Trash2,
  CheckCircle2
} from "lucide-react";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";

import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { formatProgrammeKey, formatProgDisplay } from "../lib/utils";

export default function VisionMission() {
  const { departments: deptMap } = useDepartments();
  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [visions, setVisions] = useState([""]);
  const [missions, setMissions] = useState([""]);
  const [peos, setPeos] = useState([""]);
  const [mapping, setMapping] = useState({}); // { peoIdx: { missionIdx: value } }
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [modal, setModal] = useState({ show: false, type: 'alert', title: '', message: '', onConfirm: null });

  const showAlert = (title, message) => {
    setModal({ show: true, type: 'alert', title, message, onConfirm: null });
  };

  const fetchVisionMission = (prog, dept) => {
    if (!prog || !dept) return;
    const progKey = formatProgrammeKey(prog);
    const sanitizedDept = sanitizeKey(dept); // Use sanitizeKey for department
    const deptRef = doc(db, 'vision_mission', progKey, sanitizedDept); // Firestore subcollection path
    onSnapshot(deptRef, (snapshot) => { // Use onSnapshot for real-time updates
      const data = snapshot.data(); // Use .data() for Firestore documents
      if (data) {
        setVisions(data.vision || [""]);
        setMissions(data.mission || [""]);
        setPeos(data.peo || [""]);
        setMapping(data.peo_mission_mapping || {});
      } else {
        setVisions([""]);
        setMissions([""]);
        setPeos([""]);
        setMapping({});
      }
    }, (error) => {
      console.error("Fetch Error:", error);
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!programme || !department) {
      showAlert("Validation Error", "Please select a programme and department");
      return;
    }

    const progKey = formatProgrammeKey(programme);
    const sanitizedDept = sanitizeKey(department); // Use sanitizeKey for department
    const deptRef = doc(db, 'vision_mission', progKey, sanitizedDept); // Firestore subcollection path
    try {
      await setDoc(deptRef, { // Use setDoc for Firestore
        vision: visions.filter(v => v.trim() !== ""),
        mission: missions.filter(m => m.trim() !== ""),
        peo: peos.filter(p => p.trim() !== ""),
        peo_mission_mapping: mapping
      });
      setSuccessMessage("Vision, Mission, PEO and Mapping saved successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Save Error:", error);
      showAlert("Error", "Failed to save. Check your database rules.");
    }
  };

  const addVision = () => setVisions([...visions, ""]);
  const addMission = () => setMissions([...missions, ""]);
  const addPeo = () => setPeos([...peos, ""]);

  const updateVision = (index, value) => {
    const newVisions = [...visions];
    newVisions[index] = value;
    setVisions(newVisions);
  };

  const updateMission = (index, value) => {
    const newMissions = [...missions];
    newMissions[index] = value;
    setMissions(newMissions);
  };

  const updatePeo = (index, value) => {
    const newPeos = [...peos];
    newPeos[index] = value;
    setPeos(newPeos);
  };

  const removeVision = (index) => {
    if (visions.length > 1) {
      setVisions(visions.filter((_, i) => i !== index));
    } else {
      setVisions([""]);
    }
  };

  const removeMission = (index) => {
    if (missions.length > 1) {
      setMissions(missions.filter((_, i) => i !== index));
      // Clean up mapping
      const newMapping = {};
      Object.keys(mapping).forEach(pIdx => {
        const peoMap = { ...mapping[pIdx] };
        delete peoMap[index];
        const shiftedPeoMap = {};
        Object.keys(peoMap).forEach(mIdxKey => {
          const mIdx = parseInt(mIdxKey);
          if (mIdx > index) {
            shiftedPeoMap[mIdx - 1] = peoMap[mIdxKey];
          } else {
            shiftedPeoMap[mIdx] = peoMap[mIdxKey];
          }
        });
        newMapping[pIdx] = shiftedPeoMap;
      });
      setMapping(newMapping);
    } else {
      setMissions([""]);
      setMapping({});
    }
  };

  const removePeo = (index) => {
    if (peos.length > 1) {
      setPeos(peos.filter((_, i) => i !== index));
      // Clean up mapping
      const newMapping = { ...mapping };
      delete newMapping[index];
      // Shift indices
      const shiftedMapping = {};
      Object.keys(newMapping).forEach(key => {
        const k = parseInt(key);
        if (k > index) {
          shiftedMapping[k - 1] = newMapping[key];
        } else {
          shiftedMapping[k] = newMapping[key];
        }
      });
      setMapping(shiftedMapping);
    } else {
      setPeos([""]);
      setMapping({});
    }
  };

  const handleMappingChange = (peoIdx, missionIdx, value) => {
    setMapping(prev => ({
      ...prev,
      [peoIdx]: {
        ...(prev[peoIdx] || {}),
        [missionIdx]: value
      }
    }));
  };

  const autoMap = () => {
    const stopwords = new Set(['the','and','or','of','in','on','with','for','to','a','an','by','is','are','be','this','that','as','at','from','which','it']);
    const tokenize = (text) => (String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).filter(w => !stopwords.has(w)));

    const visibleMissions = missions.map(m => m.trim()).filter(m => m !== '');
    const visiblePeos = peos.map(p => p.trim()).filter(p => p !== '');

    const newMapping = {};

    visiblePeos.forEach((peo, pIdx) => {
      const pWords = new Set(tokenize(peo));
      visibleMissions.forEach((mission, mIdx) => {
        const mWords = tokenize(mission);
        if (mWords.length === 0) return;
        const intersection = mWords.filter(w => pWords.has(w)).length;
        const score = intersection / Math.max(1, mWords.length);
        let val = '-';
        if (score >= 0.6) val = '3';
        else if (score >= 0.3) val = '2';
        else if (score >= 0.1) val = '1';
        const pKey = String(pIdx);
        const mKey = String(mIdx);
        newMapping[pKey] = {
          ...(newMapping[pKey] || {}),
          [mKey]: val
        };
      });
    });

    // Merge with existing mapping to preserve manual edits, then set
    setMapping(prev => {
      const merged = { ...prev };
      Object.keys(newMapping).forEach(p => {
        merged[p] = {
          ...(merged[p] || {}),
          ...newMapping[p]
        };
      });
      return merged;
    });
    setSuccessMessage('Auto-mapping applied');
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2500);
  };

  return (
    <Layout title="Vision and Mission">
      <style>{`
        .bottom-space {
          margin-top: 40px;
        }
        .card {
          border: none;
          border-radius: 12px;
          overflow: hidden;
          background-color: #fff;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
        }
        .card-header {
          background-color: #120c7a !important;
          color: white !important;
          padding: 16px 24px !important;
          font-size: 18px;
          font-weight: 700;
          border: none;
        }
        .form-label {
          font-weight: 600;
          color: #444;
          margin-bottom: 8px;
        }
        .form-select, .form-control {
          border: 1px solid #dee2e6;
          border-radius: 8px;
          padding: 12px;
          transition: border-color 0.2s;
        }
        .form-select:focus, .form-control:focus {
          border-color: #120c7a;
          box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.1);
        }
        .trash-btn {
          color: #dc3545;
          opacity: 0.6;
          transition: opacity 0.2s;
        }
        .trash-btn:hover {
          opacity: 1;
        }
      `}</style>

      {/* Main Content */}
      <div className="container mx-auto px-4 bottom-space pb-10">
        <div className="card">
          <div className="card-header">Department Vision and Mission</div>
          <div className="card-body p-4 md:p-6">
            <form onSubmit={handleSave}>
              <div className="mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="form-label">Programme *</label>
                    <select 
                      className="form-select w-full" 
                      value={programme}
                      onChange={(e) => {
                        setProgramme(e.target.value);
                        setDepartment("");
                      }}
                      required
                    >
                      <option value="">Select Programme</option>
                      {Object.keys(deptMap).map(prog => (
                        <option key={prog} value={prog}>{formatProgDisplay(prog)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Department *</label>
                    <select 
                      className="form-select w-full" 
                      value={department}
                      disabled={!programme}
                      onChange={(e) => {
                        setDepartment(e.target.value);
                        fetchVisionMission(programme, e.target.value);
                      }}
                      required
                    >
                      <option value="">Select Department</option>
                      {programme && deptMap[programme]?.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label">Vision Statement</label>
                <div className="space-y-3">
                  {visions.map((v, i) => (
                    <div key={i} className="relative group">
                      <textarea 
                        className="form-control" 
                        rows="3" 
                        placeholder="Enter Vision Statement"
                        value={v}
                        onChange={(e) => updateVision(i, e.target.value)}
                      />
                      <button 
                        type="button"
                        className="absolute right-3 bottom-3 trash-btn"
                        onClick={() => removeVision(i)}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label">Mission Statement</label>
                <div className="space-y-3">
                  {missions.map((m, i) => (
                    <div key={i} className="relative group">
                      <textarea 
                        className="form-control" 
                        rows="3" 
                        placeholder="Enter Mission Statement"
                        value={m}
                        onChange={(e) => updateMission(i, e.target.value)}
                      />
                      <button 
                        type="button"
                        className="absolute right-3 bottom-3 trash-btn"
                        onClick={() => removeMission(i)}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label">Program Educational Objectives (PEO)</label>
                <div className="space-y-3">
                  {peos.map((p, i) => (
                    <div key={i} className="relative group">
                      <textarea 
                        className="form-control" 
                        rows="3" 
                        placeholder="Enter PEO Statement"
                        value={p}
                        onChange={(e) => updatePeo(i, e.target.value)}
                      />
                      <button 
                        type="button"
                        className="absolute right-3 bottom-3 trash-btn"
                        onClick={() => removePeo(i)}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mapping Table */}
              {missions.some(m => m.trim()) && peos.some(p => p.trim()) && (
                <div className="mt-10 mb-6 overflow-x-auto">
                  <h3 className="text-lg font-bold text-zinc-800 mb-2">Mapping of PEOs with Mission</h3>
                  <p className="text-sm text-zinc-500 mb-4 italic">(Generate a Mission of the Department-PEOs matrix with justification and rationale of the mapping.)</p>
                  
                  <table className="w-full border-collapse border border-zinc-300">
                    <thead>
                      <tr className="bg-[#fff9e6]">
                        <th className="border border-zinc-300 p-3 text-sm font-bold text-zinc-800 w-1/3">PEO Statements</th>
                        {missions.filter(m => m.trim()).map((_, idx) => (
                          <th key={idx} className="border border-zinc-300 p-3 text-sm font-bold text-zinc-800 text-center">
                            M<sub>{idx + 1}</sub>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {peos.filter(p => p.trim()).map((peo, pIdx) => (
                        <tr key={pIdx}>
                          <td className="border border-zinc-300 p-3 text-sm text-zinc-700 font-medium">
                            PEO{pIdx + 1}: {peo.length > 100 ? peo.substring(0, 100) + "..." : peo}
                          </td>
                          {missions.filter(m => m.trim()).map((_, mIdx) => (
                            <td key={mIdx} className="border border-zinc-300 p-2 text-center">
                              <select
                                className="w-16 h-10 border border-zinc-200 rounded-lg text-center text-sm font-bold outline-none focus:ring-2 focus:ring-[#120c7a] transition-all"
                                value={mapping[pIdx]?.[mIdx] || "-"}
                                onChange={(e) => handleMappingChange(pIdx, mIdx, e.target.value)}
                              >
                                <option value="-">-</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                                <option value="3">3</option>
                              </select>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  <div className="mt-4 p-4 bg-zinc-50 rounded-xl border border-zinc-200">
                    <p className="text-sm font-bold text-zinc-700 mb-2">Note:</p>
                    <ul className="text-sm text-zinc-600 space-y-1 list-disc pl-5">
                      <li>M<sub>1</sub>, M<sub>2</sub>. . . M<sub>n</sub> are distinct elements of mission statement.</li>
                      <li>Enter correlation levels as Low (1), Medium (2) and High (3). If there is no correlation, put &quot;-&quot;</li>
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 mt-5">
                <button 
                  type="button" 
                  className="btn btn-primary px-4 py-2 rounded-lg font-bold"
                  onClick={addVision}
                  style={{ backgroundColor: '#120c7a', border: 'none' }}
                >
                  Add Vision
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary px-4 py-2 rounded-lg font-bold"
                  onClick={addMission}
                  style={{ backgroundColor: '#120c7a', border: 'none' }}
                >
                  Add Mission
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary px-4 py-2 rounded-lg font-bold"
                  onClick={addPeo}
                  style={{ backgroundColor: '#120c7a', border: 'none' }}
                >
                  Add PEO
                </button>
                <button
                  type="button"
                  className="btn px-4 py-2 rounded-lg font-bold"
                  onClick={autoMap}
                  style={{ backgroundColor: '#120c7a', border: 'none', color: 'white' }}
                >
                  Auto-map (AI)
                </button>
                <button 
                  type="submit" 
                  className="btn btn-success px-5 py-2 rounded-lg font-bold"
                  style={{ backgroundColor: '#28a745', border: 'none' }}
                >
                  Save
                </button>
              </div>
            </form>
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
