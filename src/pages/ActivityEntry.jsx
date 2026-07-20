import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { 
  Award, Clock, Eye, Download, Check, X, Search, Filter, Users, Loader2,
  Settings, Plus, Trash2, Save, BookOpen, ListTodo, Target, ChevronRight, Info,
  GraduationCap, Building2, User, FileText, Calendar, AlertTriangle, CheckCircle2, XCircle, 
  ArrowRight, BarChart3, Upload, Edit, MessageSquare, AlertCircle, Star, Globe, Layers,
  ArrowLeft, Send, RefreshCw
} from "lucide-react";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { ACTIVITY_REGISTRY, ACTIVITY_CATEGORIES } from "../data/activityRegistry";
import { formatProgrammeKey, sanitizeKey, getAcademicYears, formatProgDisplay } from "../lib/utils";

const BASIC_INFO_KEYS = new Set(["programme", "department", "batch", "academicYear", "semester", "section", "date", "submittedBy", "month"]);

const getCategoryFromCode = (code) => {
  if (code.startsWith("A")) return "student";
  if (code.startsWith("B")) return "department";
  if (code.startsWith("C")) return "faculty";
  return "student";
};

export default function ActivityEntry() {
  const { code } = useParams(); // e.g., "A5"
  const navigate = useNavigate();
  
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activityConfig, setActivityConfig] = useState(null);
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [sectionConfigs, setSectionConfigs] = useState({});

  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getActiveBatches } = useBatches(durations);
  const activeBatchesList = useMemo(() => {
    if (!formData.programme) return [];
    const progKey = formatProgrammeKey(formData.programme);
    const allActive = getActiveBatches(progKey);
    if (!formData.department) return allActive;
    const deptKey = sanitizeKey(formData.department);
    const configuredBatches = new Set();
    Object.values(sectionConfigs).forEach(cfg => {
      if (cfg.progKey === progKey && cfg.deptKey === deptKey) {
        configuredBatches.add(cfg.batch);
      }
    });
    if (configuredBatches.size === 0) return allActive;
    return allActive.filter(b => configuredBatches.has(b));
  }, [formData.programme, formData.department, getActiveBatches, sectionConfigs]);

  const availableSections = useMemo(() => {
    const prog = formData.programme;
    const dept = formData.department;
    const batch = formData.batch;
    if (!prog || !dept || !batch) return [];
    const progKey = formatProgrammeKey(prog);
    const deptKey = sanitizeKey(dept);
    const batchKey = sanitizeKey(batch);
    const docId = `${progKey}_${deptKey}_${batchKey}`;

    let cfg = sectionConfigs[docId];

    // Fallback: search through stored field values
    if (!cfg?.numSections) {
      const entry = Object.values(sectionConfigs).find(v =>
        v.batch === batch &&
        v.department === dept &&
        (v.programme === prog || formatProgrammeKey(v.programme) === progKey)
      );
      if (entry) cfg = entry;
    }

    if (!cfg?.numSections) return [];
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from({ length: cfg.numSections }, (_, i) => `Sec-${letters[i]}`);
  }, [formData.programme, formData.department, formData.batch, sectionConfigs]);

  const semesterOptions = useMemo(() => {
    const batch = formData.batch;
    const acYear = formData.academicYear;
    if (!batch || !acYear) return [];
    const batchStart = parseInt(batch.split("-")[0]);
    const acStart = parseInt(acYear.split("-")[0]);
    if (isNaN(batchStart) || isNaN(acStart)) return [];
    const yearNumber = acStart - batchStart + 1;
    if (yearNumber < 1) return [];
    const firstSem = (yearNumber - 1) * 2 + 1;
    return [firstSem, firstSem + 1];
  }, [formData.batch, formData.academicYear]);

  // Multi-row state for activities like A5, A7, A8
  const [rows, setRows] = useState([{}]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            const data = snap.data();
            setCurrentUserData(data);
            // Pre-fill form with user data
            setFormData(prev => ({
              ...prev,
              department: data.department || "",
              programme: data.programme || "",
              submittedBy: data.facultyName || data.studentName || data.displayName || "",
              submittedById: user.uid,
              submittedByRole: data.role || ""
            }));
          }
        } catch (err) {
          console.error("Error loading user profile:", err);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Load batch section configs
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'batch_sections'), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setSectionConfigs(data);
    });
    return () => unsub();
  }, []);

  // Load activity configuration
  useEffect(() => {
    if (code) {
      const config = ACTIVITY_REGISTRY.find(a => a.code === code);
      setActivityConfig(config);
      if (config?.isMultiRow) {
        setRows([{}]); // Start with one empty row
      }
    }
  }, [code]);

  const handleInputChange = (field, value, rowIndex = null) => {
    if (rowIndex !== null) {
      setRows(prev => {
        const newRows = [...prev];
        newRows[rowIndex] = { ...newRows[rowIndex], [field]: value };
        return newRows;
      });
    } else {
      setFormData(prev => {
        const next = { ...prev, [field]: value };
        // Auto-fill month from date
        if ((field === 'date' || field === 'fromDate') && value) {
          const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
          const d = new Date(value);
          if (!isNaN(d)) next.month = monthNames[d.getMonth()];
        }
        return next;
      });
      if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: null }));
      }
    }
  };

  const handleFileChange = (e, field) => {
    const files = Array.from(e.target.files);
    if (files.length > 5) {
      alert("Maximum 5 files allowed");
      return;
    }
    const validFiles = files.filter(f => {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!validTypes.includes(f.type)) {
        alert(`File ${f.name} is not a valid type. Only PDF, JPG, PNG allowed.`);
        return false;
      }
      if (f.size > 10 * 1024 * 1024) {
        alert(`File ${f.name} exceeds 10MB limit.`);
        return false;
      }
      return true;
    });
    setUploadedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const validateForm = () => {
    const newErrors = {};
    const dataToValidate = activityConfig?.isMultiRow ? rows : formData;
    
    if (activityConfig?.isMultiRow) {
      dataToValidate.forEach((row, idx) => {
        activityConfig.fields.forEach(field => {
          if (BASIC_INFO_KEYS.has(field.key)) return;
          if (field.required && !row[field.key]) {
            newErrors[`${field.key}_${idx}`] = `${field.label} is required`;
          }
        });
      });
    } else {
      activityConfig?.fields.forEach(field => {
        if (BASIC_INFO_KEYS.has(field.key)) return;
        if (field.required && !formData[field.key]) {
          newErrors[field.key] = `${field.label} is required`;
        }
      });
    }
    
    // Check evidence files for required activities
    if (activityConfig?.evidenceRequired && uploadedFiles.length === 0) {
      newErrors.evidence = "At least one evidence file is required";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveDraft = async () => {
    if (!activityConfig) return;
    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
        activityCode: code,
        activityName: activityConfig.name,
        category: getCategoryFromCode(code),
        status: "Draft",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        submittedBy: currentUserData?.facultyName || currentUserData?.studentName || currentUserData?.displayName,
        submittedById: auth.currentUser?.uid,
        submittedByRole: currentUserData?.role,
        formData: activityConfig.isMultiRow ? rows : formData,
        evidenceFiles: uploadedFiles.map(f => ({ name: f.name, size: f.size, type: f.type }))
      };

      let docRef;
      if (draftId) {
        docRef = doc(db, "activity_entries", draftId);
        await setDoc(docRef, dataToSave, { merge: true });
      } else {
        docRef = await addDoc(collection(db, "activity_entries"), dataToSave);
        setDraftId(docRef.id);
      }
      alert("Draft saved successfully!");
    } catch (err) {
      console.error("Error saving draft:", err);
      alert("Failed to save draft.");
    } finally {
      setSaving(false);
    }
  };

  const submitForApproval = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
        activityCode: code,
        activityName: activityConfig.name,
        category: getCategoryFromCode(code),
        status: "Pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        submittedBy: currentUserData?.facultyName || currentUserData?.studentName || currentUserData?.displayName,
        submittedById: auth.currentUser?.uid,
        submittedByRole: currentUserData?.role,
        formData: activityConfig.isMultiRow ? rows : formData,
        evidenceFiles: uploadedFiles.map(f => ({ name: f.name, size: f.size, type: f.type }))
      };

      let docRef;
      if (draftId) {
        docRef = doc(db, "activity_entries", draftId);
        await setDoc(docRef, dataToSave, { merge: true });
      } else {
        docRef = await addDoc(collection(db, "activity_entries"), dataToSave);
      }
      
      // Create notification for HOD
      if (currentUserData?.department) {
        await addDoc(collection(db, "notifications"), {
          type: "activity_submitted",
          activityId: docRef.id || draftId,
          activityCode: code,
          activityName: activityConfig.name,
          department: currentUserData.department,
          submittedBy: currentUserData.facultyName || currentUserData.studentName,
          submittedById: auth.currentUser?.uid,
          createdAt: serverTimestamp(),
          read: false
        });
      }
      
      setSubmitted(true);
      alert("Activity submitted for approval successfully!");
      navigate("/activities");
    } catch (err) {
      console.error("Error submitting:", err);
      alert("Failed to submit. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const addRow = () => {
    setRows(prev => [...prev, {}]);
  };

  const removeRow = (index) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <Layout title="New Activity Entry">
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="animate-spin text-[#120c7a]" size={40} />
        </div>
      </Layout>
    );
  }

  if (!activityConfig) {
    return (
      <Layout title="New Activity Entry">
        <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-zinc-100 p-8 shadow-sm text-center">
          <AlertTriangle className="text-amber-500 mx-auto mb-4" size={48} />
          <h2 className="text-lg font-black text-zinc-800">Activity Not Found</h2>
          <p className="text-xs text-zinc-400 font-medium mt-1">The activity code "{code}" does not exist in the registry.</p>
          <button onClick={() => navigate("/activities/new")} className="mt-4 px-4 py-2 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-[#120c7a]/90">
            Back to New Activity
          </button>
        </div>
      </Layout>
    );
  }

  const categoryInfo = ACTIVITY_CATEGORIES[getCategoryFromCode(code)];

  return (
    <Layout title={`New ${activityConfig.name}`}>
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#120c7a] to-[#0e0a5c] rounded-3xl p-6 md:p-8 text-white mb-8 shadow-xl flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
              <Award size={28} className="text-yellow-400" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">New Entry</span>
              <h1 className="text-xl md:text-2xl font-extrabold tracking-tight mt-0.5">{activityConfig.name}</h1>
              <p className="text-blue-100 text-xs mt-1">
                {activityConfig.description} • NBA: {activityConfig.nbaCriterion} • NAAC: {activityConfig.naacCriterion}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${categoryInfo.color} text-white`}>
              {categoryInfo.label}
            </span>
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
              Part {activityConfig.part}
            </span>
          </div>
        </div>

        {submitted && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2">
            <CheckCircle2 size={20} className="text-emerald-600" />
            <div>
              <p className="text-sm font-bold text-emerald-800">Submitted Successfully!</p>
              <p className="text-xs text-emerald-600">Your activity has been submitted for HOD approval. You'll be notified once reviewed.</p>
            </div>
            <button onClick={() => navigate("/activities")} className="ml-auto px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700">
              View All Activities
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={e => { e.preventDefault(); submitForApproval(); }}>
          {/* Basic Info Section */}
          <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Info size={18} className="text-[#120c7a]" />
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider">Basic Information</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Programme <span className="text-red-500">*</span></label>
                <select
                  value={formData.programme}
                  onChange={e => handleInputChange('programme', e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                  required
                >
                  <option value="">Select Programme</option>
                  {Object.keys(PROGRAMME_DEPARTMENTS).sort().map(p => (
                    <option key={p} value={formatProgDisplay(p)}>{formatProgDisplay(p)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Department <span className="text-red-500">*</span></label>
                <select
                  value={formData.department}
                  onChange={e => handleInputChange('department', e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                  disabled={!formData.programme}
                  required
                >
                  <option value="">{formData.programme ? "Select Department" : "Select Programme first"}</option>
                  {formData.programme && (PROGRAMME_DEPARTMENTS[formatProgrammeKey(formData.programme)] || []).sort().map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {errors.department && <p className="text-[10px] text-red-500 mt-1">{errors.department}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Batch <span className="text-red-500">*</span></label>
                <select
                  value={formData.batch}
                  onChange={e => handleInputChange('batch', e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                  disabled={!formData.programme}
                  required
                >
                  <option value="">{formData.programme ? "Select Batch" : "Select Programme first"}</option>
                  {activeBatchesList.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                {errors.batch && <p className="text-[10px] text-red-500 mt-1">{errors.batch}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Academic Year <span className="text-red-500">*</span></label>
                <select
                  value={formData.academicYear}
                  onChange={e => handleInputChange('academicYear', e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                  disabled={!formData.batch}
                  required
                >
                  <option value="">{formData.batch ? "Select Academic Year" : "Select Batch first"}</option>
                  {formData.batch && getAcademicYears(formData.batch).map(ay => (
                    <option key={ay} value={ay}>{ay}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Semester <span className="text-red-500">*</span></label>
                <select
                  value={formData.semester}
                  onChange={e => handleInputChange('semester', e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                  disabled={!formData.batch || !formData.academicYear || semesterOptions.length === 0}
                  required
                >
                  <option value="">{!formData.batch || !formData.academicYear ? "Select Batch & Academic Year first" : "Select Semester"}</option>
                  {semesterOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Section</label>
                <select
                  value={formData.section}
                  onChange={e => handleInputChange('section', e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                  disabled={!formData.programme || !formData.department || !formData.batch || availableSections.length === 0}
                >
                  <option value="">{availableSections.length === 0 && formData.programme && formData.department && formData.batch ? "No sections configured" : "Select Section"}</option>
                  {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={formData.date || formData.fromDate || ""}
                  onChange={e => handleInputChange(activityConfig.isMultiRow ? 'fromDate' : 'date', e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Submitted By</label>
                <input
                  type="text"
                  value={formData.submittedBy || ""}
                  onChange={e => handleInputChange('submittedBy', e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                  readOnly
                />
              </div>
            </div>
          </div>

          {/* Dynamic Activity Fields */}
          <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={18} className="text-[#120c7a]" />
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider">Activity Details</h3>
            </div>

            {activityConfig.isMultiRow ? (
              <div className="space-y-4">
                {rows.map((row, idx) => (
                  <div key={idx} className="border border-zinc-200 rounded-2xl p-4 bg-zinc-50/50 relative">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Entry #{idx + 1}</span>
                      {rows.length > 1 && (
                        <button type="button" onClick={() => removeRow(idx)} className="text-rose-500 hover:text-rose-700 text-xs font-bold">
                          <Trash2 size={14} /> Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activityConfig.fields.filter(f => !BASIC_INFO_KEYS.has(f.key)).map(field => (
                        <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                            {field.label} {field.required && <span className="text-red-500">*</span>}
                          </label>
                          {field.type === 'select' ? (
                            <select
                              value={row[field.key] || ""}
                              onChange={e => handleInputChange(field.key, e.target.value, idx)}
                              className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a]"
                              required={field.required}
                            >
                              <option value="">Select</option>
                              {field.options?.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : field.type === 'textarea' ? (
                            <textarea
                              value={row[field.key] || ""}
                              onChange={e => handleInputChange(field.key, e.target.value, idx)}
                              rows={3}
                              className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a]"
                              placeholder={field.placeholder || ""}
                              required={field.required}
                            />
                          ) : (
                            <input
                              type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
                              value={row[field.key] || ""}
                              onChange={e => handleInputChange(field.key, e.target.value, idx)}
                              className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a]"
                              placeholder={field.placeholder || ""}
                              required={field.required}
                            />
                          )}
                          {errors[`${field.key}_${idx}`] && <p className="text-[10px] text-red-500 mt-1">{errors[`${field.key}_${idx}`]}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addRow} className="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-[#0d075a] text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer">
                  <Plus size={12} /> Add Another Entry
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activityConfig.fields.filter(f => f.key !== 'evidence' && !BASIC_INFO_KEYS.has(f.key)).map(field => (
                  <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>
                    {field.type === 'select' ? (
                      <select
                        value={formData[field.key] || ""}
                        onChange={e => handleInputChange(field.key, e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                        required={field.required}
                      >
                        <option value="">Select</option>
                        {field.options?.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        value={formData[field.key] || ""}
                        onChange={e => handleInputChange(field.key, e.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                        placeholder={field.placeholder || ""}
                        required={field.required}
                      />
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
                        value={formData[field.key] || ""}
                        onChange={e => handleInputChange(field.key, e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                        placeholder={field.placeholder || ""}
                        required={field.required}
                      />
                    )}
                    {errors[field.key] && <p className="text-[10px] text-red-500 mt-1">{errors[field.key]}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Evidence Upload */}
            {activityConfig.evidenceRequired && (
              <div className="mt-6 pt-6 border-t border-zinc-100">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">
                  Supporting Evidence (PDF/JPG/PNG, Max 10MB each, Max 5 files) <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-6 text-center hover:border-[#120c7a] hover:bg-[#120c7a]/5 transition-all cursor-pointer">
                  <Upload size={24} className="mx-auto text-zinc-400 mb-2" />
                  <p className="text-xs text-zinc-500 font-medium">Drag & drop files here, or click to browse</p>
                  <p className="text-[9px] text-zinc-400 mt-1">Accepted: PDF, JPG, PNG • Max 10MB per file • Max 5 files</p>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    multiple
                    onChange={e => handleFileChange(e, 'evidence')}
                    className="hidden"
                    id="evidence-upload"
                  />
                  <button type="button" onClick={() => document.getElementById('evidence-upload').click()} className="mt-3 px-4 py-1.5 bg-[#120c7a] hover:bg-[#120c7a]/90 text-white text-xs font-bold rounded-lg cursor-pointer">
                    Browse Files
                  </button>
                </div>
                {uploadedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Attached Files:</p>
                    {uploadedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-zinc-50 rounded-xl border border-zinc-100">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-blue-500" />
                          <span className="text-xs font-medium text-zinc-700 truncate max-w-xs">{file.name}</span>
                          <span className="text-[9px] text-zinc-400">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <button type="button" onClick={() => removeFile(idx)} className="text-rose-500 hover:text-rose-700 p-1">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {errors.evidence && <p className="text-[10px] text-red-500 mt-1">{errors.evidence}</p>}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-4">
            <button type="button" onClick={() => navigate("/activities/new")} className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1">
              <ArrowLeft size={14} /> Back to New Activity
            </button>
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={saveDraft} disabled={saving} className="px-5 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50">
                <Save size={14} /> {draftId ? "Update Draft" : "Save as Draft"}
              </button>
              <button type="submit" disabled={saving} className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-extrabold rounded-xl shadow-md hover:from-emerald-600 hover:to-teal-700 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Submit for Approval
              </button>
            </div>
          </div>
        </form>
      </div>
    </Layout>
  );
}