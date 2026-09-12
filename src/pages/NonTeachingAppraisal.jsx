import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  query,
  where
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Layout from "../components/Layout";
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
  Loader2
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

  // Academic Year State
  const [academicYear, setAcademicYear] = useState("2024-2025");

  // Form State
  const [formData, setFormData] = useState({
    // Staff Info (Q1-Q6)
    name: "",
    dob: "",
    age: "",
    designation: "",
    department: "",
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

    // Punctuality & Discipline (Q8-Q11)
    reportScheduledTime: "Yes", // Yes | Most of the time | No
    seekPermissionOutside: "Yes", // Yes | Most of the time | No
    applyLeaveAdvance: "Yes", // Yes | Most of the time | No
    consumeBalanceCL: "No", // Yes | If required | No

    // Leave Details (Q12)
    leaveDetails: {
      cl: "0",
      coff: "0",
      llp: "0",
      odDept: "0",
      odInst: "0",
      odOthers: "0"
    },

    // Grievances & Relationships (Q13-Q19)
    happyWithGrievances: "Yes", // Yes | No | Not Applicable
    relStudents: { rating: "Good", reason: "" }, // Good | Fair | Unsatisfactory | Should be improved
    relColleagues: { rating: "Good", reason: "" },
    relSuperiors: { rating: "Good", reason: "" },
    accomplishAssignmentInTime: "Yes", // Yes | With reminder | Depends on my interest
    potentialUtilization: "Properly Utilized", // Over Burdened | Properly Utilized | Under Utilized | Not utilized At all
    selfAssessmentPlacement: "At par", // Above | At par | Below

    // Invest In Yourself & Admissions (Q20-Q22)
    iiyCourses: [
      {
        title: "",
        startDate: "",
        endDate: "",
        weeks: "",
        platform: "",
        examDate: "",
        certificateReceived: "Yes"
      }
    ],
    iiyOutcome: "",
    admissionsContributed: [
      { teamNoArea: "", count: "", teamLeader: "" }
    ],
    otherInfo: "",

    // Certification
    certified: false,
    dateSubmitted: new Date().toISOString().split("T")[0],
    signatureUrl: ""
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
              name: data.displayName || data.name || user.displayName || "",
              designation: data.designation || "Technical / Lab Staff",
              department: data.department || "",
              dojCollege: data.doj || "",
              qualification: data.qualification || ""
            }));
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

        if (sched.isActive) {
          const now = new Date().getTime();
          const start = sched.openTime ? new Date(sched.openTime).getTime() : null;
          const end = sched.closeTime ? new Date(sched.closeTime).getTime() : null;

          let open = true;
          if (start && now < start) open = false;
          if (end && now > end) open = false;
          setIsPortalOpen(open);
        } else {
          setIsPortalOpen(false);
        }
      } else {
        setIsPortalOpen(true);
      }
      setCheckingSchedule(false);
    }, (err) => {
      console.error("Error checking appraisal schedule:", err);
      setCheckingSchedule(false);
    });
    return () => unsub();
  }, []);

  // Fetch Existing Appraisal Document for current user & academic year
  useEffect(() => {
    if (!currentUser || !academicYear) return;
    const docId = `${currentUser.uid}_${academicYear.replace(/[^a-zA-Z0-9]/g, "_")}_non_teaching`;

    const unsub = onSnapshot(doc(db, "non_teaching_appraisals", docId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setExistingAppraisal(data);
        if (data.formData) {
          setFormData((prev) => ({ ...prev, ...data.formData }));
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

  // IIY Table Handlers
  const addIiyCourse = () => {
    setFormData((prev) => ({
      ...prev,
      iiyCourses: [
        ...prev.iiyCourses,
        {
          title: "",
          startDate: "",
          endDate: "",
          weeks: "",
          platform: "",
          examDate: "",
          certificateReceived: "Yes"
        }
      ]
    }));
  };

  const removeIiyCourse = (index) => {
    setFormData((prev) => ({
      ...prev,
      iiyCourses: prev.iiyCourses.filter((_, i) => i !== index)
    }));
  };

  const updateIiyCourse = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.iiyCourses];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, iiyCourses: updated };
    });
  };

  // Admissions Table Handlers
  const addAdmission = () => {
    setFormData((prev) => ({
      ...prev,
      admissionsContributed: [
        ...prev.admissionsContributed,
        { teamNoArea: "", count: "", teamLeader: "" }
      ]
    }));
  };

  const removeAdmission = (index) => {
    setFormData((prev) => ({
      ...prev,
      admissionsContributed: prev.admissionsContributed.filter((_, i) => i !== index)
    }));
  };

  const updateAdmission = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.admissionsContributed];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, admissionsContributed: updated };
    });
  };

  // Save / Submit Handler
  const handleSave = async (isSubmit = false) => {
    if (!currentUser) return;
    if (isSubmit) {
      if (!formData.name || !formData.department) {
        showToast("Please fill in basic staff details.", "error");
        return;
      }
      if (!formData.rolesResponsibilities.trim()) {
        showToast("Please detail your Roles & Responsibilities carried out.", "error");
        return;
      }
      if (!formData.certified) {
        showToast("Please check the certification declaration before submitting.", "error");
        return;
      }
    }

    if (isSubmit) setSubmitting(true);
    else setSaving(true);

    try {
      const docId = `${currentUser.uid}_${academicYear.replace(/[^a-zA-Z0-9]/g, "_")}_non_teaching`;
      const docRef = doc(db, "non_teaching_appraisals", docId);

      const status = isSubmit ? "Submitted" : existingAppraisal?.status || "Draft";

      const payload = {
        id: docId,
        uid: currentUser.uid,
        userEmail: currentUser.email || "",
        staffName: formData.name || userProfile?.displayName || "",
        department: formData.department || userProfile?.department || "",
        designation: formData.designation || "Technical / Lab Staff",
        academicYear,
        formType: "non_teaching",
        status,
        submittedAt: isSubmit ? new Date().toISOString() : existingAppraisal?.submittedAt || null,
        updatedAt: new Date().toISOString(),
        formData
      };

      await setDoc(docRef, payload, { merge: true });

      showToast(
        isSubmit
          ? "Non-Teaching Appraisal Request Submitted to HOD Successfully!"
          : "Draft Saved Successfully!",
        "success"
      );
    } catch (err) {
      console.error("Error saving non-teaching appraisal:", err);
      showToast("Failed to save appraisal request.", "error");
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  const isReadOnly =
    (existingAppraisal?.status === "Submitted" ||
      existingAppraisal?.status === "HOD_Approved" ||
      existingAppraisal?.status === "Approved") &&
    existingAppraisal?.status !== "Returned";

  if (loading || checkingSchedule) {
    return (
      <Layout title="Non-Teaching Staff Appraisal Request">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2 className="animate-spin text-indigo-700" size={40} />
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Checking appraisal window schedule...</span>
        </div>
      </Layout>
    );
  }

  const isAdminOrHR = userProfile?.role === "HR" || userProfile?.role === "Admin";
  if (!isPortalOpen && (!existingAppraisal || existingAppraisal.status === "Draft") && !isAdminOrHR) {
    return (
      <Layout title="Non-Teaching Staff Appraisal Request">
        <div className="max-w-xl mx-auto py-16 px-4">
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-xl overflow-hidden text-center p-8 space-y-6">
            <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <Calendar size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-850 uppercase tracking-wide">Appraisal Portal is Closed</h2>
              <p className="text-zinc-500 text-xs font-medium">
                The non-teaching staff appraisal request submission portal is currently inactive or has reached its deadline.
              </p>
            </div>

            {appraisalSchedule && (
              <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl text-left text-xs space-y-3">
                <span className="font-bold text-slate-900 block border-b border-zinc-200 pb-1.5 uppercase">Schedule Details</span>
                <div className="flex justify-between">
                  <span className="text-zinc-400 font-bold uppercase">Target Session:</span>
                  <strong className="text-slate-800">{appraisalSchedule.academicYear}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400 font-bold uppercase">Open Time:</span>
                  <strong className="text-slate-800">
                    {appraisalSchedule.openTime ? new Date(appraisalSchedule.openTime).toLocaleString() : "Not scheduled"}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400 font-bold uppercase">Deadline Time:</span>
                  <strong className="text-slate-800">
                    {appraisalSchedule.closeTime ? new Date(appraisalSchedule.closeTime).toLocaleString() : "Not scheduled"}
                  </strong>
                </div>
              </div>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Non-Teaching Staff Appraisal Request">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Toast Alert */}
        {toast.show && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-5 py-3.5 rounded-xl text-white font-bold shadow-lg animate-slideIn ${toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"}`}>
            <CheckCircle2 size={18} />
            <span>{toast.message}</span>
          </div>
        )}

        {/* Top Header Banner */}
        <div className="bg-gradient-to-tr from-[#120c7a] via-[#1a10a0] to-indigo-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden mb-8">
          <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-black tracking-widest uppercase w-fit">
                <Sparkles size={12} className="text-amber-400" /> HR Appraisal System
              </div>
              <h1 className="text-lg md:text-xl font-bold font-serif">
                SELF-APPRAISAL FORM FOR THE STAFF MEMBERS (Non-Teaching / Technical / Lab Staff)
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-indigo-200 whitespace-nowrap">Academic Session:</span>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                disabled={true}
                className="bg-white/10 text-white font-bold text-sm px-4 py-2 rounded-xl border border-white/20 outline-none transition-all cursor-not-allowed opacity-80"
              >
                <option value="2024-2025" className="text-zinc-900">2024 – 2025</option>
                <option value="2025-2026" className="text-zinc-900">2025 – 2026</option>
                <option value="2026-2027" className="text-zinc-900">2026 – 2027</option>
              </select>
            </div>
          </div>
        </div>

        {/* Status Badge Banner */}
        {existingAppraisal && (
          <div className="mb-6 bg-white border border-indigo-100 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${existingAppraisal.status === 'Submitted' ? 'bg-amber-100 text-amber-700' :
                  existingAppraisal.status === 'HOD_Approved' || existingAppraisal.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                    existingAppraisal.status === 'Returned' ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-700'
                }`}>
                <FileText size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Submission Status:</span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${existingAppraisal.status === 'Submitted' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                      existingAppraisal.status === 'HOD_Approved' || existingAppraisal.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                        existingAppraisal.status === 'Returned' ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-zinc-100 text-zinc-600'
                    }`}>
                    {existingAppraisal.status === 'HOD_Approved' ? 'Forwarded to HR' : existingAppraisal.status}
                  </span>
                </div>
                {existingAppraisal.hodReview?.comments && (
                  <p className="text-xs text-zinc-600 mt-1 italic">
                    HOD Remarks: "{existingAppraisal.hodReview.comments}"
                  </p>
                )}
              </div>
            </div>
            {isReadOnly && (
              <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
                Submitted form is currently locked for review
              </span>
            )}
          </div>
        )}

        {/* ═══ SECTION 1: GENERAL STAFF DETAILS (Q1-Q6) ═══ */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-zinc-100 mb-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <User size={18} />
            </div>
            <h2 className="text-base font-bold text-zinc-900">1. Staff Details (Questions 1 – 6)</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1.5">1. Staff Name *</label>
              <input
                type="text"
                disabled={isReadOnly}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                placeholder="Enter full name"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1.5">2. Date of Birth</label>
              <input
                type="date"
                disabled={isReadOnly}
                value={formData.dob}
                onChange={(e) => handleDobChange(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1.5">Age</label>
              <input
                type="text"
                readOnly
                value={formData.age}
                className="w-full bg-zinc-100 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm font-bold text-zinc-700 outline-none"
                placeholder="Auto-calculated"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1.5">3. Designation</label>
              <input
                type="text"
                disabled={isReadOnly}
                value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                placeholder="e.g. Lab Technician / Instructor / Superintendent"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1.5">Department *</label>
              <input
                type="text"
                disabled={isReadOnly}
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                placeholder="e.g. CSE / ECE / Mechanical / Office"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1.5">4. Date of Joining College</label>
              <input
                type="date"
                disabled={isReadOnly}
                value={formData.dojCollege}
                onChange={(e) => setFormData({ ...formData, dojCollege: e.target.value })}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1.5">Date of Joining Present Post</label>
              <input
                type="date"
                disabled={isReadOnly}
                value={formData.dojPresentPost}
                onChange={(e) => setFormData({ ...formData, dojPresentPost: e.target.value })}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-zinc-600 mb-1.5">5. Academic Qualification</label>
              <input
                type="text"
                disabled={isReadOnly}
                value={formData.qualification}
                onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                placeholder="e.g. B.Sc. / B.E. / Diploma / M.Sc."
              />
            </div>
          </div>

          {/* Q6: Experience */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-zinc-700 mb-2">6. Experience (Years)</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-zinc-50/70 p-4 rounded-2xl border border-zinc-100">
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 mb-1">a) At CKCET (Yrs)</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.expCKCET}
                  onChange={(e) => setFormData({ ...formData, expCKCET: e.target.value })}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                  placeholder="e.g. 5"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-500 mb-1">b) Other Institutions (Yrs)</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.expOther}
                  onChange={(e) => setFormData({ ...formData, expOther: e.target.value })}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                  placeholder="e.g. 2"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-500 mb-1">c) Industrial (Yrs)</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.expIndustrial}
                  onChange={(e) => setFormData({ ...formData, expIndustrial: e.target.value })}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                  placeholder="e.g. 1"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ═══ SECTION 2: ROLES & RESPONSIBILITIES (Q7) ═══ */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-zinc-100 mb-8 space-y-4">
          <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Briefcase size={18} />
            </div>
            <h2 className="text-base font-bold text-zinc-900">2. Roles & Responsibilities (Question 7)</h2>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-2">
              7. Explain the Roles and Responsibilities carried out during the Academic Year with details *
            </label>
            <textarea
              rows={4}
              disabled={isReadOnly}
              value={formData.rolesResponsibilities}
              onChange={(e) => setFormData({ ...formData, rolesResponsibilities: e.target.value })}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              placeholder="Describe your laboratory maintenance, register updates, student practical support, stock verification, and administrative duties..."
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-600 mb-1.5">Attach Additional Proof / Details Document URL (Optional)</label>
            <input
              type="text"
              disabled={isReadOnly}
              value={formData.rolesEvidenceUrl}
              onChange={(e) => setFormData({ ...formData, rolesEvidenceUrl: e.target.value })}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              placeholder="https://drive.google.com/..."
            />
          </div>
        </div>

        {/* ═══ SECTION 3: PUNCTUALITY, DISCIPLINE & LEAVE DETAILS (Q8-Q12) ═══ */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-zinc-100 mb-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Clock size={18} />
            </div>
            <h2 className="text-base font-bold text-zinc-900">3. Punctuality, Discipline & Leave (Questions 8 – 12)</h2>
          </div>

          <div className="space-y-4">
            {/* Q8 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-zinc-50/70 rounded-2xl border border-zinc-100 gap-3">
              <span className="text-xs font-bold text-zinc-700">8. Do you report on the scheduled time?</span>
              <div className="flex items-center gap-4">
                {["Yes", "Most of the time", "No"].map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                    <input
                      type="radio"
                      name="q8"
                      disabled={isReadOnly}
                      checked={formData.reportScheduledTime === opt}
                      onChange={() => setFormData({ ...formData, reportScheduledTime: opt })}
                      className="accent-indigo-600"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            {/* Q9 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-zinc-50/70 rounded-2xl border border-zinc-100 gap-3">
              <span className="text-xs font-bold text-zinc-700">9. Do you seek permission while attending outside work during working hours?</span>
              <div className="flex items-center gap-4">
                {["Yes", "Most of the time", "No"].map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                    <input
                      type="radio"
                      name="q9"
                      disabled={isReadOnly}
                      checked={formData.seekPermissionOutside === opt}
                      onChange={() => setFormData({ ...formData, seekPermissionOutside: opt })}
                      className="accent-indigo-600"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            {/* Q10 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-zinc-50/70 rounded-2xl border border-zinc-100 gap-3">
              <span className="text-xs font-bold text-zinc-700">10. Do you apply for leave in advance?</span>
              <div className="flex items-center gap-4">
                {["Yes", "Most of the time", "No"].map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                    <input
                      type="radio"
                      name="q10"
                      disabled={isReadOnly}
                      checked={formData.applyLeaveAdvance === opt}
                      onChange={() => setFormData({ ...formData, applyLeaveAdvance: opt })}
                      className="accent-indigo-600"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            {/* Q11 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-zinc-50/70 rounded-2xl border border-zinc-100 gap-3">
              <span className="text-xs font-bold text-zinc-700">11. Do you consume your balance CL in last month of academic session?</span>
              <div className="flex items-center gap-4">
                {["Yes", "If required", "No"].map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                    <input
                      type="radio"
                      name="q11"
                      disabled={isReadOnly}
                      checked={formData.consumeBalanceCL === opt}
                      onChange={() => setFormData({ ...formData, consumeBalanceCL: opt })}
                      className="accent-indigo-600"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Q12: Details of leave taken */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-zinc-700 mb-3">12. Details of leave taken during the Academic Year (July to June)</label>
            <div className="overflow-x-auto border border-zinc-200 rounded-2xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-100 text-zinc-700 font-bold border-b border-zinc-200">
                    <th colSpan={3} className="p-3 text-center border-r border-zinc-200">No. of Leave availed</th>
                    <th colSpan={3} className="p-3 text-center">No. of On Duty (OD) availed</th>
                  </tr>
                  <tr className="bg-zinc-50 text-zinc-600 font-bold border-b border-zinc-200 text-center">
                    <th className="p-2.5 border-r border-zinc-200">CL</th>
                    <th className="p-2.5 border-r border-zinc-200">C-OFF</th>
                    <th className="p-2.5 border-r border-zinc-200">LLP / LOP</th>
                    <th className="p-2.5 border-r border-zinc-200">Department</th>
                    <th className="p-2.5 border-r border-zinc-200">Institution</th>
                    <th className="p-2.5">Others</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="divide-x divide-zinc-200">
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        disabled={isReadOnly}
                        value={formData.leaveDetails.cl}
                        onChange={(e) => setFormData({ ...formData, leaveDetails: { ...formData.leaveDetails, cl: e.target.value } })}
                        className="w-full text-center bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-bold outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        disabled={isReadOnly}
                        value={formData.leaveDetails.coff}
                        onChange={(e) => setFormData({ ...formData, leaveDetails: { ...formData.leaveDetails, coff: e.target.value } })}
                        className="w-full text-center bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-bold outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        disabled={isReadOnly}
                        value={formData.leaveDetails.llp}
                        onChange={(e) => setFormData({ ...formData, leaveDetails: { ...formData.leaveDetails, llp: e.target.value } })}
                        className="w-full text-center bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-bold outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        disabled={isReadOnly}
                        value={formData.leaveDetails.odDept}
                        onChange={(e) => setFormData({ ...formData, leaveDetails: { ...formData.leaveDetails, odDept: e.target.value } })}
                        className="w-full text-center bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-bold outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        disabled={isReadOnly}
                        value={formData.leaveDetails.odInst}
                        onChange={(e) => setFormData({ ...formData, leaveDetails: { ...formData.leaveDetails, odInst: e.target.value } })}
                        className="w-full text-center bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-bold outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        disabled={isReadOnly}
                        value={formData.leaveDetails.odOthers}
                        onChange={(e) => setFormData({ ...formData, leaveDetails: { ...formData.leaveDetails, odOthers: e.target.value } })}
                        className="w-full text-center bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-bold outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ═══ SECTION 4: GRIEVANCES & INTERPERSONAL RELATIONSHIPS (Q13-Q19) ═══ */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-zinc-100 mb-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <HelpCircle size={18} />
            </div>
            <h2 className="text-base font-bold text-zinc-900">4. Grievances & Relationships (Questions 13 – 19)</h2>
          </div>

          <div className="space-y-5">
            {/* Q13 */}
            <div className="p-4 bg-zinc-50/70 rounded-2xl border border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-bold text-zinc-700">13. Are you happy with the redressal of your grievances?</span>
              <div className="flex items-center gap-4">
                {["Yes", "No", "Not Applicable"].map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                    <input
                      type="radio"
                      name="q13"
                      disabled={isReadOnly}
                      checked={formData.happyWithGrievances === opt}
                      onChange={() => setFormData({ ...formData, happyWithGrievances: opt })}
                      className="accent-indigo-600"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            {/* Q14: Relationship with Students */}
            <div className="p-4 bg-zinc-50/70 rounded-2xl border border-zinc-100 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-zinc-700">14. Relationship with the Students</span>
                <div className="flex flex-wrap items-center gap-3">
                  {["Good", "Fair", "Unsatisfactory", "Should be improved"].map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                      <input
                        type="radio"
                        name="q14"
                        disabled={isReadOnly}
                        checked={formData.relStudents.rating === opt}
                        onChange={() => setFormData({ ...formData, relStudents: { ...formData.relStudents, rating: opt } })}
                        className="accent-indigo-600"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
              {formData.relStudents.rating === "Should be improved" && (
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.relStudents.reason}
                  onChange={(e) => setFormData({ ...formData, relStudents: { ...formData.relStudents, reason: e.target.value } })}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Specify reason for improvement..."
                />
              )}
            </div>

            {/* Q15: Relationship with Colleagues */}
            <div className="p-4 bg-zinc-50/70 rounded-2xl border border-zinc-100 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-zinc-700">15. Relationship with the Colleagues</span>
                <div className="flex flex-wrap items-center gap-3">
                  {["Good", "Fair", "Unsatisfactory", "Should be improved"].map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                      <input
                        type="radio"
                        name="q15"
                        disabled={isReadOnly}
                        checked={formData.relColleagues.rating === opt}
                        onChange={() => setFormData({ ...formData, relColleagues: { ...formData.relColleagues, rating: opt } })}
                        className="accent-indigo-600"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
              {formData.relColleagues.rating === "Should be improved" && (
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.relColleagues.reason}
                  onChange={(e) => setFormData({ ...formData, relColleagues: { ...formData.relColleagues, reason: e.target.value } })}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Specify reason for improvement..."
                />
              )}
            </div>

            {/* Q16: Relationship with Superiors */}
            <div className="p-4 bg-zinc-50/70 rounded-2xl border border-zinc-100 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-zinc-700">16. Relationship with the Superiors</span>
                <div className="flex flex-wrap items-center gap-3">
                  {["Good", "Fair", "Unsatisfactory", "Should be improved"].map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                      <input
                        type="radio"
                        name="q16"
                        disabled={isReadOnly}
                        checked={formData.relSuperiors.rating === opt}
                        onChange={() => setFormData({ ...formData, relSuperiors: { ...formData.relSuperiors, rating: opt } })}
                        className="accent-indigo-600"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
              {formData.relSuperiors.rating === "Should be improved" && (
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={formData.relSuperiors.reason}
                  onChange={(e) => setFormData({ ...formData, relSuperiors: { ...formData.relSuperiors, reason: e.target.value } })}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Specify reason for improvement..."
                />
              )}
            </div>

            {/* Q17 */}
            <div className="p-4 bg-zinc-50/70 rounded-2xl border border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-bold text-zinc-700">17. Do you accomplish the given assignment in time?</span>
              <div className="flex items-center gap-4">
                {["Yes", "With reminder", "Depends on my interest"].map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                    <input
                      type="radio"
                      name="q17"
                      disabled={isReadOnly}
                      checked={formData.accomplishAssignmentInTime === opt}
                      onChange={() => setFormData({ ...formData, accomplishAssignmentInTime: opt })}
                      className="accent-indigo-600"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            {/* Q18 */}
            <div className="p-4 bg-zinc-50/70 rounded-2xl border border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-bold text-zinc-700">18. How do you feel about your potential utilization by Department / Institution?</span>
              <div className="flex flex-wrap items-center gap-3">
                {["Over Burdened", "Properly Utilized", "Under Utilized", "Not utilized At all"].map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                    <input
                      type="radio"
                      name="q18"
                      disabled={isReadOnly}
                      checked={formData.potentialUtilization === opt}
                      onChange={() => setFormData({ ...formData, potentialUtilization: opt })}
                      className="accent-indigo-600"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            {/* Q19 */}
            <div className="p-4 bg-zinc-50/70 rounded-2xl border border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-bold text-zinc-700">19. From the above assessment, where would you put yourself?</span>
              <div className="flex items-center gap-4">
                {["Above", "At par", "Below"].map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                    <input
                      type="radio"
                      name="q19"
                      disabled={isReadOnly}
                      checked={formData.selfAssessmentPlacement === opt}
                      onChange={() => setFormData({ ...formData, selfAssessmentPlacement: opt })}
                      className="accent-indigo-600"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ SECTION 5: INVEST IN YOURSELF & ADMISSIONS (Q20-Q22) ═══ */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-zinc-100 mb-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Award size={18} />
            </div>
            <h2 className="text-base font-bold text-zinc-900">5. Invest In Yourself & Admissions (Questions 20 – 22)</h2>
          </div>

          {/* Q20: IIY Courses Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-zinc-700">
                20. INVEST IN YOURSELF (IIY) – Details of Online Courses / Training Completed
              </label>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={addIiyCourse}
                  className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-all"
                >
                  <Plus size={14} /> Add Course
                </button>
              )}
            </div>

            <div className="overflow-x-auto border border-zinc-200 rounded-2xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-100 text-zinc-700 font-bold border-b border-zinc-200">
                    <th className="p-3 w-12 text-center">#</th>
                    <th className="p-3">Title of Course</th>
                    <th className="p-3 w-32">Start Date</th>
                    <th className="p-3 w-32">End Date</th>
                    <th className="p-3 w-20 text-center">Weeks</th>
                    <th className="p-3 w-32">Platform</th>
                    <th className="p-3 w-32">Exam Date</th>
                    <th className="p-3 w-28 text-center">Certificate (Y/N)</th>
                    {!isReadOnly && <th className="p-3 w-12 text-center">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {formData.iiyCourses.map((c, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/50">
                      <td className="p-2 text-center font-bold text-zinc-500">{idx + 1}</td>
                      <td className="p-2">
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={c.title}
                          onChange={(e) => updateIiyCourse(idx, "title", e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="e.g. NPTEL Lab Safety"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="date"
                          disabled={isReadOnly}
                          value={c.startDate}
                          onChange={(e) => updateIiyCourse(idx, "startDate", e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="date"
                          disabled={isReadOnly}
                          value={c.endDate}
                          onChange={(e) => updateIiyCourse(idx, "endDate", e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="1"
                          disabled={isReadOnly}
                          value={c.weeks}
                          onChange={(e) => updateIiyCourse(idx, "weeks", e.target.value)}
                          className="w-full text-center bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="4"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={c.platform}
                          onChange={(e) => updateIiyCourse(idx, "platform", e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="e.g. NPTEL / Coursera"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="date"
                          disabled={isReadOnly}
                          value={c.examDate}
                          onChange={(e) => updateIiyCourse(idx, "examDate", e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <select
                          disabled={isReadOnly}
                          value={c.certificateReceived}
                          onChange={(e) => updateIiyCourse(idx, "certificateReceived", e.target.value)}
                          className="bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </td>
                      {!isReadOnly && (
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeIiyCourse(idx)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-bold text-zinc-600 mb-1.5">Specify the Outcome and Achievements of IIY</label>
              <textarea
                rows={2}
                disabled={isReadOnly}
                value={formData.iiyOutcome}
                onChange={(e) => setFormData({ ...formData, iiyOutcome: e.target.value })}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl p-3.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Mention practical skills acquired, certifications earned, or laboratory improvements implemented..."
              />
            </div>
          </div>

          {/* Q21: Admissions Table */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-zinc-700">
                21. No of admission contributed to the Institutions for the AY
              </label>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={addAdmission}
                  className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-all"
                >
                  <Plus size={14} /> Add Entry
                </button>
              )}
            </div>

            <div className="overflow-x-auto border border-zinc-200 rounded-2xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-100 text-zinc-700 font-bold border-b border-zinc-200">
                    <th className="p-3 w-12 text-center">#</th>
                    <th className="p-3">Team No & Area</th>
                    <th className="p-3 w-40 text-center">No of Admissions Contributed</th>
                    <th className="p-3">Name of the Team Leader</th>
                    {!isReadOnly && <th className="p-3 w-12 text-center">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {formData.admissionsContributed.map((adm, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/50">
                      <td className="p-2 text-center font-bold text-zinc-500">{idx + 1}</td>
                      <td className="p-2">
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={adm.teamNoArea}
                          onChange={(e) => updateAdmission(idx, "teamNoArea", e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Team 3 - Cuddalore"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          disabled={isReadOnly}
                          value={adm.count}
                          onChange={(e) => updateAdmission(idx, "count", e.target.value)}
                          className="w-full text-center bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="2"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={adm.teamLeader}
                          onChange={(e) => updateAdmission(idx, "teamLeader", e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Prof. Name / HOD"
                        />
                      </td>
                      {!isReadOnly && (
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeAdmission(idx)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Q22: Other Info */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-zinc-700 mb-1.5">
              22. Any other relevant information not covered above
            </label>
            <textarea
              rows={3}
              disabled={isReadOnly}
              value={formData.otherInfo}
              onChange={(e) => setFormData({ ...formData, otherInfo: e.target.value })}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Any additional responsibilities, achievements, or contributions..."
            />
          </div>
        </div>

        {/* ═══ SECTION 6: DECLARATION & SUBMISSION ═══ */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-zinc-100 mb-8 space-y-6">
          <div className="p-5 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                disabled={isReadOnly}
                checked={formData.certified}
                onChange={(e) => setFormData({ ...formData, certified: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-indigo-600 rounded"
              />
              <span className="text-xs font-bold text-indigo-950 leading-relaxed">
                I certify that the details given above are correct to the best of my knowledge and belief.
              </span>
            </label>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 gap-3 text-xs text-zinc-600 font-medium">
              <div>
                <span className="font-bold text-zinc-700">Date:</span> {formData.dateSubmitted}
              </div>
              <div>
                <span className="font-bold text-zinc-700">Staff Signature:</span> {formData.name || "Signed Digitally"}
              </div>
            </div>
          </div>

          {/* Buttons */}
          {!isReadOnly && (
            <div className="flex flex-col sm:flex-row items-center justify-end gap-4 pt-2">
              <button
                type="button"
                disabled={saving || submitting}
                onClick={() => handleSave(false)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition-all text-sm disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span>Save Draft</span>
              </button>

              <button
                type="button"
                disabled={saving || submitting}
                onClick={() => handleSave(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all text-sm disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                <span>Submit to HOD</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
