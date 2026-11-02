import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../firebase";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import HRLayout from "../components/HRLayout";
import { uploadFile, userStoragePath } from "../utils/fileUpload";
import { checkAppraisalPortalStatus, getSchoolBannerTitle, getSchoolShortName } from "../utils/appraisalScore";
import {
  Crown,
  Briefcase,
  FileText,
  Save,
  Send,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Calendar,
  User,
  Building2,
  GraduationCap,
  Award,
  ShieldCheck,
  ChevronRight,
  Loader2,
  Trash2,
  ExternalLink,
  Info
} from "lucide-react";

export default function PrincipalAppraisal() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [appraisalSchedule, setAppraisalSchedule] = useState(null);
  const [isPortalOpen, setIsPortalOpen] = useState(true);
  const [checkingSchedule, setCheckingSchedule] = useState(true);
  const [existingAppraisal, setExistingAppraisal] = useState(null);

  // Academic Year State
  const [academicYear, setAcademicYear] = useState("2024-2025");

  // Form State: strictly focused on Principal Details (Q1-Q6) & Roles & Responsibilities (Q7)
  const [formData, setFormData] = useState({
    // Principal Details (Q1-Q6)
    name: "",
    dob: "",
    age: "",
    designation: "Principal",
    department: "Administration / Institutional Governance",
    institution: "",
    dojCollege: "",
    dojPresentPost: "",
    qualification: "",
    expCKCET: "",
    expOther: "",
    expIndustrial: "",

    // Roles & Responsibilities (Q7)
    rolesResponsibilities: "",
    rolesEvidenceUrl: "",
    rolesEvidenceName: "",

    // Certification
    certified: false,
    dateSubmitted: new Date().toISOString().split("T")[0]
  });

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  // Auth & Profile Listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUserProfile(data);
            setFormData((prev) => ({
              ...prev,
              name: prev.name || data.displayName || data.name || user.displayName || "",
              designation: prev.designation || data.designation || "Principal",
              department: prev.department || data.department || "Administration / Institutional Governance",
              institution: data.institution || prev.institution || "CKCET",
              dojCollege: prev.dojCollege || data.doj || data.dojCollege || "",
              dojPresentPost: prev.dojPresentPost || data.dojPresentPost || "",
              qualification: prev.qualification || data.qualification || "",
              dob: prev.dob || data.dob || ""
            }));

            if (data.dob && !formData.age) {
              handleDobChange(data.dob);
            }
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubAuth();
  }, []);

  // Fetch Appraisal Settings & Active Schedule
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "appraisal_config", "schedule"), (snap) => {
      if (snap.exists()) {
        const sched = snap.data();
        setAppraisalSchedule(sched);
        if (sched.academicYear) {
          setAcademicYear(sched.academicYear);
        }
        const { isOpen } = checkAppraisalPortalStatus(sched);
        setIsPortalOpen(isOpen);
      } else {
        setIsPortalOpen(true);
      }
      setCheckingSchedule(false);
    });
    return () => unsub();
  }, []);

  // Fetch Existing Principal Appraisal Document
  useEffect(() => {
    if (!currentUser || !academicYear) return;
    const docId = `${currentUser.uid}_${academicYear.replace(/[^a-zA-Z0-9]/g, "_")}_principal`;

    const unsub = onSnapshot(doc(db, "principal_appraisals", docId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setExistingAppraisal(data);
        if (data.formData) {
          setFormData((prev) => ({
            ...prev,
            ...data.formData
          }));
        }
      } else {
        setExistingAppraisal(null);
      }
    });
    return () => unsub();
  }, [currentUser, academicYear]);

  // Calculate Age automatically from DOB
  const handleDobChange = (dobVal) => {
    let calculatedAge = "";
    if (dobVal) {
      const birthDate = new Date(dobVal);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      calculatedAge = age > 0 ? String(age) : "";
    }
    setFormData((prev) => ({ ...prev, dob: dobVal, age: calculatedAge }));
  };

  // Upload Evidence File for Q7 Roles & Responsibilities (Max 100 KB)
  const [uploadingRoleDoc, setUploadingRoleDoc] = useState(false);
  const handleFileUpload = async (file) => {
    if (!file || !currentUser) return;
    if (file.size > 100 * 1024) {
      showToast(`File size is ${(file.size / 1024).toFixed(1)} KB, which exceeds the limit of 100 KB.`, "error");
      return;
    }
    setUploadingRoleDoc(true);
    try {
      const path = userStoragePath(currentUser.uid, "principal_roles", file.name);
      const fileUrl = await uploadFile(path, file, file.type);
      setFormData((prev) => ({
        ...prev,
        rolesEvidenceUrl: fileUrl,
        rolesEvidenceName: file.name
      }));
      showToast("Roles & Responsibilities document attached successfully!", "success");
    } catch (err) {
      console.error("Upload error:", err);
      showToast("Failed to upload file: " + err.message, "error");
    } finally {
      setUploadingRoleDoc(false);
    }
  };

  // Save / Submit Appraisal
  const handleSave = async (isSubmit = false) => {
    if (!currentUser) {
      showToast("Please login to submit appraisal.", "error");
      return;
    }

    if (isSubmit) {
      if (!formData.name?.trim()) {
        showToast("Please enter Principal Name.", "error");
        return;
      }
      if (!formData.rolesResponsibilities?.trim()) {
        showToast("Please describe Roles & Responsibilities carried out during the academic year.", "error");
        return;
      }
      if (!formData.certified) {
        showToast("Please check the declaration confirmation before submitting.", "error");
        return;
      }
    }

    if (isSubmit) setSubmitting(true);
    else setSaving(true);

    try {
      const docId = `${currentUser.uid}_${academicYear.replace(/[^a-zA-Z0-9]/g, "_")}_principal`;
      const docRef = doc(db, "principal_appraisals", docId);

      const status = isSubmit ? "Submitted" : existingAppraisal?.status || "Draft";

      const payload = {
        id: docId,
        uid: currentUser.uid,
        userEmail: currentUser.email || "",
        principalName: formData.name || userProfile?.displayName || "",
        staffName: formData.name || userProfile?.displayName || "",
        department: formData.department || "Administration / Institutional Governance",
        institution: userProfile?.institution || formData.institution || "CKCET",
        designation: formData.designation || "Principal",
        academicYear,
        formType: "principal",
        status,
        submittedAt: isSubmit ? new Date().toISOString() : existingAppraisal?.submittedAt || null,
        updatedAt: new Date().toISOString(),
        formData,
        doj: formData.dojCollege || "",
        dateOfJoining: formData.dojCollege || "",
        dojCollege: formData.dojCollege || "",
        dojPresentPost: formData.dojPresentPost || ""
      };

      await setDoc(docRef, payload, { merge: true });

      showToast(
        isSubmit
          ? "Principal Self-Appraisal Request Submitted Successfully! Redirecting to Reviews..."
          : "Draft Saved Successfully!",
        "success"
      );

      if (isSubmit) {
        setTimeout(() => {
          navigate("/reviews");
        }, 1200);
      }
    } catch (err) {
      console.error("Error saving principal appraisal:", err);
      showToast("Failed to save appraisal request.", "error");
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  const isReadOnly =
    (existingAppraisal?.status === "Submitted" ||
      existingAppraisal?.status === "Approved") &&
    existingAppraisal?.status !== "Returned";

  const totalExperience = useMemo(() => {
    const ckcet = parseFloat(formData.expCKCET) || 0;
    const other = parseFloat(formData.expOther) || 0;
    const ind = parseFloat(formData.expIndustrial) || 0;
    const sum = ckcet + other + ind;
    return sum > 0 ? sum.toFixed(1).replace(/\.0$/, "") : null;
  }, [formData.expCKCET, formData.expOther, formData.expIndustrial]);

  if (loading || checkingSchedule) {
    return (
      <HRLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 className="animate-spin text-indigo-700" size={40} />
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            Loading Principal Appraisal Portal...
          </span>
        </div>
      </HRLayout>
    );
  }

  return (
    <HRLayout>
      <div className="w-full pb-16 max-w-7xl mx-auto px-2 sm:px-4">

        {/* Toast Notification */}
        {toast.show && (
          <div
            className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl text-white font-bold shadow-2xl backdrop-blur-md animate-slideIn ${
              toast.type === "success" ? "bg-emerald-600/95" : "bg-rose-600/95"
            }`}
          >
            <CheckCircle2 size={20} />
            <span className="text-sm">{toast.message}</span>
          </div>
        )}

        {/* ═══ PREMIUM EXECUTIVE HERO BANNER ═══ */}
        <div className="relative rounded-3xl p-6 sm:p-8 md:p-10 text-white shadow-2xl overflow-hidden mb-8 bg-gradient-to-tr from-[#0b1226] via-[#101b38] to-[#1e3a8a] border border-white/10">
          {/* Subtle Ambient Radial Lighting */}
          <div className="absolute -right-16 -top-16 w-80 h-80 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-md text-[11px] font-black tracking-widest uppercase text-amber-300 shadow-xs">
                <Crown size={14} className="text-amber-400" />
                Executive Leadership Appraisal
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight font-serif text-white">
                SELF-APPRAISAL FORM FOR THE PRINCIPAL
              </h1>
              <p className="text-xs sm:text-sm text-indigo-200/90 max-w-2xl font-medium leading-relaxed">
                Institutional Leadership, Academic Governance, Accreditation Administration & Strategic Development Record
              </p>
            </div>

            {/* Academic Session Selector with Glassmorphism */}
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md p-2.5 sm:p-3 rounded-2xl border border-white/15 self-start lg:self-center shadow-lg">
              <div className="flex items-center gap-2 px-2 text-indigo-200">
                <Calendar size={16} />
                <span className="text-xs font-bold uppercase tracking-wider">Academic Session:</span>
              </div>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                disabled={true}
                className="bg-white text-slate-900 font-extrabold text-sm px-4 py-2 rounded-xl border border-white/40 outline-none transition-all cursor-not-allowed shadow-inner"
              >
                <option value="2024-2025">2024 – 2025</option>
                <option value="2025-2026">2025 – 2026</option>
                <option value="2026-2027">2026 – 2027</option>
              </select>
            </div>
          </div>
        </div>

        {/* ═══ SUBMISSION STATUS BANNER ═══ */}
        {existingAppraisal && (
          <div className="mb-8 bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold shadow-xs ${
                  existingAppraisal.status === "Submitted"
                    ? "bg-amber-100 text-amber-800"
                    : existingAppraisal.status === "Approved"
                    ? "bg-emerald-100 text-emerald-800"
                    : existingAppraisal.status === "Returned"
                    ? "bg-rose-100 text-rose-800"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Status:</span>
                  <span
                    className={`text-xs font-black uppercase px-3 py-1 rounded-full tracking-wider ${
                      existingAppraisal.status === "Submitted"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : existingAppraisal.status === "Approved"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : existingAppraisal.status === "Returned"
                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {existingAppraisal.status === "Submitted" ? "Submitted to Management" : existingAppraisal.status}
                  </span>
                </div>
                {existingAppraisal.submittedAt && (
                  <p className="text-[11px] text-zinc-500 mt-1 font-medium flex items-center gap-1.5">
                    <Clock size={12} /> Submitted on: {new Date(existingAppraisal.submittedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </p>
                )}
              </div>
            </div>

            {isReadOnly && (
              <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-3.5 py-2 rounded-xl flex items-center gap-2">
                <Info size={14} /> Submitted form is locked for Management Review
              </span>
            )}
          </div>
        )}

        {/* ═══ SECTION 1: PRINCIPAL DETAILS (QUESTIONS 1 – 6) ═══ */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200/80 mb-8 space-y-6 hover:border-indigo-200 transition-all">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-[#120c7a] flex items-center justify-center font-bold shadow-xs">
                <User size={20} />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                  1. Principal Details (Questions 1 – 6)
                </h2>
                <p className="text-xs text-zinc-400 font-medium">
                  Official identity, academic qualifications, and institutional tenure
                </p>
              </div>
            </div>

            {totalExperience && (
              <div className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black rounded-full flex items-center gap-1.5">
                <Award size={13} className="text-emerald-600" />
                Total Experience: {totalExperience} Yrs
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* 1. Principal Name */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                1. Principal Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                disabled={isReadOnly}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-slate-50/60 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 disabled:opacity-60 transition-all"
                placeholder="Dr. / Prof. Principal Name"
              />
            </div>

            {/* 2. Date of Birth */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                2. Date of Birth
              </label>
              <input
                type="date"
                disabled={isReadOnly}
                value={formData.dob}
                onChange={(e) => handleDobChange(e.target.value)}
                className="w-full bg-slate-50/60 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 disabled:opacity-60 transition-all"
              />
            </div>

            {/* Age (Auto-calculated) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-zinc-700">Age</label>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                  Auto-calculated
                </span>
              </div>
              <div className="w-full bg-slate-100/80 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 flex items-center justify-between">
                <span>{formData.age ? `${formData.age} Years` : "Enter Date of Birth"}</span>
                {formData.age && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                )}
              </div>
            </div>

            {/* 3. Designation */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                3. Designation
              </label>
              <input
                type="text"
                disabled={isReadOnly}
                value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                className="w-full bg-slate-50/60 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 disabled:opacity-60 transition-all"
                placeholder="Principal"
              />
            </div>

            {/* Department / Institutional Governance */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                Department / Governance Division <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                disabled={isReadOnly}
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full bg-slate-50/60 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 disabled:opacity-60 transition-all"
                placeholder="Administration / Governance"
              />
            </div>

            {/* 4. Date of Joining College */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                4. Date of Joining College / Institution
              </label>
              <input
                type="date"
                disabled={isReadOnly}
                value={formData.dojCollege}
                onChange={(e) => setFormData({ ...formData, dojCollege: e.target.value })}
                className="w-full bg-slate-50/60 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 disabled:opacity-60 transition-all"
              />
            </div>

            {/* Date of Joining Present Post */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                Date of Joining Present Post
              </label>
              <input
                type="date"
                disabled={isReadOnly}
                value={formData.dojPresentPost}
                onChange={(e) => setFormData({ ...formData, dojPresentPost: e.target.value })}
                className="w-full bg-slate-50/60 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 disabled:opacity-60 transition-all"
              />
            </div>

            {/* 5. Academic Qualification (spans 2 columns on desktop) */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                5. Academic Qualification
              </label>
              <input
                type="text"
                disabled={isReadOnly}
                value={formData.qualification}
                onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                className="w-full bg-slate-50/60 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 disabled:opacity-60 transition-all"
                placeholder="e.g. B.E., M.E., Ph.D., Post-Doc in Computer Science & Engineering"
              />
            </div>
          </div>

          {/* 6. Experience (Years) Container */}
          <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/70 space-y-3">
            <div className="flex items-center gap-2">
              <GraduationCap size={16} className="text-indigo-600" />
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider">
                6. Experience (Years)
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                <label className="block text-[11px] font-bold text-zinc-500 mb-1">
                  a) At CKCET / Current Institution (Yrs)
                </label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.expCKCET}
                  onChange={(e) => setFormData({ ...formData, expCKCET: e.target.value })}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60"
                  placeholder="e.g. 5"
                />
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                <label className="block text-[11px] font-bold text-zinc-500 mb-1">
                  b) Other Institutions (Yrs)
                </label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.expOther}
                  onChange={(e) => setFormData({ ...formData, expOther: e.target.value })}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60"
                  placeholder="e.g. 12"
                />
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                <label className="block text-[11px] font-bold text-zinc-500 mb-1">
                  c) Industrial / Research (Yrs)
                </label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.expIndustrial}
                  onChange={(e) => setFormData({ ...formData, expIndustrial: e.target.value })}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60"
                  placeholder="e.g. 3"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ═══ SECTION 2: ROLES & RESPONSIBILITIES (QUESTION 7) ═══ */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200/80 mb-8 space-y-5 hover:border-indigo-200 transition-all">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-[#120c7a] flex items-center justify-center font-bold shadow-xs">
              <Briefcase size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                2. Roles & Responsibilities (Question 7)
              </h2>
              <p className="text-xs text-zinc-400 font-medium">
                Autonomous institutional leadership, academic administration & strategic governance
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="block text-xs font-bold text-zinc-800">
                7. Explain the Roles and Responsibilities carried out during the Academic Year with details <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-zinc-400 font-medium">
                {formData.rolesResponsibilities.length} characters
              </span>
            </div>
            <textarea
              rows={6}
              disabled={isReadOnly}
              value={formData.rolesResponsibilities}
              onChange={(e) => setFormData({ ...formData, rolesResponsibilities: e.target.value })}
              className="w-full bg-slate-50/60 border border-slate-200 rounded-2xl p-4 text-sm font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 disabled:opacity-60 transition-all leading-relaxed"
              placeholder="Describe your institutional leadership initiatives, academic governance, NAAC / NBA accreditation steering, autonomous curriculum approvals, faculty performance mentoring, research funding & patent filings, industry-institute MOUs, student admissions excellence, infrastructural expansion, and executive administrative duties..."
            />
          </div>

          {/* Document Upload Box (Max 100 KB) */}
          <div className="bg-gradient-to-r from-slate-50 to-indigo-50/30 p-5 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <label className="block text-xs font-extrabold text-slate-800">
                  Attach Additional Proof / Details Document (Max 100 KB)
                </label>
                <p className="text-[11px] text-zinc-500">
                  Upload PDF, DOCX or image summary of institutional achievements and responsibilities (Strict Limit: 100 KB)
                </p>
              </div>

              {!isReadOnly && (
                <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm">
                  <Upload size={14} />
                  <span>{uploadingRoleDoc ? "Uploading..." : formData.rolesEvidenceUrl ? "Replace File (Max 100 KB)" : "Attach File (Max 100 KB)"}</span>
                  <input
                    type="file"
                    disabled={uploadingRoleDoc}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              )}
            </div>

            {/* Document preview if uploaded */}
            {formData.rolesEvidenceUrl && (
              <div className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-indigo-100 shadow-2xs">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                    <FileText size={16} />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {formData.rolesEvidenceName || "Principal_Roles_Evidence_Document"}
                    </p>
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircle2 size={10} /> Attached successfully
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={formData.rolesEvidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1"
                  >
                    <ExternalLink size={12} /> View
                  </a>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, rolesEvidenceUrl: "", rolesEvidenceName: "" }))}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                      title="Remove attachment"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ SECTION 3: DIGITAL DECLARATION & EXECUTIVE ACTIONS ═══ */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200/80 mb-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-[#120c7a] flex items-center justify-center font-bold shadow-xs">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                3. Digital Certification & Submission Declaration
              </h2>
              <p className="text-xs text-zinc-400 font-medium">
                Official declaration and submission directly to the Management / Governing Council
              </p>
            </div>
          </div>

          <label className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 cursor-pointer hover:bg-indigo-50/30 transition-all">
            <input
              type="checkbox"
              disabled={isReadOnly}
              checked={formData.certified}
              onChange={(e) => setFormData({ ...formData, certified: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-zinc-300 cursor-pointer"
            />
            <span className="text-xs text-slate-700 font-medium leading-relaxed">
              I hereby declare that the institutional leadership information and particulars furnished in Questions 1 through 7 above are authentic, complete and true to the best of my knowledge and belief.
            </span>
          </label>

          <div className="flex items-center justify-between text-xs text-zinc-500 flex-wrap gap-2 pt-2">
            <span>Date: <strong>{formData.dateSubmitted}</strong></span>
            <span>Designation: <strong className="text-indigo-900">{formData.designation}</strong></span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 flex-wrap">
            {!isReadOnly ? (
              <>
                <button
                  type="button"
                  disabled={saving || submitting}
                  onClick={() => handleSave(false)}
                  className="px-6 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Save size={15} />
                  <span>{saving ? "Saving Draft..." : "Save Draft"}</span>
                </button>

                <button
                  type="button"
                  disabled={saving || submitting}
                  onClick={() => handleSave(true)}
                  className="px-7 py-3 rounded-2xl bg-gradient-to-r from-[#101b38] to-[#1c356e] hover:from-[#162752] hover:to-[#22448d] text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md hover:shadow-lg disabled:opacity-50"
                >
                  <Send size={15} />
                  <span>{submitting ? "Submitting..." : "Submit Principal Appraisal Request"}</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl flex items-center gap-2">
                  <CheckCircle2 size={16} /> Appraisal Successfully Submitted to Management
                </span>
              </div>
            )}
          </div>
        </div>

      </div>
    </HRLayout>
  );
}
