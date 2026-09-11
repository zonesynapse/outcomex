import { useState, useEffect, useRef, useMemo } from "react";
import { auth, db } from "../firebase";
import { collection, onSnapshot, doc, updateDoc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { 
  User, CheckCircle2, AlertCircle, FileText, ChevronRight,
  Eye, Check, Search, Building2, Filter, Loader2, ArrowLeft,
  X, Star, Printer, Undo2, Award, Sparkles, Send, GraduationCap, Library
} from "lucide-react";
import Layout from "../components/Layout";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

export default function AppraisalReviews() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userDept, setUserDept] = useState(null);
  const [appraisals, setAppraisals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);
  const [customFieldsConfig, setCustomFieldsConfig] = useState([]);

  // Search, Filter & View Details States
  const [searchTerm, setSearchTerm] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedAppraisal, setSelectedAppraisal] = useState(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState(1);

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

  const isSectionEvidenceRequired = (secId) => {
    return customFieldsConfig.find(f => f.id === secId)?.evidenceRequired === true;
  };

  const renderRowEvidenceHeader = (sectionId) => {
    if (!isSectionEvidenceRequired(sectionId)) return null;
    return <th className="border border-zinc-200 p-2 text-center w-28 text-[10px] uppercase font-bold text-zinc-600 bg-zinc-50">Evidence</th>;
  };

  const renderRowEvidenceCellReadOnly = (row, sectionId) => {
    if (!isSectionEvidenceRequired(sectionId)) return null;
    return (
      <td className="border border-zinc-200 p-1.5 text-center min-w-[100px]">
        {row.fileUrl ? (
          <a 
            href={row.fileUrl} 
            target="_blank" 
            rel="noreferrer" 
            className="inline-block text-[10px] font-extrabold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-100 transition-all"
            title={row.fileName || "View Proof"}
          >
            Proof File
          </a>
        ) : (
          <span className="text-zinc-400 font-semibold text-[10px]">-</span>
        )}
      </td>
    );
  };

  const isCustomDisclosureField = (f, customData) => {
    if (!f || f.visible === false || f.id.startsWith("sec_")) return false;
    // Built-in section sub-fields have parentId starting with sec_
    if (f.parentId && f.parentId.startsWith("sec_")) return false;
    // Include custom dynamic fields, fields requiring evidence, or fields with saved data/files
    if (f.id.startsWith("field_") || f.evidenceRequired) return true;
    const saved = customData?.[f.id];
    if (saved && (saved.value || saved.fileUrl)) return true;
    return false;
  };

  const appraisalTabs = useMemo(() => {
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
      if (tab.id === 7) {
        return customFieldsConfig.some(f => f.tabId === 7 && isCustomDisclosureField(f, selectedAppraisal?.formData?.customFields));
      }
      const hasVisibleBuiltIn = customFieldsConfig.some(f => f.tabId === tab.id && f.id.startsWith("sec_") && f.visible !== false);
      const hasVisibleCustom = customFieldsConfig.some(f => f.tabId === tab.id && isCustomDisclosureField(f, selectedAppraisal?.formData?.customFields));
      if (customFieldsConfig.length === 0) return true;
      return hasVisibleBuiltIn || hasVisibleCustom;
    });
  }, [customFieldsConfig, selectedAppraisal]);

  const renderReviewCustomFields = (tId, customFieldsData) => {
    const tabFields = customFieldsConfig.filter(f => f.tabId === tId && isCustomDisclosureField(f, customFieldsData));
    if (tabFields.length === 0) return null;

    return (
      <div className="mt-6 pt-6 border-t border-zinc-150 space-y-4 text-xs">
        <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5 mb-2">
          <Award size={14} className="text-[#120c7a]" /> Additional Evidences & Disclosures
        </h4>
        <div className="grid grid-cols-1 gap-4">
          {tabFields.map((field) => {
            const savedEntry = customFieldsData?.[field.id] || { value: "", fileUrl: "", fileName: "" };
            return (
              <div key={field.id} className="bg-slate-50 border border-slate-200/50 p-4 rounded-xl space-y-2">
                <span className="block text-[9px] font-black text-[#120c7a] uppercase tracking-wider">{field.title}</span>
                {field.description && (
                  <p className="text-[9px] text-zinc-400 font-semibold uppercase leading-tight">{field.description}</p>
                )}
                {field.type !== "file_only" && savedEntry.value && (
                  <p className="font-bold text-slate-850 bg-white p-3 rounded-lg border border-zinc-100">{savedEntry.value}</p>
                )}
                {field.evidenceRequired && savedEntry.fileUrl && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-zinc-400 font-semibold uppercase text-[9px]">Proof Attachment:</span>
                    <a 
                      href={savedEntry.fileUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-xs font-bold text-blue-600 hover:underline truncate max-w-xs block"
                    >
                      {savedEntry.fileName || "View Attachment"}
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Correction Modal
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionComments, setCorrectionComments] = useState("");

  // Review Form States
  const [comments, setComments] = useState("");
  const [evaluationGrade, setEvaluationGrade] = useState("Good");
  
  // Principal Checkboxes
  const [principalCheckboxes, setPrincipalCheckboxes] = useState({
    appreciated: false,
    satisfactory: false,
    underutilized: false,
    counseling: false,
    improvementDesired: false
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
          setUserRole(userSnap.data().role || "Faculty");
          setUserDept(userSnap.data().department || "");
        }
      }
    });
    return () => unsub();
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

  // Fetch all appraisal records
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(collection(db, "faculty_appraisals"), (snap) => {
      const list = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setAppraisals(list);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  const filteredAppraisals = appraisals.filter((app) => {
    const nameMatch = (app.facultyName || "").toLowerCase().includes(searchTerm.toLowerCase());
    const emailMatch = (app.facultyEmail || "").toLowerCase().includes(searchTerm.toLowerCase());
    
    const depMatch = userRole === "HOD" 
      ? app.department === userDept
      : (deptFilter === "All" || app.department === deptFilter);
      
    const statusMatch = statusFilter === "All" || app.status === statusFilter;
    
    return (nameMatch || emailMatch) && depMatch && statusMatch;
  });

  const availableDepts = [...new Set(appraisals.map((a) => a.department))].filter(Boolean);

  const handleOpenDetails = (app) => {
    setSelectedAppraisal(app);
    setActiveDetailsTab(1);
    
    if (userRole === "HOD") {
      setComments(app.hodReview?.comments || "");
      setEvaluationGrade(app.hodReview?.grade || "Good");
    } else if (userRole === "Principal" || userRole === "Admin") {
      setComments(app.principalReview?.comments || "");
      setEvaluationGrade(app.principalReview?.grade || "Good");
      setPrincipalCheckboxes({
        appreciated: app.principalReview?.checkboxes?.appreciated || false,
        satisfactory: app.principalReview?.checkboxes?.satisfactory || false,
        underutilized: app.principalReview?.checkboxes?.underutilized || false,
        counseling: app.principalReview?.checkboxes?.counseling || false,
        improvementDesired: app.principalReview?.checkboxes?.improvementDesired || false
      });
    }
  };

  const handleReviewAction = async (newStatus) => {
    if (!selectedAppraisal) return;
    setActioning(true);

    const updatePayload = {
      status: newStatus,
      updatedAt: new Date().toISOString()
    };

    if (userRole === "HOD") {
      updatePayload.hodReview = {
        comments: comments || "Reviewed by HOD",
        grade: evaluationGrade,
        reviewedBy: currentUser.email,
        reviewedAt: new Date().toISOString()
      };
    } else if (userRole === "Principal" || userRole === "Admin") {
      updatePayload.principalReview = {
        comments: comments || "Approved by Principal",
        grade: evaluationGrade,
        checkboxes: principalCheckboxes,
        reviewedBy: currentUser.email,
        reviewedAt: new Date().toISOString()
      };
    }

    try {
      await updateDoc(doc(db, "faculty_appraisals", selectedAppraisal.id), updatePayload);
      showToast(`Appraisal successfully updated to: ${newStatus.replace("_", " ")}`, "success");
      setSelectedAppraisal(null);
    } catch (error) {
      console.error("Error updating appraisal:", error);
      showToast("Failed to update appraisal status.", "error");
    }
    setActioning(false);
  };

  const handleReturnCorrection = async () => {
    if (!selectedAppraisal || !correctionComments.trim()) return;
    setActioning(true);

    const updatePayload = {
      status: "Returned",
      updatedAt: new Date().toISOString(),
      hodReview: userRole === "HOD" ? {
        comments: correctionComments,
        reviewedBy: currentUser.email,
        reviewedAt: new Date().toISOString()
      } : selectedAppraisal.hodReview,
      principalReview: userRole === "Principal" ? {
        comments: correctionComments,
        reviewedBy: currentUser.email,
        reviewedAt: new Date().toISOString()
      } : selectedAppraisal.principalReview
    };

    try {
      await updateDoc(doc(db, "faculty_appraisals", selectedAppraisal.id), updatePayload);
      showToast("Appraisal returned to faculty for correction.", "success");
      setCorrectionModalOpen(false);
      setCorrectionComments("");
      setSelectedAppraisal(null);
    } catch (error) {
      console.error("Error returning appraisal:", error);
      showToast("Failed to return appraisal.", "error");
    }
    setActioning(false);
  };

  const handlePrintPDF = (app) => {
    const data = app.formData || app;
    const doc = new jsPDF("p", "pt", "a4");
    
    doc.setFont("Times", "bold");
    doc.setFontSize(14);
    doc.text("CK COLLEGE OF ENGINEERING & TECHNOLOGY, CUDDALORE - 607 003", 30, 45);
    doc.setFontSize(11);
    doc.setFont("Times", "normal");
    doc.text("SELF APPRAISAL FORM FOR TEACHING FACULTY", 190, 65);
    doc.setFont("Times", "italic");
    doc.text(`Academic Session: ${app.academicYear || "2024-2025"}`, 230, 80);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(30, 95, 565, 95);

    // Profile Details Grid
    doc.setFont("Times", "bold");
    doc.setFontSize(10);
    doc.text("1. PERSONAL & POST DETAILS", 30, 115);
    
    const info = [
      ["Faculty Name:", data.name || "", "Designation:", data.designation || ""],
      ["Department:", data.department || "", "Date of Birth:", data.dob || ""],
      ["Age:", data.age || "", "DOJ College:", data.dojCollege || ""],
      ["DOJ Present Post:", data.dojPresentPost || "", "Academic Qual:", data.academicQualification || ""],
      ["Specialization:", data.subjectSpecialization || "", "", ""]
    ];

    doc.autoTable({
      startY: 125,
      margin: { left: 30, right: 30 },
      body: info,
      theme: "plain",
      styles: { font: "Times", fontSize: 9, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: "bold", width: 90 }, 2: { fontStyle: "bold", width: 90 } }
    });

    // Experience Summary
    doc.setFont("Times", "bold");
    doc.text("2. EXPERIENCE SUMMARY (Years)", 30, doc.lastAutoTable.finalY + 25);
    
    const expData = [
      ["Teaching at CKCET", data.experience?.teachingCKCET || "0"],
      ["Teaching Elsewhere", data.experience?.teachingElsewhere || "0"],
      ["Industrial Experience", data.experience?.industrial || "0"]
    ];

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 35,
      margin: { left: 30, right: 30 },
      head: [["Experience Category", "Years of Experience"]],
      body: expData,
      theme: "striped",
      headStyles: { fillColor: [18, 12, 122], textColor: 255, font: "Times", fontStyle: "bold", fontSize: 9 },
      styles: { font: "Times", fontSize: 9 }
    });

    // HOD & Principal Evaluation Sheet
    doc.addPage();
    doc.setFont("Times", "bold");
    doc.setFontSize(12);
    doc.text("EVALUATION & REVIEW SHEET", 30, 45);
    doc.line(30, 55, 565, 55);

    doc.setFontSize(10);
    doc.text("HOD RECOMMENDATION / REMARKS", 30, 80);
    
    const hodInfo = [
      ["Evaluation Grade:", app.hodReview?.grade || "Not Reviewed Yet"],
      ["Remarks:", app.hodReview?.comments || "N/A"],
      ["Reviewed By:", app.hodReview?.reviewedBy || "-"],
      ["Date:", app.hodReview?.reviewedAt ? new Date(app.hodReview.reviewedAt).toLocaleDateString() : "-"]
    ];

    doc.autoTable({
      startY: 90,
      margin: { left: 30, right: 30 },
      body: hodInfo,
      theme: "plain",
      styles: { font: "Times", fontSize: 9, cellPadding: 5 },
      columnStyles: { 0: { fontStyle: "bold", width: 120 } }
    });

    doc.text("PRINCIPAL APPROVAL & RATING", 30, doc.lastAutoTable.finalY + 30);
    
    // Checkboxes text
    const cb = app.principalReview?.checkboxes || {};
    const cbText = [
      cb.appreciated ? "[x] His / Her contribution to be appreciated and recommended" : "[ ] His / Her contribution to be appreciated and recommended",
      cb.satisfactory ? "[x] Satisfactory performance" : "[ ] Satisfactory performance",
      cb.underutilized ? "[x] Potential underutilized" : "[ ] Potential underutilized",
      cb.counseling ? "[x] Counseling is required" : "[ ] Counseling is required",
      cb.improvementDesired ? "[x] Performance improvement is desired / to be warned" : "[ ] Performance improvement is desired / to be warned"
    ].join("\n");

    const principalInfo = [
      ["Principal Grading:", app.principalReview?.grade || "Pending Approval"],
      ["Assessment Status:", cbText],
      ["Remarks:", app.principalReview?.comments || "N/A"],
      ["Approved By:", app.principalReview?.reviewedBy || "-"],
      ["Date:", app.principalReview?.reviewedAt ? new Date(app.principalReview.reviewedAt).toLocaleDateString() : "-"]
    ];

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 40,
      margin: { left: 30, right: 30 },
      body: principalInfo,
      theme: "plain",
      styles: { font: "Times", fontSize: 9, cellPadding: 5 },
      columnStyles: { 0: { fontStyle: "bold", width: 120 } }
    });

    const finalY = doc.lastAutoTable.finalY + 80;
    doc.setFont("Times", "bold");
    doc.text("Signature of Faculty", 30, finalY);
    doc.text("Signature of HOD", 230, finalY);
    doc.text("Signature of Principal", 430, finalY);

    doc.save(`Appraisal_${app.facultyName.replace(" ", "_")}_${app.academicYear}.pdf`);
  };

  if (loading) {
    return (
      <Layout title="Appraisal Reviews">
        <div className="flex justify-center items-center py-24">
          <Loader2 size={36} className="animate-spin text-[#120c7a]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Faculty Appraisal Requests">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Toast Alert */}
        {toast.show && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-5 py-3.5 rounded-xl text-white font-bold shadow-lg animate-slideIn ${toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"}`}>
            <CheckCircle2 size={18} />
            <span>{toast.message}</span>
          </div>
        )}

        {/* Details Slider / View */}
        {selectedAppraisal ? (
          <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden animate-fadeIn">
            {/* Header Area */}
            <div className="bg-zinc-50 border-b border-zinc-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
              <button
                onClick={() => setSelectedAppraisal(null)}
                className="px-3.5 py-1.5 border border-zinc-200 text-zinc-600 hover:bg-zinc-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft size={14} /> Back to Requests
              </button>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handlePrintPDF(selectedAppraisal)}
                  className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Printer size={14} /> Print PDF
                </button>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  selectedAppraisal.status === "Approved" ? "bg-emerald-500/20 text-emerald-700 border border-emerald-500/30" :
                  selectedAppraisal.status === "HOD_Approved" ? "bg-blue-500/20 text-blue-700 border border-blue-500/30" :
                  selectedAppraisal.status === "Submitted" ? "bg-amber-500/20 text-amber-700 border border-amber-500/30" :
                  selectedAppraisal.status === "Returned" ? "bg-rose-500/20 text-rose-700 border border-rose-500/30" :
                  "bg-zinc-500/20 text-zinc-700 border border-zinc-500/30"
                }`}>
                  {selectedAppraisal.status.replace("_", " ")}
                </span>
              </div>
            </div>

            {/* Appraisal Details Content */}
            <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Column: Form Details & Tables (2 cols wide) */}
              <div className="lg:col-span-2 space-y-8">
                
                {/* Custom internal detail tabs */}
                <div className="flex border-b border-zinc-100 overflow-x-auto gap-2 no-scrollbar mb-4">
                  {appraisalTabs.map((subTab) => (
                    <button
                      key={subTab.id}
                      onClick={() => setActiveDetailsTab(subTab.id)}
                      className={`pb-3 px-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                        activeDetailsTab === subTab.id
                          ? "border-indigo-600 text-indigo-600"
                          : "border-transparent text-zinc-500 hover:text-zinc-700"
                      }`}
                    >
                      {subTab.name}
                    </button>
                  ))}
                </div>

                {/* Sub-Tab 1: Profile & Workload */}
                {activeDetailsTab === 1 && (
                  <div className="space-y-6">
                    {isSectionVisible("sec_profile_details") && (
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                        <span style={{ fontSize: "11px" }} className="font-extrabold text-indigo-950 block border-b border-zinc-200 pb-1 uppercase tracking-wider">
                          {getSectionTitle("sec_profile_details", "1.1 Profile Details")}
                        </span>
                        {getSectionDescription("sec_profile_details") && (
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase">{getSectionDescription("sec_profile_details")}</p>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-xs">
                          {isSectionVisible("f_name") && (
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_name", "Faculty Name")}</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.name || selectedAppraisal.facultyName}</span>
                            </div>
                          )}
                          {isSectionVisible("f_designation") && (
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_designation", "Designation")}</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.designation || selectedAppraisal.designation}</span>
                            </div>
                          )}
                          {isSectionVisible("f_department") && (
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_department", "Department")}</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.department || selectedAppraisal.department}</span>
                            </div>
                          )}
                          {isSectionVisible("f_dob") && (
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_dob", "Date of Birth")}</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.dob || "-"}</span>
                            </div>
                          )}
                          {isSectionVisible("f_age") && (
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_age", "Age")}</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.age || "-"}</span>
                            </div>
                          )}
                          {isSectionVisible("f_subjectSpecialization") && (
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_subjectSpecialization", "Specialization / Interest")}</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.subjectSpecialization || "-"}</span>
                            </div>
                          )}
                          {isSectionVisible("f_dojCollege") && (
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_dojCollege", "DOJ College")}</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.dojCollege || "-"}</span>
                            </div>
                          )}
                          {isSectionVisible("f_dojPresentPost") && (
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_dojPresentPost", "DOJ Present Post")}</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.dojPresentPost || "-"}</span>
                            </div>
                          )}
                          {isSectionVisible("f_academicQualification") && (
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_academicQualification", "Academic Qualification")}</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.academicQualification || "-"}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isSectionVisible("sec_profile_experience") && (
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                        <span style={{ fontSize: "11px" }} className="font-extrabold text-indigo-950 block border-b border-zinc-200 pb-1 uppercase tracking-wider">
                          {getSectionTitle("sec_profile_experience", "1.2 Teaching & Industrial Experience")}
                        </span>
                        {getSectionDescription("sec_profile_experience") && (
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase">{getSectionDescription("sec_profile_experience")}</p>
                        )}
                        <div className="grid grid-cols-3 gap-4">
                          {isSectionVisible("f_teachingCKCET") && (
                            <div className="bg-white border border-zinc-200 p-3 rounded-xl text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_teachingCKCET", "Teaching CKCET")}</span>
                              <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.experience?.teachingCKCET || "0"} Yrs</span>
                            </div>
                          )}
                          {isSectionVisible("f_teachingElsewhere") && (
                            <div className="bg-white border border-zinc-200 p-3 rounded-xl text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_teachingElsewhere", "Teaching Elsewhere")}</span>
                              <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.experience?.teachingElsewhere || "0"} Yrs</span>
                            </div>
                          )}
                          {isSectionVisible("f_industrial") && (
                            <div className="bg-white border border-zinc-200 p-3 rounded-xl text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_industrial", "Industrial")}</span>
                              <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.experience?.industrial || "0"} Yrs</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isSectionVisible("sec_profile_workload") && (
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                        <span style={{ fontSize: "11px" }} className="font-extrabold text-indigo-950 block border-b border-zinc-200 pb-1 uppercase tracking-wider">
                          {getSectionTitle("sec_profile_workload", "1.3 Weekly Work Load (Hours)")}
                        </span>
                        {getSectionDescription("sec_profile_workload") && (
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase">{getSectionDescription("sec_profile_workload")}</p>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                          {isSectionVisible("f_oddTheory") && (
                            <div className="bg-white border border-zinc-200 p-3 rounded-xl text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_oddTheory", "Odd Theory")}</span>
                              <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.oddTheory || "0"} Hrs</span>
                            </div>
                          )}
                          {isSectionVisible("f_oddPractical") && (
                            <div className="bg-white border border-zinc-200 p-3 rounded-xl text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_oddPractical", "Odd Lab")}</span>
                              <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.oddPractical || "0"} Hrs</span>
                            </div>
                          )}
                          {isSectionVisible("f_oddTotal") && (
                            <div className="bg-white border border-zinc-200 p-3 rounded-xl text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_oddTotal", "Odd Total")}</span>
                              <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.oddTotal || "0"} Hrs</span>
                            </div>
                          )}
                          {isSectionVisible("f_evenTheory") && (
                            <div className="bg-white border border-zinc-200 p-3 rounded-xl text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_evenTheory", "Even Theory")}</span>
                              <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.evenTheory || "0"} Hrs</span>
                            </div>
                          )}
                          {isSectionVisible("f_evenPractical") && (
                            <div className="bg-white border border-zinc-200 p-3 rounded-xl text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_evenPractical", "Even Lab")}</span>
                              <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.evenPractical || "0"} Hrs</span>
                            </div>
                          )}
                          {isSectionVisible("f_evenTotal") && (
                            <div className="bg-white border border-zinc-200 p-3 rounded-xl text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_evenTotal", "Even Total")}</span>
                              <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.evenTotal || "0"} Hrs</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {renderReviewCustomFields(1, selectedAppraisal.formData?.customFields)}
                  </div>
                )}

                {activeDetailsTab === 2 && (
                  <div className="space-y-6">
                    {isSectionVisible("sec_subjects_results") && (
                      <>
                        {/* Dynamic Title / Description */}
                        <div className="border-b border-slate-100 pb-2 mb-4">
                          <span style={{ fontSize: "11px" }} className="font-extrabold text-indigo-950 block uppercase tracking-wider">
                            {getSectionTitle("sec_subjects_results", "2.1 Subject Results & Student Feedback Ratings")}
                          </span>
                          {getSectionDescription("sec_subjects_results") && (
                            <p className="text-[10px] text-zinc-400 font-semibold uppercase mt-0.5">{getSectionDescription("sec_subjects_results")}</p>
                          )}
                        </div>

                        {/* Odd Semester */}
                        <div>
                          <span className="text-xs font-black text-[#120c7a] block mb-2 uppercase tracking-wider">Odd Semester Theory Subjects</span>
                          <table className="w-full border-collapse border border-zinc-200 text-xs">
                            <tr className="bg-zinc-50 font-bold">
                              <th className="border border-zinc-200 p-2">Class</th>
                              <th className="border border-zinc-200 p-2">Subject Code & Title</th>
                              <th className="border border-zinc-200 p-2 text-center">Appeared</th>
                              <th className="border border-zinc-200 p-2 text-center">Passed</th>
                              <th className="border border-zinc-200 p-2 text-center">% Result</th>
                              <th className="border border-zinc-200 p-2 text-center">Feedback Rating</th>
                              {renderRowEvidenceHeader("sec_subjects_results")}
                            </tr>
                            {(selectedAppraisal.formData?.oddTheorySubjects || []).map((row, i) => (
                              <tr key={i}>
                                <td className="border border-zinc-200 p-2">{row.class}</td>
                                <td className="border border-zinc-200 p-2">{row.subjectCodeTitle}</td>
                                <td className="border border-zinc-200 p-2 text-center">{row.appeared}</td>
                                <td className="border border-zinc-200 p-2 text-center">{row.passed}</td>
                                <td className="border border-zinc-200 p-2 text-center font-bold text-[#120c7a]">{row.resultPercentage}</td>
                                <td className="border border-zinc-200 p-2 text-center font-bold text-indigo-700">{row.feedbackRating}</td>
                                {renderRowEvidenceCellReadOnly(row, "sec_subjects_results")}
                              </tr>
                            ))}
                          </table>
                        </div>

                        <div>
                          <span className="text-xs font-black text-[#120c7a] block mb-2 uppercase tracking-wider">Odd Semester Practical / Project Subjects</span>
                          <table className="w-full border-collapse border border-zinc-200 text-xs">
                            <tr className="bg-zinc-50 font-bold">
                              <th className="border border-zinc-200 p-2">Class</th>
                              <th className="border border-zinc-200 p-2">Subject Code & Title</th>
                              <th className="border border-zinc-200 p-2 text-center">Appeared</th>
                              <th className="border border-zinc-200 p-2 text-center">Passed</th>
                              <th className="border border-zinc-200 p-2 text-center">% Result</th>
                              <th className="border border-zinc-200 p-2 text-center">Feedback Rating</th>
                              {renderRowEvidenceHeader("sec_subjects_results")}
                            </tr>
                            {(selectedAppraisal.formData?.oddPracticalSubjects || []).map((row, i) => (
                              <tr key={i}>
                                <td className="border border-zinc-200 p-2">{row.class}</td>
                                <td className="border border-zinc-200 p-2">{row.subjectCodeTitle}</td>
                                <td className="border border-zinc-200 p-2 text-center">{row.appeared}</td>
                                <td className="border border-zinc-200 p-2 text-center">{row.passed}</td>
                                <td className="border border-zinc-200 p-2 text-center font-bold text-[#120c7a]">{row.resultPercentage}</td>
                                <td className="border border-zinc-200 p-2 text-center font-bold text-indigo-700">{row.feedbackRating}</td>
                                {renderRowEvidenceCellReadOnly(row, "sec_subjects_results")}
                              </tr>
                            ))}
                          </table>
                        </div>

                        {/* Even Semester */}
                        <div>
                          <span className="text-xs font-black text-[#120c7a] block mb-2 uppercase tracking-wider">Even Semester Theory Subjects</span>
                          <table className="w-full border-collapse border border-zinc-200 text-xs">
                            <tr className="bg-zinc-50 font-bold">
                              <th className="border border-zinc-200 p-2">Class</th>
                              <th className="border border-zinc-200 p-2">Subject Code & Title</th>
                              <th className="border border-zinc-200 p-2 text-center">Appeared</th>
                              <th className="border border-zinc-200 p-2 text-center">Passed</th>
                              <th className="border border-zinc-200 p-2 text-center">% Result</th>
                              <th className="border border-zinc-200 p-2 text-center">Feedback Rating</th>
                              {renderRowEvidenceHeader("sec_subjects_results")}
                            </tr>
                            {(selectedAppraisal.formData?.evenTheorySubjects || []).map((row, i) => (
                              <tr key={i}>
                                <td className="border border-zinc-200 p-2">{row.class}</td>
                                <td className="border border-zinc-200 p-2">{row.subjectCodeTitle}</td>
                                <td className="border border-zinc-200 p-2 text-center">{row.appeared}</td>
                                <td className="border border-zinc-200 p-2 text-center">{row.passed}</td>
                                <td className="border border-zinc-200 p-2 text-center font-bold text-[#120c7a]">{row.resultPercentage}</td>
                                <td className="border border-zinc-200 p-2 text-center font-bold text-indigo-700">{row.feedbackRating}</td>
                                {renderRowEvidenceCellReadOnly(row, "sec_subjects_results")}
                              </tr>
                            ))}
                          </table>
                        </div>

                        <div>
                          <span className="text-xs font-black text-[#120c7a] block mb-2 uppercase tracking-wider">Even Semester Practical / Project Subjects</span>
                          <table className="w-full border-collapse border border-zinc-200 text-xs">
                            <tr className="bg-zinc-50 font-bold">
                              <th className="border border-zinc-200 p-2">Class</th>
                              <th className="border border-zinc-200 p-2">Subject Code & Title</th>
                              <th className="border border-zinc-200 p-2 text-center">Appeared</th>
                              <th className="border border-zinc-200 p-2 text-center">Passed</th>
                              <th className="border border-zinc-200 p-2 text-center">% Result</th>
                              <th className="border border-zinc-200 p-2 text-center">Feedback Rating</th>
                              {renderRowEvidenceHeader("sec_subjects_results")}
                            </tr>
                            {(selectedAppraisal.formData?.evenPracticalSubjects || []).map((row, i) => (
                              <tr key={i}>
                                <td className="border border-zinc-200 p-2">{row.class}</td>
                                <td className="border border-zinc-200 p-2">{row.subjectCodeTitle}</td>
                                <td className="border border-zinc-200 p-2 text-center">{row.appeared}</td>
                                <td className="border border-zinc-200 p-2 text-center">{row.passed}</td>
                                <td className="border border-zinc-200 p-2 text-center font-bold text-[#120c7a]">{row.resultPercentage}</td>
                                <td className="border border-zinc-200 p-2 text-center font-bold text-indigo-700">{row.feedbackRating}</td>
                                {renderRowEvidenceCellReadOnly(row, "sec_subjects_results")}
                              </tr>
                            ))}
                          </table>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-zinc-200">
                          <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider">11. Result Attribution Opinion</span>
                          <span className="text-xs font-bold text-slate-800">{selectedAppraisal.formData?.resultAttribution || "Both"}</span>
                        </div>
                      </>
                    )}

                    {renderReviewCustomFields(2, selectedAppraisal.formData?.customFields)}
                  </div>
                )}

                {activeDetailsTab === 3 && (
                  <div className="space-y-6">
                    {isSectionVisible("sec_academic_nptel") && (
                      <div>
                        <span className="text-xs font-black text-[#120c7a] block mb-2 uppercase tracking-wider">
                          {getSectionTitle("sec_academic_nptel", "3.1 MOOC / Online Courses Completed")}
                        </span>
                        {getSectionDescription("sec_academic_nptel") && (
                          <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_academic_nptel")}</p>
                        )}
                        <table className="w-full border-collapse border border-zinc-200 text-xs">
                          <tr className="bg-zinc-50 font-bold">
                            <th className="border border-zinc-200 p-2">Course Title</th>
                            <th className="border border-zinc-200 p-2 text-center">Start Date</th>
                            <th className="border border-zinc-200 p-2 text-center">End Date</th>
                            <th className="border border-zinc-200 p-2 text-center">Platform</th>
                            <th className="border border-zinc-200 p-2 text-center">Exam Date</th>
                            <th className="border border-zinc-200 p-2 text-center">Cert?</th>
                            {renderRowEvidenceHeader("sec_academic_nptel")}
                          </tr>
                          {(selectedAppraisal.formData?.onlineCourses || []).map((row, i) => (
                            <tr key={i}>
                              <td className="border border-zinc-200 p-2 font-semibold">{row.title}</td>
                              <td className="border border-zinc-200 p-2 text-center">{row.startDate}</td>
                              <td className="border border-zinc-200 p-2 text-center">{row.endDate}</td>
                              <td className="border border-zinc-200 p-2 text-center">{row.platform}</td>
                              <td className="border border-zinc-200 p-2 text-center">{row.examDate}</td>
                              <td className="border border-zinc-200 p-2 text-center font-bold">{row.certificateReceived}</td>
                              {renderRowEvidenceCellReadOnly(row, "sec_academic_nptel")}
                            </tr>
                          ))}
                        </table>
                        {selectedAppraisal.formData?.onlineCoursesOutcome && (
                          <div className="bg-slate-50 border border-zinc-200 p-3 rounded-xl mt-2 text-xs">
                            <span className="font-bold block mb-1">Outcome/Achievements of Courses:</span>
                            <p className="text-zinc-600 font-medium">"{selectedAppraisal.formData.onlineCoursesOutcome}"</p>
                          </div>
                        )}
                      </div>
                    )}

                    {isSectionVisible("sec_academic_fdp") && (
                      <div>
                        <span className="text-xs font-black text-[#120c7a] block mb-2 uppercase tracking-wider">
                          {getSectionTitle("sec_academic_fdp", "3.2 Workshops / Seminars / FDP Participations")}
                        </span>
                        {getSectionDescription("sec_academic_fdp") && (
                          <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_academic_fdp")}</p>
                        )}
                        <table className="w-full border-collapse border border-zinc-200 text-xs">
                          <tr className="bg-zinc-50 font-bold">
                            <th className="border border-zinc-200 p-2 text-left">Program Title</th>
                            <th className="border border-zinc-200 p-2 text-center">Dates</th>
                            <th className="border border-zinc-200 p-2 text-center">Days</th>
                            <th className="border border-zinc-200 p-2 text-left">Organizing Institution</th>
                            <th className="border border-zinc-200 p-2 text-center">Report?</th>
                            {renderRowEvidenceHeader("sec_academic_fdp")}
                          </tr>
                          {(selectedAppraisal.formData?.workshopsFDPs || []).map((row, i) => (
                            <tr key={i}>
                              <td className="border border-zinc-200 p-2 font-semibold text-slate-700">{row.title}</td>
                              <td className="border border-zinc-200 p-2 text-center">{row.dates}</td>
                              <td className="border border-zinc-200 p-2 text-center">{row.days}</td>
                              <td className="border border-zinc-200 p-2 font-medium text-zinc-650">{row.organization}</td>
                              <td className="border border-zinc-200 p-2 text-center font-bold text-emerald-700">{row.reportSubmitted}</td>
                              {renderRowEvidenceCellReadOnly(row, "sec_academic_fdp")}
                            </tr>
                          ))}
                        </table>
                      </div>
                    )}

                    {isSectionVisible("sec_academic_journals") && (
                      <div>
                        <span className="text-xs font-black text-[#120c7a] block mb-2 uppercase tracking-wider">
                          {getSectionTitle("sec_academic_journals", "3.3 Research Publications")}
                        </span>
                        {getSectionDescription("sec_academic_journals") && (
                          <p className="text-[10px] text-zinc-400 font-semibold mb-4 uppercase">{getSectionDescription("sec_academic_journals")}</p>
                        )}
                        <table className="w-full border-collapse border border-zinc-200 text-xs">
                          <tr className="bg-zinc-50 font-bold">
                            <th className="border border-zinc-200 p-2">Paper Title</th>
                            <th className="border border-zinc-200 p-2 text-center">Date/Month/Year</th>
                            <th className="border border-zinc-200 p-2">Journal/Conference Name</th>
                            <th className="border border-zinc-200 p-2">Volume & Page Details</th>
                            <th className="border border-zinc-200 p-2 text-center">SCI/SCOPUS/UGC</th>
                            {renderRowEvidenceHeader("sec_academic_journals")}
                          </tr>
                          {(selectedAppraisal.formData?.researchPapers || []).map((row, i) => (
                            <tr key={i}>
                              <td className="border border-zinc-200 p-2 font-semibold">{row.title}</td>
                              <td className="border border-zinc-200 p-2 text-center">{row.dateMonthYear}</td>
                              <td className="border border-zinc-200 p-2">{row.journal}</td>
                              <td className="border border-zinc-200 p-2">{row.volumeIssue}</td>
                              <td className="border border-zinc-200 p-2 text-center font-bold text-indigo-700">{row.sciScopusUgc}</td>
                              {renderRowEvidenceCellReadOnly(row, "sec_academic_journals")}
                            </tr>
                          ))}
                        </table>
                      </div>
                    )}

                    {isSectionVisible("sec_academic_nptel") && selectedAppraisal.formData?.improvingQualification && (
                      <div className="bg-[#120c7a]/5 border border-[#120c7a]/15 p-4 rounded-xl">
                        <span className="block text-[10px] font-black text-zinc-500 uppercase mb-2">Improving Qualification detail</span>
                        <table className="w-full border-collapse border border-zinc-200 text-xs bg-white">
                          <tr className="bg-zinc-50 font-bold">
                            <th className="border border-zinc-200 p-1.5">Degree</th>
                            <th className="border border-zinc-200 p-1.5">Specialization</th>
                            <th className="border border-zinc-200 p-1.5">University</th>
                            <th className="border border-zinc-200 p-1.5 text-center">Duration</th>
                            <th className="border border-zinc-200 p-1.5 text-center">Status</th>
                            <th className="border border-zinc-200 p-1.5 text-center">NOC Obtained?</th>
                            {renderRowEvidenceHeader("sec_academic_nptel")}
                          </tr>
                          {(selectedAppraisal.formData?.improvingDetails || []).map((row, i) => (
                            <tr key={i}>
                              <td className="border border-zinc-200 p-1.5">{row.degreeRegistered}</td>
                              <td className="border border-zinc-200 p-1.5">{row.specialization}</td>
                              <td className="border border-zinc-200 p-1.5">{row.university}</td>
                              <td className="border border-zinc-200 p-1.5 text-center">{row.duration}</td>
                              <td className="border border-zinc-200 p-1.5 text-center font-bold">{row.status}</td>
                              <td className="border border-zinc-200 p-1.5 text-center">{row.nocObtained}</td>
                              {renderRowEvidenceCellReadOnly(row, "sec_academic_nptel")}
                            </tr>
                          ))}
                        </table>
                      </div>
                    )}

                    {renderReviewCustomFields(3, selectedAppraisal.formData?.customFields)}
                  </div>
                )}

                {/* Sub-Tab 4: Institutional Roles */}
                {activeDetailsTab === 4 && (
                  <div className="space-y-6">
                    {isSectionVisible("sec_roles_department") && (
                      <>
                        <div className="border-b border-slate-100 pb-2 mb-4">
                          <span style={{ fontSize: "11px" }} className="font-extrabold text-indigo-950 block uppercase tracking-wider">
                            {getSectionTitle("sec_roles_department", "4.1 Department & Institutional contributions")}
                          </span>
                          {getSectionDescription("sec_roles_department") && (
                            <p className="text-[10px] text-zinc-400 font-semibold uppercase mt-0.5">{getSectionDescription("sec_roles_department")}</p>
                          )}
                        </div>

                        {/* Organizing Programs */}
                        <div>
                          <span className="text-xs font-black text-slate-800 block mb-2 uppercase">A) Organizing FDP / Conferences / Workshops / Guest Lectures</span>
                          <table className="w-full border-collapse border border-zinc-200 text-xs">
                            <tr className="bg-zinc-50 font-bold">
                              <th className="border border-zinc-200 p-2 text-left">Event Title</th>
                              <th className="border border-zinc-200 p-2 text-center">Period</th>
                              <th className="border border-zinc-200 p-2 text-left">Resource Details</th>
                              <th className="border border-zinc-200 p-2 text-left">Target Audience & Outcome</th>
                              {renderRowEvidenceHeader("sec_roles_department")}
                            </tr>
                            {(selectedAppraisal.formData?.organizingPrograms || []).map((row, i) => (
                              <tr key={i}>
                                <td className="border border-zinc-200 p-2 font-semibold text-slate-700">{row.title}</td>
                                <td className="border border-zinc-200 p-2 text-center">{row.period}</td>
                                <td className="border border-zinc-200 p-2 font-medium text-zinc-655">{row.resourcePersonDetails}</td>
                                <td className="border border-zinc-200 p-2 text-zinc-600">{row.targetAudience} - {row.outcome}</td>
                                {renderRowEvidenceCellReadOnly(row, "sec_roles_department")}
                              </tr>
                            ))}
                          </table>
                        </div>

                        {/* Funding Proposals */}
                        <div>
                          <span className="text-xs font-black text-slate-800 block mb-2 uppercase">B) Contribution towards Funding Proposals / Testing / Consultancy</span>
                          <table className="w-full border-collapse border border-zinc-200 text-xs">
                            <tr className="bg-zinc-50 font-bold">
                              <th className="border border-zinc-200 p-2 text-left">Proposal / Project Title</th>
                              <th className="border border-zinc-200 p-2 text-center">Role</th>
                              <th className="border border-zinc-200 p-2 text-center">Fund Requested (Rs)</th>
                              <th className="border border-zinc-200 p-2 text-center">Agency & Status</th>
                              {renderRowEvidenceHeader("sec_roles_department")}
                            </tr>
                            {(selectedAppraisal.formData?.fundingProposals || []).map((row, i) => (
                              <tr key={i}>
                                <td className="border border-zinc-200 p-2 font-semibold text-slate-700">{row.title}</td>
                                <td className="border border-zinc-200 p-2 text-center font-bold text-indigo-700">{row.role}</td>
                                <td className="border border-zinc-200 p-2 text-center font-bold text-emerald-700">{row.fundRequested}</td>
                                <td className="border border-zinc-200 p-2 text-center font-medium">{row.fundingAgencyScheme} ({row.status})</td>
                                {renderRowEvidenceCellReadOnly(row, "sec_roles_department")}
                              </tr>
                            ))}
                          </table>
                        </div>

                        {/* Placement activities */}
                        {selectedAppraisal.formData?.involvementPlacement && selectedAppraisal.formData.involvementPlacement.length > 0 && (
                          <div>
                            <span className="text-xs font-black text-slate-800 block mb-2 uppercase">C) Placement Activities / Mentoring / Counseling</span>
                            <table className="w-full border-collapse border border-zinc-200 text-xs">
                              <tr className="bg-zinc-50 font-bold">
                                <th className="border border-zinc-200 p-2 text-left">Description</th>
                                <th className="border border-zinc-200 p-2">Role</th>
                                <th className="border border-zinc-200 p-2">Outcome</th>
                                <th className="border border-zinc-200 p-2 text-center">Records?</th>
                                {renderRowEvidenceHeader("sec_roles_department")}
                              </tr>
                              {selectedAppraisal.formData.involvementPlacement.map((row, i) => (
                                <tr key={i}>
                                  <td className="border border-zinc-200 p-2 font-semibold text-slate-700">{row.description}</td>
                                  <td className="border border-zinc-200 p-2 font-bold text-indigo-700">{row.role}</td>
                                  <td className="border border-zinc-200 p-2 text-zinc-600">{row.outcome}</td>
                                  <td className="border border-zinc-200 p-2 text-center font-bold">{row.recordsMaintained}</td>
                                  {renderRowEvidenceCellReadOnly(row, "sec_roles_department")}
                                </tr>
                              ))}
                            </table>
                          </div>
                        )}

                        {/* Accreditation activities */}
                        {selectedAppraisal.formData?.accreditationContributions && selectedAppraisal.formData.accreditationContributions.length > 0 && (
                          <div>
                            <span className="text-xs font-black text-slate-800 block mb-2 uppercase">D) ISO / NAAC / NBA / Coordinator role</span>
                            <table className="w-full border-collapse border border-zinc-200 text-xs">
                              <tr className="bg-zinc-50 font-bold">
                                <th className="border border-zinc-200 p-2 text-left">Role</th>
                                <th className="border border-zinc-200 p-2 text-left">Description</th>
                                <th className="border border-zinc-200 p-2 text-left">Outcome</th>
                                {renderRowEvidenceHeader("sec_roles_department")}
                              </tr>
                              {selectedAppraisal.formData.accreditationContributions.map((row, i) => (
                                <tr key={i}>
                                  <td className="border border-zinc-200 p-2 font-bold text-indigo-700">{row.role}</td>
                                  <td className="border border-zinc-200 p-2 text-slate-700">{row.description}</td>
                                  <td className="border border-zinc-200 p-2 text-zinc-655">{row.outcome}</td>
                                  {renderRowEvidenceCellReadOnly(row, "sec_roles_department")}
                                </tr>
                              ))}
                            </table>
                          </div>
                        )}

                        {/* R&D Portfolios */}
                        {selectedAppraisal.formData?.rdContributions && selectedAppraisal.formData.rdContributions.length > 0 && (
                          <div>
                            <span className="text-xs font-black text-slate-800 block mb-2 uppercase">E) R&D / EDC / SIC / Sports Portfolios</span>
                            <table className="w-full border-collapse border border-zinc-200 text-xs">
                              <tr className="bg-zinc-50 font-bold">
                                <th className="border border-zinc-200 p-2 text-left">Role</th>
                                <th className="border border-zinc-200 p-2 text-left">Description</th>
                                <th className="border border-zinc-200 p-2 text-left">Outcome</th>
                                {renderRowEvidenceHeader("sec_roles_department")}
                              </tr>
                              {selectedAppraisal.formData.rdContributions.map((row, i) => (
                                <tr key={i}>
                                  <td className="border border-zinc-200 p-2 font-bold text-indigo-700">{row.role}</td>
                                  <td className="border border-zinc-200 p-2 text-slate-700">{row.description}</td>
                                  <td className="border border-zinc-200 p-2 text-zinc-655">{row.outcome}</td>
                                  {renderRowEvidenceCellReadOnly(row, "sec_roles_department")}
                                </tr>
                              ))}
                            </table>
                          </div>
                        )}

                        {/* HOD exclusive results */}
                        {(isSectionVisible("f_resultImprovementHOD") || isSectionVisible("f_deptAdministrationHOD")) && (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                            <span className="text-xs font-black text-indigo-950 block uppercase tracking-wider">HOD Exclusive Portfolio Answers</span>
                            {isSectionVisible("f_resultImprovementHOD") && selectedAppraisal.formData?.resultImprovementHOD && (
                              <div>
                                <span className="block text-[9px] font-black text-zinc-400 uppercase">
                                  {getSectionTitle("f_resultImprovementHOD", "Result Improvement & Maintenance")}:
                                </span>
                                <p className="font-semibold text-slate-800">"{selectedAppraisal.formData.resultImprovementHOD}"</p>
                              </div>
                            )}
                            {isSectionVisible("f_deptAdministrationHOD") && selectedAppraisal.formData?.deptAdministrationHOD && (
                              <div className="mt-2">
                                <span className="block text-[9px] font-black text-zinc-400 uppercase">
                                  {getSectionTitle("f_deptAdministrationHOD", "Department Administration & Planning")}:
                                </span>
                                <p className="font-semibold text-slate-800">"{selectedAppraisal.formData.deptAdministrationHOD}"</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Other roles contribution */}
                        {isSectionVisible("f_otherRolesContribution") && selectedAppraisal.formData?.otherRolesContribution && (
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <span className="block text-[9px] font-black text-zinc-400 uppercase mb-1">
                              {getSectionTitle("f_otherRolesContribution", "Other Role / Contribution")}:
                            </span>
                            <p className="font-semibold text-slate-850">"{selectedAppraisal.formData.otherRolesContribution}"</p>
                          </div>
                        )}

                        {/* Admissions contributed */}
                        <div>
                          <span className="text-xs font-black text-slate-800 block mb-2 uppercase">Admissions Contributed (Minimum 5 Admissions)</span>
                          <table className="w-full border-collapse border border-zinc-200 text-xs">
                            <tr className="bg-zinc-50 font-bold">
                              <th className="border border-zinc-200 p-2">Team No / Area</th>
                              <th className="border border-zinc-200 p-2 text-center">Admissions Contributed</th>
                              <th className="border border-zinc-200 p-2">Name of the Team Leader</th>
                              {renderRowEvidenceHeader("sec_roles_department")}
                            </tr>
                            {(selectedAppraisal.formData?.admissionContribution || []).map((row, i) => (
                              <tr key={i}>
                                <td className="border border-zinc-200 p-2 font-bold">{row.teamNoArea}</td>
                                <td className="border border-zinc-200 p-2 text-center font-black text-[#120c7a]">{row.countContributed}</td>
                                <td className="border border-zinc-200 p-2">{row.teamLeaderName}</td>
                                {renderRowEvidenceCellReadOnly(row, "sec_roles_department")}
                              </tr>
                            ))}
                          </table>
                        </div>
                      </>
                    )}

                    {/* Professional body memberships */}
                    {isSectionVisible("sec_professional_memberships") && selectedAppraisal.formData?.professionalMembership && selectedAppraisal.formData.professionalMembership.length > 0 && (
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                        <span className="text-xs font-black text-slate-800 block uppercase">
                          {getSectionTitle("sec_professional_memberships", "4.2 Membership in Professional Bodies")}
                        </span>
                        {getSectionDescription("sec_professional_memberships") && (
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase">{getSectionDescription("sec_professional_memberships")}</p>
                        )}
                        <div className="space-y-1">
                          {selectedAppraisal.formData.professionalMembership.map((row, idx) => (
                            <div key={idx} className="bg-white p-2.5 rounded-lg border border-zinc-150 flex justify-between text-xs items-center">
                              <span className="font-bold text-slate-700">{row.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-zinc-500">{row.type} (No: {row.membershipNo})</span>
                                {isSectionEvidenceRequired("sec_professional_memberships") && row.fileUrl && (
                                  <a href={row.fileUrl} target="_blank" rel="noreferrer" className="text-[10px] font-extrabold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-100 transition-all">Proof</a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Awards & Honors */}
                    {isSectionVisible("sec_awards_honors") && selectedAppraisal.formData?.awardsHonors && selectedAppraisal.formData.awardsHonors.length > 0 && (
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                        <span className="text-xs font-black text-slate-800 block uppercase">
                          {getSectionTitle("sec_awards_honors", "4.3 Awards & Recognitions")}
                        </span>
                        {getSectionDescription("sec_awards_honors") && (
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase">{getSectionDescription("sec_awards_honors")}</p>
                        )}
                        <table className="w-full border-collapse border border-zinc-200 text-xs bg-white">
                          <tr className="bg-zinc-50 font-bold">
                            <th className="border border-zinc-200 p-2">Award Title</th>
                            <th className="border border-zinc-200 p-2">Organization</th>
                            <th className="border border-zinc-200 p-2 text-center">Year</th>
                            <th className="border border-zinc-200 p-2 text-center">Level</th>
                            {renderRowEvidenceHeader("sec_awards_honors")}
                          </tr>
                          {selectedAppraisal.formData.awardsHonors.map((row, idx) => (
                            <tr key={idx}>
                              <td className="border border-zinc-200 p-2 font-bold text-slate-750">{row.awardName}</td>
                              <td className="border border-zinc-200 p-2 font-medium text-zinc-655">{row.organization}</td>
                              <td className="border border-zinc-200 p-2 text-center font-semibold">{row.year}</td>
                              <td className="border border-zinc-200 p-2 text-center font-bold text-indigo-750">{row.level}</td>
                              {renderRowEvidenceCellReadOnly(row, "sec_awards_honors")}
                            </tr>
                          ))}
                        </table>
                      </div>
                    )}

                    {renderReviewCustomFields(4, selectedAppraisal.formData?.customFields)}
                  </div>
                )}

                {/* Sub-Tab 5: Library & Leaves */}
                {activeDetailsTab === 5 && (
                  <div className="space-y-6">
                    {isSectionVisible("sec_library_usage") && (
                      <div className="bg-slate-50 p-4 border border-zinc-200 rounded-xl space-y-2">
                        <span className="text-xs font-black text-[#120c7a] block uppercase tracking-wider">
                          {getSectionTitle("sec_library_usage", "5.1 Library usage supplement details")}
                        </span>
                        {getSectionDescription("sec_library_usage") && (
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase">{getSectionDescription("sec_library_usage")}</p>
                        )}
                        {isSectionVisible("f_libraryUsage") && (
                          <div>
                            <span className="block text-[9px] font-black text-zinc-400 uppercase mb-0.5">{getSectionTitle("f_libraryUsage", "Use of Library Journals / Books")}</span>
                            <p className="text-xs text-slate-700 font-medium">{selectedAppraisal.formData?.libraryUsage || "None specified"}</p>
                          </div>
                        )}
                        {isSectionVisible("f_libraryPurpose") && (
                          <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mt-2">
                            {getSectionTitle("f_libraryPurpose", "Purpose of visit")}: <span className="text-slate-800 font-bold">{selectedAppraisal.formData?.libraryPurpose || "GK"}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {(isSectionVisible("sec_leave_summary") || isSectionVisible("f_accomplishAssignment") || isSectionVisible("f_applyLeaveInAdvance") || isSectionVisible("f_consumeClLastMonth")) && (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {isSectionVisible("f_accomplishAssignment") && (
                            <div className="border border-zinc-200 p-3.5 rounded-xl">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_accomplishAssignment", "Conducted assignment in time?")}</span>
                              <span className="text-xs font-bold text-slate-800">{selectedAppraisal.formData?.accomplishAssignment}</span>
                            </div>
                          )}
                          {isSectionVisible("f_applyLeaveInAdvance") && (
                            <div className="border border-zinc-200 p-3.5 rounded-xl">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_applyLeaveInAdvance", "Applied leave in advance?")}</span>
                              <span className="text-xs font-bold text-slate-800">{selectedAppraisal.formData?.applyLeaveInAdvance}</span>
                            </div>
                          )}
                          {isSectionVisible("f_consumeClLastMonth") && (
                            <div className="border border-zinc-200 p-3.5 rounded-xl">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_consumeClLastMonth", "Consume CL last month?")}</span>
                              <span className="text-xs font-bold text-slate-800">{selectedAppraisal.formData?.consumeClLastMonth}</span>
                            </div>
                          )}
                        </div>

                        {isSectionVisible("sec_leave_summary") && (
                          <div>
                            <span className="text-xs font-black text-slate-800 block mb-2 uppercase tracking-wider">
                              {getSectionTitle("sec_leave_summary", "5.2 Leave Summary")}
                            </span>
                            {getSectionDescription("sec_leave_summary") && (
                              <p className="text-[10px] text-zinc-400 font-semibold uppercase mb-2">{getSectionDescription("sec_leave_summary")}</p>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-zinc-200">
                              <div>
                                <span className="text-[10px] font-black text-zinc-500 block mb-1 underline uppercase">Leaves Availed</span>
                                <div className="text-xs font-bold text-slate-800">
                                  {isSectionVisible("f_leaveCl") && <span>{getSectionTitle("f_leaveCl", "CL")}: {selectedAppraisal.formData?.leaveDetails?.cl || 0} </span>}
                                  {isSectionVisible("f_leaveCoff") && <span>| {getSectionTitle("f_leaveCoff", "C-OFF")}: {selectedAppraisal.formData?.leaveDetails?.coff || 0} </span>}
                                  {isSectionVisible("f_leaveLop") && <span>| {getSectionTitle("f_leaveLop", "LOP")}: {selectedAppraisal.formData?.leaveDetails?.lop || 0}</span>}
                                </div>
                              </div>
                              <div>
                                <span className="text-[10px] font-black text-zinc-500 block mb-1 underline uppercase">On Duty (OD) Availed</span>
                                <div className="text-xs font-bold text-slate-800">
                                  {isSectionVisible("f_odUniversity") && <span>{getSectionTitle("f_odUniversity", "University")}: {selectedAppraisal.formData?.leaveDetails?.odUniversity || 0} </span>}
                                  {isSectionVisible("f_odOthers") && <span>| {getSectionTitle("f_odOthers", "Others")}: {selectedAppraisal.formData?.leaveDetails?.odOthers || 0} </span>}
                                  {isSectionVisible("f_odInstitution") && <span>| {getSectionTitle("f_odInstitution", "Institution")}: {selectedAppraisal.formData?.leaveDetails?.odInstitution || 0}</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {renderReviewCustomFields(5, selectedAppraisal.formData?.customFields)}
                  </div>
                )}

                {/* Sub-Tab 6: Relations & Targets */}
                {activeDetailsTab === 6 && (
                  <div className="space-y-6">
                    {isSectionVisible("sec_interpersonal_relations") && (
                      <div>
                        <span className="text-xs font-black text-slate-800 block mb-2 uppercase tracking-wider">
                          {getSectionTitle("sec_interpersonal_relations", "6.1 Interpersonal Relations")}
                        </span>
                        {getSectionDescription("sec_interpersonal_relations") && (
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase mb-3">{getSectionDescription("sec_interpersonal_relations")}</p>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {isSectionVisible("f_relationStudents") && (
                            <div className="bg-zinc-50 border border-zinc-200/50 p-4 rounded-xl">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_relationStudents", "Students")}</span>
                              <span className="text-xs font-black text-[#120c7a]">{(selectedAppraisal.formData?.relationStudents || {}).rating || "Good"}</span>
                              {(selectedAppraisal.formData?.relationStudents || {}).reason && <p className="text-[10px] text-zinc-500 mt-1">Reason: "{(selectedAppraisal.formData?.relationStudents || {}).reason}"</p>}
                            </div>
                          )}
                          {isSectionVisible("f_relationColleagues") && (
                            <div className="bg-zinc-50 border border-zinc-200/50 p-4 rounded-xl">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_relationColleagues", "Colleagues")}</span>
                              <span className="text-xs font-black text-[#120c7a]">{(selectedAppraisal.formData?.relationColleagues || {}).rating || "Good"}</span>
                              {(selectedAppraisal.formData?.relationColleagues || {}).reason && <p className="text-[10px] text-zinc-500 mt-1">Reason: "{(selectedAppraisal.formData?.relationColleagues || {}).reason}"</p>}
                            </div>
                          )}
                          {isSectionVisible("f_relationSuperiors") && (
                            <div className="bg-zinc-50 border border-zinc-200/50 p-4 rounded-xl">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_relationSuperiors", "Superiors")}</span>
                              <span className="text-xs font-black text-[#120c7a]">{(selectedAppraisal.formData?.relationSuperiors || {}).rating || "Good"}</span>
                              {(selectedAppraisal.formData?.relationSuperiors || {}).reason && <p className="text-[10px] text-zinc-500 mt-1">Reason: "{(selectedAppraisal.formData?.relationSuperiors || {}).reason}"</p>}
                            </div>
                          )}
                          {isSectionVisible("f_relationDepartment") && (
                            <div className="bg-zinc-50 border border-zinc-200/50 p-4 rounded-xl">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_relationDepartment", "Department")}</span>
                              <span className="text-xs font-black text-[#120c7a]">{(selectedAppraisal.formData?.relationDepartment || {}).rating || "Good"}</span>
                              {(selectedAppraisal.formData?.relationDepartment || {}).reason && <p className="text-[10px] text-zinc-500 mt-1">Reason: "{(selectedAppraisal.formData?.relationDepartment || {}).reason}"</p>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isSectionVisible("sec_targets_next_sem") && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-zinc-100 pt-4">
                        {isSectionVisible("f_targetsNextSemester") && (
                          <div>
                            <span className="block text-[10px] font-black text-zinc-500 uppercase mb-1">
                              {getSectionTitle("f_targetsNextSemester", "6.2 Targets set for Next Semester")}
                            </span>
                            {getSectionDescription("f_targetsNextSemester") && (
                              <p className="text-[9px] text-zinc-400 font-semibold uppercase mb-1">{getSectionDescription("f_targetsNextSemester")}</p>
                            )}
                            <p className="text-xs text-slate-700 font-medium bg-slate-50 p-3 rounded-xl border border-zinc-150">"{selectedAppraisal.formData?.targetsNextSemester || "N/A"}"</p>
                          </div>
                        )}
                        {isSectionVisible("f_targetsStrategy") && (
                          <div>
                            <span className="block text-[10px] font-black text-zinc-500 uppercase mb-1">
                              {getSectionTitle("f_targetsStrategy", "Strategy for Achieving Targets")}
                            </span>
                            {getSectionDescription("f_targetsStrategy") && (
                              <p className="text-[9px] text-zinc-400 font-semibold uppercase mb-1">{getSectionDescription("f_targetsStrategy")}</p>
                            )}
                            <p className="text-xs text-slate-700 font-medium bg-slate-50 p-3 rounded-xl border border-zinc-150">"{selectedAppraisal.formData?.targetsStrategy || "N/A"}"</p>
                          </div>
                        )}
                      </div>
                    )}

                    {isSectionVisible("sec_self_analysis") && (
                      <div>
                        <span className="text-xs font-black text-slate-800 block mb-2 uppercase tracking-wider">
                          {getSectionTitle("sec_self_analysis", "6.3 Self-Analysis (Strengths & Weaknesses)")}
                        </span>
                        {getSectionDescription("sec_self_analysis") && (
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase mb-2">{getSectionDescription("sec_self_analysis")}</p>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {isSectionVisible("f_selfAnalysisStrengths") && (
                            <div className="border border-emerald-200 bg-emerald-50/15 p-3.5 rounded-xl space-y-1.5">
                              <span className="text-[10px] font-black text-emerald-800 uppercase block">{getSectionTitle("f_selfAnalysisStrengths", "Strengths")}</span>
                              {(selectedAppraisal.formData?.selfAnalysisStrengths || []).map((str, idx) => str && (
                                <div key={idx} className="text-xs font-semibold text-emerald-950 flex gap-2"><span>•</span> {str}</div>
                              ))}
                            </div>
                          )}
                          {isSectionVisible("f_selfAnalysisWeaknesses") && (
                            <div className="border border-rose-200 bg-rose-50/15 p-3.5 rounded-xl space-y-1.5">
                              <span className="text-[10px] font-black text-rose-800 uppercase block">{getSectionTitle("f_selfAnalysisWeaknesses", "Weaknesses")}</span>
                              {(selectedAppraisal.formData?.selfAnalysisWeaknesses || []).map((weak, idx) => weak && (
                                <div key={idx} className="text-xs font-semibold text-rose-950 flex gap-2"><span>•</span> {weak}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {renderReviewCustomFields(6, selectedAppraisal.formData?.customFields)}
                  </div>
                )}

                {activeDetailsTab === 7 && (
                  <div className="space-y-6 text-xs animate-fadeIn">
                    <div className="border-b border-zinc-150 pb-2 mb-4">
                      <h4 className="text-xs font-black text-slate-805 uppercase tracking-wider">7. Dynamic Evidences & Disclosures</h4>
                      <p className="text-[9px] text-zinc-400 font-semibold uppercase mt-0.5">Details and attachments configured dynamically by HR.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                      {customFieldsConfig.filter(f => f.tabId === 7 && isCustomDisclosureField(f, selectedAppraisal.formData?.customFields)).map((field) => {
                        const entry = selectedAppraisal.formData?.customFields?.[field.id] || { value: "", fileUrl: "", fileName: "" };
                        return (
                          <div key={field.id} className="bg-slate-50 border border-slate-200/50 p-4 rounded-xl space-y-2">
                            <span className="block text-[9px] font-black text-[#120c7a] uppercase tracking-wider">{field.title}</span>
                            {field.description && (
                              <p className="text-[9px] text-zinc-400 font-semibold uppercase leading-tight">{field.description}</p>
                            )}
                            {field.type !== "file_only" && entry.value && (
                              <p className="font-bold text-slate-850 bg-white p-3 rounded-lg border border-zinc-100">{entry.value}</p>
                            )}
                            {field.evidenceRequired && entry.fileUrl && (
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-zinc-400 font-semibold uppercase text-[9px]">Proof Attachment:</span>
                                <a 
                                  href={entry.fileUrl} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="text-blue-600 font-extrabold hover:underline inline-flex items-center gap-1 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg"
                                >
                                  View Evidence ({entry.fileName || "File"})
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Reviewing Actions & Comments Portlet */}
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 h-fit space-y-6">
                
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Star size={14} className="text-[#120c7a]" /> Evaluation & Recommendation
                  </h4>
                  <p className="text-[11px] text-zinc-500">Provide evaluation grade and recommendation comments for this appraisal request.</p>
                </div>

                {/* HOD Recommendations (shown to Principal/Admin) */}
                {selectedAppraisal.hodReview && userRole !== "HOD" && (
                  <div className="bg-blue-50 border border-blue-150 p-4 rounded-2xl space-y-2">
                    <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest block border-b border-blue-200 pb-1">HOD Review Recommendations</span>
                    <div>
                      <span className="block text-[9px] font-black text-blue-700 uppercase tracking-wider">Evaluated Grade:</span>
                      <span className="text-xs font-black text-blue-900">{selectedAppraisal.hodReview.grade}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-blue-700 uppercase tracking-wider">Remarks:</span>
                      <p className="text-xs text-blue-950 font-medium">"{selectedAppraisal.hodReview.comments}"</p>
                    </div>
                    <div className="text-[10px] text-blue-500 italic">
                      - Recommended by {selectedAppraisal.hodReview.reviewedBy}
                    </div>
                  </div>
                )}

                {/* Grade Selection */}
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">Recommended Appraisal Grade</label>
                  <select
                    value={evaluationGrade}
                    onChange={(e) => setEvaluationGrade(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs font-bold text-zinc-700 focus:outline-none"
                  >
                    <option value="Outstanding">Outstanding</option>
                    <option value="Very Good">Very Good</option>
                    <option value="Good">Good</option>
                    <option value="Satisfactory">Satisfactory</option>
                    <option value="Average">Average</option>
                  </select>
                </div>

                {/* Principal checkboxes (shown to Principal/Admin only) */}
                {(userRole === "Principal" || userRole === "Admin") && (
                  <div className="border border-zinc-200/60 p-4 bg-white rounded-xl space-y-3">
                    <span className="block text-[10px] font-black text-zinc-500 uppercase mb-2">Principal's Remarks Checkboxes</span>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-start gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={principalCheckboxes.appreciated}
                          onChange={(e) => setPrincipalCheckboxes(prev => ({ ...prev, appreciated: e.target.checked }))}
                          className="h-4.5 w-4.5 rounded border-zinc-300 text-[#120c7a] mt-0.5"
                        />
                        <span>His / Her contribution to be appreciated and recommended</span>
                      </label>
                      <label className="flex items-start gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={principalCheckboxes.satisfactory}
                          onChange={(e) => setPrincipalCheckboxes(prev => ({ ...prev, satisfactory: e.target.checked }))}
                          className="h-4.5 w-4.5 rounded border-zinc-300 text-[#120c7a] mt-0.5"
                        />
                        <span>Satisfactory performance</span>
                      </label>
                      <label className="flex items-start gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={principalCheckboxes.underutilized}
                          onChange={(e) => setPrincipalCheckboxes(prev => ({ ...prev, underutilized: e.target.checked }))}
                          className="h-4.5 w-4.5 rounded border-zinc-300 text-[#120c7a] mt-0.5"
                        />
                        <span>Potential underutilized</span>
                      </label>
                      <label className="flex items-start gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={principalCheckboxes.counseling}
                          onChange={(e) => setPrincipalCheckboxes(prev => ({ ...prev, counseling: e.target.checked }))}
                          className="h-4.5 w-4.5 rounded border-zinc-300 text-[#120c7a] mt-0.5"
                        />
                        <span>Counseling is required</span>
                      </label>
                      <label className="flex items-start gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={principalCheckboxes.improvementDesired}
                          onChange={(e) => setPrincipalCheckboxes(prev => ({ ...prev, improvementDesired: e.target.checked }))}
                          className="h-4.5 w-4.5 rounded border-zinc-300 text-[#120c7a] mt-0.5"
                        />
                        <span>Performance improvement is desired / to be warned</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Recommendation Remarks */}
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">Detailed Review Comments</label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs font-medium text-zinc-700 focus:outline-none"
                    placeholder="Enter review remarks, suggestions, and recommendations..."
                  />
                </div>

                {/* Interactive Action Buttons */}
                <div className="space-y-2.5 pt-4">
                  {userRole === "HOD" && selectedAppraisal.status === "Submitted" && (
                    <>
                      <button
                        onClick={() => handleReviewAction("HOD_Approved")}
                        disabled={actioning}
                        className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-850 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-100 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} /> Recommend & Forward
                      </button>
                      <button
                        onClick={() => setCorrectionModalOpen(true)}
                        disabled={actioning}
                        className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Undo2 size={14} /> Return for Correction
                      </button>
                    </>
                  )}

                  {(userRole === "Principal" || userRole === "Admin") && (selectedAppraisal.status === "HOD_Approved" || selectedAppraisal.status === "Submitted") && (
                    <>
                      <button
                        onClick={() => handleReviewAction("Approved")}
                        disabled={actioning}
                        className="w-full py-2.5 bg-gradient-to-r from-indigo-650 to-indigo-800 hover:from-indigo-700 hover:to-indigo-900 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-100 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} /> Finalize & Approve
                      </button>
                      <button
                        onClick={() => setCorrectionModalOpen(true)}
                        disabled={actioning}
                        className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Undo2 size={14} /> Return for Correction
                      </button>
                    </>
                  )}
                </div>

              </div>

            </div>
          </div>
        ) : (
          /* Appraisal Grid & Request Table */
          <div className="space-y-6">
            
            {/* Filter Portlet */}
            <div className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-1 items-center gap-2 max-w-md bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-zinc-500">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search by faculty name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent border-0 text-xs text-zinc-700 w-full focus:outline-none focus:ring-0"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {userRole !== "HOD" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Dept:</span>
                    <select
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="bg-white border border-zinc-200 rounded-xl px-3 py-1.5 text-xs font-bold text-zinc-700"
                    >
                      <option value="All">All Departments</option>
                      {availableDepts.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-white border border-zinc-200 rounded-xl px-3 py-1.5 text-xs font-bold text-zinc-700"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Draft">Draft</option>
                    <option value="Submitted">Submitted</option>
                    <option value="HOD_Approved">HOD Approved</option>
                    <option value="Approved">Approved</option>
                    <option value="Returned">Returned</option>
                  </select>
                </div>
              </div>
            </div>

            {/* List Content */}
            <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold">
                      <th className="p-4">Faculty Member</th>
                      <th className="p-4">Department & Designation</th>
                      <th className="p-4 text-center">Session</th>
                      <th className="p-4 text-center">Status</th>
                      <th className="p-4 text-center">HOD Recommendation</th>
                      <th className="p-4 text-center">Principal Rating</th>
                      <th className="p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredAppraisals.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-zinc-400 font-semibold">
                          No appraisal request submissions match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredAppraisals.map((app) => (
                        <tr key={app.id} className="hover:bg-zinc-50/40 transition-all">
                          <td className="p-4">
                            <div className="font-bold text-slate-800">{app.facultyName}</div>
                            <div className="text-[10px] text-zinc-500">{app.facultyEmail}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-semibold text-slate-700">{app.department}</div>
                            <div className="text-[10px] text-zinc-400">{app.designation}</div>
                          </td>
                          <td className="p-4 text-center font-bold text-zinc-600">
                            {app.academicYear}
                          </td>
                          <td className="p-4 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              app.status === "Approved" ? "bg-emerald-500/10 text-emerald-700" :
                              app.status === "HOD_Approved" ? "bg-blue-500/10 text-blue-700" :
                              app.status === "Submitted" ? "bg-amber-500/10 text-amber-700" :
                              app.status === "Returned" ? "bg-rose-500/10 text-rose-700" :
                              "bg-zinc-500/10 text-zinc-700"
                            }`}>
                              {app.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="p-4 text-center font-bold text-indigo-950">
                            {app.hodReview?.grade ? (
                              <span className="flex items-center justify-center gap-1">
                                <Star size={10} className="fill-amber-400 text-amber-400" /> {app.hodReview.grade}
                              </span>
                            ) : (
                              <span className="text-zinc-300">-</span>
                            )}
                          </td>
                          <td className="p-4 text-center font-bold text-emerald-950">
                            {app.principalReview?.grade ? (
                              <span className="flex items-center justify-center gap-1">
                                <Star size={10} className="fill-amber-400 text-amber-400" /> {app.principalReview.grade}
                              </span>
                            ) : (
                              <span className="text-zinc-300">-</span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleOpenDetails(app)}
                              className="px-3 py-1.5 bg-[#120c7a] hover:bg-[#1a10a0] text-white rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={12} /> Review
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* Correction Feedback Modal */}
        {correctionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl w-full max-w-md border border-zinc-200 shadow-xl p-6 space-y-4 animate-scaleUp">
              <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1">
                  <Undo2 size={14} className="text-rose-500" /> Correction Comment
                </h3>
                <button onClick={() => setCorrectionModalOpen(false)} className="text-zinc-400 hover:text-zinc-600"><X size={16} /></button>
              </div>

              <div>
                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1.5">Specify required corrections for faculty</label>
                <textarea
                  value={correctionComments}
                  onChange={(e) => setCorrectionComments(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-medium text-zinc-700 focus:outline-none"
                  placeholder="Tell the faculty member what sections need correction (e.g. please update student feedback target, write-up too long)..."
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  onClick={() => setCorrectionModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReturnCorrection}
                  disabled={actioning || !correctionComments.trim()}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md shadow-rose-100"
                >
                  {actioning ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  Return to Faculty
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
