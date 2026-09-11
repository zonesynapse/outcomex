import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { 
  User, Calendar, Briefcase, BookOpen, Award, CheckCircle2, 
  Plus, Trash2, Save, Send, AlertTriangle, FileText, ChevronRight,
  ChevronLeft, Sparkles, HeartHandshake, Eye, Check, Loader2, RefreshCw, Users, Library,
  UploadCloud, Paperclip, Edit2, X
} from "lucide-react";
import Layout from "../components/Layout";
import { uploadFile, userStoragePath } from "../utils/fileUpload";

export default function FacultyAppraisal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(1);
  const [existingAppraisal, setExistingAppraisal] = useState(null);
  const [customFieldsConfig, setCustomFieldsConfig] = useState([]);
  const [uploadingMap, setUploadingMap] = useState({});
  const [isEditingSubmitted, setIsEditingSubmitted] = useState(false);

  // Form State
  const [academicYear, setAcademicYear] = useState("2024-2025");
  const [appraisalSchedule, setAppraisalSchedule] = useState(null);
  const [isPortalOpen, setIsPortalOpen] = useState(true);
  const [checkingSchedule, setCheckingSchedule] = useState(true);
  const [formData, setFormData] = useState({
    // General Info
    name: "",
    dob: "",
    age: "",
    designation: "",
    department: "",
    dojCollege: "",
    dojPresentPost: "",
    academicQualification: "",
    subjectSpecialization: "",
    experience: {
      teachingCKCET: "",
      teachingElsewhere: "",
      industrial: ""
    },
    workloadWeek: {
      oddTheory: "",
      oddPractical: "",
      oddTotal: "",
      evenTheory: "",
      evenPractical: "",
      evenTotal: ""
    },

    // Subjects & Results (Odd Semester)
    oddTheorySubjects: [{ class: "", subjectCodeTitle: "", appeared: "", passed: "", resultPercentage: "", feedbackRating: "" }],
    oddPracticalSubjects: [{ class: "", subjectCodeTitle: "", appeared: "", passed: "", resultPercentage: "", feedbackRating: "" }],
    
    // Subjects & Results (Even Semester)
    evenTheorySubjects: [{ class: "", subjectCodeTitle: "", appeared: "", passed: "", resultPercentage: "", feedbackRating: "" }],
    evenPracticalSubjects: [{ class: "", subjectCodeTitle: "", appeared: "", passed: "", resultPercentage: "", feedbackRating: "" }],
    
    resultAttribution: "Both", // Yourself, Students, Both, Prevailing Circumstances
    professionalMembership: [{ name: "", type: "Life Member", membershipNo: "" }],
    awardsHonors: [{ awardName: "", organization: "", year: "", level: "Institutional" }],

    // Invest In Yourself
    onlineCourses: [{ title: "", startDate: "", endDate: "", weeks: "", platform: "", examDate: "", certificateReceived: "Yes" }],
    onlineCoursesOutcome: "",
    researchPapers: [{ title: "", dateMonthYear: "", journal: "", volumeIssue: "", issnIsbn: "", sciScopusUgc: "UGC" }],
    workshopsFDPs: [{ title: "", dates: "", days: "", organization: "", reportSubmitted: "Yes" }],
    improvingQualification: false,
    improvingDetails: [{ degreeRegistered: "", specialization: "", university: "", duration: "", status: "", nocObtained: "Yes" }],

    // Department / Institution Development Contributions
    organizingPrograms: [{ title: "", period: "", resourcePersonDetails: "", targetAudience: "", outcome: "" }],
    fundingProposals: [{ role: "PI", fundingAgencyScheme: "", title: "", fundRequested: "", dateSubmission: "", status: "" }],
    involvementPlacement: [{ description: "", role: "", outcome: "", recordsMaintained: "Yes" }],
    accreditationContributions: [{ role: "", description: "", outcome: "" }],
    rdContributions: [{ role: "", description: "", outcome: "" }],
    resultImprovementHOD: "", // HOD only
    deptAdministrationHOD: "", // HOD only
    otherRolesContribution: "",
    admissionContribution: [{ teamNoArea: "", countContributed: "", teamLeaderName: "" }],

    // Library, Leaves & Grievances
    libraryUsage: "",
    libraryPurpose: "Subject Preparation", // Subject Preparation / Research / GK / Others
    accomplishAssignment: "Yes", // Yes / with reminder / Depends on my interest
    applyLeaveInAdvance: "Yes", // Yes / Most of the time / No
    leaveDetails: {
      cl: "",
      coff: "",
      lop: "",
      odUniversity: "",
      odOthers: "",
      odInstitution: ""
    },
    consumeClLastMonth: "No", // Yes / If required / No
    happyGrievanceMechanism: "Yes", // Yes / No / Not Applicable
    
    // Interpersonal Relations
    relationStudents: { rating: "Good", reason: "" },
    relationColleagues: { rating: "Good", reason: "" },
    relationSuperiors: { rating: "Good", reason: "" },
    relationDepartment: { rating: "Good", reason: "" },
    potentialUtilized: "Properly Utilized", // Over Burdened / Properly Utilized / Under Utilized / Not utilized at all
    
    // Future Targets & Suggestions
    targetsNextSemester: "",
    targetsStrategy: "",
    difficultiesOnCampus: "",
    selfPlacementGrading: "At par", // Above, At par, Below
    
    // Self Analysis
    selfAnalysisStrengths: ["", "", "", ""],
    selfAnalysisWeaknesses: ["", "", "", ""],
    customFields: {}
  });

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const profile = userSnap.data();
          setUserProfile(profile);
          
          setFormData(prev => ({
            ...prev,
            name: profile.displayName || profile.facultyName || "",
            designation: profile.designation || "",
            department: profile.department || "",
            academicQualification: profile.academicQualification || profile.qualification || "",
            dojCollege: profile.dojCollege || "",
            dob: profile.dob || "",
          }));
        }
      }
    });
  }, []);

  useEffect(() => {
    const docRef = doc(db, "appraisal_config", "schedule");
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const sched = snap.data();
        setAppraisalSchedule(sched);
        
        if (sched.isActive) {
          const now = new Date().getTime();
          const start = sched.openTime ? new Date(sched.openTime).getTime() : null;
          const end = sched.closeTime ? new Date(sched.closeTime).getTime() : null;
          
          let open = true;
          if (start && now < start) open = false;
          if (end && now > end) open = false;
          setIsPortalOpen(open);
          
          if (sched.academicYear) {
            setAcademicYear(sched.academicYear);
          }
        } else {
          setIsPortalOpen(false);
        }
      } else {
        // If no config, default to open
        setIsPortalOpen(true);
      }
      setCheckingSchedule(false);
    }, (err) => {
      console.error("Error checking appraisal schedule:", err);
      setCheckingSchedule(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const docRef = doc(db, "appraisal_config", "form_fields");
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setCustomFieldsConfig(snap.data().fields || []);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUser || !academicYear) return;
    const docId = `appraisal_${currentUser.uid}_${academicYear}`;
    const unsub = onSnapshot(doc(db, "faculty_appraisals", docId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setExistingAppraisal(data);
        const savedForm = data.formData || data;
        setFormData({
          ...savedForm,
          customFields: savedForm.customFields || {}
        });
      } else {
        setExistingAppraisal(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser, academicYear]);

  const addRow = (field, defaultValue) => {
    setFormData(prev => ({
      ...prev,
      [field]: [...prev[field], defaultValue]
    }));
  };

  const removeRow = (field, index) => {
    setFormData(prev => {
      const list = [...prev[field]];
      if (list.length > 1) {
        list.splice(index, 1);
      }
      return { ...prev, [field]: list };
    });
  };

  const updateRow = (field, index, key, value) => {
    setFormData(prev => {
      const list = [...prev[field]];
      list[index] = { ...list[index], [key]: value };
      return { ...prev, [field]: list };
    });
  };

  const updateListVal = (field, index, value) => {
    setFormData(prev => {
      const list = [...prev[field]];
      list[index] = value;
      return { ...prev, [field]: list };
    });
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleNestedInputChange = (parent, field, value) => {
    setFormData(prev => ({
      ...prev,
      [parent]: {
        ...prev[parent],
        [field]: value
      }
    }));
  };

  const isSectionEvidenceRequired = (secId) => {
    return customFieldsConfig.find(f => f.id === secId)?.evidenceRequired === true;
  };

  const handleRowFileSelect = async (e, listKey, index, sectionId) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check size limit dynamically (default to 300KB if not specified)
    const sectionConfig = customFieldsConfig.find(f => f.id === sectionId);
    const maxSizeKb = sectionConfig?.maxSizeKb ? parseInt(sectionConfig.maxSizeKb) : 300;
    if (file.size > maxSizeKb * 1024) {
      showToast(`File size is ${(file.size / 1024).toFixed(1)} KB, which exceeds the limit of ${maxSizeKb} KB configured for this section.`, "error");
      e.target.value = ""; // Reset the input
      return;
    }

    setUploadingMap(prev => ({ ...prev, [`${listKey}_${index}`]: true }));
    try {
      const storagePath = userStoragePath(currentUser.uid, "appraisal_evidences", `${listKey}_row_${index}_${file.name}`);
      const downloadUrl = await uploadFile(storagePath, file, file.type);
      setFormData(prev => {
        const updatedList = [...(prev[listKey] || [])];
        if (updatedList[index]) {
          updatedList[index] = {
            ...updatedList[index],
            fileUrl: downloadUrl,
            fileName: file.name
          };
        }
        return { ...prev, [listKey]: updatedList };
      });
      showToast(`Uploaded evidence file for row ${index + 1}!`, "success");
    } catch (err) {
      console.error("Error uploading row evidence:", err);
      showToast("File upload failed. Please try again.", "error");
    }
    setUploadingMap(prev => ({ ...prev, [`${listKey}_${index}`]: false }));
  };

  const handleRemoveRowFile = (listKey, index) => {
    setFormData(prev => {
      const updatedList = [...(prev[listKey] || [])];
      if (updatedList[index]) {
        updatedList[index] = {
          ...updatedList[index],
          fileUrl: "",
          fileName: ""
        };
      }
      return { ...prev, [listKey]: updatedList };
    });
    showToast("Evidence file removed.", "success");
  };

  const renderRowEvidenceHeader = (sectionId) => {
    if (!isSectionEvidenceRequired(sectionId)) return null;
    return <th className="border border-zinc-200 p-2 text-center w-28">Evidence</th>;
  };

  const renderRowEvidenceCell = (listKey, row, index, sectionId) => {
    if (!isSectionEvidenceRequired(sectionId)) return null;

    const isUploading = uploadingMap[`${listKey}_${index}`];

    return (
      <td className="border border-zinc-200 p-1.5 text-center min-w-[120px]">
        {row.fileUrl ? (
          <div className="flex items-center justify-center gap-1.5">
            <a 
              href={row.fileUrl} 
              target="_blank" 
              rel="noreferrer" 
              className="text-[10px] font-extrabold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded truncate max-w-[80px]"
              title={row.fileName || "View Proof"}
            >
              Proof
            </a>
            {!isReadOnly && (
              <button 
                type="button"
                onClick={() => handleRemoveRowFile(listKey, index)} 
                className="text-rose-500 hover:text-rose-700"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ) : isUploading ? (
          <div className="flex items-center justify-center gap-1 text-zinc-400 font-bold text-[9px] uppercase">
            <Loader2 size={10} className="animate-spin text-indigo-600" />
            <span>Uploading...</span>
          </div>
        ) : !isReadOnly ? (
          <div className="flex justify-center">
            <label 
              htmlFor={`file_${listKey}_${index}`} 
              className="cursor-pointer text-[9px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded uppercase hover:bg-indigo-100 transition-all flex items-center gap-0.5"
            >
              <UploadCloud size={9} />
              <span>Attach</span>
            </label>
            <input 
              type="file" 
              id={`file_${listKey}_${index}`} 
              className="hidden" 
              onChange={(e) => handleRowFileSelect(e, listKey, index, sectionId)} 
            />
          </div>
        ) : (
          <span className="text-zinc-400 font-semibold text-[10px]">-</span>
        )}
      </td>
    );
  };

  const handleCancelEdits = () => {
    if (existingAppraisal) {
      const savedForm = existingAppraisal.formData || existingAppraisal;
      setFormData({
        ...savedForm,
        customFields: savedForm.customFields || {}
      });
    }
    setIsEditingSubmitted(false);
    showToast("Edits cancelled. Reverted to submitted values.", "success");
  };

  const hasFieldEvidence = (field, fData) => {
    if (!field || !fData) return false;
    // 1. Direct fileUrl on customFields[field.id]
    const entry = fData.customFields?.[field.id];
    if (entry && entry.fileUrl) return true;

    // 2. Mapped lists for built-in sections
    const sectionListMap = {
      sec_subjects_results: ["oddTheorySubjects", "oddPracticalSubjects", "evenTheorySubjects", "evenPracticalSubjects"],
      sec_academic_nptel: ["onlineCourses", "nptelCertifications"],
      sec_academic_fdp: ["workshopsFDPs", "fdpAttended"],
      sec_academic_journals: ["researchPapers", "journalPublications"],
      sec_academic_books: ["bookPublications", "improvingDetails"],
      sec_roles_department: [
        "organizingPrograms",
        "fundingProposals",
        "involvementPlacement",
        "accreditationContributions",
        "rdContributions",
        "admissionContribution",
        "departmentRoles"
      ],
      sec_professional_memberships: ["professionalMembership"],
      sec_awards_honors: ["awardsHonors"],
      sec_profile_experience: ["experienceRecords"],
      sec_library_usage: ["libraryUsage"],
      sec_leave_summary: ["leaveSummary"]
    };

    const listKeys = sectionListMap[field.id] || [];
    for (const key of listKeys) {
      const list = fData[key];
      if (Array.isArray(list) && list.some(row => row && row.fileUrl)) {
        return true;
      }
    }

    if (Array.isArray(fData[field.id]) && fData[field.id].some(row => row && row.fileUrl)) {
      return true;
    }

    if (fData[field.id] && typeof fData[field.id] === 'object' && fData[field.id].fileUrl) {
      return true;
    }

    return false;
  };

  const isSectionPopulated = (field, fData) => {
    if (!field || !fData) return false;
    const entry = fData.customFields?.[field.id];
    if (entry && (entry.value || entry.fileUrl)) return true;

    const sectionListMap = {
      sec_subjects_results: ["oddTheorySubjects", "oddPracticalSubjects", "evenTheorySubjects", "evenPracticalSubjects"],
      sec_academic_nptel: ["onlineCourses", "nptelCertifications"],
      sec_academic_fdp: ["workshopsFDPs", "fdpAttended"],
      sec_academic_journals: ["researchPapers", "journalPublications"],
      sec_academic_books: ["bookPublications", "improvingDetails"],
      sec_roles_department: [
        "organizingPrograms",
        "fundingProposals",
        "involvementPlacement",
        "accreditationContributions",
        "rdContributions",
        "admissionContribution",
        "departmentRoles"
      ],
      sec_professional_memberships: ["professionalMembership"],
      sec_awards_honors: ["awardsHonors"],
      sec_profile_experience: ["experienceRecords"],
      sec_library_usage: ["libraryUsage"],
      sec_leave_summary: ["leaveSummary"]
    };

    const listKeys = sectionListMap[field.id] || [];
    const ignoredKeys = new Set(['fileUrl', 'fileName', 'level', 'type', 'resultAttribution', 'certificateReceived', 'reportSubmitted', 'sciScopusUgc', 'nocObtained']);

    for (const key of listKeys) {
      const list = fData[key];
      if (Array.isArray(list)) {
        for (const row of list) {
          if (row) {
            const values = Object.entries(row)
              .filter(([k]) => !ignoredKeys.has(k))
              .map(([, v]) => String(v || '').trim())
              .filter(Boolean);
            if (values.length > 0) return true;
          }
        }
      }
    }

    if (Array.isArray(fData[field.id])) {
      for (const row of fData[field.id]) {
        if (row) {
          const values = Object.values(row).map(v => String(v || '').trim()).filter(Boolean);
          if (values.length > 0) return true;
        }
      }
    }

    return false;
  };

  const handleSave = async (isSubmit = false) => {
    if (!currentUser) return;
    setSaving(true);

    if (isSubmit) {
      // Check mandatory dynamic field & section evidence files
      for (const field of customFieldsConfig) {
        if (field.evidenceRequired && field.evidenceMandatory) {
          const populated = isSectionPopulated(field, formData);
          const hasEvidence = hasFieldEvidence(field, formData);
          if (populated && !hasEvidence) {
            showToast(`Evidence document is required for: "${field.title}"`, "error");
            setSaving(false);
            return;
          }
        }
      }
    }

    const docId = `appraisal_${currentUser.uid}_${academicYear}`;
    const status = isSubmit ? "Submitted" : "Draft";

    const payload = {
      uid: currentUser.uid,
      facultyName: formData.name,
      facultyEmail: currentUser.email,
      department: formData.department,
      designation: formData.designation,
      academicYear,
      status,
      formData,
      submittedAt: isSubmit ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
      hodReview: existingAppraisal?.hodReview || null,
      principalReview: existingAppraisal?.principalReview || null
    };

    try {
      await setDoc(doc(db, "faculty_appraisals", docId), payload);
      showToast(isSubmit ? "Appraisal Request Submitted Successfully!" : "Draft Saved Successfully!", "success");
      setIsEditingSubmitted(false);
    } catch (error) {
      console.error("Error saving appraisal:", error);
      showToast("Failed to save appraisal request.", "error");
    }
    setSaving(false);
  };

  const isSectionVisible = (id) => {
    const field = customFieldsConfig.find(f => f.id === id);
    return field ? field.visible !== false : true;
  };

  const getSectionTitle = (id, defaultTitle) => {
    const field = customFieldsConfig.find(f => f.id === id);
    return field ? field.title : defaultTitle;
  };

  const getSectionDescription = (id, defaultDesc) => {
    const field = customFieldsConfig.find(f => f.id === id);
    return field ? field.description : defaultDesc;
  };

  const tabs = useMemo(() => {
    const baseTabs = [
      { id: 1, name: "Profile & Workload" },
      { id: 2, name: "Subjects & Results" },
      { id: 3, name: "Academic Development" },
      { id: 4, name: "Institutional Roles" },
      { id: 5, name: "Library & Leaves" },
      { id: 6, name: "Relations & Targets" },
      { id: 7, name: "Evidences & Disclosures" }
    ];
    return baseTabs.filter(tab => {
      return customFieldsConfig.some(f => f.tabId === tab.id && f.visible !== false);
    });
  }, [customFieldsConfig]);

  if (checkingSchedule) {
    return (
      <Layout title="Faculty Self Appraisal">
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-400">
          <Loader2 size={36} className="animate-spin text-[#120c7a]" />
          <span className="text-xs font-bold uppercase tracking-wider">Checking appraisal window schedule...</span>
        </div>
      </Layout>
    );
  }

  const isAdminOrHR = userProfile?.role === "HR" || userProfile?.role === "Admin";
  if (!isPortalOpen && !existingAppraisal && !isAdminOrHR) {
    return (
      <Layout title="Faculty Self Appraisal">
        <div className="max-w-xl mx-auto py-16 px-4">
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-xl overflow-hidden text-center text-zinc-805 p-8 space-y-6">
            <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <Calendar size={32} />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-805 uppercase tracking-wide">Appraisal Portal is Closed</h2>
              <p className="text-zinc-500 text-xs font-medium">
                The self-appraisal request submission portal is currently inactive or has reached its deadline.
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

            <p className="text-[10px] text-zinc-400 font-bold uppercase">Please reach out to your HR Coordinator or administrator for assistance.</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout title="Faculty Self Appraisal">
        <div className="flex justify-center items-center py-24">
          <Loader2 size={36} className="animate-spin text-[#120c7a]" />
        </div>
      </Layout>
    );
  }

  const renderTabCustomFields = (tId) => {
    const tabFields = customFieldsConfig.filter(f => 
      f.tabId === tId && 
      f.visible !== false && 
      (f.id.startsWith("field_") || (f.id.startsWith("f_") && f.evidenceRequired))
    );
    if (tabFields.length === 0) return null;

    return (
      <div className="mt-8 pt-8 border-t border-zinc-150 space-y-6">
        <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5 mb-4">
          <Award size={14} className="text-[#120c7a]" /> Additional Evidences & Disclosures
        </h4>
        <div className="grid grid-cols-1 gap-6">
          {tabFields.map((field) => {
            const savedEntry = formData.customFields?.[field.id] || { value: "", fileUrl: "", fileName: "" };
            const isUploading = uploadingMap[field.id];

            const handleFieldTextChange = (val) => {
              setFormData(prev => ({
                ...prev,
                customFields: {
                  ...prev.customFields,
                  [field.id]: {
                    ...savedEntry,
                    label: field.title,
                    value: val
                  }
                }
              }));
            };

            const handleFileSelect = async (e) => {
              const file = e.target.files[0];
              if (!file) return;

              // Check size limit dynamically (default to 300KB if not specified)
              const maxSizeKb = field.maxSizeKb ? parseInt(field.maxSizeKb) : 300;
              if (file.size > maxSizeKb * 1024) {
                showToast(`File size is ${(file.size / 1024).toFixed(1)} KB, which exceeds the limit of ${maxSizeKb} KB configured for this field.`, "error");
                e.target.value = ""; // Reset input
                return;
              }

              setUploadingMap(prev => ({ ...prev, [field.id]: true }));
              try {
                const storagePath = userStoragePath(currentUser.uid, "appraisal_evidences", `${field.id}_${file.name}`);
                const downloadUrl = await uploadFile(storagePath, file, file.type);
                setFormData(prev => ({
                  ...prev,
                  customFields: {
                    ...prev.customFields,
                    [field.id]: {
                      ...savedEntry,
                      label: field.title,
                      fileUrl: downloadUrl,
                      fileName: file.name
                    }
                  }
                }));
                showToast(`Uploaded evidence file for "${field.title}"!`, "success");
              } catch (err) {
                console.error("Error uploading evidence:", err);
                showToast("File upload failed. Please try again.", "error");
              }
              setUploadingMap(prev => ({ ...prev, [field.id]: false }));
            };

            const handleRemoveFile = () => {
              setFormData(prev => ({
                ...prev,
                customFields: {
                  ...prev.customFields,
                  [field.id]: {
                    ...savedEntry,
                    fileUrl: "",
                    fileName: ""
                  }
                }
              }));
              showToast("Evidence attachment removed.", "success");
            };

            return (
              <div key={field.id} className="bg-zinc-50 border border-zinc-150 p-6 rounded-2xl space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-black text-slate-805 uppercase tracking-wider">{field.title}</label>
                    {field.evidenceRequired && (
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        field.evidenceMandatory 
                          ? "bg-red-50 border border-red-150 text-red-700 animate-pulse font-sans" 
                          : "bg-indigo-50 border border-indigo-100 text-indigo-750 font-sans"
                      }`}>
                        {field.evidenceMandatory ? "Mandatory Evidence" : "Evidence Welcome"}
                      </span>
                    )}
                  </div>
                  {field.description && (
                    <p className="text-[10px] text-zinc-400 font-semibold mt-1 uppercase leading-relaxed">{field.description}</p>
                  )}
                </div>

                {field.type !== "file_only" && (
                  <div>
                    {field.type === "textarea" ? (
                      <textarea
                        value={savedEntry.value || ""}
                        onChange={(e) => handleFieldTextChange(e.target.value)}
                        disabled={isReadOnly}
                        rows={4}
                        className="w-full rounded-xl border border-zinc-200 p-3 text-xs bg-white focus:outline-none font-medium"
                        placeholder="Type details here..."
                      />
                    ) : (
                      <input
                        type={field.type}
                        value={savedEntry.value || ""}
                        onChange={(e) => handleFieldTextChange(e.target.value)}
                        disabled={isReadOnly}
                        className="w-full rounded-xl border border-zinc-200 p-3 text-xs bg-white focus:outline-none font-medium"
                        placeholder="Type answer here..."
                      />
                    )}
                  </div>
                )}

                {field.evidenceRequired && (
                  <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-[#120c7a]">
                        <Paperclip size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">Evidence File Proof</span>
                        {savedEntry.fileUrl ? (
                          <a 
                            href={savedEntry.fileUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-xs font-bold text-blue-600 hover:underline truncate max-w-xs block"
                          >
                            {savedEntry.fileName || "View Attachment"}
                          </a>
                        ) : (
                          <span className="text-xs font-bold text-zinc-400 italic">No File Uploaded</span>
                        )}
                      </div>
                    </div>

                    {!isReadOnly && (
                      <div className="flex items-center gap-2">
                        {savedEntry.fileUrl ? (
                          <button
                            type="button"
                            onClick={handleRemoveFile}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            Remove File
                          </button>
                        ) : (
                          <label className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-[#120c7a] border border-indigo-150 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5">
                            {isUploading ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
                            Upload Evidence
                            <input 
                              type="file" 
                              onChange={handleFileSelect} 
                              disabled={isUploading}
                              className="hidden" 
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const isReadOnly = (existingAppraisal?.status === "Submitted" || existingAppraisal?.status === "HOD_Approved" || existingAppraisal?.status === "Approved") && !isEditingSubmitted;
  const isHOD = userProfile?.role === "HOD";

  return (
    <Layout title="Faculty Self Appraisal Form">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Toast Alert */}
        {toast.show && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-5 py-3.5 rounded-xl text-white font-bold shadow-lg animate-slideIn ${toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"}`}>
            <CheckCircle2 size={18} />
            <span>{toast.message}</span>
          </div>
        )}

        {/* Top Header Card */}
        <div className="bg-gradient-to-tr from-[#120c7a] via-[#1a10a0] to-indigo-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden mb-8">
          <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-black tracking-widest uppercase w-fit">
                <Sparkles size={12} className="text-amber-400" /> HR Appraisal System
              </div>
              <h1 className="text-lg md:text-xl font-bold font-serif">Self Appraisal Request Form</h1>
              <p className="text-indigo-200 text-xs md:text-sm">Submit your performance evaluation request for the academic session {academicYear}.</p>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-indigo-200 whitespace-nowrap">Academic Year:</span>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                disabled={true}
                className="bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/40"
              >
                <option value="2024-2025">2024-2025</option>
                <option value="2025-2026">2025-2026</option>
                <option value="2026-2027">2026-2027</option>
              </select>
            </div>
          </div>

          {/* Status Badge */}
          {existingAppraisal && (
            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-4 text-xs font-bold w-full">
              <div className="flex items-center gap-4">
                <span>Status:</span>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  existingAppraisal.status === "Approved" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" :
                  existingAppraisal.status === "HOD_Approved" ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" :
                  existingAppraisal.status === "Submitted" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" :
                  existingAppraisal.status === "Returned" ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" :
                  "bg-zinc-500/20 text-zinc-300 border border-zinc-500/30"
                }`}>
                  {existingAppraisal.status.replace("_", " ")}
                </span>

                {existingAppraisal.status === "Returned" && existingAppraisal.hodReview?.comments && (
                  <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-rose-300 flex items-start gap-2 max-w-2xl">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <div>
                      <span className="font-black">Correction Comment:</span> {existingAppraisal.hodReview.comments}
                    </div>
                  </div>
                )}
              </div>

              {(existingAppraisal.status === "Submitted" || existingAppraisal.status === "HOD_Approved") && !isEditingSubmitted && (
                <button
                  type="button"
                  onClick={() => setIsEditingSubmitted(true)}
                  className="px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-900 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-yellow-500/10 border-0"
                >
                  <Edit2 size={12} /> Request Edit / Unlock Form
                </button>
              )}
            </div>
          )}
        </div>

        {/* Read-Only Banner */}
        {isReadOnly && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl flex items-center gap-3 mb-6">
            <CheckCircle2 size={18} className="text-amber-600 shrink-0" />
            <div className="text-xs font-semibold">
              This appraisal has been submitted and is currently in read-only mode. You cannot make any edits unless it is returned for corrections.
            </div>
          </div>
        )}

        {/* Tab Headers */}
        <div className="flex border-b border-zinc-200 overflow-x-auto gap-2 mb-8 no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-4 px-4 text-xs font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "border-[#120c7a] text-[#120c7a]"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 md:p-8 mb-6">
          
          {/* TAB 1: PROFILE & WORKLOAD */}
          {activeTab === 1 && (
            <div className="space-y-6 animate-fadeIn">
              {isSectionVisible("sec_profile_details") && (
                <div>
                  <div style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                    <User size={12} className="text-[#120c7a]" /> 
                    {getSectionTitle("sec_profile_details", "1.1 Basic Profile Details")}
                  </div>
                  {getSectionDescription("sec_profile_details") && (
                    <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_profile_details")}</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {isSectionVisible("f_name") && (
                      <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">{getSectionTitle("f_name", "Faculty Name")}</label>
                        {getSectionDescription("f_name") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_name")}</p>}
                        <input type="text" value={formData.name} onChange={(e) => handleInputChange("name", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    )}
                    {isSectionVisible("f_dob") && (
                      <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">{getSectionTitle("f_dob", "Date of Birth")}</label>
                        {getSectionDescription("f_dob") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_dob")}</p>}
                        <input type="date" value={formData.dob} onChange={(e) => handleInputChange("dob", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold text-zinc-700 focus:outline-none" />
                      </div>
                    )}
                    {isSectionVisible("f_age") && (
                      <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">{getSectionTitle("f_age", "Age")}</label>
                        {getSectionDescription("f_age") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_age")}</p>}
                        <input type="number" value={formData.age} onChange={(e) => handleInputChange("age", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold text-zinc-700 focus:outline-none" />
                      </div>
                    )}
                    {isSectionVisible("f_designation") && (
                      <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">{getSectionTitle("f_designation", "Designation")}</label>
                        {getSectionDescription("f_designation") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_designation")}</p>}
                        <input type="text" value={formData.designation} onChange={(e) => handleInputChange("designation", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold text-zinc-700 focus:outline-none" />
                      </div>
                    )}
                    {isSectionVisible("f_department") && (
                      <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">{getSectionTitle("f_department", "Department")}</label>
                        {getSectionDescription("f_department") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_department")}</p>}
                        <input type="text" value={formData.department} onChange={(e) => handleInputChange("department", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold text-zinc-700" />
                      </div>
                    )}
                    {isSectionVisible("f_subjectSpecialization") && (
                      <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">{getSectionTitle("f_subjectSpecialization", "Subject Specialization")}</label>
                        {getSectionDescription("f_subjectSpecialization") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_subjectSpecialization")}</p>}
                        <input type="text" value={formData.subjectSpecialization} onChange={(e) => handleInputChange("subjectSpecialization", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold text-zinc-700 focus:outline-none" placeholder="e.g. Image Processing, Compiler Design" />
                      </div>
                    )}
                    {isSectionVisible("f_dojCollege") && (
                      <div>
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{getSectionTitle("f_dojCollege", "Date of Joining CKCET")}</label>
                        {getSectionDescription("f_dojCollege") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_dojCollege")}</p>}
                        <input type="date" value={formData.dojCollege} onChange={(e) => handleInputChange("dojCollege", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold text-zinc-700" />
                      </div>
                    )}
                    {isSectionVisible("f_dojPresentPost") && (
                      <div>
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{getSectionTitle("f_dojPresentPost", "DOJ Present Post")}</label>
                        {getSectionDescription("f_dojPresentPost") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_dojPresentPost")}</p>}
                        <input type="date" value={formData.dojPresentPost} onChange={(e) => handleInputChange("dojPresentPost", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold text-zinc-700" />
                      </div>
                    )}
                    {isSectionVisible("f_academicQualification") && (
                      <div>
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{getSectionTitle("f_academicQualification", "Academic Qualification")}</label>
                        {getSectionDescription("f_academicQualification") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_academicQualification")}</p>}
                        <input type="text" value={formData.academicQualification} onChange={(e) => handleInputChange("academicQualification", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold text-zinc-700" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isSectionVisible("sec_profile_experience") && (
                <div className="pt-4 border-t border-zinc-100">
                  <div style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Briefcase size={12} className="text-[#120c7a]" /> 
                    {getSectionTitle("sec_profile_experience", "1.2 Teaching & Industrial Experience Details")}
                  </div>
                  {getSectionDescription("sec_profile_experience") && (
                    <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_profile_experience")}</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {isSectionVisible("f_teachingCKCET") && (
                      <div>
                        <label className="block text-[10px] font-black text-[#120c7a] uppercase tracking-widest mb-1">{getSectionTitle("f_teachingCKCET", "Teaching at CKCET (Yrs)")}</label>
                        {getSectionDescription("f_teachingCKCET") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_teachingCKCET")}</p>}
                        <input type="number" value={formData.experience.teachingCKCET} onChange={(e) => handleNestedInputChange("experience", "teachingCKCET", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold text-zinc-700 focus:outline-none" />
                      </div>
                    )}
                    {isSectionVisible("f_teachingElsewhere") && (
                      <div>
                        <label className="block text-[10px] font-black text-[#120c7b] uppercase tracking-widest mb-1">{getSectionTitle("f_teachingElsewhere", "Teaching Elsewhere (Yrs)")}</label>
                        {getSectionDescription("f_teachingElsewhere") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_teachingElsewhere")}</p>}
                        <input type="number" value={formData.experience.teachingElsewhere} onChange={(e) => handleNestedInputChange("experience", "teachingElsewhere", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold text-zinc-700 focus:outline-none" />
                      </div>
                    )}
                    {isSectionVisible("f_industrial") && (
                      <div>
                        <label className="block text-[10px] font-black text-[#120c7c] uppercase tracking-widest mb-1">{getSectionTitle("f_industrial", "Industrial Experience (Yrs)")}</label>
                        {getSectionDescription("f_industrial") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_industrial")}</p>}
                        <input type="number" value={formData.experience.industrial} onChange={(e) => handleNestedInputChange("experience", "industrial", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold text-zinc-700 focus:outline-none" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isSectionVisible("sec_profile_workload") && (
                <div className="pt-4 border-t border-zinc-100">
                  <div style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Calendar size={12} className="text-[#120c7a]" /> 
                    {getSectionTitle("sec_profile_workload", "1.3 Weekly Workload Grid")}
                  </div>
                  {getSectionDescription("sec_profile_workload") && (
                    <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_profile_workload")}</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {isSectionVisible("f_oddTheory") && (
                      <div>
                        <label className="block text-[10px] font-black text-[#120c7d] uppercase tracking-widest mb-1">{getSectionTitle("f_oddTheory", "Odd Sem Theory")}</label>
                        {getSectionDescription("f_oddTheory") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_oddTheory")}</p>}
                        <input type="number" value={formData.workloadWeek.oddTheory} onChange={(e) => handleNestedInputChange("workloadWeek", "oddTheory", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold focus:outline-none" />
                      </div>
                    )}
                    {isSectionVisible("f_oddPractical") && (
                      <div>
                        <label className="block text-[10px] font-black text-[#120c7e] uppercase tracking-widest mb-1">{getSectionTitle("f_oddPractical", "Odd Practical/Project")}</label>
                        {getSectionDescription("f_oddPractical") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_oddPractical")}</p>}
                        <input type="number" value={formData.workloadWeek.oddPractical} onChange={(e) => handleNestedInputChange("workloadWeek", "oddPractical", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold focus:outline-none" />
                      </div>
                    )}
                    {isSectionVisible("f_oddTotal") && (
                      <div>
                        <label className="block text-[10px] font-black text-[#120c7f] uppercase tracking-widest mb-1">{getSectionTitle("f_oddTotal", "Odd Total Hrs")}</label>
                        {getSectionDescription("f_oddTotal") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_oddTotal")}</p>}
                        <input type="number" value={formData.workloadWeek.oddTotal} onChange={(e) => handleNestedInputChange("workloadWeek", "oddTotal", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold focus:outline-none" />
                      </div>
                    )}
                    
                    {isSectionVisible("f_evenTheory") && (
                      <div>
                        <label className="block text-[10px] font-black text-[#120c80] uppercase tracking-widest mb-1">{getSectionTitle("f_evenTheory", "Even Sem Theory")}</label>
                        {getSectionDescription("f_evenTheory") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_evenTheory")}</p>}
                        <input type="number" value={formData.workloadWeek.evenTheory} onChange={(e) => handleNestedInputChange("workloadWeek", "evenTheory", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold focus:outline-none" />
                      </div>
                    )}
                    {isSectionVisible("f_evenPractical") && (
                      <div>
                        <label className="block text-[10px] font-black text-[#120c81] uppercase tracking-widest mb-1">{getSectionTitle("f_evenPractical", "Even Practical/Project")}</label>
                        {getSectionDescription("f_evenPractical") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_evenPractical")}</p>}
                        <input type="number" value={formData.workloadWeek.evenPractical} onChange={(e) => handleNestedInputChange("workloadWeek", "evenPractical", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold focus:outline-none" />
                      </div>
                    )}
                    {isSectionVisible("f_evenTotal") && (
                      <div>
                        <label className="block text-[10px] font-black text-[#120c82] uppercase tracking-widest mb-1">{getSectionTitle("f_evenTotal", "Even Total Hrs")}</label>
                        {getSectionDescription("f_evenTotal") && <p className="text-[9px] text-zinc-400 mb-1">{getSectionDescription("f_evenTotal")}</p>}
                        <input type="number" value={formData.workloadWeek.evenTotal} onChange={(e) => handleNestedInputChange("workloadWeek", "evenTotal", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold focus:outline-none" />
                      </div>
                    )}
                  </div>
                </div>
              )}
              {renderTabCustomFields(1)}
            </div>
          )}

          {/* TAB 2: SUBJECTS & RESULTS */}
          {activeTab === 2 && (
            <div className="space-y-8 animate-fadeIn">
              {isSectionVisible("sec_subjects_results") && (
                <>
                  {/* ODD SEMESTER */}
                  <div>
                    <div style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2 flex justify-between items-center">
                      <span>{getSectionTitle("sec_subjects_results", "2.1 Subjects Handled & Pass % — ODD SEMESTER (Nov/Dec)")}</span>
                    </div>
                    {getSectionDescription("sec_subjects_results") && (
                      <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_subjects_results")}</p>
                    )}
                    
                    {/* Odd Sem Theory Table */}
                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-black text-zinc-600 underline">THEORY Subjects</span>
                        {!isReadOnly && (
                          <button
                            onClick={() => addRow("oddTheorySubjects", { class: "", subjectCodeTitle: "", appeared: "", passed: "", resultPercentage: "", feedbackRating: "" })}
                            className="px-2.5 py-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center gap-1 transition-all"
                          >
                            <Plus size={10} /> Add Theory
                          </button>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-zinc-200 text-xs">
                          <thead>
                            <tr className="bg-zinc-50 font-bold">
                              <th className="border border-zinc-200 p-2 text-center w-12">S.No</th>
                              <th className="border border-zinc-200 p-2">Class</th>
                              <th className="border border-zinc-200 p-2">Subject Code & Title</th>
                              <th className="border border-zinc-200 p-2 text-center w-20">Appeared</th>
                              <th className="border border-zinc-200 p-2 text-center w-20">Passed</th>
                              <th className="border border-zinc-200 p-2 text-center w-20">% Result</th>
                              <th className="border border-zinc-200 p-2 text-center w-36">Feedback Rating</th>
                              {renderRowEvidenceHeader("sec_subjects_results")}
                              <th className="border border-zinc-200 p-2 text-center w-16">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formData.oddTheorySubjects.map((row, i) => (
                              <tr key={i} className="hover:bg-zinc-50/50">
                                <td className="border border-zinc-200 p-2 text-center font-bold">{i+1}</td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.class} onChange={(e) => updateRow("oddTheorySubjects", i, "class", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs focus:ring-0 focus:outline-none" placeholder="e.g. III Year CSE" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.subjectCodeTitle} onChange={(e) => updateRow("oddTheorySubjects", i, "subjectCodeTitle", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs focus:ring-0 focus:outline-none" placeholder="e.g. CS3501 Compiler Design" /></td>
                                <td className="border border-zinc-200 p-1"><input type="number" value={row.appeared} onChange={(e) => updateRow("oddTheorySubjects", i, "appeared", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" /></td>
                                <td className="border border-zinc-200 p-1"><input type="number" value={row.passed} onChange={(e) => updateRow("oddTheorySubjects", i, "passed", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.resultPercentage} onChange={(e) => updateRow("oddTheorySubjects", i, "resultPercentage", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" placeholder="e.g. 88%" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.feedbackRating} onChange={(e) => updateRow("oddTheorySubjects", i, "feedbackRating", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" placeholder="e.g. 94.2%" /></td>
                                {renderRowEvidenceCell("oddTheorySubjects", row, i, "sec_subjects_results")}
                                <td className="border border-zinc-200 p-2 text-center">
                                  <button onClick={() => removeRow("oddTheorySubjects", i)} disabled={isReadOnly} className="text-rose-500 disabled:opacity-30"><Trash2 size={14} /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Odd Sem Practical Table */}
                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-black text-zinc-600 underline">PRACTICAL / PROJECT Subjects</span>
                        {!isReadOnly && (
                          <button
                            onClick={() => addRow("oddPracticalSubjects", { class: "", subjectCodeTitle: "", appeared: "", passed: "", resultPercentage: "", feedbackRating: "" })}
                            className="px-2.5 py-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center gap-1 transition-all"
                          >
                            <Plus size={10} /> Add Practical
                          </button>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-zinc-200 text-xs">
                          <thead>
                            <tr className="bg-zinc-50 font-bold">
                              <th className="border border-zinc-200 p-2 text-center w-12">S.No</th>
                              <th className="border border-zinc-200 p-2">Class</th>
                              <th className="border border-zinc-200 p-2">Subject Code & Title</th>
                              <th className="border border-zinc-200 p-2 text-center w-20">Appeared</th>
                              <th className="border border-zinc-200 p-2 text-center w-20">Passed</th>
                              <th className="border border-zinc-200 p-2 text-center w-20">% Result</th>
                              <th className="border border-zinc-200 p-2 text-center w-36">Feedback Rating</th>
                              {renderRowEvidenceHeader("sec_subjects_results")}
                              <th className="border border-zinc-200 p-2 text-center w-16">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formData.oddPracticalSubjects.map((row, i) => (
                              <tr key={i} className="hover:bg-zinc-50/50">
                                <td className="border border-zinc-200 p-2 text-center font-bold">{i+1}</td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.class} onChange={(e) => updateRow("oddPracticalSubjects", i, "class", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs focus:ring-0 focus:outline-none" placeholder="e.g. III Year CSE" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.subjectCodeTitle} onChange={(e) => updateRow("oddPracticalSubjects", i, "subjectCodeTitle", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs focus:ring-0 focus:outline-none" placeholder="e.g. Compiler Lab" /></td>
                                <td className="border border-zinc-200 p-1"><input type="number" value={row.appeared} onChange={(e) => updateRow("oddPracticalSubjects", i, "appeared", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" /></td>
                                <td className="border border-zinc-200 p-1"><input type="number" value={row.passed} onChange={(e) => updateRow("oddPracticalSubjects", i, "passed", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.resultPercentage} onChange={(e) => updateRow("oddPracticalSubjects", i, "resultPercentage", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" placeholder="e.g. 100%" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.feedbackRating} onChange={(e) => updateRow("oddPracticalSubjects", i, "feedbackRating", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" placeholder="e.g. 96.5%" /></td>
                                {renderRowEvidenceCell("oddPracticalSubjects", row, i, "sec_subjects_results")}
                                <td className="border border-zinc-200 p-2 text-center">
                                  <button onClick={() => removeRow("oddPracticalSubjects", i)} disabled={isReadOnly} className="text-rose-500 disabled:opacity-30"><Trash2 size={14} /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* EVEN SEMESTER */}
                  <div>
                    <div style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
                      10. Subjects Handled & Pass % — EVEN SEMESTER (April/May)
                    </div>

                    {/* Even Sem Theory Table */}
                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-black text-zinc-600 underline">THEORY Subjects</span>
                        {!isReadOnly && (
                          <button
                            onClick={() => addRow("evenTheorySubjects", { class: "", subjectCodeTitle: "", appeared: "", passed: "", resultPercentage: "", feedbackRating: "" })}
                            className="px-2.5 py-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center gap-1 transition-all"
                          >
                            <Plus size={10} /> Add Theory
                          </button>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-zinc-200 text-xs">
                          <thead>
                            <tr className="bg-zinc-50 font-bold">
                              <th className="border border-zinc-200 p-2 text-center w-12">S.No</th>
                              <th className="border border-zinc-200 p-2">Class</th>
                              <th className="border border-zinc-200 p-2">Subject Code & Title</th>
                              <th className="border border-zinc-200 p-2 text-center w-20">Appeared</th>
                              <th className="border border-zinc-200 p-2 text-center w-20">Passed</th>
                              <th className="border border-zinc-200 p-2 text-center w-20">% Result</th>
                              <th className="border border-zinc-200 p-2 text-center w-36">Feedback Rating</th>
                              {renderRowEvidenceHeader("sec_subjects_results")}
                              <th className="border border-zinc-200 p-2 text-center w-16">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formData.evenTheorySubjects.map((row, i) => (
                              <tr key={i} className="hover:bg-zinc-50/50">
                                <td className="border border-zinc-200 p-2 text-center font-bold">{i+1}</td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.class} onChange={(e) => updateRow("evenTheorySubjects", i, "class", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs focus:ring-0 focus:outline-none" placeholder="e.g. IV Year CSE" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.subjectCodeTitle} onChange={(e) => updateRow("evenTheorySubjects", i, "subjectCodeTitle", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs focus:ring-0 focus:outline-none" placeholder="e.g. CS3601 Web Tech" /></td>
                                <td className="border border-zinc-200 p-1"><input type="number" value={row.appeared} onChange={(e) => updateRow("evenTheorySubjects", i, "appeared", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" /></td>
                                <td className="border border-zinc-200 p-1"><input type="number" value={row.passed} onChange={(e) => updateRow("evenTheorySubjects", i, "passed", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.resultPercentage} onChange={(e) => updateRow("evenTheorySubjects", i, "resultPercentage", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" placeholder="e.g. 92%" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.feedbackRating} onChange={(e) => updateRow("evenTheorySubjects", i, "feedbackRating", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" placeholder="e.g. 93%" /></td>
                                {renderRowEvidenceCell("evenTheorySubjects", row, i, "sec_subjects_results")}
                                <td className="border border-zinc-200 p-2 text-center">
                                  <button onClick={() => removeRow("evenTheorySubjects", i)} disabled={isReadOnly} className="text-rose-500 disabled:opacity-30"><Trash2 size={14} /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Even Sem Practical Table */}
                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-black text-zinc-600 underline">PRACTICAL / PROJECT Subjects</span>
                        {!isReadOnly && (
                          <button
                            onClick={() => addRow("evenPracticalSubjects", { class: "", subjectCodeTitle: "", appeared: "", passed: "", resultPercentage: "", feedbackRating: "" })}
                            className="px-2.5 py-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center gap-1 transition-all"
                          >
                            <Plus size={10} /> Add Practical
                          </button>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-zinc-200 text-xs">
                          <thead>
                            <tr className="bg-zinc-50 font-bold">
                              <th className="border border-zinc-200 p-2 text-center w-12">S.No</th>
                              <th className="border border-zinc-200 p-2">Class</th>
                              <th className="border border-zinc-200 p-2">Subject Code & Title</th>
                              <th className="border border-zinc-200 p-2 text-center w-20">Appeared</th>
                              <th className="border border-zinc-200 p-2 text-center w-20">Passed</th>
                              <th className="border border-zinc-200 p-2 text-center w-20">% Result</th>
                              <th className="border border-zinc-200 p-2 text-center w-36">Feedback Rating</th>
                              {renderRowEvidenceHeader("sec_subjects_results")}
                              <th className="border border-zinc-200 p-2 text-center w-16">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formData.evenPracticalSubjects.map((row, i) => (
                              <tr key={i} className="hover:bg-zinc-50/50">
                                <td className="border border-zinc-200 p-2 text-center font-bold">{i+1}</td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.class} onChange={(e) => updateRow("evenPracticalSubjects", i, "class", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs focus:ring-0 focus:outline-none" placeholder="e.g. IV Year CSE" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.subjectCodeTitle} onChange={(e) => updateRow("evenPracticalSubjects", i, "subjectCodeTitle", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs focus:ring-0 focus:outline-none" placeholder="e.g. Web Tech Lab" /></td>
                                <td className="border border-zinc-200 p-1"><input type="number" value={row.appeared} onChange={(e) => updateRow("evenPracticalSubjects", i, "appeared", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" /></td>
                                <td className="border border-zinc-200 p-1"><input type="number" value={row.passed} onChange={(e) => updateRow("evenPracticalSubjects", i, "passed", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.resultPercentage} onChange={(e) => updateRow("evenPracticalSubjects", i, "resultPercentage", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" placeholder="e.g. 100%" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.feedbackRating} onChange={(e) => updateRow("evenPracticalSubjects", i, "feedbackRating", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-xs text-center focus:ring-0" placeholder="e.g. 95%" /></td>
                                {renderRowEvidenceCell("evenPracticalSubjects", row, i, "sec_subjects_results")}
                                <td className="border border-zinc-200 p-2 text-center">
                                  <button onClick={() => removeRow("evenPracticalSubjects", i)} disabled={isReadOnly} className="text-rose-500 disabled:opacity-30"><Trash2 size={14} /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Attribution of Results */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 max-w-xl">
                    <label className="block text-[10px] font-black text-[#120c7a] uppercase tracking-wider mb-2">11. To whom do you think these results can be attributed to?</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {["Yourself", "Students", "Both", "Prevailing Circumstances"].map((attr) => (
                        <button
                          key={attr}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => handleInputChange("resultAttribution", attr)}
                          className={`px-3 py-2 rounded-xl text-xs font-bold border text-center transition-all ${
                            formData.resultAttribution === attr ? "bg-[#120c7a] border-[#120c7a] text-white" : "bg-white border-zinc-200 text-zinc-600"
                          }`}
                        >
                          {attr}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {renderTabCustomFields(2)}
            </div>
          )}

          {/* TAB 3: ACADEMIC DEVELOPMENT */}
          {activeTab === 3 && (
            <div className="space-y-8 animate-fadeIn">
              
              {/* Online Courses */}
              {isSectionVisible("sec_academic_nptel") && (
                <div>
                  <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-1">
                    <span style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider">
                      {getSectionTitle("sec_academic_nptel", "3.1 Invest in Yourself — A) Details of Online Courses Completed")}
                    </span>
                    {!isReadOnly && (
                      <button
                        onClick={() => addRow("onlineCourses", { title: "", startDate: "", endDate: "", weeks: "", platform: "", examDate: "", certificateReceived: "Yes" })}
                        className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] rounded font-bold"
                      >
                        + Add Course
                      </button>
                    )}
                  </div>
                  {getSectionDescription("sec_academic_nptel") && (
                    <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_academic_nptel")}</p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-zinc-200 text-xs">
                      <thead>
                        <tr className="bg-zinc-50 font-bold">
                          <th className="border border-zinc-200 p-2 text-center w-12">Sl.No</th>
                          <th className="border border-zinc-200 p-2">Title of the Course</th>
                          <th className="border border-zinc-200 p-2 text-center w-24">Start Date</th>
                          <th className="border border-zinc-200 p-2 text-center w-24">End Date</th>
                          <th className="border border-zinc-200 p-2 text-center w-20">Weeks</th>
                          <th className="border border-zinc-200 p-2 text-center w-28">Platform</th>
                          <th className="border border-zinc-200 p-2 text-center w-24">Exam Date</th>
                          <th className="border border-zinc-200 p-2 text-center w-20">Certificate?</th>
                          {renderRowEvidenceHeader("sec_academic_nptel")}
                          <th className="border border-zinc-200 p-2 text-center w-12">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.onlineCourses.map((row, i) => (
                          <tr key={i}>
                            <td className="border border-zinc-200 p-2 text-center font-bold">{i+1}</td>
                            <td className="border border-zinc-200 p-1"><input type="text" value={row.title} onChange={(e) => updateRow("onlineCourses", i, "title", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 focus:ring-0 focus:outline-none" /></td>
                            <td className="border border-zinc-200 p-1"><input type="text" placeholder="DD-MM-YYYY" value={row.startDate} onChange={(e) => updateRow("onlineCourses", i, "startDate", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center" /></td>
                            <td className="border border-zinc-200 p-1"><input type="text" placeholder="DD-MM-YYYY" value={row.endDate} onChange={(e) => updateRow("onlineCourses", i, "endDate", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center" /></td>
                            <td className="border border-zinc-200 p-1"><input type="number" value={row.weeks} onChange={(e) => updateRow("onlineCourses", i, "weeks", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center" /></td>
                            <td className="border border-zinc-200 p-1"><input type="text" value={row.platform} onChange={(e) => updateRow("onlineCourses", i, "platform", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center" /></td>
                            <td className="border border-zinc-200 p-1"><input type="text" placeholder="e.g. Oct 2024" value={row.examDate} onChange={(e) => updateRow("onlineCourses", i, "examDate", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center" /></td>
                            <td className="border border-zinc-200 p-1">
                              <select value={row.certificateReceived} onChange={(e) => updateRow("onlineCourses", i, "certificateReceived", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center focus:ring-0">
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                            </td>
                            {renderRowEvidenceCell("onlineCourses", row, i, "sec_academic_nptel")}
                            <td className="border border-zinc-200 p-2 text-center"><button onClick={() => removeRow("onlineCourses", i)} disabled={isReadOnly} className="text-rose-500"><Trash2 size={12} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3">
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1 font-serif">* Specify the Outcome and achievements of 13.A</label>
                    <textarea value={formData.onlineCoursesOutcome} onChange={(e) => handleInputChange("onlineCoursesOutcome", e.target.value)} disabled={isReadOnly} rows={2} className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-semibold" placeholder="Summarize what outcome/knowledge was gained from these completed courses..." />
                  </div>
                </div>
              )}

              {/* Research Papers B */}
              {isSectionVisible("sec_academic_journals") && (
                <div>
                  <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-1">
                    <span style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider">
                      {getSectionTitle("sec_academic_journals", "3.3 Publication of Research Papers in Reputed Journals / International Conferences / Patents")}
                    </span>
                    {!isReadOnly && (
                      <button
                        onClick={() => addRow("researchPapers", { title: "", dateMonthYear: "", journal: "", volumeIssue: "", issnIsbn: "", sciScopusUgc: "UGC" })}
                        className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] rounded font-bold"
                      >
                        + Add Publication
                      </button>
                    )}
                  </div>
                  {getSectionDescription("sec_academic_journals") && (
                    <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_academic_journals")}</p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-zinc-200 text-xs">
                      <thead>
                        <tr className="bg-zinc-50 font-bold">
                          <th className="border border-zinc-200 p-2 text-center w-12">Sl.No</th>
                          <th className="border border-zinc-200 p-2">Title of the Paper</th>
                          <th className="border border-zinc-200 p-2 text-center w-28">Date / Month / Year</th>
                          <th className="border border-zinc-200 p-2">Name of Journal / Conference</th>
                          <th className="border border-zinc-200 p-2">Vol. No, Issue No, Page No</th>
                          <th className="border border-zinc-200 p-2 text-center w-36">SCI / SCOPUS / UGC</th>
                          {renderRowEvidenceHeader("sec_academic_journals")}
                          <th className="border border-zinc-200 p-2 text-center w-12">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.researchPapers.map((row, i) => (
                          <tr key={i}>
                            <td className="border border-zinc-200 p-2 text-center font-bold">{i+1}</td>
                            <td className="border border-zinc-200 p-1"><input type="text" value={row.title} onChange={(e) => updateRow("researchPapers", i, "title", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                            <td className="border border-zinc-200 p-1"><input type="text" value={row.dateMonthYear} onChange={(e) => updateRow("researchPapers", i, "dateMonthYear", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center" /></td>
                            <td className="border border-zinc-200 p-1"><input type="text" value={row.journal} onChange={(e) => updateRow("researchPapers", i, "journal", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                            <td className="border border-zinc-200 p-1"><input type="text" value={row.volumeIssue} onChange={(e) => updateRow("researchPapers", i, "volumeIssue", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                            <td className="border border-zinc-200 p-1">
                              <select value={row.sciScopusUgc} onChange={(e) => updateRow("researchPapers", i, "sciScopusUgc", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center focus:ring-0">
                                <option value="SCI">SCI</option>
                                <option value="SCOPUS">SCOPUS</option>
                                <option value="UGC">UGC Indexed</option>
                                <option value="Other">Other Non-indexed</option>
                              </select>
                            </td>
                            {renderRowEvidenceCell("researchPapers", row, i, "sec_academic_journals")}
                            <td className="border border-zinc-200 p-2 text-center"><button onClick={() => removeRow("researchPapers", i)} disabled={isReadOnly} className="text-rose-500"><Trash2 size={12} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Workshops & Seminars C */}
              {isSectionVisible("sec_academic_fdp") && (
                <div>
                  <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-1">
                    <span style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider">
                      {getSectionTitle("sec_academic_fdp", "3.2 Participation in Workshops / Conferences / FDPs / STTPs / Seminars")}
                    </span>
                    {!isReadOnly && (
                      <button
                        onClick={() => addRow("workshopsFDPs", { title: "", dates: "", days: "", organization: "", reportSubmitted: "Yes" })}
                        className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] rounded font-bold"
                      >
                        + Add Entry
                      </button>
                    )}
                  </div>
                  {getSectionDescription("sec_academic_fdp") && (
                    <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_academic_fdp")}</p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-zinc-200 text-xs">
                      <thead>
                        <tr className="bg-zinc-50 font-bold">
                          <th className="border border-zinc-200 p-2 text-center w-12">Sl.No</th>
                          <th className="border border-zinc-200 p-2">Title of Workshop / FDP / Special Program</th>
                          <th className="border border-zinc-200 p-2 text-center w-36">Dates</th>
                          <th className="border border-zinc-200 p-2 text-center w-24">No. of Days</th>
                          <th className="border border-zinc-200 p-2">Organization</th>
                          <th className="border border-zinc-200 p-2 text-center w-36">Submitted Report?</th>
                          {renderRowEvidenceHeader("sec_academic_fdp")}
                          <th className="border border-zinc-200 p-2 text-center w-12">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.workshopsFDPs.map((row, i) => (
                          <tr key={i}>
                            <td className="border border-zinc-200 p-2 text-center font-bold">{i+1}</td>
                            <td className="border border-zinc-200 p-1"><input type="text" value={row.title} onChange={(e) => updateRow("workshopsFDPs", i, "title", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                            <td className="border border-zinc-200 p-1"><input type="text" value={row.dates} onChange={(e) => updateRow("workshopsFDPs", i, "dates", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center" /></td>
                            <td className="border border-zinc-200 p-1"><input type="number" value={row.days} onChange={(e) => updateRow("workshopsFDPs", i, "days", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center" /></td>
                            <td className="border border-zinc-200 p-1"><input type="text" value={row.organization} onChange={(e) => updateRow("workshopsFDPs", i, "organization", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                            <td className="border border-zinc-200 p-1">
                              <select value={row.reportSubmitted} onChange={(e) => updateRow("workshopsFDPs", i, "reportSubmitted", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center focus:ring-0">
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                            </td>
                            {renderRowEvidenceCell("workshopsFDPs", row, i, "sec_academic_fdp")}
                            <td className="border border-zinc-200 p-2 text-center"><button onClick={() => removeRow("workshopsFDPs", i)} disabled={isReadOnly} className="text-rose-500"><Trash2 size={12} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Improving Qualification D */}
              {isSectionVisible("sec_academic_nptel") && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="improvingQualification"
                      checked={formData.improvingQualification}
                      onChange={(e) => handleInputChange("improvingQualification", e.target.checked)}
                      disabled={isReadOnly}
                      className="h-4.5 w-4.5 rounded border-zinc-300 text-[#120c7a] focus:ring-indigo-500"
                    />
                    <label htmlFor="improvingQualification" style={{ fontSize: "11px" }} className="font-extrabold text-zinc-700 uppercase tracking-wider">Higher Studies / PhD Upgrade</label>
                  </div>
                  
                  {formData.improvingQualification && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black text-indigo-900 uppercase">Qualification Upgrade Details</span>
                        {!isReadOnly && (
                          <button
                            onClick={() => addRow("improvingDetails", { degreeRegistered: "", specialization: "", university: "", duration: "", status: "", nocObtained: "Yes" })}
                            className="px-2 py-0.5 bg-[#120c7a] text-white text-[9px] rounded font-bold"
                          >
                            + Add Degree
                          </button>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-zinc-200 text-xs">
                          <thead>
                            <tr className="bg-zinc-100 font-bold text-[10px]">
                              <th className="border border-zinc-200 p-1.5 text-center">Sl.No</th>
                              <th className="border border-zinc-200 p-1.5">Degree Registered</th>
                              <th className="border border-zinc-200 p-1.5">Specialization</th>
                              <th className="border border-zinc-200 p-1.5">University</th>
                              <th className="border border-zinc-200 p-1.5 text-center">Duration</th>
                              <th className="border border-zinc-200 p-1.5 text-center">Status</th>
                              <th className="border border-zinc-200 p-1.5 text-center w-24">NOC Obtained?</th>
                              {renderRowEvidenceHeader("sec_academic_nptel")}
                              <th className="border border-zinc-200 p-1.5 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formData.improvingDetails.map((row, i) => (
                              <tr key={i}>
                                <td className="border border-zinc-200 p-1.5 text-center font-bold">{i+1}</td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.degreeRegistered} onChange={(e) => updateRow("improvingDetails", i, "degreeRegistered", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" placeholder="e.g. Ph.D" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.specialization} onChange={(e) => updateRow("improvingDetails", i, "specialization", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" placeholder="e.g. AI / ML" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.university} onChange={(e) => updateRow("improvingDetails", i, "university", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" placeholder="e.g. Anna University" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.duration} onChange={(e) => updateRow("improvingDetails", i, "duration", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center" placeholder="e.g. 3 Yrs" /></td>
                                <td className="border border-zinc-200 p-1"><input type="text" value={row.status} onChange={(e) => updateRow("improvingDetails", i, "status", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center" placeholder="e.g. Thesis submitted" /></td>
                                <td className="border border-zinc-200 p-1">
                                  <select value={row.nocObtained} onChange={(e) => updateRow("improvingDetails", i, "nocObtained", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center focus:ring-0">
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                    <option value="Applied">Applied</option>
                                  </select>
                                </td>
                                {renderRowEvidenceCell("improvingDetails", row, i, "sec_academic_nptel")}
                                <td className="border border-zinc-200 p-1.5 text-center"><button onClick={() => removeRow("improvingDetails", i)} disabled={isReadOnly} className="text-rose-500"><Trash2 size={12} /></button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {renderTabCustomFields(3)}
            </div>
          )}

          {/* TAB 4: INSTITUTIONAL ROLES */}
          {activeTab === 4 && (
            <div className="space-y-8 animate-fadeIn">
              
              {/* Roles Held & Organizing Programs */}
              {isSectionVisible("sec_roles_department") && (
                <>
                  {/* Organizing Programs */}
                  <div>
                    <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-1">
                      <span style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider">
                        {getSectionTitle("sec_roles_department", "4.1 Department / Institution Contributions — Organizing FDP / Conferences / Workshops")}
                      </span>
                      {!isReadOnly && (
                        <button
                          onClick={() => addRow("organizingPrograms", { title: "", period: "", resourcePersonDetails: "", targetAudience: "", outcome: "" })}
                          className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] rounded font-bold"
                        >
                          + Add Event
                        </button>
                      )}
                    </div>
                    {getSectionDescription("sec_roles_department") && (
                      <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_roles_department")}</p>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-zinc-200 text-xs">
                        <thead>
                          <tr className="bg-zinc-50 font-bold">
                            <th className="border border-zinc-200 p-2 text-center w-12">Sl.No</th>
                            <th className="border border-zinc-200 p-2">Title of the Event</th>
                            <th className="border border-zinc-200 p-2 text-center w-28">Period</th>
                            <th className="border border-zinc-200 p-2">Details of Resource Person</th>
                            <th className="border border-zinc-200 p-2">For Whom program is organized</th>
                            <th className="border border-zinc-200 p-2">Specify the Outcome of event</th>
                            {renderRowEvidenceHeader("sec_roles_department")}
                            <th className="border border-zinc-200 p-2 text-center w-12">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.organizingPrograms.map((row, i) => (
                            <tr key={i}>
                              <td className="border border-zinc-200 p-2 text-center font-bold">{i+1}</td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.title} onChange={(e) => updateRow("organizingPrograms", i, "title", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.period} onChange={(e) => updateRow("organizingPrograms", i, "period", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.resourcePersonDetails} onChange={(e) => updateRow("organizingPrograms", i, "resourcePersonDetails", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.targetAudience} onChange={(e) => updateRow("organizingPrograms", i, "targetAudience", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.outcome} onChange={(e) => updateRow("organizingPrograms", i, "outcome", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              {renderRowEvidenceCell("organizingPrograms", row, i, "sec_roles_department")}
                              <td className="border border-zinc-200 p-2 text-center"><button onClick={() => removeRow("organizingPrograms", i)} disabled={isReadOnly} className="text-rose-500"><Trash2 size={12} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Funding Proposals */}
                  <div>
                    <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-1">
                      <span style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider">Contribution towards Funding Proposals / Testing / Consultancy</span>
                      {!isReadOnly && (
                        <button
                          onClick={() => addRow("fundingProposals", { role: "PI", fundingAgencyScheme: "", title: "", fundRequested: "", dateSubmission: "", status: "" })}
                          className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] rounded font-bold"
                        >
                          + Add Proposal
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-zinc-200 text-xs">
                        <thead>
                          <tr className="bg-zinc-50 font-bold">
                            <th className="border border-zinc-200 p-2 text-center w-12">Sl.No</th>
                            <th className="border border-zinc-200 p-2 text-center w-28">Role (PI / CO-I)</th>
                            <th className="border border-zinc-200 p-2">Funding Agency & Scheme</th>
                            <th className="border border-zinc-200 p-2">Project Title</th>
                            <th className="border border-zinc-200 p-2 text-center w-28">Fund Requested (Rs.)</th>
                            <th className="border border-zinc-200 p-2 text-center w-28">Date of Submission</th>
                            <th className="border border-zinc-200 p-2">Status / Outcome</th>
                            {renderRowEvidenceHeader("sec_roles_department")}
                            <th className="border border-zinc-200 p-2 text-center w-12">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.fundingProposals.map((row, i) => (
                            <tr key={i}>
                              <td className="border border-zinc-200 p-2 text-center font-bold">{i+1}</td>
                              <td className="border border-zinc-200 p-1">
                                <select value={row.role} onChange={(e) => updateRow("fundingProposals", i, "role", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center focus:ring-0">
                                  <option value="PI">PI</option>
                                  <option value="CO-I">CO-I</option>
                                </select>
                              </td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.fundingAgencyScheme} onChange={(e) => updateRow("fundingProposals", i, "fundingAgencyScheme", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.title} onChange={(e) => updateRow("fundingProposals", i, "title", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.fundRequested} onChange={(e) => updateRow("fundingProposals", i, "fundRequested", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center font-bold text-emerald-700" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" placeholder="DD-MM-YYYY" value={row.dateSubmission} onChange={(e) => updateRow("fundingProposals", i, "dateSubmission", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.status} onChange={(e) => updateRow("fundingProposals", i, "status", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              {renderRowEvidenceCell("fundingProposals", row, i, "sec_roles_department")}
                              <td className="border border-zinc-200 p-2 text-center"><button onClick={() => removeRow("fundingProposals", i)} disabled={isReadOnly} className="text-rose-500"><Trash2 size={12} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Placement / Mentoring */}
                  <div>
                    <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-1">
                      <span style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider">Placement Activities / Department Development / Student Welfare / Mentoring / Counseling</span>
                      {!isReadOnly && (
                        <button
                          onClick={() => addRow("involvementPlacement", { description: "", role: "", outcome: "", recordsMaintained: "Yes" })}
                          className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] rounded font-bold"
                        >
                          + Add Activity
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-zinc-200 text-xs">
                        <thead>
                          <tr className="bg-zinc-50 font-bold">
                            <th className="border border-zinc-200 p-2 text-center w-12">Sl.No</th>
                            <th className="border border-zinc-200 p-2">Description of Activity</th>
                            <th className="border border-zinc-200 p-2">Specify Your Role</th>
                            <th className="border border-zinc-200 p-2">Outcome of this Activity</th>
                            <th className="border border-zinc-200 p-2 text-center w-40">Are Records Maintained?</th>
                            {renderRowEvidenceHeader("sec_roles_department")}
                            <th className="border border-zinc-200 p-2 text-center w-12">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.involvementPlacement.map((row, i) => (
                            <tr key={i}>
                              <td className="border border-zinc-200 p-2 text-center font-bold">{i+1}</td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.description} onChange={(e) => updateRow("involvementPlacement", i, "description", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.role} onChange={(e) => updateRow("involvementPlacement", i, "role", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.outcome} onChange={(e) => updateRow("involvementPlacement", i, "outcome", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              <td className="border border-zinc-200 p-1">
                                <select value={row.recordsMaintained} onChange={(e) => updateRow("involvementPlacement", i, "recordsMaintained", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center focus:ring-0">
                                  <option value="Yes">Yes</option>
                                  <option value="No">No</option>
                                </select>
                              </td>
                              {renderRowEvidenceCell("involvementPlacement", row, i, "sec_roles_department")}
                              <td className="border border-zinc-200 p-2 text-center"><button onClick={() => removeRow("involvementPlacement", i)} disabled={isReadOnly} className="text-rose-500"><Trash2 size={12} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Accreditation */}
                  <div>
                    <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-1">
                      <span style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider">ISO / NAAC / NBA / Lab Development / Class Advisor / Coordinator role</span>
                      {!isReadOnly && (
                        <button
                          onClick={() => addRow("accreditationContributions", { role: "", description: "", outcome: "" })}
                          className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] rounded font-bold"
                        >
                          + Add Contribution
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-zinc-200 text-xs">
                        <thead>
                          <tr className="bg-zinc-50 font-bold">
                            <th className="border border-zinc-200 p-2 text-center w-12">Sl.No</th>
                            <th className="border border-zinc-200 p-2 w-48">Specify Your Role</th>
                            <th className="border border-zinc-200 p-2">Description</th>
                            <th className="border border-zinc-200 p-2">Highlight the Outcome</th>
                            {renderRowEvidenceHeader("sec_roles_department")}
                            <th className="border border-zinc-200 p-2 text-center w-12">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.accreditationContributions.map((row, i) => (
                            <tr key={i}>
                              <td className="border border-zinc-200 p-2 text-center font-bold">{i+1}</td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.role} onChange={(e) => updateRow("accreditationContributions", i, "role", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.description} onChange={(e) => updateRow("accreditationContributions", i, "description", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.outcome} onChange={(e) => updateRow("accreditationContributions", i, "outcome", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              {renderRowEvidenceCell("accreditationContributions", row, i, "sec_roles_department")}
                              <td className="border border-zinc-200 p-2 text-center"><button onClick={() => removeRow("accreditationContributions", i)} disabled={isReadOnly} className="text-rose-500"><Trash2 size={12} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* R&D */}
                  <div>
                    <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-1">
                      <span style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider">Contribution towards R&D / EDC / SIC / Alumni / IIPC / Sports / NSS portfolios</span>
                      {!isReadOnly && (
                        <button
                          onClick={() => addRow("rdContributions", { role: "", description: "", outcome: "" })}
                          className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] rounded font-bold"
                        >
                          + Add Portfolio
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-zinc-200 text-xs">
                        <thead>
                          <tr className="bg-zinc-50 font-bold">
                            <th className="border border-zinc-200 p-2 text-center w-12">Sl.No</th>
                            <th className="border border-zinc-200 p-2 w-48">Specify Your Role</th>
                            <th className="border border-zinc-200 p-2">Description</th>
                            <th className="border border-zinc-200 p-2">Highlight the Outcome</th>
                            {renderRowEvidenceHeader("sec_roles_department")}
                            <th className="border border-zinc-200 p-2 text-center w-12">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.rdContributions.map((row, i) => (
                            <tr key={i}>
                              <td className="border border-zinc-200 p-2 text-center font-bold">{i+1}</td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.role} onChange={(e) => updateRow("rdContributions", i, "role", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.description} onChange={(e) => updateRow("rdContributions", i, "description", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.outcome} onChange={(e) => updateRow("rdContributions", i, "outcome", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" /></td>
                              {renderRowEvidenceCell("rdContributions", row, i, "sec_roles_department")}
                              <td className="border border-zinc-200 p-2 text-center"><button onClick={() => removeRow("rdContributions", i)} disabled={isReadOnly} className="text-rose-500"><Trash2 size={12} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* HOD Specific Sheets */}
                  {isHOD && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                      <span className="text-xs font-black text-indigo-950 block border-b border-zinc-200 pb-1 uppercase tracking-wider">HOD Exclusive Portfolio Questions</span>
                      {isSectionVisible("f_resultImprovementHOD") && (
                        <div>
                          <label className="block text-[10px] font-black text-zinc-500 uppercase mb-1">
                            {getSectionTitle("f_resultImprovementHOD", "Result Improvement of the Department, Department Ambience, Laboratory Development & Maintenance")}
                          </label>
                          {getSectionDescription("f_resultImprovementHOD") && (
                            <p className="text-[9px] text-zinc-400 mb-1 uppercase">{getSectionDescription("f_resultImprovementHOD")}</p>
                          )}
                          <textarea value={formData.resultImprovementHOD || ""} onChange={(e) => handleInputChange("resultImprovementHOD", e.target.value)} disabled={isReadOnly} rows={3} className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs" />
                        </div>
                      )}
                      {isSectionVisible("f_deptAdministrationHOD") && (
                        <div>
                          <label className="block text-[10px] font-black text-zinc-500 uppercase mb-1">
                            {getSectionTitle("f_deptAdministrationHOD", "Department Administration / Planning / Monitoring & Evaluation details")}
                          </label>
                          {getSectionDescription("f_deptAdministrationHOD") && (
                            <p className="text-[9px] text-zinc-400 mb-1 uppercase">{getSectionDescription("f_deptAdministrationHOD")}</p>
                          )}
                          <textarea value={formData.deptAdministrationHOD || ""} onChange={(e) => handleInputChange("deptAdministrationHOD", e.target.value)} disabled={isReadOnly} rows={3} className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Other Roles */}
                  {isSectionVisible("f_otherRolesContribution") && (
                    <div>
                      <label className="block text-xs font-black text-slate-800 uppercase mb-2">
                        {getSectionTitle("f_otherRolesContribution", "Specify your Role / Contribution, if any other than the above")}
                      </label>
                      {getSectionDescription("f_otherRolesContribution") && (
                        <p className="text-[9px] text-zinc-400 mb-1 uppercase">{getSectionDescription("f_otherRolesContribution")}</p>
                      )}
                      <textarea value={formData.otherRolesContribution || ""} onChange={(e) => handleInputChange("otherRolesContribution", e.target.value)} disabled={isReadOnly} rows={3} className="w-full rounded-2xl border border-zinc-200 p-4 text-xs" />
                    </div>
                  )}

                  {/* Admission Contributed */}
                  <div>
                    <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-1">
                      <span style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider">Number of admissions contributed to the Institutions for AY 2024-25</span>
                      {!isReadOnly && (
                        <button
                          onClick={() => addRow("admissionContribution", { teamNoArea: "", countContributed: "", teamLeaderName: "" })}
                          className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] rounded font-bold"
                        >
                          + Add Team
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-zinc-200 text-xs">
                        <thead>
                          <tr className="bg-zinc-50 font-bold">
                            <th className="border border-zinc-200 p-2 text-center w-12">Sl.No</th>
                            <th className="border border-zinc-200 p-2">Team No & Area</th>
                            <th className="border border-zinc-200 p-2 text-center w-40">No of Admissions contributed</th>
                            <th className="border border-zinc-200 p-2">Name of the Team Leader</th>
                            {renderRowEvidenceHeader("sec_roles_department")}
                            <th className="border border-zinc-200 p-2 text-center w-12">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.admissionContribution.map((row, i) => (
                            <tr key={i}>
                              <td className="border border-zinc-200 p-2 text-center font-bold">{i+1}</td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.teamNoArea} onChange={(e) => updateRow("admissionContribution", i, "teamNoArea", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" placeholder="e.g. Team 4 - Neyveli" /></td>
                              <td className="border border-zinc-200 p-1"><input type="number" value={row.countContributed} onChange={(e) => updateRow("admissionContribution", i, "countContributed", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center font-bold" placeholder="e.g. 3" /></td>
                              <td className="border border-zinc-200 p-1"><input type="text" value={row.teamLeaderName} onChange={(e) => updateRow("admissionContribution", i, "teamLeaderName", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1" placeholder="e.g. Prof. Kumar S" /></td>
                              {renderRowEvidenceCell("admissionContribution", row, i, "sec_roles_department")}
                              <td className="border border-zinc-200 p-2 text-center"><button onClick={() => removeRow("admissionContribution", i)} disabled={isReadOnly} className="text-rose-500"><Trash2 size={12} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* Professional Body Memberships */}
              {isSectionVisible("sec_professional_memberships") && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex justify-between items-center mb-2 border-b border-zinc-200 pb-1">
                    <span style={{ fontSize: "11px" }} className="font-extrabold text-indigo-950 block uppercase tracking-wider flex items-center gap-1.5">
                      <Award size={12} />
                      {getSectionTitle("sec_professional_memberships", "4.2 Membership in Professional Bodies")}
                    </span>
                    {!isReadOnly && (
                      <button
                        onClick={() => addRow("professionalMembership", { name: "", type: "Life Member", membershipNo: "" })}
                        className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] rounded font-bold"
                      >
                        + Add Membership
                      </button>
                    )}
                  </div>
                  {getSectionDescription("sec_professional_memberships") && (
                    <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_professional_memberships")}</p>
                  )}
                  <div className="space-y-2">
                    {formData.professionalMembership?.map((row, idx) => (
                      <div key={idx} className="flex gap-2 items-center bg-white p-2 rounded-xl border border-zinc-200">
                        <input type="text" placeholder="Name with Address" value={row.name} onChange={(e) => updateRow("professionalMembership", idx, "name", e.target.value)} disabled={isReadOnly} className="w-1/2 border-0 p-1 text-xs focus:ring-0 focus:outline-none" />
                        <select value={row.type} onChange={(e) => updateRow("professionalMembership", idx, "type", e.target.value)} disabled={isReadOnly} className="w-1/4 border-0 p-1 text-xs focus:ring-0 focus:outline-none">
                          <option value="Life Member">Life Member</option>
                          <option value="Annual Member">Annual Member</option>
                        </select>
                        <input type="text" placeholder="No." value={row.membershipNo} onChange={(e) => updateRow("professionalMembership", idx, "membershipNo", e.target.value)} disabled={isReadOnly} className="w-1/4 border-0 p-1 text-xs focus:ring-0 focus:outline-none" />
                        
                        {isSectionEvidenceRequired("sec_professional_memberships") && (
                          <div className="flex-shrink-0 min-w-[80px] flex justify-center">
                            {row.fileUrl ? (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 border border-blue-200 rounded">
                                <a href={row.fileUrl} target="_blank" rel="noreferrer" className="text-[10px] font-extrabold text-blue-600 truncate max-w-[50px]" title={row.fileName || "View Proof"}>Proof</a>
                                {!isReadOnly && <button type="button" onClick={() => handleRemoveRowFile("professionalMembership", idx)} className="text-rose-500 hover:text-rose-700"><X size={10} /></button>}
                              </div>
                            ) : uploadingMap[`professionalMembership_${idx}`] ? (
                              <span className="text-[9px] text-zinc-400 font-bold uppercase animate-pulse">Uploading...</span>
                            ) : !isReadOnly ? (
                              <div className="relative">
                                <label htmlFor={`file_professionalMembership_${idx}`} className="cursor-pointer text-[9px] font-black text-indigo-750 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded uppercase hover:bg-indigo-100 transition-all flex items-center gap-0.5">
                                  <UploadCloud size={9} /> Proof
                                </label>
                                <input type="file" id={`file_professionalMembership_${idx}`} className="hidden" onChange={(e) => handleRowFileSelect(e, "professionalMembership", idx, "sec_professional_memberships")} />
                              </div>
                            ) : (
                              <span className="text-zinc-400 font-semibold text-[10px]">-</span>
                            )}
                          </div>
                        )}
                        
                        <button onClick={() => removeRow("professionalMembership", idx)} disabled={isReadOnly} className="text-rose-500"><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Awards & Honors */}
              {isSectionVisible("sec_awards_honors") && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex justify-between items-center mb-2 border-b border-zinc-200 pb-1">
                    <span style={{ fontSize: "11px" }} className="font-extrabold text-indigo-950 block uppercase tracking-wider flex items-center gap-1.5">
                      <Award size={12} />
                      {getSectionTitle("sec_awards_honors", "4.3 Awards & Recognitions")}
                    </span>
                    {!isReadOnly && (
                      <button
                        onClick={() => addRow("awardsHonors", { awardName: "", organization: "", year: "", level: "Institutional" })}
                        className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] rounded font-bold"
                      >
                        + Add Award
                      </button>
                    )}
                  </div>
                  {getSectionDescription("sec_awards_honors") && (
                    <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_awards_honors")}</p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-zinc-200 text-xs">
                      <thead>
                        <tr className="bg-zinc-50 font-bold">
                          <th className="border border-zinc-200 p-2 text-center w-12">Sl.No</th>
                          <th className="border border-zinc-200 p-2">Award Name / Honor Title</th>
                          <th className="border border-zinc-200 p-2">Awarding Organization</th>
                          <th className="border border-zinc-200 p-2 text-center w-28">Year</th>
                          <th className="border border-zinc-200 p-2 text-center w-36">Level</th>
                          {renderRowEvidenceHeader("sec_awards_honors")}
                          <th className="border border-zinc-200 p-2 text-center w-12">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.awardsHonors?.map((row, idx) => (
                          <tr key={idx}>
                            <td className="border border-zinc-200 p-2 text-center font-bold">{idx+1}</td>
                            <td className="border border-zinc-200 p-1"><input type="text" value={row.awardName} onChange={(e) => updateRow("awardsHonors", idx, "awardName", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 focus:ring-0 focus:outline-none" placeholder="e.g. Best Teacher Award" /></td>
                            <td className="border border-zinc-200 p-1"><input type="text" value={row.organization} onChange={(e) => updateRow("awardsHonors", idx, "organization", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 focus:ring-0 focus:outline-none" placeholder="e.g. ISTE Chapter" /></td>
                            <td className="border border-zinc-200 p-1"><input type="text" value={row.year} onChange={(e) => updateRow("awardsHonors", idx, "year", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center focus:ring-0 focus:outline-none" placeholder="e.g. 2024" /></td>
                            <td className="border border-zinc-200 p-1">
                              <select value={row.level} onChange={(e) => updateRow("awardsHonors", idx, "level", e.target.value)} disabled={isReadOnly} className="w-full border-0 p-1 text-center focus:ring-0 focus:outline-none bg-white">
                                <option value="Institutional">Institutional</option>
                                <option value="State">State Level</option>
                                <option value="National">National Level</option>
                                <option value="International">International Level</option>
                              </select>
                            </td>
                            {renderRowEvidenceCell("awardsHonors", row, idx, "sec_awards_honors")}
                            <td className="border border-zinc-200 p-2 text-center"><button onClick={() => removeRow("awardsHonors", idx)} disabled={isReadOnly} className="text-rose-500"><Trash2 size={12} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {renderTabCustomFields(4)}
            </div>
          )}

          {/* TAB 5: LIBRARY, LEAVES & GRIEVANCES */}
          {activeTab === 5 && (
            <div className="space-y-8 animate-fadeIn">
              
              {/* Library Usage */}
              {isSectionVisible("sec_library_usage") && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <span style={{ fontSize: "11px" }} className="font-extrabold text-indigo-950 block border-b border-zinc-200 pb-1 uppercase tracking-wider flex items-center gap-1.5">
                    <Library size={12} /> 
                    {getSectionTitle("sec_library_usage", "5.1 Library Books & Journals Referenced")}
                  </span>
                  {getSectionDescription("sec_library_usage") && (
                    <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_library_usage")}</p>
                  )}
                  
                  {isSectionVisible("f_libraryUsage") && (
                    <div>
                      <label className="block text-[10px] font-black text-zinc-500 uppercase mb-1">
                        {getSectionTitle("f_libraryUsage", "Use of Library Journals / Books (supplementary readings apart from syllabus to extend knowledge)")}
                      </label>
                      {getSectionDescription("f_libraryUsage") && (
                        <p className="text-[9px] text-zinc-400 mb-1 uppercase">{getSectionDescription("f_libraryUsage")}</p>
                      )}
                      <textarea value={formData.libraryUsage} onChange={(e) => handleInputChange("libraryUsage", e.target.value)} disabled={isReadOnly} rows={3} className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs" placeholder="Mention titles of journals / reference books referenced..." />
                    </div>
                  )}

                  {isSectionVisible("f_libraryPurpose") && (
                    <div>
                      <label className="block text-[10px] font-black text-zinc-500 uppercase mb-2">
                        {getSectionTitle("f_libraryPurpose", "What is your purpose of visiting library?")}
                      </label>
                      {getSectionDescription("f_libraryPurpose") && (
                        <p className="text-[9px] text-zinc-400 mb-2 uppercase">{getSectionDescription("f_libraryPurpose")}</p>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {["Subject Preparation", "Research", "GK", "Others"].map((p) => (
                          <button
                            key={p}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => handleInputChange("libraryPurpose", p)}
                            className={`px-3 py-2.5 rounded-xl text-xs font-bold border text-center transition-all ${
                              formData.libraryPurpose === p ? "bg-[#120c7a] border-[#120c7a] text-white" : "bg-white border-zinc-200 text-zinc-600"
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {isSectionVisible("f_accomplishAssignment") && (
                    <div className="border border-zinc-200 p-4 rounded-2xl bg-white">
                      <label className="block text-[10px] font-black text-zinc-500 uppercase mb-2">
                        {getSectionTitle("f_accomplishAssignment", "Do you accomplish given assignments in time?")}
                      </label>
                      {getSectionDescription("f_accomplishAssignment") && (
                        <p className="text-[9px] text-zinc-400 mb-2 uppercase">{getSectionDescription("f_accomplishAssignment")}</p>
                      )}
                      <div className="flex flex-col gap-2">
                        {["Yes", "with reminder", "Depends on my interest"].map((v) => (
                          <label key={v} className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer">
                            <input type="radio" name="accomplishAssignment" checked={formData.accomplishAssignment === v} onChange={() => handleInputChange("accomplishAssignment", v)} disabled={isReadOnly} className="text-[#120c7a]" />
                            {v}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Leave & Absence Summary */}
              {isSectionVisible("sec_leave_summary") && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 border border-slate-200 p-5 rounded-2xl">
                    {isSectionVisible("f_applyLeaveInAdvance") && (
                      <div className="border border-zinc-205 p-4 rounded-2xl bg-white">
                        <label className="block text-[10px] font-black text-zinc-500 uppercase mb-2">
                          {getSectionTitle("f_applyLeaveInAdvance", "Do you apply for leave in advance?")}
                        </label>
                        {getSectionDescription("f_applyLeaveInAdvance") && (
                          <p className="text-[9px] text-zinc-400 mb-2 uppercase">{getSectionDescription("f_applyLeaveInAdvance")}</p>
                        )}
                        <div className="flex flex-col gap-2">
                          {["Yes", "Most of the time", "No"].map((v) => (
                            <label key={v} className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer">
                              <input type="radio" name="applyLeaveInAdvance" checked={formData.applyLeaveInAdvance === v} onChange={() => handleInputChange("applyLeaveInAdvance", v)} disabled={isReadOnly} className="text-[#120c7a]" />
                              {v}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {isSectionVisible("f_consumeClLastMonth") && (
                      <div className="border border-zinc-205 p-4 rounded-2xl bg-white">
                        <label className="block text-[10px] font-black text-zinc-500 uppercase mb-2">
                          {getSectionTitle("f_consumeClLastMonth", "Do you consume balance CL in last month of session?")}
                        </label>
                        {getSectionDescription("f_consumeClLastMonth") && (
                          <p className="text-[9px] text-zinc-400 mb-2 uppercase">{getSectionDescription("f_consumeClLastMonth")}</p>
                        )}
                        <div className="flex flex-col gap-2">
                          {["Yes", "If required", "No"].map((v) => (
                            <label key={v} className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer">
                              <input type="radio" name="consumeClLastMonth" checked={formData.consumeClLastMonth === v} onChange={() => handleInputChange("consumeClLastMonth", v)} disabled={isReadOnly} className="text-[#120c7a]" />
                              {v}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Leave Taken Summary Table */}
                  <div>
                    <div style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-1">
                      {getSectionTitle("sec_leave_summary", "5.2 Leave & Absence Summary")}
                    </div>
                    {getSectionDescription("sec_leave_summary") && (
                      <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_leave_summary")}</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div>
                        <span className="text-xs font-black text-zinc-600 block mb-2 underline">No. of Leaves availed</span>
                        <div className="grid grid-cols-3 gap-4">
                          {isSectionVisible("f_leaveCl") && (
                            <div>
                              <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">{getSectionTitle("f_leaveCl", "CL")}</label>
                              <input type="number" value={formData.leaveDetails.cl} onChange={(e) => handleNestedInputChange("leaveDetails", "cl", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs text-center font-bold focus:ring-0" />
                            </div>
                          )}
                          {isSectionVisible("f_leaveCoff") && (
                            <div>
                              <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">{getSectionTitle("f_leaveCoff", "C-OFF")}</label>
                              <input type="number" value={formData.leaveDetails.coff} onChange={(e) => handleNestedInputChange("leaveDetails", "coff", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs text-center font-bold focus:ring-0" />
                            </div>
                          )}
                          {isSectionVisible("f_leaveLop") && (
                            <div>
                              <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">{getSectionTitle("f_leaveLop", "LOP")}</label>
                              <input type="number" value={formData.leaveDetails.lop} onChange={(e) => handleNestedInputChange("leaveDetails", "lop", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs text-center font-bold focus:ring-0" />
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-xs font-black text-zinc-600 block mb-2 underline">No. of On Duty (OD) availed</span>
                        <div className="grid grid-cols-3 gap-4">
                          {isSectionVisible("f_odUniversity") && (
                            <div>
                              <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">{getSectionTitle("f_odUniversity", "Univ Exams")}</label>
                              <input type="number" value={formData.leaveDetails.odUniversity} onChange={(e) => handleNestedInputChange("leaveDetails", "odUniversity", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs text-center font-bold focus:ring-0" />
                            </div>
                          )}
                          {isSectionVisible("f_odOthers") && (
                            <div>
                              <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">{getSectionTitle("f_odOthers", "Others")}</label>
                              <input type="number" value={formData.leaveDetails.odOthers} onChange={(e) => handleNestedInputChange("leaveDetails", "odOthers", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs text-center font-bold focus:ring-0" />
                            </div>
                          )}
                          {isSectionVisible("f_odInstitution") && (
                            <div>
                              <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">{getSectionTitle("f_odInstitution", "Institution")}</label>
                              <input type="number" value={formData.leaveDetails.odInstitution} onChange={(e) => handleNestedInputChange("leaveDetails", "odInstitution", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-3 text-xs text-center font-bold focus:ring-0" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grievance happiness */}
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between flex-wrap gap-4">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Are you happy with the Redressal Mechanism adopted for your grievances?</span>
                    <div className="flex gap-4">
                      {["Yes", "No", "Not Applicable"].map((v) => (
                        <label key={v} className="flex items-center gap-1.5 text-xs font-bold text-zinc-700 cursor-pointer">
                          <input type="radio" name="happyGrievanceMechanism" checked={formData.happyGrievanceMechanism === v} onChange={() => handleInputChange("happyGrievanceMechanism", v)} disabled={isReadOnly} className="text-[#120c7a]" />
                          {v}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {renderTabCustomFields(5)}
            </div>
          )}

          {/* TAB 6: RELATIONS & TARGETS */}
          {activeTab === 6 && (
            <div className="space-y-8 animate-fadeIn">
              
              {/* Relations Rating Table */}
              {isSectionVisible("sec_interpersonal_relations") && (
                <>
                  <div>
                    <div style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-1">
                      {getSectionTitle("sec_interpersonal_relations", "6.1 Interpersonal Relations rating scales")}
                    </div>
                    {getSectionDescription("sec_interpersonal_relations") && (
                      <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_interpersonal_relations")}</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Students */}
                      {isSectionVisible("f_relationStudents") && (
                        <div className="border border-zinc-200 p-4 rounded-2xl space-y-3 bg-white">
                          <span className="text-xs font-black text-slate-700 block uppercase tracking-wider">
                            {getSectionTitle("f_relationStudents", "Relationship with the Students")}
                          </span>
                          {getSectionDescription("f_relationStudents") && (
                            <p className="text-[9px] text-zinc-400 uppercase">{getSectionDescription("f_relationStudents")}</p>
                          )}
                          <div className="flex gap-2">
                            {["Good", "Fair", "Unsatisfactory", "Should be improved"].map((r) => (
                              <button
                                key={r}
                                type="button"
                                disabled={isReadOnly}
                                onClick={() => handleNestedInputChange("relationStudents", "rating", r)}
                                className={`px-2.5 py-1 text-[10px] rounded font-bold border ${
                                  formData.relationStudents.rating === r ? "bg-[#120c7a] text-white border-[#120c7a]" : "bg-white border-zinc-200 text-zinc-600"
                                }`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                          {formData.relationStudents.rating === "Should be improved" && (
                            <input type="text" placeholder="Specify Reason..." value={formData.relationStudents.reason} onChange={(e) => handleNestedInputChange("relationStudents", "reason", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs text-zinc-700 focus:outline-none" />
                          )}
                        </div>
                      )}

                      {/* Colleagues */}
                      {isSectionVisible("f_relationColleagues") && (
                        <div className="border border-zinc-200 p-4 rounded-2xl space-y-3 bg-white">
                          <span className="text-xs font-black text-slate-700 block uppercase tracking-wider">
                            {getSectionTitle("f_relationColleagues", "Relationship with the Colleagues")}
                          </span>
                          {getSectionDescription("f_relationColleagues") && (
                            <p className="text-[9px] text-zinc-400 uppercase">{getSectionDescription("f_relationColleagues")}</p>
                          )}
                          <div className="flex gap-2">
                            {["Good", "Fair", "Unsatisfactory", "Should be improved"].map((r) => (
                              <button
                                key={r}
                                type="button"
                                disabled={isReadOnly}
                                onClick={() => handleNestedInputChange("relationColleagues", "rating", r)}
                                className={`px-2.5 py-1 text-[10px] rounded font-bold border ${
                                  formData.relationColleagues.rating === r ? "bg-[#120c7a] text-white border-[#120c7a]" : "bg-white border-zinc-200 text-zinc-600"
                                }`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                          {formData.relationColleagues.rating === "Should be improved" && (
                            <input type="text" placeholder="Specify Reason..." value={formData.relationColleagues.reason} onChange={(e) => handleNestedInputChange("relationColleagues", "reason", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs text-zinc-700 focus:outline-none" />
                          )}
                        </div>
                      )}

                      {/* Superiors */}
                      {isSectionVisible("f_relationSuperiors") && (
                        <div className="border border-zinc-200 p-4 rounded-2xl space-y-3 bg-white">
                          <span className="text-xs font-black text-slate-700 block uppercase tracking-wider">
                            {getSectionTitle("f_relationSuperiors", "Relationship with the Superiors")}
                          </span>
                          {getSectionDescription("f_relationSuperiors") && (
                            <p className="text-[9px] text-zinc-400 uppercase">{getSectionDescription("f_relationSuperiors")}</p>
                          )}
                          <div className="flex gap-2">
                            {["Good", "Fair", "Unsatisfactory", "Should be improved"].map((r) => (
                              <button
                                key={r}
                                type="button"
                                disabled={isReadOnly}
                                onClick={() => handleNestedInputChange("relationSuperiors", "rating", r)}
                                className={`px-2.5 py-1 text-[10px] rounded font-bold border ${
                                  formData.relationSuperiors.rating === r ? "bg-[#120c7a] text-white border-[#120c7a]" : "bg-white border-zinc-200 text-zinc-600"
                                }`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                          {formData.relationSuperiors.rating === "Should be improved" && (
                            <input type="text" placeholder="Specify Reason..." value={formData.relationSuperiors.reason} onChange={(e) => handleNestedInputChange("relationSuperiors", "reason", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs text-zinc-700 focus:outline-none" />
                          )}
                        </div>
                      )}

                      {/* How do you rate department */}
                      {isSectionVisible("f_relationDepartment") && (
                        <div className="border border-zinc-200 p-4 rounded-2xl space-y-3 bg-white">
                          <span className="text-xs font-black text-slate-700 block uppercase tracking-wider">
                            {getSectionTitle("f_relationDepartment", "How do you rate your Department?")}
                          </span>
                          {getSectionDescription("f_relationDepartment") && (
                            <p className="text-[9px] text-zinc-400 uppercase">{getSectionDescription("f_relationDepartment")}</p>
                          )}
                          <div className="flex gap-2">
                            {["Good", "Fair", "Unsatisfactory", "Should be improved"].map((r) => (
                              <button
                                key={r}
                                type="button"
                                disabled={isReadOnly}
                                onClick={() => handleNestedInputChange("relationDepartment", "rating", r)}
                                className={`px-2.5 py-1 text-[10px] rounded font-bold border ${
                                  formData.relationDepartment.rating === r ? "bg-[#120c7a] text-white border-[#120c7a]" : "bg-white border-zinc-200 text-zinc-600"
                                }`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                          {formData.relationDepartment.rating === "Should be improved" && (
                            <input type="text" placeholder="Specify Reason..." value={formData.relationDepartment.reason} onChange={(e) => handleNestedInputChange("relationDepartment", "reason", e.target.value)} disabled={isReadOnly} className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs text-zinc-700 focus:outline-none" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Potential utilized */}
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider block mb-3">Is your potential being appropriately utilized by the Department / Institution?</span>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {["Over Burdened", "Properly Utilized", "Under Utilized", "Not utilized at all"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => handleInputChange("potentialUtilized", v)}
                          className={`px-3 py-2.5 rounded-xl text-xs font-bold border text-center transition-all ${
                            formData.potentialUtilized === v ? "bg-[#120c7a] border-[#120c7a] text-white" : "bg-white border-zinc-200 text-zinc-600"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Target Setup */}
              {isSectionVisible("sec_targets_next_sem") && (
                <div className="space-y-6">
                  <div style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
                    {getSectionTitle("sec_targets_next_sem", "6.2 Future Targets & Planning")}
                  </div>
                  {getSectionDescription("sec_targets_next_sem") && (
                    <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_targets_next_sem")}</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {isSectionVisible("f_targetsNextSemester") && (
                      <div>
                        <label className="block text-xs font-black text-slate-800 uppercase mb-2">
                          {getSectionTitle("f_targetsNextSemester", "Targets set up by you for the Next Semester")}
                        </label>
                        {getSectionDescription("f_targetsNextSemester") && (
                          <p className="text-[9px] text-zinc-400 mb-1 uppercase">{getSectionDescription("f_targetsNextSemester")}</p>
                        )}
                        <textarea value={formData.targetsNextSemester} onChange={(e) => handleInputChange("targetsNextSemester", e.target.value)} disabled={isReadOnly} rows={4} className="w-full rounded-2xl border border-zinc-200 p-4 text-xs" placeholder="e.g. Achieve 95% pass, submit 1 Scopus publication..." />
                      </div>
                    )}
                    {isSectionVisible("f_targetsStrategy") && (
                      <div>
                        <label className="block text-xs font-black text-slate-800 uppercase mb-2">
                          {getSectionTitle("f_targetsStrategy", "Strategy / Planning for Achieving the Targets")}
                        </label>
                        {getSectionDescription("f_targetsStrategy") && (
                          <p className="text-[9px] text-zinc-400 mb-1 uppercase">{getSectionDescription("f_targetsStrategy")}</p>
                        )}
                        <textarea value={formData.targetsStrategy} onChange={(e) => handleInputChange("targetsStrategy", e.target.value)} disabled={isReadOnly} rows={4} className="w-full rounded-2xl border border-zinc-200 p-4 text-xs" placeholder="e.g. Conduct remedial classes from week 4, allocate separate research hours..." />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-800 uppercase mb-2">Difficulties faced and suggestions for improvement of On-Campus Life / Self-Growth</label>
                    <textarea value={formData.difficultiesOnCampus} onChange={(e) => handleInputChange("difficultiesOnCampus", e.target.value)} disabled={isReadOnly} rows={3} className="w-full rounded-2xl border border-zinc-200 p-4 text-xs" />
                  </div>

                  <div className="bg-[#120c7a]/5 border border-[#120c7a]/15 p-5 rounded-2xl flex items-center justify-between flex-wrap gap-4 bg-white">
                    <span className="text-xs font-black text-indigo-950 uppercase tracking-wider">From the above assessment, where would you place yourself?</span>
                    <div className="flex gap-4">
                      {["Above", "At par", "Below"].map((v) => (
                        <label key={v} className="flex items-center gap-1.5 text-xs font-black text-zinc-700 cursor-pointer">
                          <input type="radio" name="selfPlacementGrading" checked={formData.selfPlacementGrading === v} onChange={() => handleInputChange("selfPlacementGrading", v)} disabled={isReadOnly} className="text-[#120c7a]" />
                          {v}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Self-Analysis: Strengths & Weaknesses Table */}
              {isSectionVisible("sec_self_analysis") && (
                <div>
                  <div style={{ fontSize: "11px" }} className="font-extrabold text-slate-800 uppercase tracking-wider mb-3 border-b border-slate-100 pb-1">
                    {getSectionTitle("sec_self_analysis", "6.3 Self-Analysis (Strengths & Weaknesses)")}
                  </div>
                  {getSectionDescription("sec_self_analysis") && (
                    <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_self_analysis")}</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {isSectionVisible("f_selfAnalysisStrengths") && (
                      <div className="border border-emerald-200 bg-emerald-50/20 p-4 rounded-2xl space-y-3">
                        <span className="text-xs font-black text-emerald-800 block uppercase">
                          {getSectionTitle("f_selfAnalysisStrengths", "Strengths")}
                        </span>
                        {getSectionDescription("f_selfAnalysisStrengths") && (
                          <p className="text-[9px] text-zinc-400 uppercase">{getSectionDescription("f_selfAnalysisStrengths")}</p>
                        )}
                        {formData.selfAnalysisStrengths.map((str, idx) => (
                          <input
                            key={idx}
                            type="text"
                            placeholder={`Strength ${idx+1}`}
                            value={str}
                            onChange={(e) => updateListVal("selfAnalysisStrengths", idx, e.target.value)}
                            disabled={isReadOnly}
                            className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-medium"
                          />
                        ))}
                      </div>
                    )}

                    {isSectionVisible("f_selfAnalysisWeaknesses") && (
                      <div className="border border-rose-200 bg-rose-50/20 p-4 rounded-2xl space-y-3">
                        <span className="text-xs font-black text-rose-800 block uppercase">
                          {getSectionTitle("f_selfAnalysisWeaknesses", "Weaknesses")}
                        </span>
                        {getSectionDescription("f_selfAnalysisWeaknesses") && (
                          <p className="text-[9px] text-zinc-400 uppercase">{getSectionDescription("f_selfAnalysisWeaknesses")}</p>
                        )}
                        {formData.selfAnalysisWeaknesses.map((weak, idx) => (
                          <input
                            key={idx}
                            type="text"
                            placeholder={`Weakness ${idx+1}`}
                            value={weak}
                            onChange={(e) => updateListVal("selfAnalysisWeaknesses", idx, e.target.value)}
                            disabled={isReadOnly}
                            className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-medium"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {renderTabCustomFields(6)}
            </div>
          )}

          {activeTab === 7 && (
            <div className="space-y-8 animate-fadeIn text-xs">
              <div className="border-b border-zinc-150 pb-3 mb-6">
                <h3 className="text-sm font-black text-slate-850 uppercase tracking-wider flex items-center gap-1.5">
                  <Award size={18} className="text-[#120c7a]" /> 7. Dynamic Evidences & Disclosures
                </h3>
                <p className="text-[10px] text-zinc-400 font-semibold mt-0.5 uppercase">Provide details and upload required proof document files configured by HR.</p>
              </div>

              <div className="grid grid-cols-1 gap-8">
                {customFieldsConfig.filter(f => f.tabId === 7 && !f.id.startsWith("sec_") && f.visible !== false).map((field) => {
                  const savedEntry = formData.customFields?.[field.id] || { value: "", fileUrl: "", fileName: "" };
                  const isUploading = uploadingMap[field.id];

                  const handleFieldTextChange = (val) => {
                    setFormData(prev => ({
                      ...prev,
                      customFields: {
                        ...prev.customFields,
                        [field.id]: {
                          ...savedEntry,
                          label: field.title,
                          value: val
                        }
                      }
                    }));
                  };

                  const handleFileSelect = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    // Check size limit dynamically (default to 300KB if not specified)
                    const maxSizeKb = field.maxSizeKb ? parseInt(field.maxSizeKb) : 300;
                    if (file.size > maxSizeKb * 1024) {
                      showToast(`File size is ${(file.size / 1024).toFixed(1)} KB, which exceeds the limit of ${maxSizeKb} KB configured for this field.`, "error");
                      e.target.value = ""; // Reset input
                      return;
                    }

                    setUploadingMap(prev => ({ ...prev, [field.id]: true }));
                    try {
                      const storagePath = userStoragePath(currentUser.uid, "appraisal_evidences", `${field.id}_${file.name}`);
                      const downloadUrl = await uploadFile(storagePath, file, file.type);
                      setFormData(prev => ({
                        ...prev,
                        customFields: {
                          ...prev.customFields,
                          [field.id]: {
                            ...savedEntry,
                            label: field.title,
                            fileUrl: downloadUrl,
                            fileName: file.name
                          }
                        }
                      }));
                      showToast(`Uploaded evidence file for "${field.title}"!`, "success");
                    } catch (err) {
                      console.error("Error uploading evidence:", err);
                      showToast("File upload failed. Please try again.", "error");
                    }
                    setUploadingMap(prev => ({ ...prev, [field.id]: false }));
                  };

                  const handleRemoveFile = () => {
                    setFormData(prev => ({
                      ...prev,
                      customFields: {
                        ...prev.customFields,
                        [field.id]: {
                          ...savedEntry,
                          fileUrl: "",
                          fileName: ""
                        }
                      }
                    }));
                    showToast("Evidence attachment removed.", "success");
                  };

                  return (
                    <div key={field.id} className="bg-zinc-50 border border-zinc-150 p-6 rounded-2xl space-y-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-black text-slate-805 uppercase tracking-wider">{field.title}</label>
                          {field.evidenceRequired && (
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              field.evidenceMandatory 
                                ? "bg-red-55 border border-red-150 text-red-700 animate-pulse font-sans" 
                                : "bg-indigo-50 border border-indigo-100 text-indigo-750 font-sans"
                            }`}>
                              {field.evidenceMandatory ? "Mandatory Evidence" : "Evidence Welcome"}
                            </span>
                          )}
                        </div>
                        {field.description && (
                          <p className="text-[10px] text-zinc-400 font-semibold mt-1 uppercase leading-relaxed">{field.description}</p>
                        )}
                      </div>

                      {field.type !== "file_only" && (
                        <div>
                          {field.type === "textarea" ? (
                            <textarea
                              value={savedEntry.value || ""}
                              onChange={(e) => handleFieldTextChange(e.target.value)}
                              disabled={isReadOnly}
                              rows={4}
                              className="w-full rounded-xl border border-zinc-200 p-3 text-xs bg-white focus:outline-none font-medium"
                              placeholder="Type details here..."
                            />
                          ) : (
                            <input
                              type={field.type}
                              value={savedEntry.value || ""}
                              onChange={(e) => handleFieldTextChange(e.target.value)}
                              disabled={isReadOnly}
                              className="w-full rounded-xl border border-zinc-200 p-3 text-xs bg-white focus:outline-none font-medium"
                              placeholder="Type answer here..."
                            />
                          )}
                        </div>
                      )}

                      {field.evidenceRequired && (
                        <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-[#120c7a]">
                              <Paperclip size={18} />
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">Evidence File Proof</span>
                              {savedEntry.fileUrl ? (
                                <a 
                                  href={savedEntry.fileUrl} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="text-xs font-bold text-blue-600 hover:underline truncate max-w-xs block"
                                >
                                  {savedEntry.fileName || "View Attachment"}
                                </a>
                              ) : (
                                <span className="text-xs font-bold text-zinc-400 italic">No File Uploaded</span>
                              )}
                            </div>
                          </div>

                          {!isReadOnly && (
                            <div className="flex items-center gap-3">
                              {isUploading ? (
                                <div className="flex items-center gap-1.5 text-zinc-400 font-bold">
                                  <Loader2 size={14} className="animate-spin text-[#120c7a]" />
                                  <span>Uploading...</span>
                                </div>
                              ) : savedEntry.fileUrl ? (
                                <button
                                  type="button"
                                  onClick={handleRemoveFile}
                                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <Trash2 size={12} /> Remove
                                </button>
                              ) : (
                                <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-indigo-100">
                                  <UploadCloud size={14} /> Upload File
                                  <input
                                    type="file"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                  />
                                </label>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* Action Button Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-8 pb-12">
          {/* Previous / Next Tab buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab(prev => Math.max(1, prev - 1))}
              disabled={activeTab === 1}
              className="px-4 py-2 border border-zinc-200 text-zinc-600 hover:bg-zinc-50 rounded-xl text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft size={14} /> Back
            </button>
            <button
              onClick={() => setActiveTab(prev => Math.min(tabs[tabs.length - 1]?.id || 6, prev + 1))}
              disabled={activeTab === (tabs[tabs.length - 1]?.id || 6)}
              className="px-4 py-2 border border-zinc-200 text-zinc-600 hover:bg-zinc-50 rounded-xl text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>

          {/* Save / Submit actions */}
          {!isReadOnly && (
            <div className="flex items-center gap-3">
              {isEditingSubmitted && (
                <button
                  type="button"
                  onClick={handleCancelEdits}
                  className="px-4 py-2.5 border border-zinc-200 text-zinc-500 hover:bg-zinc-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <X size={14} /> Cancel Edits
                </button>
              )}

              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Draft
              </button>
              
              <button
                onClick={() => {
                  if (confirm(isEditingSubmitted 
                    ? "Are you sure you want to resubmit this self appraisal with your new edits?" 
                    : "Are you sure you want to finalize and submit this self appraisal? You will not be able to make changes until reviewed."
                  )) {
                    handleSave(true);
                  }
                }}
                disabled={saving}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-700 to-violet-800 hover:from-indigo-850 hover:to-violet-950 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {isEditingSubmitted ? "Resubmit to HOD" : "Submit to HOD"}
              </button>
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
