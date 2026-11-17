import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FileCheck2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Building,
  UserCheck,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  Save,
  Send,
  ArrowLeft,
  BookOpen,
  Calendar,
  Award,
  Layers,
  HelpCircle,
  FileText,
  Clock,
  Sparkles,
  ChevronRight,
  Info,
  Check,
  RotateCcw,
  Printer
} from "lucide-react";
import { db, auth } from "../../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import {
  SCRUTINY_CHECKLIST_ITEMS,
  SCRUTINY_DECLARATION_TEXT
} from "../../components/ScrutinyReportModal";
import ScrutinyReportModal from "../../components/ScrutinyReportModal";

export default function ScrutinyWorkbench() {
  const location = useLocation();
  const navigate = useNavigate();

  // URL query params
  const queryParams = new URLSearchParams(location.search);
  const urlMemberId = queryParams.get("memberId");

  // Auth & Session States
  const [authenticatedMember, setAuthenticatedMember] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [authenticating, setAuthenticating] = useState(false);

  // Dashboard Data
  const [allocatedAssignments, setAllocatedAssignments] = useState([]);
  const [scrutinyReportsMap, setScrutinyReportsMap] = useState({});
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // Inspection Studio States
  const [activeInspectionAssignment, setActiveInspectionAssignment] = useState(null);
  const [activeSet, setActiveSet] = useState("setA"); // "setA" | "setB"
  const [setAObservations, setSetAObservations] = useState({});
  const [setBObservations, setSetBObservations] = useState({});
  const [checklistResponses, setChecklistResponses] = useState({});
  const [remarks, setRemarks] = useState("");
  const [memberSignature, setMemberSignature] = useState("");
  const [agreedDeclaration, setAgreedDeclaration] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Preview Modal
  const [previewReport, setPreviewReport] = useState(null);

  // Digital Signature Canvas Ref
  const sigCanvasRef = useRef(null);
  const [isDrawingSig, setIsDrawingSig] = useState(false);

  // Helper to strip HTML for text display
  const stripHtml = (html) => {
    if (!html) return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  // Helper to extract question list for scrutiny
  const extractQuestionsForScrutiny = (paper) => {
    if (!paper || !Array.isArray(paper.sections)) return [];
    const list = [];
    paper.sections.forEach((sec, secIdx) => {
      const partName = sec.name || `PART – ${String.fromCharCode(65 + secIdx)}`;
      (sec.questions || []).forEach((q) => {
        const isEitherOr = q.optionB !== undefined;
        const baseLabel = isEitherOr ? `${q.qNo}(a)` : `${q.qNo}`;

        // Main Question / Option A
        if (q.isSplit && Array.isArray(q.subParts) && q.subParts.length > 0) {
          q.subParts.forEach((sp, idx) => {
            const subLabel = sp.label || `(${String.fromCharCode(105 + idx)})`;
            list.push({
              key: `Q.${baseLabel} ${subLabel}`,
              qNo: `Q.${baseLabel} ${subLabel}`,
              part: partName,
              text: sp.text || "",
              marks: sp.marks || "",
              co: sp.co || "",
              bloom: sp.bloom || sp.blooms || ""
            });
          });
        } else {
          list.push({
            key: `Q.${baseLabel}`,
            qNo: `Q.${baseLabel}`,
            part: partName,
            text: q.text || "",
            marks: q.marks || "",
            co: q.co || "",
            bloom: q.bloom || q.blooms || ""
          });
        }

        // Option B (if Either / Or)
        if (isEitherOr) {
          const baseLabelB = `${q.qNo}(b)`;
          if (q.isSplitOptionB && Array.isArray(q.subPartsOptionB) && q.subPartsOptionB.length > 0) {
            q.subPartsOptionB.forEach((sp, idx) => {
              const subLabel = sp.label || `(${String.fromCharCode(105 + idx)})`;
              list.push({
                key: `Q.${baseLabelB} ${subLabel}`,
                qNo: `Q.${baseLabelB} ${subLabel}`,
                part: partName,
                text: sp.text || "",
                marks: sp.marks || "",
                co: sp.co || "",
                bloom: sp.bloom || sp.blooms || ""
              });
            });
          } else {
            list.push({
              key: `Q.${baseLabelB}`,
              qNo: `Q.${baseLabelB}`,
              part: partName,
              text: q.optionB || "",
              marks: q.marks || "",
              co: q.coOptionB || q.co || "",
              bloom: q.bloomOptionB || q.blooms || ""
            });
          }
        }
      });
    });
    return list;
  };

  // 1. Check session / Auto-login from local or URL
  useEffect(() => {
    const saved = localStorage.getItem("coe_scrutiny_auth_member");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.id) {
          setAuthenticatedMember(parsed);
          loadAllocatedPapers(parsed);
          return;
        }
      } catch (e) { }
    }

    if (urlMemberId) {
      autoLoginByMemberId(urlMemberId);
    }
  }, [urlMemberId]);

  const autoLoginByMemberId = async (memberId) => {
    setAuthenticating(true);
    try {
      if (!auth.currentUser) {
        try { await signInAnonymously(auth); } catch (_) { }
      }
      const snap = await getDoc(doc(db, "coe_scrutiny_members", memberId));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setAuthenticatedMember(data);
        localStorage.setItem("coe_scrutiny_auth_member", JSON.stringify(data));
        loadAllocatedPapers(data);
      }
    } catch (err) {
      console.warn("Auto login error:", err);
    } finally {
      setAuthenticating(false);
    }
  };

  // 2. Login Form Submission
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    setAuthenticating(true);

    try {
      if (!auth.currentUser) {
        try { await signInAnonymously(auth); } catch (_) { }
      }

      const cleanEmail = loginEmail.trim().toLowerCase();
      const cleanPass = loginPassword.trim();

      const qMembers = query(
        collection(db, "coe_scrutiny_members"),
        where("email", "==", cleanEmail)
      );
      const snap = await getDocs(qMembers);

      if (snap.empty) {
        throw new Error("No Scrutiny Committee account found with this email address.");
      }

      let matched = null;
      snap.forEach((d) => {
        const md = d.data();
        if (md.password === cleanPass) {
          matched = { id: d.id, ...md };
        }
      });

      if (!matched) {
        throw new Error("Incorrect password. Please verify your credentials sent by COE.");
      }

      setAuthenticatedMember(matched);
      localStorage.setItem("coe_scrutiny_auth_member", JSON.stringify(matched));
      loadAllocatedPapers(matched);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setAuthenticating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("coe_scrutiny_auth_member");
    setAuthenticatedMember(null);
    setActiveInspectionAssignment(null);
    setAllocatedAssignments([]);
  };

  // 3. Load Allocated Question Papers
  const loadAllocatedPapers = async (member) => {
    if (!member?.allocatedQpIds || member.allocatedQpIds.length === 0) {
      setAllocatedAssignments([]);
      return;
    }

    setLoadingDashboard(true);
    try {
      const qpList = [];
      for (const qpId of member.allocatedQpIds) {
        const assSnap = await getDoc(doc(db, "coe_setter_assignments", qpId));
        if (assSnap.exists()) {
          const assData = assSnap.data();
          const allocatedScope = member.allocatedQpSets?.[qpId] || (Number(assData.numSets) === 2 ? "both" : "setA");
          qpList.push({ id: assSnap.id, ...assData, allocatedSets: allocatedScope });
        }
      }
      setAllocatedAssignments(qpList);

      // Fetch existing scrutiny reports submitted by this member
      const reportsQuery = query(
        collection(db, "coe_scrutiny_reports"),
        where("memberId", "==", member.id)
      );
      const reportsSnap = await getDocs(reportsQuery);
      const rMap = {};
      reportsSnap.forEach((rd) => {
        const rData = rd.data();
        if (rData.assignmentId) {
          rMap[rData.assignmentId] = { id: rd.id, ...rData };
        }
      });
      setScrutinyReportsMap(rMap);
    } catch (err) {
      console.error("Error loading allocated papers:", err);
    } finally {
      setLoadingDashboard(false);
    }
  };

  // 4. Open Inspection Studio for an Allocated Question Paper
  const handleOpenInspection = (ass) => {
    setActiveInspectionAssignment(ass);
    const allocatedScope = ass.allocatedSets || authenticatedMember?.allocatedQpSets?.[ass.id] || "both";
    setActiveSet(allocatedScope === "setB" ? "setB" : "setA");

    // Pre-populate if report already exists
    const existingReport = scrutinyReportsMap[ass.id];
    if (existingReport) {
      const mapA = {};
      (existingReport.setA || []).forEach((item) => {
        mapA[item.qNo] = item;
      });
      setSetAObservations(mapA);

      const mapB = {};
      (existingReport.setB || []).forEach((item) => {
        mapB[item.qNo] = item;
      });
      setSetBObservations(mapB);

      setChecklistResponses(existingReport.checklist || {});
      setRemarks(existingReport.remarks || "");
      setMemberSignature(existingReport.memberSignature || "");
      setAgreedDeclaration(Boolean(existingReport.status === "submitted"));
    } else {
      // Default blank inspection state
      setSetAObservations({});
      setSetBObservations({});
      const defaultChecklist = {};
      SCRUTINY_CHECKLIST_ITEMS.forEach((it) => {
        defaultChecklist[`item_${it.id}`] = { status: "Yes", comments: "Verified" };
      });
      setChecklistResponses(defaultChecklist);
      setRemarks("");
      setMemberSignature("");
      setAgreedDeclaration(false);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Toggle observation status for question: "CORRECT" or "NEEDS_CORRECTION"
  const handleToggleQuestionStatus = (qItem, newStatus) => {
    const isSetB = activeSet === "setB";
    const setter = isSetB ? setSetBObservations : setSetAObservations;

    setter((prev) => {
      const existing = prev[qItem.qNo] || {};
      return {
        ...prev,
        [qItem.qNo]: {
          ...existing,
          qNo: qItem.qNo,
          part: qItem.part,
          status: newStatus,
          observation: newStatus === "CORRECT" ? "" : (existing.observation || ""),
          suggestedCorrection: newStatus === "CORRECT" ? "" : (existing.suggestedCorrection || "")
        }
      };
    });
  };

  const handleUpdateObservationField = (qNo, field, val) => {
    const isSetB = activeSet === "setB";
    const setter = isSetB ? setSetBObservations : setSetAObservations;

    setter((prev) => ({
      ...prev,
      [qNo]: {
        ...(prev[qNo] || {}),
        qNo,
        status: "NEEDS_CORRECTION",
        [field]: val
      }
    }));
  };

  // Update Checklist Item
  const handleChecklistChange = (itemId, statusVal, commentsVal) => {
    setChecklistResponses((prev) => {
      const current = prev[`item_${itemId}`] || {};
      return {
        ...prev,
        [`item_${itemId}`]: {
          status: statusVal !== undefined ? statusVal : current.status,
          comments: commentsVal !== undefined ? commentsVal : current.comments
        }
      };
    });
  };

  // Signature Canvas Drawing
  const startDrawing = (e) => {
    setIsDrawingSig(true);
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawingSig) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#120c7a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.stroke();
  };

  const endDrawing = () => {
    if (!isDrawingSig) return;
    setIsDrawingSig(false);
    const canvas = sigCanvasRef.current;
    if (canvas) {
      setMemberSignature(canvas.toDataURL("image/png"));
    }
  };

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setMemberSignature("");
  };

  // 5. Save Draft or Final Submit Scrutiny
  const handleSaveScrutiny = async (isFinalSubmit = false) => {
    if (!activeInspectionAssignment || !authenticatedMember) return;

    if (isFinalSubmit) {
      if (!agreedDeclaration) {
        alert("Please acknowledge and agree to the Confidentiality Declaration before final submission.");
        return;
      }
      if (!memberSignature) {
        alert("Please provide your digital signature in the verification section before final submission.");
        return;
      }

      const confirmed = window.confirm(
        "Are you sure you want to finalize and submit this Question Paper Scrutiny Report to the Office of the Controller of Examinations?\n\nOnce submitted, the report will be immediately reviewed by the Examination Board."
      );
      if (!confirmed) return;
      setIsSubmitting(true);
    } else {
      setIsSaving(true);
    }

    try {
      const ass = activeInspectionAssignment;
      const reportId = `${ass.id}_${authenticatedMember.id}`;

      // Convert observation maps to ordered arrays matching paper structure
      const paperA = ass.submittedPaperA || ass.submittedPaper || ass.draftPaperA || ass.draftPaper;
      const paperB = ass.submittedPaperB || ass.draftPaperB;

      const qListA = extractQuestionsForScrutiny(paperA);
      const qListB = extractQuestionsForScrutiny(paperB);

      const arrayA = qListA.map((q) => {
        const obs = setAObservations[q.qNo] || {};
        return {
          qNo: q.qNo,
          part: q.part,
          status: obs.status || "CORRECT",
          observation: obs.observation || "",
          suggestedCorrection: obs.suggestedCorrection || "",
          actionTaken: obs.actionTaken || ""
        };
      });

      const arrayB = qListB.map((q) => {
        const obs = setBObservations[q.qNo] || {};
        return {
          qNo: q.qNo,
          part: q.part,
          status: obs.status || "CORRECT",
          observation: obs.observation || "",
          suggestedCorrection: obs.suggestedCorrection || "",
          actionTaken: obs.actionTaken || ""
        };
      });

      const allocatedScope = ass.allocatedSets || authenticatedMember?.allocatedQpSets?.[ass.id] || "both";

      const reportPayload = {
        id: reportId,
        assignmentId: ass.id,
        memberId: authenticatedMember.id,
        memberName: authenticatedMember.name || "Scrutiny Member",
        memberEmail: authenticatedMember.email || "",
        memberAffiliation: authenticatedMember.affiliation || authenticatedMember.department || "Scrutiny Committee",
        allocatedSets: allocatedScope,
        subjectCode: ass.subjectCode || "",
        subjectTitle: ass.subjectTitle || "",
        department: ass.department || "",
        degree: ass.degree || "",
        examSession: ass.examSession || "Nov./Dec. 2026",
        dateOfVerification: new Date().toLocaleDateString("en-IN"),
        status: isFinalSubmit ? "submitted" : "draft",
        setA: arrayA,
        setB: arrayB,
        checklist: checklistResponses,
        remarks: remarks || "The question paper satisfies all autonomous examination standards.",
        memberSignature: memberSignature || "",
        submittedAt: isFinalSubmit ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "coe_scrutiny_reports", reportId), reportPayload, { merge: true });

      // If final submitted, also tag assignment document
      if (isFinalSubmit) {
        await setDoc(
          doc(db, "coe_setter_assignments", ass.id),
          {
            scrutinyStatus: "submitted",
            scrutinizedAt: new Date().toISOString(),
            scrutinizedBy: authenticatedMember.name || "Scrutiny Committee Member",
            scrutinyMemberId: authenticatedMember.id
          },
          { merge: true }
        );
      }

      setScrutinyReportsMap((prev) => ({
        ...prev,
        [ass.id]: reportPayload
      }));

      if (isFinalSubmit) {
        alert("Success! Question Paper Scrutiny Report successfully submitted to the Office of the Controller of Examinations.");
        setActiveInspectionAssignment(null);
      } else {
        alert("Progress saved as Draft successfully!");
      }
    } catch (err) {
      console.error("Save scrutiny error:", err);
      alert("Failed to save scrutiny: " + err.message);
    } finally {
      setIsSaving(false);
      setIsSubmitting(false);
    }
  };

  // ==========================================
  // RENDER SCREEN 1: LOGIN
  // ==========================================
  if (!authenticatedMember) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0c0852] via-[#120c7a] to-[#1e149e] flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 font-sans">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
          
          {/* CKCET Logo Badge */}
          <div className="bg-white/95 backdrop-blur-md px-5 py-2.5 rounded-2xl shadow-xl border border-white/60 mx-auto w-fit flex items-center justify-center gap-3">
            <img src="/logo.png" alt="CKCET Logo" className="h-10 w-auto object-contain" />
            <div className="h-6 w-px bg-slate-300" />
            <div className="text-left">
              <div className="text-[11px] font-black text-[#120c7a] uppercase tracking-tight">Office of the COE</div>
              <div className="text-[9px] font-bold text-slate-600">Autonomous Examination Portal</div>
            </div>
          </div>

          <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            Scrutiny Committee Workbench
          </h2>
          <p className="text-xs text-blue-200/90 font-medium">
            Confidential Question Paper Review &amp; Quality Certification
          </p>
        </div>

        <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white/95 backdrop-blur-md py-8 px-6 sm:px-8 shadow-2xl rounded-3xl border border-white/40 space-y-5">
            
            {loginError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-zinc-700 uppercase tracking-wide mb-1">
                  Official Email Address
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="e.g. member@institution.edu.in"
                  className="w-full text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-zinc-300 focus:border-[#120c7a] focus:ring-2 focus:ring-blue-100 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-zinc-700 uppercase tracking-wide mb-1">
                  Access Key / Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter confidential scrutiny password"
                    className="w-full text-xs font-semibold px-3.5 py-2.5 pr-10 rounded-xl border border-zinc-300 focus:border-[#120c7a] focus:ring-2 focus:ring-blue-100 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authenticating}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#120c7a] to-[#2b1fb0] hover:from-[#0e0a61] hover:to-[#22188c] text-white font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Lock className="h-4 w-4 text-amber-300" />
                <span>{authenticating ? "Verifying Credentials..." : "Access Scrutiny Workbench"}</span>
              </button>
            </form>

            <div className="pt-2 border-t border-zinc-200 text-center">
              <p className="text-[10px] text-zinc-500 font-medium">
                Confidential Autonomous Portal • Contact COE Office for credentials or question paper allocation support.
              </p>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER SCREEN 2: ALLOCATED QUESTION PAPERS DASHBOARD
  // ==========================================
  if (!activeInspectionAssignment) {
    const totalAllocated = allocatedAssignments.length;
    const completedCount = allocatedAssignments.filter(
      (a) => scrutinyReportsMap[a.id]?.status === "submitted"
    ).length;
    const pendingCount = totalAllocated - completedCount;

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        
        {/* Elite Top Navigation Bar */}
        <header className="bg-gradient-to-r from-[#120c7a] via-[#1a129e] to-[#0c0852] text-white border-b border-blue-900 sticky top-0 z-30 shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            
            <div className="flex items-center gap-3">
              <div className="bg-white/95 p-1.5 rounded-xl shadow-xs shrink-0">
                <img src="/logo.png" alt="CKCET Logo" className="h-7 w-auto object-contain" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-2">
                  <span>Question Paper Scrutiny Committee</span>
                  <span className="hidden sm:inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-black">
                    Autonomous Board
                  </span>
                </h1>
                <p className="text-[11px] text-blue-200 font-medium truncate">
                  Welcome, <strong>{authenticatedMember.name}</strong> • {authenticatedMember.affiliation || authenticatedMember.department}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5 text-rose-300" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>

          </div>
        </header>

        {/* Dashboard Main View */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
          
          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-zinc-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-zinc-500 uppercase">Allocated Question Papers</p>
                <h3 className="text-2xl font-black text-zinc-900 mt-1">{totalAllocated} <span className="text-xs text-zinc-400 font-normal">/ Max 10</span></h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <BookOpen className="h-6 w-6" />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-zinc-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-zinc-500 uppercase">Scrutiny Completed &amp; Submitted</p>
                <h3 className="text-2xl font-black text-emerald-600 mt-1">{completedCount}</h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-zinc-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-zinc-500 uppercase">Pending Inspection</p>
                <h3 className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <Clock className="h-6 w-6" />
              </div>
            </div>
          </div>

          {/* Guidelines Notice */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-3 shadow-2xs">
            <Info className="h-5 w-5 text-[#120c7a] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-extrabold uppercase tracking-wide text-[10px] text-blue-950 block">
                Autonomous Scrutiny Committee Protocol:
              </span>
              <p className="leading-relaxed">
                Please inspect each question paper thoroughly for syllabus alignment, clarity, Bloom's taxonomy mapping, formula accuracy, and diagram clarity. Mark any error identified with suggested corrections in the Q-Wise report, complete all 11 points in the verification checklist, and digitally sign your declaration.
              </p>
            </div>
          </div>

          {/* Allocated Papers Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-zinc-900 flex items-center gap-2">
                <span>Allocated Question Papers for Inspection</span>
                <span className="text-xs font-bold text-zinc-500">({totalAllocated})</span>
              </h2>
            </div>

            {loadingDashboard ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-zinc-200">
                <div className="h-8 w-8 rounded-full border-4 border-indigo-200 border-t-[#120c7a] animate-spin mx-auto mb-3" />
                <p className="text-xs text-zinc-500 font-bold">Loading allocated question papers...</p>
              </div>
            ) : totalAllocated === 0 ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-zinc-200 space-y-3">
                <BookOpen className="h-10 w-10 text-zinc-300 mx-auto" />
                <h3 className="font-extrabold text-sm text-zinc-800">No Question Papers Allocated Yet</h3>
                <p className="text-xs text-zinc-500 max-w-md mx-auto">
                  The Office of the Controller of Examinations has not yet assigned any question papers to your scrutiny profile. Please contact the COE Office.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allocatedAssignments.map((ass) => {
                  const rep = scrutinyReportsMap[ass.id];
                  const isSubmitted = rep?.status === "submitted";
                  const isDraft = rep?.status === "draft";
                  const numSets = Number(ass.numSets) || 1;

                  return (
                    <div
                      key={ass.id}
                      className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs hover:border-indigo-300 transition-all flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-indigo-50 text-[#120c7a] border border-indigo-200">
                            {ass.subjectCode || "COURSE"}
                          </span>
                          <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                            isSubmitted
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : isDraft
                              ? "bg-blue-50 text-blue-800 border-blue-300"
                              : "bg-amber-50 text-amber-800 border-amber-300"
                          }`}>
                            {isSubmitted ? "Scrutiny Completed ✓" : isDraft ? "Draft in Progress" : "Pending Inspection"}
                          </span>
                        </div>

                        <div>
                          <h3 className="font-extrabold text-sm text-zinc-900 leading-snug">
                            {ass.subjectTitle || "Untitled Course"}
                          </h3>
                          <p className="text-xs text-zinc-500 font-medium mt-1">
                            {ass.department} • Regulation R-{ass.regulation || "2021"}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-zinc-100">
                          <div>
                            <span className="text-zinc-400 block font-bold">Exam Session</span>
                            <span className="font-bold text-zinc-800">{ass.examSession || "Nov./Dec. 2026"}</span>
                          </div>
                          <div>
                            <span className="text-zinc-400 block font-bold">Scope Allocated</span>
                            <span className="font-bold text-zinc-800">
                              {ass.allocatedSets === "setA" ? (
                                <span className="text-blue-700 font-black">Set A Only</span>
                              ) : ass.allocatedSets === "setB" ? (
                                <span className="text-amber-700 font-black">Set B Only</span>
                              ) : numSets === 2 ? (
                                <span className="text-purple-700 font-black">Both Sets (A &amp; B)</span>
                              ) : (
                                "Single Set"
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2">
                        {isSubmitted ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setPreviewReport(rep)}
                              className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>View Submitted Report</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenInspection(ass)}
                              className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-[#120c7a] text-xs font-bold transition-all cursor-pointer"
                            >
                              Edit / Review
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenInspection(ass)}
                            className="w-full py-2.5 rounded-xl bg-[#120c7a] hover:bg-[#1a129e] text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                          >
                            <span>{isDraft ? "Continue Scrutiny Inspection" : "Start Question Paper Scrutiny"}</span>
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

        </main>

        {/* Report Preview Modal */}
        {previewReport && (
          <ScrutinyReportModal
            report={previewReport}
            isCoeView={false}
            onClose={() => setPreviewReport(null)}
          />
        )}

      </div>
    );
  }

  // ==========================================
  // RENDER SCREEN 3: SCRUTINY STUDIO (QUESTION INSPECTOR)
  // ==========================================
  const currentAss = activeInspectionAssignment;
  const paperA = currentAss.submittedPaperA || currentAss.submittedPaper || currentAss.draftPaperA || currentAss.draftPaper;
  const paperB = currentAss.submittedPaperB || currentAss.draftPaperB;
  const allocatedScope = currentAss.allocatedSets || authenticatedMember?.allocatedQpSets?.[currentAss.id] || "both";
  const hasTwoSets = Boolean(paperB || Number(currentAss.numSets) === 2);
  const allowSetA = allocatedScope === "both" || allocatedScope === "setA";
  const allowSetB = hasTwoSets && (allocatedScope === "both" || allocatedScope === "setB");

  const effectiveSet = (activeSet === "setB" && allowSetB) ? "setB" : (allowSetA ? "setA" : "setB");
  const activePaper = (effectiveSet === "setB" && paperB) ? paperB : paperA;
  const questionsList = extractQuestionsForScrutiny(activePaper);

  const activeObservations = effectiveSet === "setB" ? setBObservations : setAObservations;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      
      {/* Studio Sticky Header */}
      <header className="bg-gradient-to-r from-[#120c7a] via-[#1a129e] to-[#0c0852] text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setActiveInspectionAssignment(null)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
              title="Return to Allocated Papers"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-amber-400 text-black">
                  {currentAss.subjectCode}
                </span>
                <h1 className="text-sm sm:text-base font-black truncate">
                  {currentAss.subjectTitle}
                </h1>
              </div>
              <p className="text-[11px] text-blue-200 truncate">
                Scrutiny Studio • Member: {authenticatedMember.name} ({authenticatedMember.affiliation || authenticatedMember.department})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleSaveScrutiny(false)}
              disabled={isSaving || isSubmitting}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isSaving ? "Saving..." : "Save Draft"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveScrutiny(true)}
              disabled={isSaving || isSubmitting}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{isSubmitting ? "Submitting..." : "Submit to COE"}</span>
            </button>
          </div>

        </div>
      </header>

      {/* Studio Workspace Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        
        {/* Course Meta Banner */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-zinc-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-500 uppercase">Degree &amp; Department:</span>
              <span className="text-xs font-extrabold text-zinc-900">{currentAss.department}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-600 font-medium">
              <span>Regulation: R-{currentAss.regulation || "2021"}</span>
              <span>•</span>
              <span>Duration: {activePaper?.duration || "3 Hours"}</span>
              <span>•</span>
              <span>Max Marks: {activePaper?.maxMarks || 100}</span>
            </div>
          </div>

          {/* Set A / Set B Switcher & Scope Indicators */}
          {hasTwoSets ? (
            <div className="flex items-center gap-1.5 p-1 bg-zinc-100 rounded-xl border border-zinc-200">
              <span className="text-[10px] font-black text-zinc-500 uppercase px-2">Scope:</span>
              {allowSetA && (
                <button
                  type="button"
                  onClick={() => setActiveSet("setA")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    effectiveSet === "setA" ? "bg-[#120c7a] text-white shadow-xs" : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  Set A {allocatedScope === "setA" ? "(Allocated)" : ""}
                </button>
              )}
              {allowSetB && (
                <button
                  type="button"
                  onClick={() => setActiveSet("setB")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    effectiveSet === "setB" ? "bg-[#120c7a] text-white shadow-xs" : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  Set B {allocatedScope === "setB" ? "(Allocated)" : ""}
                </button>
              )}
              {!allowSetA && (
                <span className="text-[10px] font-bold text-zinc-400 italic px-2">
                  (Set A not allocated)
                </span>
              )}
              {!allowSetB && hasTwoSets && (
                <span className="text-[10px] font-bold text-zinc-400 italic px-2">
                  (Set B not allocated)
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs font-bold text-zinc-500 px-3 py-1 rounded-lg bg-zinc-100">
              Single Set (Set A)
            </span>
          )}
        </div>

        {/* SECTION 1: QUESTION-BY-QUESTION SCRUTINY INSPECTOR (IMAGE 1) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-zinc-900 flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-[#120c7a]" />
                <span>1. Question-by-Question Scrutiny Inspection ({effectiveSet.toUpperCase()})</span>
              </h2>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">
                Inspect every question below. Mark as "Correct" or flag as "Needs Correction" to provide observations &amp; suggested corrections.
              </p>
            </div>
          </div>

          {questionsList.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-zinc-200">
              <p className="text-xs text-zinc-500 font-bold">No questions found in this paper set.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {questionsList.map((qItem, idx) => {
                const obs = activeObservations[qItem.qNo] || {};
                const isNeedsCorrection = obs.status === "NEEDS_CORRECTION";
                const isCorrect = obs.status === "CORRECT";

                return (
                  <div
                    key={qItem.qNo}
                    className={`rounded-2xl border transition-all p-4 sm:p-5 bg-white ${
                      isNeedsCorrection
                        ? "border-amber-300 ring-2 ring-amber-100 shadow-xs"
                        : isCorrect
                        ? "border-emerald-300 ring-1 ring-emerald-50"
                        : "border-zinc-200"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      
                      {/* Left: Question Content */}
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-black px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-900 border border-zinc-200">
                            {qItem.qNo}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-500 uppercase">
                            {qItem.part}
                          </span>
                          {qItem.marks && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                              {qItem.marks} Marks
                            </span>
                          )}
                          {qItem.bloom && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700">
                              {qItem.bloom}
                            </span>
                          )}
                          {qItem.co && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                              CO-{qItem.co}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-zinc-900 font-medium leading-relaxed font-serif pl-1">
                          {stripHtml(qItem.text) || "(No question text provided)"}
                        </div>
                      </div>

                      {/* Right: Decision Buttons */}
                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => handleToggleQuestionStatus(qItem, "CORRECT")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isCorrect
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200"
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Correct ✓</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleQuestionStatus(qItem, "NEEDS_CORRECTION")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isNeedsCorrection
                              ? "bg-amber-600 text-white shadow-xs"
                              : "bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300"
                          }`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>Recorrect ⚠️</span>
                        </button>
                      </div>

                    </div>

                    {/* Expandable Inputs if "Needs Correction" */}
                    {isNeedsCorrection && (
                      <div className="mt-4 pt-4 border-t border-amber-200 grid grid-cols-1 md:grid-cols-2 gap-3 bg-amber-50/50 p-3.5 rounded-xl">
                        <div>
                          <label className="block text-[11px] font-bold text-amber-950 uppercase mb-1">
                            Observation / Error Identified:
                          </label>
                          <textarea
                            rows={2}
                            value={obs.observation || ""}
                            onChange={(e) => handleUpdateObservationField(qItem.qNo, "observation", e.target.value)}
                            placeholder="e.g. Typo in equation, ambiguous question statement, question out of syllabus unit..."
                            className="w-full text-xs p-2 rounded-lg border border-amber-300 focus:border-amber-600 focus:ring-1 focus:ring-amber-500 bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-indigo-950 uppercase mb-1">
                            Suggested Correction:
                          </label>
                          <textarea
                            rows={2}
                            value={obs.suggestedCorrection || ""}
                            onChange={(e) => handleUpdateObservationField(qItem.qNo, "suggestedCorrection", e.target.value)}
                            placeholder="e.g. Suggest rephrasing as: 'Define... and explain its derivation with neat sketch.'"
                            className="w-full text-xs p-2 rounded-lg border border-indigo-300 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-500 bg-white"
                          />
                        </div>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 2: 11-POINT VERIFICATION CHECKLIST & DECLARATION (IMAGE 2) */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-black text-zinc-900 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span>2. Verification Checklist &amp; Confidential Declaration (Image 2)</span>
            </h2>
            <p className="text-xs text-zinc-500 font-medium mt-0.5">
              Review and answer all 11 mandatory verification checklist points as required by the Autonomous Examination Board.
            </p>
          </div>

          {/* 11 Items Table */}
          <div className="border border-zinc-300 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-100 text-zinc-900 font-bold border-b border-zinc-300">
                  <th className="p-3 w-14 text-center">Sl.No.</th>
                  <th className="p-3">Description</th>
                  <th className="p-3 w-32 text-center">Status (Yes / No)</th>
                  <th className="p-3 w-48 sm:w-64">Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {SCRUTINY_CHECKLIST_ITEMS.map((item) => {
                  const currentItem = checklistResponses[`item_${item.id}`] || { status: "Yes", comments: "Satisfied" };

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="p-3 text-center font-bold text-zinc-500 font-mono align-top">
                        {item.id}
                      </td>
                      <td className="p-3 font-semibold text-zinc-800 leading-relaxed align-top">
                        {item.text}
                      </td>
                      <td className="p-3 text-center align-top">
                        <div className="inline-flex rounded-lg border border-zinc-300 p-0.5 bg-zinc-100">
                          <button
                            type="button"
                            onClick={() => handleChecklistChange(item.id, "Yes", undefined)}
                            className={`px-3 py-1 rounded text-xs font-black transition-all cursor-pointer ${
                              currentItem.status === "Yes"
                                ? "bg-emerald-600 text-white shadow-2xs"
                                : "text-zinc-600 hover:text-zinc-900"
                            }`}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChecklistChange(item.id, "No", undefined)}
                            className={`px-3 py-1 rounded text-xs font-black transition-all cursor-pointer ${
                              currentItem.status === "No"
                                ? "bg-rose-600 text-white shadow-2xs"
                                : "text-zinc-600 hover:text-zinc-900"
                            }`}
                          >
                            No
                          </button>
                        </div>
                      </td>
                      <td className="p-3 align-top">
                        <input
                          type="text"
                          value={currentItem.comments || ""}
                          onChange={(e) => handleChecklistChange(item.id, undefined, e.target.value)}
                          placeholder="Comments / Specific notes"
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-zinc-300 focus:border-[#120c7a] bg-white font-medium"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Remarks / Observation */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-800">
              Remarks / General Observation:
            </label>
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. The question paper conforms well to syllabus units. High quality analytical questions provided."
              className="w-full text-xs p-3 rounded-xl border border-zinc-300 focus:border-[#120c7a] focus:ring-1 focus:ring-[#120c7a]"
            />
          </div>

          {/* Declaration Box */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-zinc-300 space-y-3">
            <h4 className="font-extrabold text-xs text-zinc-900 uppercase tracking-wide">
              Declaration of the Scrutiny Committee:
            </h4>
            <p className="text-xs text-zinc-700 italic leading-relaxed">
              "{SCRUTINY_DECLARATION_TEXT}"
            </p>

            <label className="flex items-center gap-2 cursor-pointer select-none pt-2">
              <input
                type="checkbox"
                checked={agreedDeclaration}
                onChange={(e) => setAgreedDeclaration(e.target.checked)}
                className="h-4 w-4 rounded text-indigo-600 border-zinc-300 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-zinc-900">
                I accept and certify the above declaration as an authorized member of the Scrutiny Committee.
              </span>
            </label>
          </div>

          {/* Signature Canvas Box */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-800">
                Committee Member's Digital Signature:
              </label>
              <button
                type="button"
                onClick={clearSignature}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Clear &amp; Re-sign</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-80 h-28 border-2 border-dashed border-zinc-300 rounded-xl bg-white relative overflow-hidden flex items-center justify-center cursor-crosshair">
                <canvas
                  ref={sigCanvasRef}
                  width={320}
                  height={110}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={endDrawing}
                  onMouseLeave={endDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={endDrawing}
                  className="w-full h-full"
                />
                {!memberSignature && (
                  <span className="absolute text-[11px] text-zinc-400 font-bold pointer-events-none select-none">
                    Sign inside box with mouse or touch/stylus
                  </span>
                )}
              </div>

              <div className="text-xs text-zinc-600 space-y-1">
                <p><strong>Member Name:</strong> {authenticatedMember.name}</p>
                <p><strong>Affiliation:</strong> {authenticatedMember.affiliation || authenticatedMember.department}</p>
                <p><strong>Date:</strong> {new Date().toLocaleDateString("en-IN")}</p>
              </div>
            </div>
          </div>

          {/* Action Submission Footer */}
          <div className="pt-4 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setActiveInspectionAssignment(null)}
              className="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs transition-all cursor-pointer"
            >
              Back to Allocated Papers
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleSaveScrutiny(false)}
                disabled={isSaving || isSubmitting}
                className="px-4 py-2.5 rounded-xl bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-800 font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{isSaving ? "Saving Draft..." : "Save Draft"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveScrutiny(true)}
                disabled={isSaving || isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                <span>{isSubmitting ? "Submitting..." : "Final Submit Scrutiny to COE"}</span>
              </button>
            </div>
          </div>

        </div>

      </main>

    </div>
  );
}

