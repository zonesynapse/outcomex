import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import HRLayout from "../components/HRLayout";
import { checkAppraisalPortalStatus, getSchoolBannerTitle, getSchoolShortName } from "../utils/appraisalScore";
import { uploadFile, userStoragePath } from "../utils/fileUpload";
import {
  FileText,
  Save,
  Send,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Plus,
  Trash2,
  Calendar,
  User,
  Building,
  Award,
  Briefcase,
  HelpCircle,
  ChevronRight,
  Loader2,
  Paperclip,
  Check,
  FileCheck,
  Users
} from "lucide-react";

export default function NonTeachingAppraisal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [appraisalSchedule, setAppraisalSchedule] = useState(null);
  const [isPortalOpen, setIsPortalOpen] = useState(true);
  const [checkingSchedule, setCheckingSchedule] = useState(true);
  const [existingAppraisal, setExistingAppraisal] = useState(null);
  const [activeTab, setActiveTab] = useState(1);
  const [uploadingRoleDoc, setUploadingRoleDoc] = useState(false);

  // Academic Year State
  const [academicYear, setAcademicYear] = useState("");

  // Initial Form Data strictly matching CKSPE Self-Appraisal Form for Staff Members (Images 1 & 2)
  const initialFormData = {
    // 1. Staff Profile & Experience (Q1-Q6)
    name: "",
    dob: "",
    age: "",
    designation: "",
    department: "",
    dojSchool: "",
    dojPresentPost: "",
    qualification: "",
    expCKSPE: "",
    expOther: "",

    // Q7. Roles & Responsibilities carried out during AY (Textarea + Attach file)
    rolesResponsibilities: "",
    rolesEvidenceUrl: "",
    rolesEvidenceName: "",

    // 2. Punctuality & Attendance (Q8-Q11)
    reportScheduledTime: "Yes.", // Yes. | Most of the time | No
    seekPermissionOutside: "Yes", // Yes | Most of the time | No
    applyLeaveAdvance: "Yes", // Yes | Most of the time | No
    consumeBalanceCL: "No", // Yes | If required | No

    // Q12. Details of leave taken during Academic Year (June to May)
    leaveDetails: {
      cl: "0",
      coff: "0",
      llp: "0",
      odDept: "0",
      odInst: "0",
      odOthers: "0"
    },

    // 3. Interpersonal Relationships & Work Habits (Q14-Q19)
    relStudents: { rating: "Good", reason: "" }, // Good | Fair | Unsatisfactory | Should it be improved?
    relColleagues: { rating: "Good", reason: "" },
    relSuperiors: { rating: "Good", reason: "" },

    accomplishAssignmentInTime: "Yes", // Yes | With reminder | Depends on my interest
    potentialUtilization: "Properly Utilized", // Over Burdened | Properly Utilized | Under Utilized | Not utilized At all
    selfAssessmentPlacement: "At par", // Above | At par | Below

    // 4. Admissions & Additional Info (Q21-Q22)
    // Q21. Admissions Contributed to Institutions
    admissionsInstitutions: [
      { area: "", count: "" }
    ],

    // Q21b. Admissions Contributed to Vijayadashami
    admissionsVijayadashami: [
      { area: "", count: "" }
    ],

    // Q22. Any other relevant information
    otherInfo: "",

    // Digital Certification & Date
    certified: false,
    declarationDate: new Date().toISOString().split("T")[0],
    dateSubmitted: new Date().toISOString().split("T")[0]
  };

  const [formData, setFormData] = useState(initialFormData);

  // User Auth Observer
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const localStr = localStorage.getItem(`user_profile_${user.uid}`);
        const localProf = localStr ? JSON.parse(localStr) : null;
        try {
          const userSnap = await getDoc(doc(db, "users", user.uid));
          if (userSnap.exists()) {
            const data = userSnap.data();
            setUserProfile(data);
            setFormData((prev) => ({
              ...prev,
              name: prev.name || data.displayName || data.name || user.displayName || "",
              designation: prev.designation || data.designation || data.role || "",
              department: prev.department || data.department || "",
              dojSchool: prev.dojSchool || data.doj || "",
              qualification: prev.qualification || data.qualification || ""
            }));
          } else if (localProf) {
            setUserProfile(localProf);
            setFormData((prev) => ({
              ...prev,
              name: prev.name || localProf.name || "",
              designation: prev.designation || localProf.role || "",
              department: prev.department || localProf.department || ""
            }));
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });
    return () => unsubAuth();
  }, []);

  // Fetch Appraisal Schedule & Active Status
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

  // Fetch Existing Non-Teaching Appraisal Document
  useEffect(() => {
    if (!currentUser) return;
    const docId = `${currentUser.uid}_${academicYear}`;
    const unsub = onSnapshot(doc(db, "non_teaching_appraisals", docId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setExistingAppraisal(data);
        if (data.formData) {
          setFormData((prev) => ({
            ...initialFormData,
            ...data.formData,
            leaveDetails: {
              ...initialFormData.leaveDetails,
              ...(data.formData.leaveDetails || {})
            },
            admissionsInstitutions: data.formData.admissionsInstitutions?.length
              ? data.formData.admissionsInstitutions
              : initialFormData.admissionsInstitutions,
            admissionsVijayadashami: data.formData.admissionsVijayadashami?.length
              ? data.formData.admissionsVijayadashami
              : initialFormData.admissionsVijayadashami
          }));
        }
      }
    });
    return () => unsub();
  }, [currentUser, academicYear]);

  // Handlers
  const handleTextChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNestedChange = (parent, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [parent]: {
        ...prev[parent],
        [field]: value
      }
    }));
  };

  const handleArrayRowChange = (arrayKey, index, field, value) => {
    setFormData((prev) => {
      const list = [...(prev[arrayKey] || [])];
      list[index] = { ...list[index], [field]: value };
      return { ...prev, [arrayKey]: list };
    });
  };

  const addArrayRow = (arrayKey, defaultObj) => {
    setFormData((prev) => ({
      ...prev,
      [arrayKey]: [...(prev[arrayKey] || []), defaultObj]
    }));
  };

  const removeArrayRow = (arrayKey, index) => {
    setFormData((prev) => {
      const list = [...(prev[arrayKey] || [])];
      if (list.length <= 1) return prev;
      list.splice(index, 1);
      return { ...prev, [arrayKey]: list };
    });
  };

  // Upload Evidence File for Q7 Roles & Responsibilities
  const handleFileUpload = async (file) => {
    if (!file || !currentUser) return;
    if (file.size > 100 * 1024) {
      alert(`File size is ${(file.size / 1024).toFixed(1)} KB, which exceeds the limit of 100 KB.`);
      return;
    }
    setUploadingRoleDoc(true);
    try {
      const path = userStoragePath(currentUser.uid, "non_teaching_roles", file.name);
      const fileUrl = await uploadFile(path, file, file.type);
      setFormData((prev) => ({
        ...prev,
        rolesEvidenceUrl: fileUrl,
        rolesEvidenceName: file.name
      }));
      alert("Roles & Responsibilities document attached successfully!");
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload file: " + err.message);
    } finally {
      setUploadingRoleDoc(false);
    }
  };

  // Save / Submit Handlers
  const handleSave = async (isSubmit = false) => {
    if (!currentUser) return;
    if (isSubmit) {
      if (!formData.name || !formData.department) {
        alert("Please fill in your Name and Department before submitting.");
        return;
      }
      const decDate = formData.declarationDate || formData.dateSubmitted || new Date().toISOString().split("T")[0];
      if (!decDate) {
        alert("Please select the Date of Declaration before submitting.");
        return;
      }
      if (!formData.certified) {
        alert("Please confirm the declaration check before submitting.");
        return;
      }
    }

    if (isSubmit) setSubmitting(true);
    else setSaving(true);

    try {
      const docId = `${currentUser.uid}_${academicYear}`;
      const docRef = doc(db, "non_teaching_appraisals", docId);

      const userInst = userProfile?.institution || formData.institution || "CKSPK (Matric)";

      const payload = {
        docId,
        formType: "non_teaching",
        staffId: currentUser.uid,
        staffName: formData.name || userProfile?.name || currentUser.email,
        staffEmail: currentUser.email,
        department: formData.department || userProfile?.department || "General",
        institution: userInst,
        academicYear,
        formData: {
          ...formData,
          institution: userInst
        },
        status: isSubmit ? "HOD_Approved" : (existingAppraisal?.status || "Draft"),
        submittedAt: isSubmit ? new Date().toISOString() : (existingAppraisal?.submittedAt || null),
        updatedAt: new Date().toISOString()
      };

      await setDoc(docRef, payload, { merge: true });
      alert(isSubmit ? "Staff Appraisal Form submitted successfully! Forwarded to your Institution Principal for review." : "Progress saved as draft.");
    } catch (error) {
      console.error("Save Non-Teaching Appraisal error:", error);
      alert("Failed to save appraisal: " + error.message);
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  if (loading || checkingSchedule) {
    return (
      <HRLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="w-10 h-10 text-teal-600 animate-spin mb-4" />
          <p className="text-sm font-semibold text-slate-600">Loading Staff Appraisal Request Form...</p>
        </div>
      </HRLayout>
    );
  }

  const status = existingAppraisal?.status || "Draft";
  const isReadOnly = !isPortalOpen || status === "Approved" || status === "HOD_Approved" || status === "Submitted";

  const instName = userProfile?.institution || existingAppraisal?.institution || existingAppraisal?.formData?.institution || (currentUser ? JSON.parse(localStorage.getItem(`user_profile_${currentUser.uid}`) || "{}")?.institution : "") || "";
  const schoolTitle = getSchoolBannerTitle(instName);
  const schoolShortName = getSchoolShortName(instName);

  const tabs = [
    { id: 1, name: "1. Staff Profile & Experience", icon: User },
    { id: 2, name: "2. Punctuality & Leaves", icon: Clock },
    { id: 3, name: "3. Relationships & Work Habits", icon: Users },
    { id: 4, name: "4. Admissions & Info", icon: Award }
  ];

  return (
    <HRLayout>
      <div className="space-y-6 max-w-6xl mx-auto pb-16">
        {/* Header Title Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
          <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 bg-teal-500/20 border border-teal-400/30 text-teal-300 rounded-full text-xs font-bold tracking-wider uppercase">
                  {schoolTitle}
                </span>
                <div className="bg-white/15 backdrop-blur-md border border-white/25 rounded-xl px-3.5 py-1 text-xs font-black text-white flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>Academic Session {academicYear}</span>
                </div>
              </div>

              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight font-heading">
                Self-Appraisal Form for Staff Members
              </h1>
              <p className="text-slate-300 text-xs md:text-sm mt-1 max-w-2xl font-medium">
                To be filled by each staff member. Questions are formulated to assess your views, decision making power, leave records, and institutional support.
              </p>
            </div>

            {/* Status & Actions Pill */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <span className={`px-4 py-2 rounded-2xl text-xs font-extrabold uppercase tracking-wider border shadow-sm ${
                status === "Approved" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
                status === "HOD_Approved" ? "bg-blue-500/20 text-blue-300 border-blue-500/40" :
                status === "Submitted" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                "bg-slate-700/50 text-slate-300 border-slate-600/50"
              }`}>
                Status: {status.replace("_", " ")}
              </span>

              {!isReadOnly && (
                <>
                  <button
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    className="px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Draft
                  </button>

                  <button
                    onClick={() => handleSave(true)}
                    disabled={submitting}
                    className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-teal-600/30 cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Submit to Principal
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Closed Portal Alert */}
        {!isPortalOpen && (
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center gap-3 text-rose-800 text-xs font-semibold">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <span>The Appraisal Portal submission window is currently closed. Form is displayed in Read-Only mode.</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 overflow-x-auto gap-2 no-scrollbar bg-white p-2 rounded-2xl shadow-xs border border-slate-200/80">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-teal-600 text-white shadow-md shadow-teal-600/20"
                    : "text-slate-600 hover:text-teal-600 hover:bg-teal-50"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-500"}`} />
                <span>{t.name}</span>
              </button>
            );
          })}
        </div>

        {/* ── TAB 1: STAFF PROFILE & EXPERIENCE (Q1-Q7) ── */}
        {activeTab === 1 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 space-y-8 shadow-xs">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
                <User className="w-5 h-5 text-teal-600" /> 1. Staff Profile & Service Details
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">General personal information and service record.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">1. Name *</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.name}
                  onChange={(e) => handleTextChange("name", e.target.value)}
                  placeholder="Enter full name"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">2. Date of Birth</label>
                <input
                  type="date"
                  disabled={isReadOnly}
                  value={formData.dob}
                  onChange={(e) => handleTextChange("dob", e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Age (Yrs)</label>
                <input
                  type="number"
                  disabled={isReadOnly}
                  value={formData.age}
                  onChange={(e) => handleTextChange("age", e.target.value)}
                  placeholder="e.g. 32"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">3. Designation</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.designation}
                  onChange={(e) => handleTextChange("designation", e.target.value)}
                  placeholder="e.g. Lab Assistant / Office Executive"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Department *</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.department}
                  onChange={(e) => handleTextChange("department", e.target.value)}
                  placeholder="e.g. Administration / Computer Lab"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">4. Date of joining the School</label>
                <input
                  type="date"
                  disabled={isReadOnly}
                  value={formData.dojSchool}
                  onChange={(e) => handleTextChange("dojSchool", e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Date of joining the Present Post</label>
                <input
                  type="date"
                  disabled={isReadOnly}
                  value={formData.dojPresentPost}
                  onChange={(e) => handleTextChange("dojPresentPost", e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">5. Academic Qualification</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.qualification}
                  onChange={(e) => handleTextChange("qualification", e.target.value)}
                  placeholder="e.g. B.Sc, BCA, Diploma"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-60"
                />
              </div>
            </div>

            {/* Experience Section */}
            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-4">6. Experience Details (in Years)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">a) At {schoolShortName}</label>
                  <input
                    type="number"
                    step="0.5"
                    disabled={isReadOnly}
                    value={formData.expCKSPE}
                    onChange={(e) => handleTextChange("expCKSPE", e.target.value)}
                    placeholder="e.g. 3.5"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">b) Other Institutions</label>
                  <input
                    type="number"
                    step="0.5"
                    disabled={isReadOnly}
                    value={formData.expOther}
                    onChange={(e) => handleTextChange("expOther", e.target.value)}
                    placeholder="e.g. 2.0"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-60"
                  />
                </div>
              </div>
            </div>

            {/* Q7: Roles and Responsibilities */}
            <div className="pt-6 border-t border-slate-100 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  7. Explain the Roles and Responsibilities carried out during the Academic year with details?
                </label>
                <span className="text-[11px] text-slate-500 italic">(Attach the Details in a Separate Sheet if required)</span>
              </div>

              <textarea
                rows="4"
                disabled={isReadOnly}
                value={formData.rolesResponsibilities}
                onChange={(e) => handleTextChange("rolesResponsibilities", e.target.value)}
                placeholder="Detail key duties, administrative tasks, lab maintenance, and daily responsibilities..."
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-60"
              ></textarea>

              {/* Evidence Attachment */}
              <div className="flex items-center gap-3 pt-1">
                {!isReadOnly && (
                  <label className="px-3.5 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer">
                    {uploadingRoleDoc ? <Loader2 className="w-4 h-4 animate-spin text-teal-600" /> : <Paperclip className="w-4 h-4 text-teal-600" />}
                    <span>{formData.rolesEvidenceUrl ? "Change Attachment Sheet (Max 100 KB)" : "Attach Separate Sheet / Document (Max 100 KB)"}</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    />
                  </label>
                )}

                {formData.rolesEvidenceUrl && (
                  <a
                    href={formData.rolesEvidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-teal-700 hover:underline flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200"
                  >
                    <FileCheck className="w-4 h-4 text-teal-600" />
                    <span>Attached: {formData.rolesEvidenceName || "View File"}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: PUNCTUALITY, DISCIPLINE & LEAVES (Q8-Q12) ── */}
        {activeTab === 2 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 space-y-10 shadow-xs">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
                <Clock className="w-5 h-5 text-teal-600" /> 2. Punctuality, Work Habits & Leave Breakdown
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Questions 8 to 12: Reporting time, advance permissions, and leaves availed.</p>
            </div>

            {/* Q8 */}
            <div>
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                8. Do you report on the scheduled time?
              </label>
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                {["Yes.", "Most of the time", "No"].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      formData.reportScheduledTime === opt
                        ? "bg-teal-50 border-teal-300 text-teal-950 shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportScheduledTime"
                      disabled={isReadOnly}
                      checked={formData.reportScheduledTime === opt}
                      onChange={() => handleTextChange("reportScheduledTime", opt)}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Q9 */}
            <div className="pt-6 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                9. Do you seek permission while attending outside work during working hours?
              </label>
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                {["Yes", "Most of the time", "No"].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      formData.seekPermissionOutside === opt
                        ? "bg-teal-50 border-teal-300 text-teal-950 shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="seekPermissionOutside"
                      disabled={isReadOnly}
                      checked={formData.seekPermissionOutside === opt}
                      onChange={() => handleTextChange("seekPermissionOutside", opt)}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Q10 */}
            <div className="pt-6 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                10. Do you apply for leave in advance?
              </label>
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                {["Yes", "Most of the time", "No"].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      formData.applyLeaveAdvance === opt
                        ? "bg-teal-50 border-teal-300 text-teal-950 shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="applyLeaveAdvance"
                      disabled={isReadOnly}
                      checked={formData.applyLeaveAdvance === opt}
                      onChange={() => handleTextChange("applyLeaveAdvance", opt)}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Q11 */}
            <div className="pt-6 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                11. Do you consume your balance CL in last month of academic session?
              </label>
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                {["Yes", "If required", "No"].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      formData.consumeBalanceCL === opt
                        ? "bg-teal-50 border-teal-300 text-teal-950 shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="consumeBalanceCL"
                      disabled={isReadOnly}
                      checked={formData.consumeBalanceCL === opt}
                      onChange={() => handleTextChange("consumeBalanceCL", opt)}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Q12: Leave Details Table */}
            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-4">
                12. Details of leave taken during the Academic Year (June to May)
              </h3>

              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 space-y-6">
                <div>
                  <span className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-3">
                    No. of Leave availed
                  </span>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1 text-center">CL (Casual Leave)</label>
                      <input
                        type="number"
                        disabled={isReadOnly}
                        value={formData.leaveDetails?.cl || "0"}
                        onChange={(e) => handleNestedChange("leaveDetails", "cl", e.target.value)}
                        placeholder="0"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-center text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1 text-center">C-OFF (Compensatory)</label>
                      <input
                        type="number"
                        disabled={isReadOnly}
                        value={formData.leaveDetails?.coff || "0"}
                        onChange={(e) => handleNestedChange("leaveDetails", "coff", e.target.value)}
                        placeholder="0"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-center text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1 text-center">LLP (Loss of Pay)</label>
                      <input
                        type="number"
                        disabled={isReadOnly}
                        value={formData.leaveDetails?.llp || "0"}
                        onChange={(e) => handleNestedChange("leaveDetails", "llp", e.target.value)}
                        placeholder="0"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-center text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                  <span className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-3">
                    No. of On Duty (OD) availed
                  </span>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1 text-center">Department OD</label>
                      <input
                        type="number"
                        disabled={isReadOnly}
                        value={formData.leaveDetails?.odDept || "0"}
                        onChange={(e) => handleNestedChange("leaveDetails", "odDept", e.target.value)}
                        placeholder="0"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-center text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1 text-center">Institution OD</label>
                      <input
                        type="number"
                        disabled={isReadOnly}
                        value={formData.leaveDetails?.odInst || "0"}
                        onChange={(e) => handleNestedChange("leaveDetails", "odInst", e.target.value)}
                        placeholder="0"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-center text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1 text-center">Others OD</label>
                      <input
                        type="number"
                        disabled={isReadOnly}
                        value={formData.leaveDetails?.odOthers || "0"}
                        onChange={(e) => handleNestedChange("leaveDetails", "odOthers", e.target.value)}
                        placeholder="0"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-center text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: RELATIONSHIPS, WORK HABITS & UTILIZATION (Q14-Q19) ── */}
        {activeTab === 3 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 space-y-10 shadow-xs">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-600" /> 3. Interpersonal Relationships & Potential Assessment
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Questions 14 to 19: Ratings with students, colleagues, superiors, and work habit self-assessment.</p>
            </div>

            {/* Helper for Q14, Q15, Q16 */}
            {renderRelationField({
              qNum: "14",
              title: "Relationship with the Students",
              stateObj: formData.relStudents,
              isReadOnly,
              onChange: (key, val) => handleNestedChange("relStudents", key, val)
            })}

            {renderRelationField({
              qNum: "15",
              title: "Relationship with the Colleagues",
              stateObj: formData.relColleagues,
              isReadOnly,
              onChange: (key, val) => handleNestedChange("relColleagues", key, val)
            })}

            {renderRelationField({
              qNum: "16",
              title: "Relationship with the Superiors",
              stateObj: formData.relSuperiors,
              isReadOnly,
              onChange: (key, val) => handleNestedChange("relSuperiors", key, val)
            })}

            {/* Q17 */}
            <div className="pt-6 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                17. Do you accomplish the given assignment in time?
              </label>
              <div className="grid grid-cols-3 gap-4 max-w-xl">
                {["Yes", "With reminder", "Depends on my interest"].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      formData.accomplishAssignmentInTime === opt
                        ? "bg-teal-50 border-teal-300 text-teal-950 shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="accomplishAssignmentInTime"
                      disabled={isReadOnly}
                      checked={formData.accomplishAssignmentInTime === opt}
                      onChange={() => handleTextChange("accomplishAssignmentInTime", opt)}
                      className="text-teal-600"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Q18 */}
            <div className="pt-6 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                18. How do you feel about your potential utilization by the Department / Institution?
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  "Over Burdened",
                  "Properly Utilized",
                  "Under Utilized",
                  "Not utilized At all"
                ].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      formData.potentialUtilization === opt
                        ? "bg-teal-50 border-teal-300 text-teal-950 shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="potentialUtilization"
                      disabled={isReadOnly}
                      checked={formData.potentialUtilization === opt}
                      onChange={() => handleTextChange("potentialUtilization", opt)}
                      className="text-teal-600"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Q19 */}
            <div className="pt-6 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                19. From the above assessment, where would you put yourself?
              </label>
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                {["Above", "At par", "Below"].map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      formData.selfAssessmentPlacement === opt
                        ? "bg-teal-50 border-teal-300 text-teal-950 shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="selfAssessmentPlacement"
                      disabled={isReadOnly}
                      checked={formData.selfAssessmentPlacement === opt}
                      onChange={() => handleTextChange("selfAssessmentPlacement", opt)}
                      className="text-teal-600"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: ADMISSIONS & ADDITIONAL INFO (Q21-Q22) ── */}
        {activeTab === 4 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 space-y-10 shadow-xs">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
                <Award className="w-5 h-5 text-teal-600" /> 4. Admissions Contribution & Additional Details
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Questions 21 to 22: Admission counts, Vijayadashami contributions, and general remarks.</p>
            </div>

            {/* Q21: Admissions to Institutions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  21. No of admission contributed to the Institutions for the AY
                </h3>
                {!isReadOnly && (
                  <button
                    onClick={() => addArrayRow("admissionsInstitutions", { area: "", count: "" })}
                    className="px-3 py-1 bg-teal-50 text-teal-800 hover:bg-teal-100 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Row
                  </button>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-700">
                    <tr>
                      <th className="p-3 text-center w-12">Sl.No</th>
                      <th className="p-3">Area / Region</th>
                      <th className="p-3 text-center w-48">No of Admission Contributed</th>
                      {!isReadOnly && <th className="p-3 text-center w-12">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-semibold">
                    {formData.admissionsInstitutions.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.area}
                            onChange={(e) => handleArrayRowChange("admissionsInstitutions", idx, "area", e.target.value)}
                            placeholder="e.g. Cuddalore / Local Area"
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            disabled={isReadOnly}
                            value={row.count}
                            onChange={(e) => handleArrayRowChange("admissionsInstitutions", idx, "count", e.target.value)}
                            placeholder="Count"
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-black text-center text-teal-800"
                          />
                        </td>
                        {!isReadOnly && (
                          <td className="p-2 text-center">
                            <button
                              onClick={() => removeArrayRow("admissionsInstitutions", idx)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Q21b: Admissions to Vijayadashami */}
            <div className="pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  21b. No of admission contributed to Vijayadashami for the AY
                </h3>
                {!isReadOnly && (
                  <button
                    onClick={() => addArrayRow("admissionsVijayadashami", { area: "", count: "" })}
                    className="px-3 py-1 bg-teal-50 text-teal-800 hover:bg-teal-100 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Row
                  </button>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-700">
                    <tr>
                      <th className="p-3 text-center w-12">Sl.No</th>
                      <th className="p-3">Area / Region</th>
                      <th className="p-3 text-center w-48">No of Admission Contributed</th>
                      {!isReadOnly && <th className="p-3 text-center w-12">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-semibold">
                    {formData.admissionsVijayadashami.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={row.area}
                            onChange={(e) => handleArrayRowChange("admissionsVijayadashami", idx, "area", e.target.value)}
                            placeholder="e.g. Nursery / Primary Admissions"
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            disabled={isReadOnly}
                            value={row.count}
                            onChange={(e) => handleArrayRowChange("admissionsVijayadashami", idx, "count", e.target.value)}
                            placeholder="Count"
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-black text-center text-teal-800"
                          />
                        </td>
                        {!isReadOnly && (
                          <td className="p-2 text-center">
                            <button
                              onClick={() => removeArrayRow("admissionsVijayadashami", idx)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Q22 */}
            <div className="pt-6 border-t border-slate-100">
              <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">
                22. Any other relevant information not covered above.
              </label>
              <textarea
                rows="4"
                disabled={isReadOnly}
                value={formData.otherInfo}
                onChange={(e) => handleTextChange("otherInfo", e.target.value)}
                placeholder="Specify any additional achievements, special efforts, or institutional suggestions..."
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-60"
              ></textarea>
            </div>

            {/* Declaration Checkbox & Dates */}
            <div className="pt-6 border-t border-slate-200 bg-slate-50/60 p-6 rounded-2xl border border-slate-200/80 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isReadOnly}
                  checked={formData.certified}
                  onChange={(e) => handleTextChange("certified", e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-slate-800 leading-relaxed">
                  I certify that the details given above are correct to the best of my knowledge and belief.
                </span>
              </label>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 text-xs text-slate-600 font-medium">
                <div>
                  <span className="font-bold text-slate-800">Date of Declaration: </span>
                  <input
                    type="date"
                    disabled={isReadOnly}
                    value={formData.declarationDate || formData.dateSubmitted || ""}
                    onChange={(e) => {
                      handleTextChange("declarationDate", e.target.value);
                      handleTextChange("dateSubmitted", e.target.value);
                    }}
                    className="ml-2 px-3 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-900"
                  />
                </div>
                <div className="text-right italic font-serif text-slate-700">
                  Signature of the Staff Member: <span className="font-bold underline">{formData.name || "________________"}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </HRLayout>
  );
}

// Helper component to render Q14, Q15, Q16 relationship fields
function renderRelationField({ qNum, title, stateObj = {}, isReadOnly, onChange }) {
  const options = [
    "Good",
    "Fair",
    "Unsatisfactory",
    "Should it be improved?"
  ];

  return (
    <div className="pt-4 border-t border-slate-100 first:border-0 first:pt-0">
      <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-3">
        {qNum}. {title}
      </label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
        {options.map((opt) => (
          <label
            key={opt}
            className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              stateObj.rating === opt
                ? "bg-teal-50 border-teal-300 text-teal-950 shadow-xs"
                : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <input
              type="radio"
              name={`relation_${qNum}`}
              disabled={isReadOnly}
              checked={stateObj.rating === opt}
              onChange={() => onChange("rating", opt)}
              className="text-teal-600 focus:ring-teal-500"
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>

      {stateObj.rating === "Should it be improved?" && (
        <textarea
          rows="2"
          disabled={isReadOnly}
          value={stateObj.reason || ""}
          onChange={(e) => onChange("reason", e.target.value)}
          placeholder="Specify the reason or feedback for improvement..."
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-60"
        ></textarea>
      )}
    </div>
  );
}
