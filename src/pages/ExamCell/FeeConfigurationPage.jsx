import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { onSnapshot, collection, doc, setDoc, deleteDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import Layout from "../../components/Layout";
import { useRegulations } from "../../hooks/useRegulations";
import {
  IndianRupee, Plus, Search, Edit2, Trash2, Save, X,
  CheckCircle2, AlertCircle, GraduationCap, Filter,
  FileText, ShieldAlert, RefreshCw, ArrowLeft, Layers, Tag
} from "lucide-react";

const DEFAULT_FEE_STRUCTURES = [
  {
    title: "UG Regular Exam Fee Structure",
    programme: "UG",
    regulation: "Regulation 2021",
    academicYear: "2026-2027",
    category: "Regular Exam",
    fees: {
      theory: 150,
      practical: 250,
      integrated: 300,
      project: 500
    },
    status: "Active",
    remarks: "Standard UG End Semester Examination rate per course"
  },
  {
    title: "PG Regular Exam Fee Structure",
    programme: "PG",
    regulation: "Regulation 2021",
    academicYear: "2026-2027",
    category: "Regular Exam",
    fees: {
      theory: 250,
      practical: 350,
      integrated: 400,
      project: 750
    },
    status: "Active",
    remarks: "Standard PG End Semester Examination rate per course"
  },
  {
    title: "Answer Script Photocopy Fee",
    programme: "All",
    regulation: "All Regulations",
    academicYear: "2026-2027",
    category: "Photocopy",
    fees: {
      photocopyFee: 300
    },
    status: "Active",
    remarks: "Fee per subject for answer script photocopy application"
  },
  {
    title: "Answer Script Review Fee",
    programme: "All",
    regulation: "All Regulations",
    academicYear: "2026-2027",
    category: "Review",
    fees: {
      reviewFee: 400
    },
    status: "Active",
    remarks: "Fee per subject for answer script review application"
  },
  {
    title: "Revaluation & Answer Script Charges",
    programme: "All",
    regulation: "All Regulations",
    academicYear: "2026-2027",
    category: "Revaluation & Verification",
    fees: {
      photocopyFee: 300,
      revaluationFee: 400,
      retotallingFee: 150
    },
    status: "Active",
    remarks: "Post-examination revaluation & script copy request charges"
  },
  {
    title: "Certificate & Convocation Charges",
    programme: "All",
    regulation: "All Regulations",
    academicYear: "2026-2027",
    category: "Certificate & Convocation",
    fees: {
      gradeSheetFee: 100,
      provisionalCertFee: 500,
      consolidatedCertFee: 1000,
      degreeCertFee: 1500
    },
    status: "Active",
    remarks: "Official grade sheets & degree certification fees"
  },
  {
    title: "Late Fine & Duplicate Ticket Charges",
    programme: "All",
    regulation: "All Regulations",
    academicYear: "2026-2027",
    category: "Fines & Penalties",
    fees: {
      lateFineTier1: 200,
      lateFineTier2: 500,
      duplicateHallTicket: 150
    },
    status: "Active",
    remarks: "Late examination registration fine & duplicate pass charges"
  }
];

export default function FeeConfigurationPage() {
  const navigate = useNavigate();
  const { regulations } = useRegulations();

  // Course types configured per regulation in Curriculum page (course_type_configs)
  const [courseTypeConfigs, setCourseTypeConfigs] = useState({});
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'course_type_configs'), (snapshot) => {
      const data = {};
      snapshot.forEach(d => { data[d.id] = d.data(); });
      setCourseTypeConfigs(data);
    });
    return () => unsub();
  }, []);

  const sanitizeRegKey = (key) => {
    if (!key) return "";
    return String(key).replace(/[.#$[\]/ ]/g, '_');
  };
  const toArray = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'object' && v !== null) {
      const vals = Object.values(v);
      if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
      return vals;
    }
    return [];
  };

  // Data States
  const [feeConfigs, setFeeConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProg, setSelectedProg] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    programme: "UG",
    regulation: "Regulation 2021",
    academicYear: "2026-2027",
    category: "Regular Exam",
    status: "Active",
    remarks: "",
    fees: {
      theory: 150,
      practical: 250,
      integrated: 300,
      project: 500,
      arrearTheory: 250,
      arrearPractical: 400,
      photocopyFee: 300,
      revaluationFee: 400,
      gradeSheetFee: 100,
      provisionalCertFee: 500,
      consolidatedCertFee: 1000,
      lateFineTier1: 200,
      duplicateHallTicket: 150
    }
  });

  const showToastMsg = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  // Fee key for a Curriculum course type (legacy keys preserved for known types)
  const feeKeyForCourseType = (ct) => {
    const n = String(ct || '').toLowerCase();
    if (n.includes('integrated') || n.includes('cum') || (n.includes('theory') && n.includes('lab'))) return 'integrated';
    if (n.includes('theory') && !n.includes('practical') && !n.includes('lab')) return 'theory';
    if (n.includes('practical') || n.includes('lab')) return 'practical';
    if (n.includes('project') || n.includes('viva')) return 'project';
    return n.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'rate';
  };
  const defaultFeeForKey = (key) => {
    if (key === 'theory') return 150;
    if (key === 'practical') return 250;
    if (key === 'integrated') return 300;
    if (key === 'project') return 500;
    return '';
  };
  // Course types of the regulation chosen in the modal (from Curriculum page);
  // falls back to the legacy four so the breakdown never renders empty.
  const regulationCourseTypes = useMemo(() => {
    const list = toArray(courseTypeConfigs[sanitizeRegKey(formData.regulation)]).filter(Boolean);
    return list.length > 0 ? list : ['Theory', 'Practical', 'Integrated', 'Project'];
  }, [courseTypeConfigs, formData.regulation]);

  // Real-time Firestore sync & initial seed fallback
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "exam_fee_configurations"),
      async (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));

        if (list.length === 0) {
          try {
            for (const item of DEFAULT_FEE_STRUCTURES) {
              await addDoc(collection(db, "exam_fee_configurations"), {
                ...item,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
            }
          } catch (err) {
            console.error("Error seeding default fee configs:", err);
          }
        } else {
          setFeeConfigs(list);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching fee configs:", err);
        setFeeConfigs(DEFAULT_FEE_STRUCTURES);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Filtered Configs
  const filteredConfigs = useMemo(() => {
    return feeConfigs.filter((cfg) => {
      const matchesSearch =
        (cfg.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (cfg.category || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (cfg.regulation || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesProg = selectedProg === "All" || cfg.programme === selectedProg || cfg.programme === "All";
      const matchesCategory = selectedCategory === "All" || cfg.category === selectedCategory;
      const matchesStatus = selectedStatus === "All" || cfg.status === selectedStatus;
      return matchesSearch && matchesProg && matchesCategory && matchesStatus;
    });
  }, [feeConfigs, searchQuery, selectedProg, selectedCategory, selectedStatus]);

  // Statistics
  const stats = useMemo(() => {
    const total = feeConfigs.length;
    const active = feeConfigs.filter((c) => c.status === "Active").length;
    const regularAvg = Math.round(
      feeConfigs.filter((c) => c.category === "Regular Exam").reduce((acc, curr) => acc + (curr.fees?.theory || 0), 0) /
        (feeConfigs.filter((c) => c.category === "Regular Exam").length || 1)
    );
    const revalRate = feeConfigs.find((c) => c.category === "Revaluation & Verification")?.fees?.revaluationFee || 400;

    return { total, active, regularAvg, revalRate };
  }, [feeConfigs]);

  // Handle Save (Create / Update)
  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      showToastMsg("Please enter a valid title for the fee structure.", "error");
      return;
    }

    try {
      const payload = {
        title: formData.title,
        programme: formData.programme,
        regulation: formData.regulation,
        academicYear: formData.academicYear,
        category: formData.category,
        status: formData.status,
        remarks: formData.remarks,
        fees: formData.fees,
        updatedAt: serverTimestamp()
      };

      if (editingDoc) {
        await setDoc(doc(db, "exam_fee_configurations", editingDoc.id), payload, { merge: true });
        showToastMsg("Fee Configuration updated successfully!", "success");
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, "exam_fee_configurations"), payload);
        showToastMsg("New Fee Configuration added successfully!", "success");
      }

      if (formData.category === "Photocopy" || formData.fees?.photocopyFee) {
        const photoFeeVal = Number(formData.fees?.photocopyFee) || 300;
        await setDoc(doc(db, "exam_cell_settings", "photocopy"), {
          feePerSubject: photoFeeVal,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      setIsAddModalOpen(false);
      resetForm();
    } catch (err) {
      console.error("Save Error:", err);
      showToastMsg("Failed to save fee configuration.", "error");
    }
  };

  const handleEdit = (cfg) => {
    setEditingDoc(cfg);
    setFormData({
      title: cfg.title || "",
      programme: cfg.programme || "UG",
      regulation: cfg.regulation || "Regulation 2021",
      academicYear: cfg.academicYear || "2026-2027",
      category: cfg.category || "Regular Exam",
      status: cfg.status || "Active",
      remarks: cfg.remarks || "",
      fees: cfg.fees || {}
    });
    setIsAddModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this fee configuration?")) return;
    try {
      await deleteDoc(doc(db, "exam_fee_configurations", id));
      showToastMsg("Fee configuration deleted successfully.", "success");
    } catch (err) {
      console.error("Delete Error:", err);
      showToastMsg("Failed to delete configuration.", "error");
    }
  };

  const resetForm = () => {
    setEditingDoc(null);
    setFormData({
      title: "",
      programme: "UG",
      regulation: regulations[0] || "Regulation 2021",
      academicYear: "2026-2027",
      category: "Regular Exam",
      status: "Active",
      remarks: "",
      fees: {
        theory: 150,
        practical: 250,
        integrated: 300,
        project: 500
      }
    });
  };

  return (
    <Layout title="Exam Cell Fee Configuration">
      {/* Toast Notification */}
      {toast.show && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold shadow-xl transition-all ${
            toast.type === "error" ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"
          }`}
        >
          {toast.type === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {toast.message}
        </div>
      )}

      <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB] p-4 md:p-6">
        {/* Top Header Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl mb-6">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/exam-cell")}
                className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20 hover:bg-white/25 transition-all text-white cursor-pointer"
              >
                <ArrowLeft size={22} />
              </button>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-200/80">
                  Controller of Examinations • Fee Control
                </p>
                <h1 className="text-2xl md:text-3xl font-black leading-tight flex items-center gap-3">
                  <IndianRupee size={28} className="text-amber-300" />
                  Examination Fee Configuration
                </h1>
                <p className="text-xs md:text-sm text-blue-100/90 font-medium mt-1">
                  Configure theory, practical, arrear, revaluation & certificate fee structures across regulations.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  resetForm();
                  setIsAddModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[#120c7a] text-xs font-black hover:bg-blue-50 transition-all shadow-lg cursor-pointer"
              >
                <Plus size={16} /> Add Fee Structure
              </button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Structures</p>
                <p className="text-3xl font-black text-slate-800 mt-1">{stats.total}</p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Layers size={20} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Active Categories</p>
                <p className="text-3xl font-black text-emerald-600 mt-1">{stats.active}</p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <CheckCircle2 size={20} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Avg UG Theory Rate</p>
                <p className="text-3xl font-black text-indigo-600 mt-1">₹{stats.regularAvg}</p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <IndianRupee size={20} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Revaluation Rate</p>
                <p className="text-3xl font-black text-amber-600 mt-1">₹{stats.revalRate}</p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <FileText size={20} />
              </div>
            </div>
          </div>
        </div>

        {/* Filters & Search Control Bar */}
        <div className="bg-white rounded-3xl border border-zinc-200 p-4 shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search title, category, regulation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-1 text-xs font-bold text-zinc-500">
              <Filter size={14} /> Filter:
            </div>

            <select
              value={selectedProg}
              onChange={(e) => setSelectedProg(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Programmes</option>
              <option value="UG">UG</option>
              <option value="PG">PG</option>
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Categories</option>
              <option value="Regular Exam">Regular Exam</option>
              <option value="Photocopy">Photocopy</option>
              <option value="Review">Review</option>
              <option value="Revaluation & Verification">Revaluation & Verification</option>
              <option value="Certificate & Convocation">Certificate & Convocation</option>
              <option value="Fines & Penalties">Fines & Penalties</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Fee Structures Grid */}
        {loading ? (
          <div className="flex items-center justify-center p-12 bg-white rounded-3xl border border-zinc-200">
            <RefreshCw size={24} className="animate-spin text-blue-600 mr-2" />
            <span className="text-sm font-bold text-zinc-500">Loading Exam Fee Configurations...</span>
          </div>
        ) : filteredConfigs.length === 0 ? (
          <div className="text-center p-12 bg-white rounded-3xl border border-zinc-200">
            <ShieldAlert size={36} className="mx-auto text-amber-500 mb-3" />
            <h3 className="text-base font-bold text-slate-800">No Fee Configurations Found</h3>
            <p className="text-xs text-zinc-500 mt-1">Try adjusting search query or filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredConfigs.map((cfg) => (
              <div
                key={cfg.id || cfg.title}
                className="bg-white rounded-3xl border border-zinc-200 shadow-sm hover:shadow-xl transition-all overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="p-5 border-b border-zinc-100 flex items-start justify-between bg-slate-50/50">
                    <div>
                      <span
                        className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider mb-2 ${
                          cfg.category === "Regular Exam"
                            ? "bg-blue-100 text-blue-800"
                            : cfg.category === "Photocopy"
                            ? "bg-amber-100 text-amber-800"
                            : cfg.category === "Review"
                            ? "bg-emerald-100 text-emerald-800"
                            : cfg.category === "Revaluation & Verification"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-teal-100 text-teal-800"
                        }`}
                      >
                        {cfg.category}
                      </span>
                      <h3 className="text-base font-black text-slate-800 leading-tight">{cfg.title}</h3>
                      <p className="text-xs text-zinc-500 mt-1 font-semibold flex items-center gap-2">
                        <GraduationCap size={14} className="text-blue-600" /> {cfg.programme} • {cfg.regulation}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                        cfg.status === "Active" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {cfg.status}
                    </span>
                  </div>

                  {/* Fee Breakdown List */}
                  <div className="p-5 space-y-2.5">
                    {Object.entries(cfg.fees || {}).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between text-xs font-semibold py-1 border-b border-dashed border-zinc-100">
                        <span className="text-zinc-600 capitalize">
                          {key.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase())}
                        </span>
                        <span className="font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">₹{val}</span>
                      </div>
                    ))}

                    {cfg.remarks && (
                      <p className="text-[11px] text-zinc-500 italic mt-3 bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                        "{cfg.remarks}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="p-4 bg-slate-50 border-t border-zinc-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-400">AY: {cfg.academicYear || "2026-2027"}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(cfg)}
                      className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 size={13} /> Edit
                    </button>
                    {cfg.id && (
                      <button
                        onClick={() => handleDelete(cfg.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add / Edit Fee Structure Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl border border-zinc-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
              <div className="bg-[#120c7a] px-6 py-4 flex items-center justify-between text-white">
                <h3 className="font-black text-base flex items-center gap-2">
                  <IndianRupee size={18} className="text-amber-300" />
                  {editingDoc ? "Edit Fee Structure" : "Add Fee Structure"}
                </h3>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveConfig} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">Structure Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Answer Script Photocopy Fee 2026"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">Fee Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="Regular Exam">Regular Exam</option>
                      <option value="Photocopy">Photocopy</option>
                      <option value="Review">Review</option>
                      <option value="Revaluation & Verification">Revaluation & Verification</option>
                      <option value="Certificate & Convocation">Certificate & Convocation</option>
                      <option value="Fines & Penalties">Fines & Penalties</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">Programme</label>
                    <select
                      value={formData.programme}
                      onChange={(e) => setFormData({ ...formData, programme: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="UG">UG</option>
                      <option value="PG">PG</option>
                      <option value="All">All Programmes</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">Regulation</label>
                    <select
                      value={regulations.includes(formData.regulation) ? formData.regulation : (formData.regulation || '')}
                      onChange={(e) => setFormData({ ...formData, regulation: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {formData.regulation && !regulations.includes(formData.regulation) && (
                        <option value={formData.regulation}>{formData.regulation}</option>
                      )}
                      {regulations.length === 0 && !formData.regulation && (
                        <option value="">No regulations found</option>
                      )}
                      {regulations.map((reg) => (
                        <option key={reg} value={reg}>{reg}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-zinc-400 mt-1 font-medium">From Curriculum page regulations</p>
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Dynamic Rates Matrix Input */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag size={14} className="text-blue-600" /> Detailed Rates Breakdown (in ₹)
                  </h4>

                  {formData.category === "Regular Exam" && (
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 mb-2">
                        Course types from <span className="text-zinc-600">{formData.regulation || 'selected regulation'}</span> (Curriculum)
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {regulationCourseTypes.map((ct) => {
                          const feeKey = feeKeyForCourseType(ct);
                          const currentVal = formData.fees?.[feeKey];
                          return (
                            <div key={ct}>
                              <label className="text-[10px] font-bold text-zinc-500 block" title={ct}>{ct} (₹)</label>
                              <input
                                type="number"
                                value={currentVal ?? defaultFeeForKey(feeKey)}
                                onChange={(e) =>
                                  setFormData({ ...formData, fees: { ...formData.fees, [feeKey]: Number(e.target.value) } })
                                }
                                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {formData.category === "Photocopy" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block">Photocopy Fee per Subject (₹)</label>
                        <input
                          type="number"
                          value={formData.fees.photocopyFee || 300}
                          onChange={(e) =>
                            setFormData({ ...formData, fees: { ...formData.fees, photocopyFee: Number(e.target.value) } })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black"
                        />
                      </div>
                    </div>
                  )}

                  {formData.category === "Review" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block">Review Fee per Subject (₹)</label>
                        <input
                          type="number"
                          value={formData.fees.reviewFee || 400}
                          onChange={(e) =>
                            setFormData({ ...formData, fees: { ...formData.fees, reviewFee: Number(e.target.value) } })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black"
                        />
                      </div>
                    </div>
                  )}

                  {formData.category === "Revaluation & Verification" && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block">Script Photocopy (₹)</label>
                        <input
                          type="number"
                          value={formData.fees.photocopyFee || 300}
                          onChange={(e) =>
                            setFormData({ ...formData, fees: { ...formData.fees, photocopyFee: Number(e.target.value) } })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block">Revaluation Fee (₹)</label>
                        <input
                          type="number"
                          value={formData.fees.revaluationFee || 400}
                          onChange={(e) =>
                            setFormData({ ...formData, fees: { ...formData.fees, revaluationFee: Number(e.target.value) } })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block">Re-totalling Fee (₹)</label>
                        <input
                          type="number"
                          value={formData.fees.retotallingFee || 150}
                          onChange={(e) =>
                            setFormData({ ...formData, fees: { ...formData.fees, retotallingFee: Number(e.target.value) } })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black"
                        />
                      </div>
                    </div>
                  )}

                  {formData.category === "Certificate & Convocation" && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block">Grade Sheet (₹)</label>
                        <input
                          type="number"
                          value={formData.fees.gradeSheetFee || 100}
                          onChange={(e) =>
                            setFormData({ ...formData, fees: { ...formData.fees, gradeSheetFee: Number(e.target.value) } })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block">Provisional Cert (₹)</label>
                        <input
                          type="number"
                          value={formData.fees.provisionalCertFee || 500}
                          onChange={(e) =>
                            setFormData({ ...formData, fees: { ...formData.fees, provisionalCertFee: Number(e.target.value) } })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block">Consolidated Cert (₹)</label>
                        <input
                          type="number"
                          value={formData.fees.consolidatedCertFee || 1000}
                          onChange={(e) =>
                            setFormData({ ...formData, fees: { ...formData.fees, consolidatedCertFee: Number(e.target.value) } })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block">Degree Cert (₹)</label>
                        <input
                          type="number"
                          value={formData.fees.degreeCertFee || 1500}
                          onChange={(e) =>
                            setFormData({ ...formData, fees: { ...formData.fees, degreeCertFee: Number(e.target.value) } })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black"
                        />
                      </div>
                    </div>
                  )}

                  {formData.category === "Fines & Penalties" && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block">Late Fine Tier 1 (₹)</label>
                        <input
                          type="number"
                          value={formData.fees.lateFineTier1 || 200}
                          onChange={(e) =>
                            setFormData({ ...formData, fees: { ...formData.fees, lateFineTier1: Number(e.target.value) } })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block">Late Fine Tier 2 (₹)</label>
                        <input
                          type="number"
                          value={formData.fees.lateFineTier2 || 500}
                          onChange={(e) =>
                            setFormData({ ...formData, fees: { ...formData.fees, lateFineTier2: Number(e.target.value) } })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 block">Duplicate Ticket (₹)</label>
                        <input
                          type="number"
                          value={formData.fees.duplicateHallTicket || 150}
                          onChange={(e) =>
                            setFormData({ ...formData, fees: { ...formData.fees, duplicateHallTicket: Number(e.target.value) } })
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-black"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">Remarks / Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Applicable for end semester examination registration"
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="pt-3 flex items-center justify-end gap-3 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-[#120c7a] hover:bg-blue-900 text-white text-xs font-black transition-all flex items-center gap-1.5 shadow-lg cursor-pointer"
                  >
                    <Save size={14} /> Save Structure
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
