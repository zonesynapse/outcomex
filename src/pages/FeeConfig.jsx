import { useState, useEffect, useMemo, Fragment } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, setDoc, collection } from "firebase/firestore";
import { 
  Wallet, 
  Plus, 
  Save, 
  Trash2, 
  ChevronDown, 
  CheckCircle2, 
  AlertCircle,
  Settings2,
  Layers
} from "lucide-react";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatBatchDisplay, formatProgrammeKey, formatProgDisplay, sanitizeKey } from "../lib/utils";

export default function FeeConfig() {
  const { departments: deptMap, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);

  // Selection States
  const [programme, setProgramme] = useState("");
  const [batch, setBatch] = useState("");
  const [regulation, setRegulation] = useState("");

  // Data States
  const [feeCategories, setFeeCategories] = useState(["Tuition Fee", "Development Fee", "Other Fee"]);
  const [feeData, setFeeData] = useState({}); // { dept: { quota: { category: amount } } }
  const [quotas, setQuotas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Fetch Batches based on Programme
  const availableBatches = useMemo(() => {
    if (!programme) return [];
    return getActiveBatches(formatProgrammeKey(programme));
  }, [programme, getActiveBatches]);

  // Auto-set Regulation
  useEffect(() => {
    if (batch && programme) {
      const reg = getRegulationForBatch(formatProgrammeKey(programme), batch);
      setRegulation(reg || "");
    }
  }, [batch, programme, getRegulationForBatch]);

  // Fetch Departments for matrix
  const departments = useMemo(() => {
    if (!programme) return [];
    return deptMap[formatProgrammeKey(programme)] || [];
  }, [programme, deptMap]);

  // Fetch Quotas from Seat Management or Global Config
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "seat_configurations"), (snapshot) => {
      const quotaSet = new Set();
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.quotas) {
          Object.keys(data.quotas).forEach(q => quotaSet.add(q));
        }
      });
      setQuotas(Array.from(quotaSet).length > 0 ? Array.from(quotaSet) : ["Govt Quota", "Mgmt Quota", "Lateral Entry"]);
    });
    return () => unsub();
  }, []);

  // Fetch existing Fee Data
  useEffect(() => {
    if (programme && batch) {
      setLoading(true);
      const docId = `${formatProgrammeKey(programme)}_${sanitizeKey(batch)}`;
      const unsub = onSnapshot(doc(db, "fee_configurations", docId), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setFeeData(data.fees || {});
          if (data.categories) setFeeCategories(data.categories);
        } else {
          setFeeData({});
        }
        setLoading(false);
      });
      return () => unsub();
    }
  }, [programme, batch]);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const handleAddCategory = () => {
    let newName = "New Category";
    let counter = 1;
    while(feeCategories.includes(newName)) {
      newName = `New Category ${counter}`;
      counter++;
    }
    setFeeCategories([...feeCategories, newName]);
  };

  const handleCategoryNameChange = (idx, newName) => {
    const oldName = feeCategories[idx];
    if (oldName === newName || feeCategories.includes(newName)) return;
    
    setFeeCategories(prev => {
      const next = [...prev];
      next[idx] = newName;
      return next;
    });

    setFeeData(prev => {
      const nextData = { ...prev };
      Object.keys(nextData).forEach(dept => {
        Object.keys(nextData[dept]).forEach(quota => {
          if (nextData[dept][quota][oldName] !== undefined) {
             nextData[dept][quota][newName] = nextData[dept][quota][oldName];
             delete nextData[dept][quota][oldName];
          }
        });
      });
      return nextData;
    });
  };

  const handleFeeChange = (dept, quota, category, value) => {
    setFeeData(prev => ({
      ...prev,
      [dept]: {
        ...(prev[dept] || {}),
        [quota]: {
          ...(prev[dept]?.[quota] || {}),
          [category]: Number(value) || 0
        }
      }
    }));
  };

  const handleSave = async () => {
    if (!programme || !batch) {
      showToast("Please select Programme and Batch", "error");
      return;
    }
    setSaving(true);
    try {
      const docId = `${formatProgrammeKey(programme)}_${sanitizeKey(batch)}`;
      await setDoc(doc(db, "fee_configurations", docId), {
        programme,
        batch,
        regulation: regulation || "",
        categories: feeCategories,
        fees: feeData,
        updatedAt: new Date().toISOString()
      });
      showToast("Fee configuration saved successfully!");
    } catch (err) {
      console.error(err);
      showToast("Failed to save configuration", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title="Fee Configuration">
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
        {toast.show && (
          <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="font-bold">{toast.message}</span>
          </div>
        )}

        {/* Selection Card */}
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-zinc-100">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-600 ml-1">Programme</label>
              <div className="relative">
                <select 
                  value={programme}
                  onChange={(e) => { setProgramme(e.target.value); setBatch(""); }}
                  className="w-full appearance-none bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none transition-all font-medium"
                >
                  <option value="">Choose Programme</option>
                  {Object.keys(durations).map(prog => (
                    <option key={prog} value={prog}>{formatProgDisplay(prog)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-600 ml-1">Batch</label>
              <div className="relative">
                <select 
                  disabled={!programme}
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  className="w-full appearance-none bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none transition-all font-medium disabled:opacity-50"
                >
                  <option value="">Choose Batch</option>
                  {availableBatches.map(b => (
                    <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-600 ml-1">Regulation</label>
              <div className="w-full bg-zinc-100 border border-zinc-200 rounded-xl px-4 py-3 font-bold text-zinc-500">
                {regulation || "Regulation not mapped"}
              </div>
            </div>
          </div>
        </div>

        {programme && batch && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Fee Categories Setup */}
            <div className="bg-white rounded-3xl shadow-xl p-8 border border-zinc-100">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 text-[#120c7a] rounded-lg">
                    <Settings2 size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-800">Fee Categories</h3>
                </div>
                <button 
                  onClick={handleAddCategory}
                  className="flex items-center gap-2 text-sm font-bold text-[#120c7a] hover:underline"
                >
                  <Plus size={16} /> Add Category
                </button>
              </div>
              <div className="flex flex-wrap gap-4">
                {feeCategories.map((cat, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 group">
                    <input 
                      value={cat}
                      onChange={(e) => handleCategoryNameChange(idx, e.target.value)}
                      className="bg-transparent border-none outline-none font-bold text-zinc-700 text-sm w-32"
                    />
                    <button 
                      onClick={() => setFeeCategories(feeCategories.filter((_, i) => i !== idx))}
                      className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Matrix Table */}
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-zinc-200">
              <div className="bg-[#120c7a] px-8 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Wallet className="text-white opacity-80" size={20} />
                  <h4 className="text-white font-bold text-lg">Fee Structure Matrix</h4>
                </div>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-white hover:bg-zinc-100 text-[#120c7a] px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg"
                >
                  {saving ? <div className="w-4 h-4 border-2 border-[#120c7a] border-t-transparent rounded-full animate-spin" /> : <Save size={18} />}
                  Save Config
                </button>
              </div>
              
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="px-6 py-4 text-left text-xs font-black text-zinc-400 uppercase tracking-widest sticky left-0 bg-zinc-50 z-10">Department / Quota</th>
                      {feeCategories.map(cat => (
                        <th key={cat} className="px-6 py-4 text-center text-xs font-black text-zinc-400 uppercase tracking-widest min-w-[150px]">
                          {cat}
                        </th>
                      ))}
                      <th className="px-6 py-4 text-center text-xs font-black text-[#120c7a] uppercase tracking-widest bg-blue-50/50">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {departments.map(dept => (
                      <Fragment key={dept}>
                        <tr className="bg-zinc-50/50">
                          <td colSpan={feeCategories.length + 2} className="px-6 py-2 text-[11px] font-black text-blue-600 uppercase tracking-tight">
                            {dept}
                          </td>
                        </tr>
                        {quotas.map(quota => {
                          const currentValues = feeData[dept]?.[quota] || {};
                          const total = feeCategories.reduce((sum, cat) => sum + (currentValues[cat] || 0), 0);
                          
                          return (
                            <tr key={`${dept}-${quota}`} className="hover:bg-zinc-50 transition-colors group">
                              <td className="px-8 py-3 text-sm font-bold text-zinc-600 sticky left-0 bg-white group-hover:bg-zinc-50 z-10 border-r border-zinc-100">
                                {quota}
                              </td>
                              {feeCategories.map(cat => (
                                <td key={cat} className="px-4 py-2">
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-400">₹</span>
                                    <input 
                                      type="number"
                                      value={currentValues[cat] || ""}
                                      onChange={(e) => handleFeeChange(dept, quota, cat, e.target.value)}
                                      className="w-full pl-6 pr-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm font-bold text-zinc-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#120c7a] transition-all text-right"
                                      placeholder="0"
                                    />
                                  </div>
                                </td>
                              ))}
                              <td className="px-6 py-2 text-center bg-blue-50/30">
                                <span className="text-sm font-black text-[#120c7a]">
                                  ₹{total.toLocaleString()}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!programme && (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border-2 border-dashed border-zinc-200">
            <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-300 mb-4">
              <Layers size={32} />
            </div>
            <h3 className="text-lg font-bold text-zinc-600">Select filters to configure fees</h3>
            <p className="text-zinc-400 text-sm">Choose a programme and batch to start defining the fee structure.</p>
          </div>
        )}
      </div>

      <style>{`
        input[type='number']::-webkit-outer-spin-button,
        input[type='number']::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type='number'] {
          -moz-appearance: textfield;
        }
        .custom-scrollbar::-webkit-scrollbar {
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #ccc;
          border-radius: 10px;
        }
      `}</style>
    </Layout>
  );
}