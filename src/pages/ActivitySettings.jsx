import React, { useState, useEffect, useMemo } from "react";
import { 
  Plus, Search, Edit3, Trash2, CheckCircle2, AlertCircle, 
  Layers, Settings2, Sliders, Type, Hash, Calendar, FileText, 
  Upload, Link as LinkIcon, List, Eye, Sparkles, X, ChevronRight,
  HelpCircle, ShieldCheck, CheckSquare, Square, CornerDownRight, ArrowUp, ArrowDown
} from "lucide-react";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import Layout from "../components/Layout";
import { ACTIVITY_REGISTRY, ACTIVITY_CATEGORIES } from "../data/activityRegistry";
import useUnsavedChanges from "../hooks/useUnsavedChanges";

const FIELD_TYPES = [
  { type: "text", label: "Short Text", icon: Type, desc: "Single line text input" },
  { type: "number", label: "Number", icon: Hash, desc: "Numeric count, cost, or rating" },
  { type: "date", label: "Date Picker", icon: Calendar, desc: "Date selection input" },
  { type: "select", label: "Dropdown Select", icon: List, desc: "Single choice from options" },
  { type: "textarea", label: "Long Text", icon: FileText, desc: "Multi-line text area" },
  { type: "file", label: "File Attachment", icon: Upload, desc: "PDF, image, or doc file upload" },
  { type: "url", label: "Web Link / URL", icon: LinkIcon, desc: "External website or document link" },
];

const DEFAULT_FIELD = {
  key: "",
  label: "",
  type: "text",
  required: false,
  options: "",
  accept: "pdf,jpg,png",
  maxFiles: 3,
  placeholder: ""
};

export default function ActivitySettings() {
  const [customActivities, setCustomActivities] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all"); // "all", "department", "faculty"

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState(null); // null = new, string = editing

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("department");
  const [part, setPart] = useState("B");
  const [frequency, setFrequency] = useState("monthly");
  const [nbaCriterion, setNbaCriterion] = useState("");
  const [naacCriterion, setNaacCriterion] = useState("");
  const [description, setDescription] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [evidenceRequired, setEvidenceRequired] = useState(true);
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [fields, setFields] = useState([]);

  // Warn on accidental reload/close while editing activity in modal
  useUnsavedChanges(modalOpen && (!!name || fields.length > 0));

  // Toast / Feedback State
  const [feedback, setFeedback] = useState(null);

  // Real-time listener for custom activities in Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "custom_activities"), (snap) => {
      const data = {};
      snap.forEach(d => {
        data[d.id] = { code: d.id, ...d.data() };
      });
      setCustomActivities(data);
      setLoading(false);
    }, (err) => {
      console.error("Failed to load custom activities:", err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Combined list of Preset + Custom activities
  const allActivities = useMemo(() => {
    const map = new Map();
    // 1. Built-in presets
    ACTIVITY_REGISTRY.forEach(item => {
      map.set(item.code, { ...item, isPreset: true });
    });
    // 2. Custom overrides / additions
    Object.values(customActivities).forEach(item => {
      map.set(item.code, { ...item, isCustom: true });
    });
    return Array.from(map.values());
  }, [customActivities]);

  // Filtered Activities
  const filteredActivities = useMemo(() => {
    return allActivities.filter(a => {
      const matchCat = activeCategory === "all" || a.category === activeCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch = !q || (
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q)
      );
      return matchCat && matchSearch;
    });
  }, [allActivities, activeCategory, searchQuery]);

  const showToast = (msg, type = "success") => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleOpenNewModal = () => {
    // Generate next available code e.g. B25 or C10
    const existingCodes = new Set(allActivities.map(a => a.code));
    let nextNum = 1;
    let nextCode = `ACT${String(nextNum).padStart(2, "0")}`;
    while (existingCodes.has(nextCode)) {
      nextNum++;
      nextCode = `ACT${String(nextNum).padStart(2, "0")}`;
    }

    setEditingCode(null);
    setCode(nextCode);
    setName("");
    setCategory("department");
    setPart("B");
    setFrequency("monthly");
    setNbaCriterion("");
    setNaacCriterion("");
    setDescription("");
    setMandatory(false);
    setEvidenceRequired(true);
    setApprovalRequired(true);
    setFields([
      { key: "title", label: "Activity Title / Topic", type: "text", required: true, placeholder: "e.g., Guest Lecture on AI Trends" },
      { key: "date", label: "Event Date", type: "date", required: true },
      { key: "evidence", label: "Evidence File (Report / Certificate)", type: "file", required: true, accept: "pdf,jpg,png", maxFiles: 3 }
    ]);
    setModalOpen(true);
  };

  const handleOpenEditModal = (act) => {
    setEditingCode(act.code);
    setCode(act.code);
    setName(act.name || "");
    setCategory(act.category || "department");
    setPart(act.part || "B");
    setFrequency(act.frequency || "monthly");
    setNbaCriterion(act.nbaCriterion || "");
    setNaacCriterion(act.naacCriterion || "");
    setDescription(act.description || "");
    setMandatory(!!act.mandatory);
    setEvidenceRequired(act.evidenceRequired !== false);
    setApprovalRequired(act.approvalRequired !== false);
    setFields(Array.isArray(act.fields) ? act.fields.map(f => ({ ...DEFAULT_FIELD, ...f })) : []);
    setModalOpen(true);
  };

  const handleAddField = () => {
    const newIdx = fields.length + 1;
    setFields(prev => [
      ...prev,
      {
        ...DEFAULT_FIELD,
        key: `field_${Date.now()}`,
        label: `New Field ${newIdx}`,
        type: "text",
        required: false
      }
    ]);
  };

  const handleUpdateField = (index, delta) => {
    setFields(prev => {
      const next = [...prev];
      const updated = { ...next[index], ...delta };
      // Auto-generate key slug if label changes and key was default
      if (delta.label !== undefined && (!updated.key || updated.key.startsWith("field_"))) {
        const slug = delta.label.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "");
        if (slug) updated.key = slug;
      }
      next[index] = updated;
      return next;
    });
  };

  const handleRemoveField = (index) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  };

  const handleMoveField = (index, direction) => {
    setFields(prev => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleSaveActivity = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      showToast("Activity Code is required", "error");
      return;
    }
    if (!name.trim()) {
      showToast("Activity Name is required", "error");
      return;
    }
    if (fields.length === 0) {
      showToast("At least one field is required", "error");
      return;
    }

    // Clean up fields array
    const cleanedFields = fields.map((f, idx) => {
      const cleanKey = f.key ? f.key.trim() : `field_${idx + 1}`;
      const cleanLabel = f.label ? f.label.trim() : `Field ${idx + 1}`;
      let opts = [];
      if (f.type === "select" && typeof f.options === "string") {
        opts = f.options.split(",").map(s => s.trim()).filter(Boolean);
      } else if (f.type === "select" && Array.isArray(f.options)) {
        opts = f.options;
      }

      return {
        key: cleanKey,
        label: cleanLabel,
        type: f.type || "text",
        required: !!f.required,
        placeholder: f.placeholder || "",
        ...(f.type === "select" ? { options: opts } : {}),
        ...(f.type === "file" ? { accept: f.accept || "pdf,jpg,png", maxFiles: parseInt(f.maxFiles, 10) || 3 } : {})
      };
    });

    const payload = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      category,
      part,
      frequency,
      nbaCriterion: nbaCriterion.trim(),
      naacCriterion: naacCriterion.trim(),
      description: description.trim(),
      mandatory,
      evidenceRequired,
      approvalRequired,
      fields: cleanedFields,
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, "custom_activities", payload.code), payload);
      showToast(`Activity ${payload.code} saved successfully!`);
      setModalOpen(false);
    } catch (err) {
      console.error("Save Activity Error:", err);
      showToast("Failed to save activity: " + err.message, "error");
    }
  };

  const handleDeleteActivity = async (activityCode) => {
    if (!window.confirm(`Are you sure you want to delete custom activity "${activityCode}"?`)) return;
    try {
      await deleteDoc(doc(db, "custom_activities", activityCode));
      showToast(`Activity ${activityCode} deleted successfully`);
    } catch (err) {
      console.error("Delete Error:", err);
      showToast("Failed to delete activity", "error");
    }
  };

  return (
    <Layout title="Activity Settings & Field Customizer">
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        
        {/* Toast Feedback */}
        {feedback && (
          <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center gap-3 transition-all animate-bounce ${
            feedback.type === "error" 
              ? "bg-red-900/90 border-red-500/50 text-red-100" 
              : "bg-emerald-900/90 border-emerald-500/50 text-emerald-100"
          }`}>
            {feedback.type === "error" ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            <span className="text-sm font-semibold">{feedback.msg}</span>
          </div>
        )}

        {/* Header Bar */}
        <div className="bg-gradient-to-r from-[#120c7a] via-indigo-900 to-purple-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
            <Sliders size={280} />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-semibold uppercase tracking-wider backdrop-blur-md">
                <Settings2 size={14} /> Activity Configuration Module
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                Activity Settings & Dynamic Fields
              </h1>
              <p className="text-indigo-200 text-xs md:text-sm max-w-2xl">
                Configure activity types, define dynamic fields per activity, set mandatory rules, and customize evidence requirements across Department & Faculty categories.
              </p>
            </div>
            <button
              onClick={handleOpenNewModal}
              className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-white text-[#120c7a] font-bold rounded-2xl hover:bg-indigo-50 shadow-lg hover:shadow-xl transition-all active:scale-95 shrink-0"
            >
              <Plus size={18} />
              <span>Create New Activity</span>
            </button>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-xl w-full sm:w-auto">
            {[
              { id: "all", label: "All Activities" },
              { id: "department", label: "Department" },
              { id: "faculty", label: "Faculty" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeCategory === tab.id
                    ? "bg-white text-[#120c7a] shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input
              type="text"
              placeholder="Search code, name or field..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 bg-zinc-50/50 text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
            />
          </div>
        </div>

        {/* Activities Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-zinc-200/80 rounded-3xl space-y-4">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-semibold text-zinc-400">Loading activity configurations...</p>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white border border-zinc-200/80 rounded-3xl text-center p-6 space-y-3">
            <div className="p-4 rounded-2xl bg-indigo-50 text-indigo-600">
              <Layers size={32} />
            </div>
            <h3 className="text-base font-bold text-zinc-800">No Activities Found</h3>
            <p className="text-xs text-zinc-400 max-w-sm">
              No activity types match your current search or category filter. Try clearing filters or create a new activity.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredActivities.map(a => {
              const catInfo = ACTIVITY_CATEGORIES[a.category] || {};
              return (
                <div
                  key={a.code}
                  className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 relative group"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${catInfo.color || "from-indigo-600 to-purple-600"} text-white font-black text-sm flex items-center justify-center shadow-md shrink-0`}>
                          {a.code}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-zinc-900 line-clamp-1">{a.name}</span>
                          </div>
                          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                            {a.category} • Part {a.part}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditModal(a)}
                          className="p-2 rounded-xl text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                          title="Edit Activity & Fields"
                        >
                          <Edit3 size={15} />
                        </button>
                        {a.isCustom && (
                          <button
                            onClick={() => handleDeleteActivity(a.code)}
                            className="p-2 rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-all"
                            title="Delete Activity"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    {a.description && (
                      <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                        {a.description}
                      </p>
                    )}

                    {/* Dynamic Fields Pill list */}
                    <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                      <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider block">
                        Configured Fields ({a.fields?.length || 0})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {a.fields && a.fields.slice(0, 5).map((f, i) => (
                          <span 
                            key={i} 
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                              f.required 
                                ? "bg-amber-50 text-amber-700 border-amber-200/60" 
                                : "bg-zinc-50 text-zinc-600 border-zinc-200/60"
                            }`}
                          >
                            {f.label || f.key}
                            {f.required && <span className="text-amber-600 text-xs font-bold">*</span>}
                          </span>
                        ))}
                        {a.fields?.length > 5 && (
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                            +{a.fields.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Badges Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-zinc-100 text-[10px]">
                    <div className="flex items-center gap-2">
                      <span className={`font-extrabold uppercase px-2 py-0.5 rounded-md ${
                        a.mandatory ? "bg-red-50 text-red-700 border border-red-200/60" : "bg-zinc-100 text-zinc-500"
                      }`}>
                        {a.mandatory ? "Mandatory" : "Optional"}
                      </span>
                      {a.evidenceRequired && (
                        <span className="font-extrabold uppercase bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200/60">
                          Evidence
                        </span>
                      )}
                    </div>
                    {a.isCustom ? (
                      <span className="font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200/60">
                        Custom Activity
                      </span>
                    ) : (
                      <span className="font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-md">
                        Preset
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Activity Edit / Create Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl border border-zinc-200 w-full max-w-4xl max-h-[90vh] flex flex-col my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              
              {/* Modal Header */}
              <div className="px-6 py-5 bg-gradient-to-r from-[#120c7a] to-indigo-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-white/10 border border-white/20">
                    <Sliders size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">
                      {editingCode ? `Edit Activity Configuration (${code})` : "Create Custom Activity"}
                    </h2>
                    <p className="text-xs text-indigo-200">
                      Define activity metadata, rules, and dynamic mandatory fields.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSaveActivity} className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* 1. Basic Metadata Section */}
                <div className="space-y-4 bg-zinc-50/70 border border-zinc-200/80 p-5 rounded-2xl">
                  <h3 className="text-xs font-black text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                    <Layers size={14} className="text-indigo-600" /> Basic Information
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">
                        Activity Code <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={code}
                        onChange={e => setCode(e.target.value.toUpperCase())}
                        disabled={!!editingCode}
                        placeholder="e.g., B25"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-xs font-black uppercase focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-zinc-100 disabled:text-zinc-500"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-zinc-700 mb-1">
                        Activity Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g., Guest Lecture / Industry Workshop"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">Category</label>
                      <select
                        value={category}
                        onChange={e => setCategory(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="department">Department</option>
                        <option value="faculty">Faculty</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">Part</label>
                      <select
                        value={part}
                        onChange={e => setPart(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="A">Part A</option>
                        <option value="B">Part B</option>
                        <option value="C">Part C</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">Frequency</label>
                      <select
                        value={frequency}
                        onChange={e => setFrequency(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="semester">Semester</option>
                        <option value="yearly">Yearly</option>
                        <option value="on-demand">On-Demand / Event</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">NBA Criterion (Optional)</label>
                      <input
                        type="text"
                        value={nbaCriterion}
                        onChange={e => setNbaCriterion(e.target.value)}
                        placeholder="e.g., C9.6.1"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 mb-1">NAAC Criterion (Optional)</label>
                      <input
                        type="text"
                        value={naacCriterion}
                        onChange={e => setNaacCriterion(e.target.value)}
                        placeholder="e.g., 6.1.1"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Description</label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={2}
                      placeholder="Describe what this activity records and its purpose..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  {/* Rules Toggles */}
                  <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-zinc-200">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-zinc-700">
                      <input
                        type="checkbox"
                        checked={mandatory}
                        onChange={e => setMandatory(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Activity is Mandatory</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-zinc-700">
                      <input
                        type="checkbox"
                        checked={evidenceRequired}
                        onChange={e => setEvidenceRequired(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Require Evidence Documents</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-zinc-700">
                      <input
                        type="checkbox"
                        checked={approvalRequired}
                        onChange={e => setApprovalRequired(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Require HOD Approval</span>
                    </label>
                  </div>
                </div>

                {/* 2. Dynamic Field Builder Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black text-zinc-700 uppercase tracking-wider flex items-center gap-2">
                        <Sliders size={14} className="text-indigo-600" /> Dynamic Form Fields & Mandatory Configuration
                      </h3>
                      <p className="text-[11px] text-zinc-400 font-medium">
                        Configure the exact fields users will fill out when logging this activity.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddField}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-xl text-xs hover:bg-indigo-100 transition-all border border-indigo-200"
                    >
                      <Plus size={14} /> Add Custom Field
                    </button>
                  </div>

                  <div className="space-y-3">
                    {fields.length === 0 ? (
                      <div className="p-8 text-center bg-zinc-50 border border-dashed border-zinc-300 rounded-2xl space-y-2">
                        <p className="text-xs font-bold text-zinc-500">No fields added yet</p>
                        <p className="text-[11px] text-zinc-400">Click "Add Custom Field" to build the form layout for this activity.</p>
                      </div>
                    ) : (
                      fields.map((f, idx) => (
                        <div 
                          key={idx} 
                          className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm hover:border-indigo-300 transition-all space-y-3 relative group"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-lg bg-zinc-100 text-zinc-600 font-black text-[10px] flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <input
                                type="text"
                                value={f.label}
                                onChange={e => handleUpdateField(idx, { label: e.target.value })}
                                placeholder="Field Label (e.g. Guest Speaker Name)"
                                className="px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none w-60 md:w-72"
                              />
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Reorder Buttons */}
                              <button
                                type="button"
                                onClick={() => handleMoveField(idx, -1)}
                                disabled={idx === 0}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveField(idx, 1)}
                                disabled={idx === fields.length - 1}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                              >
                                <ArrowDown size={14} />
                              </button>

                              {/* Mandatory Checkbox Toggle */}
                              <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-extrabold cursor-pointer transition-all ${
                                f.required 
                                  ? "bg-amber-50 border-amber-300 text-amber-700 shadow-sm" 
                                  : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100"
                              }`}>
                                <input
                                  type="checkbox"
                                  checked={!!f.required}
                                  onChange={e => handleUpdateField(idx, { required: e.target.checked })}
                                  className="hidden"
                                />
                                {f.required ? <CheckSquare size={14} /> : <Square size={14} />}
                                <span>{f.required ? "Mandatory Field *" : "Optional"}</span>
                              </label>

                              {/* Delete Field */}
                              <button
                                type="button"
                                onClick={() => handleRemoveField(idx)}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Field Configuration Inputs */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-100 text-xs">
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Field Type</label>
                              <select
                                value={f.type}
                                onChange={e => handleUpdateField(idx, { type: e.target.value })}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 font-bold outline-none"
                              >
                                {FIELD_TYPES.map(ft => (
                                  <option key={ft.type} value={ft.type}>{ft.label}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Field Key Slug</label>
                              <input
                                type="text"
                                value={f.key}
                                onChange={e => handleUpdateField(idx, { key: e.target.value })}
                                placeholder="e.g. speaker_name"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 font-mono text-[11px] outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Placeholder Hint</label>
                              <input
                                type="text"
                                value={f.placeholder || ""}
                                onChange={e => handleUpdateField(idx, { placeholder: e.target.value })}
                                placeholder="e.g. Enter full speaker name..."
                                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 outline-none"
                              />
                            </div>
                          </div>

                          {/* Dropdown Options Input if Select */}
                          {f.type === "select" && (
                            <div className="pt-2">
                              <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1">
                                Dropdown Options (Comma-Separated) <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={Array.isArray(f.options) ? f.options.join(", ") : (f.options || "")}
                                onChange={e => handleUpdateField(idx, { options: e.target.value })}
                                placeholder="e.g., Purchase, Service, Repair, Calibration"
                                className="w-full px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50/50 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                          )}

                          {/* File Restrictions if File */}
                          {f.type === "file" && (
                            <div className="grid grid-cols-2 gap-3 pt-2">
                              <div>
                                <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1">Allowed Formats</label>
                                <input
                                  type="text"
                                  value={f.accept || "pdf,jpg,png"}
                                  onChange={e => handleUpdateField(idx, { accept: e.target.value })}
                                  placeholder="pdf,jpg,png"
                                  className="w-full px-3 py-1 rounded-xl border border-indigo-200 bg-indigo-50/50 text-xs outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1">Max Upload Files</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={f.maxFiles || 3}
                                  onChange={e => handleUpdateField(idx, { maxFiles: e.target.value })}
                                  className="w-full px-3 py-1 rounded-xl border border-indigo-200 bg-indigo-50/50 text-xs outline-none"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Modal Footer Controls */}
                <div className="pt-4 border-t border-zinc-200 flex items-center justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 transition-all active:scale-95 flex items-center gap-2"
                  >
                    <CheckCircle2 size={16} />
                    <span>Save Activity Configuration</span>
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
