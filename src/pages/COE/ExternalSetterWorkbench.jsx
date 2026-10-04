import React, { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { useLocation } from "react-router-dom";
import { db } from "../../firebase";
import {
  collection, doc, getDoc, getDocs, updateDoc, onSnapshot, query, where, serverTimestamp
} from "firebase/firestore";
import {
  Lock, Eye, CheckCircle2, XCircle, FileText, Upload, Sparkles, AlertCircle,
  Send, Edit3, BookOpen, Layers, RefreshCw, ChevronRight, Landmark, X, Printer,
  ShieldCheck, Award, FileCheck, Building2, Check, ArrowLeft, Info, HelpCircle,
  ClipboardCheck, Mail
} from "lucide-react";
import { uploadFile } from "../../utils/fileUpload";

// Reusable CKEditor component for rich question paper text editing
function QuestionCKEditor({ id, value, onChange, placeholder }) {
  const containerRef = useRef(null);

  useEffect(() => {
    let active = true;

    const initCK = () => {
      if (!window.CKEDITOR) {
        const script = document.createElement("script");
        script.src = "https://cdn.ckeditor.com/4.22.1/full-all/ckeditor.js";
        script.crossOrigin = "anonymous";
        script.onload = () => {
          if (window.CKEDITOR && active) {
            window.CKEDITOR.config.versionCheck = false;
            window.CKEDITOR.config.font_defaultLabel = 'Times New Roman';
            window.CKEDITOR.config.fontSize_defaultLabel = '12pt';
            setupEditor();
          }
        };
        document.body.appendChild(script);
      } else {
        setupEditor();
      }
    };

    const setupEditor = () => {
      if (!containerRef.current || !active) return;

      if (window.CKEDITOR.instances && window.CKEDITOR.instances[id]) {
        try { window.CKEDITOR.instances[id].destroy(true); } catch (e) { }
      }

      containerRef.current.innerHTML = "";
      const textarea = document.createElement("textarea");
      textarea.id = id;
      textarea.value = value || "";
      containerRef.current.appendChild(textarea);

      const editor = window.CKEDITOR.replace(id, {
        height: 120,
        removePlugins: 'elementspath',
        resize_enabled: false,
        extraPlugins: 'uploadimage,mathjax',
        mathJaxLib: 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-AMS-MML_HTMLorMML',
        toolbar: [
          { name: 'basicstyles', items: ['Bold', 'Italic', 'Underline', 'Subscript', 'Superscript', '-', 'RemoveFormat'] },
          { name: 'paragraph', items: ['NumberedList', 'BulletedList', '-', 'JustifyLeft', 'JustifyCenter', 'JustifyRight'] },
          { name: 'insert', items: ['Image', 'Table', 'SpecialChar', 'Mathjax'] },
          { name: 'styles', items: ['FontSize', 'TextColor'] }
        ],
        contentsStyle: `body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.4; padding: 6px; } p { margin: 0 0 4px 0; } img { max-width: 100%; height: auto; }`
      });

      editor.on('instanceReady', () => {
        try {
          if (value && editor.getData() !== value) {
            editor.setData(value);
          }
        } catch (e) { }
      });

      editor.on('change', () => {
        try {
          const rawData = editor.getData();
          onChange(rawData);
        } catch (e) { }
      });
    };

    initCK();

    return () => {
      active = false;
      if (window.CKEDITOR && window.CKEDITOR.instances && window.CKEDITOR.instances[id]) {
        try {
          window.CKEDITOR.instances[id].destroy(true);
        } catch (e) { }
      }
    };
  }, [id]);

  return (
    <div className="w-full rounded-xl overflow-hidden border border-zinc-200 bg-white" ref={containerRef}>
      <textarea id={id} defaultValue={value || ""} placeholder={placeholder} className="w-full hidden" />
    </div>
  );
}

export default function ExternalSetterWorkbench() {
  const location = useLocation();

  // Extract assignmentId from URL query param
  const queryParams = new URLSearchParams(location.search);
  const urlAssignmentId = queryParams.get("assignmentId");

  // Authentication state
  const [authenticatedSetter, setAuthenticatedSetter] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [authenticating, setAuthenticating] = useState(false);

  // Assignment details
  const [assignment, setAssignment] = useState(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);

  // Acceptance Form State
  const [interestStatus, setInterestStatus] = useState("Interested");
  const [signatureFile, setSignatureFile] = useState(null);
  const [signatureUrl, setSignatureUrl] = useState("");
  const [uploadingSig, setUploadingSig] = useState(false);
  const [acceptanceSubmitted, setAcceptanceSubmitted] = useState(false);

  // Modal & Drawer States
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showSyllabusDrawer, setShowSyllabusDrawer] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);

  // Question Paper Setting Checklist Items (Matching COE Official Document)
  const CHECKLIST_ITEMS = useMemo(() => [
    { id: "format", text: "Whether the question paper is prepared as per the prescribed format?" },
    { id: "details", text: "Whether the regulations, program, branch, semester, course code and name of the given question paper are verified?" },
    { id: "syllabus", text: "Whether the question paper is set strictly within the syllabus?" },
    { id: "blooms", text: "Whether the question paper is set in accordance with Revised Bloom's Taxonomy?" },
    { id: "mapping", text: "Whether the K-Level and CO mapping are indicated against each question?" },
    { id: "klevel_range", text: "Whether the mapped KL levels are within the KL1 to KL4?" },
    { id: "grammar", text: "Whether grammar, spellings and sentence formations are checked?" },
    { id: "units_symbols", text: "Whether units, symbols and diagrams are correctly used?" },
    { id: "databooks", text: "Whether the usage of permitted data books / charts / tables / graph sheets, if any, is indicated?" },
    { id: "repetition", text: "Whether repetition of questions across parts has been avoided?" },
    { id: "answer_key", text: "Whether the answer key / scheme of valuation is enclosed?" },
    { id: "bank_details", text: "Whether the bank account details in the claim bill are provided correctly?" }
  ], []);

  const [checklistResponses, setChecklistResponses] = useState({});
  const [examMonthYear, setExamMonthYear] = useState("April / May 2026");

  const isChecklistComplete = useMemo(() => {
    return CHECKLIST_ITEMS.every(item => checklistResponses[item.id] === "YES");
  }, [CHECKLIST_ITEMS, checklistResponses]);

  const verifiedCount = useMemo(() => {
    return CHECKLIST_ITEMS.filter(item => checklistResponses[item.id] === "YES").length;
  }, [CHECKLIST_ITEMS, checklistResponses]);

  // Claim Bill Modal & Form States
  const [showClaimBillModal, setShowClaimBillModal] = useState(false);
  const [claimBillStep, setClaimBillStep] = useState("form"); // "form" | "verify"

  const [claimBillData, setClaimBillData] = useState({
    setterName: "",
    designation: "Professor",
    departmentInstitution: "",
    mobileNumber: "",
    emailId: "",
    accHolderName: "",
    bankName: "",
    branchName: "",
    accountNumber: "",
    ifscCode: "",
    accountType: "Savings (SB)"
  });

  // Auto pre-fill Claim Bill data when assignment / setter is loaded
  useEffect(() => {
    if (assignment || authenticatedSetter) {
      setClaimBillData(prev => ({
        ...prev,
        setterName: authenticatedSetter?.name || assignment?.setterName || prev.setterName,
        designation: authenticatedSetter?.designation || "Professor",
        departmentInstitution: authenticatedSetter?.collegeName || assignment?.setterCollege || prev.departmentInstitution,
        mobileNumber: authenticatedSetter?.phone || prev.mobileNumber,
        emailId: authenticatedSetter?.email || assignment?.setterEmail || prev.emailId,
        accHolderName: authenticatedSetter?.name || assignment?.setterName || prev.accHolderName
      }));
    }
  }, [assignment, authenticatedSetter]);

  // View state: "acceptance" | "editor" | "preview"
  const [viewState, setViewState] = useState("acceptance");

  // Syllabus state
  const [syllabusData, setSyllabusData] = useState(null);

  // Bloom's Knowledge Levels fetched dynamically from Firestore blooms_taxonomy
  const [bloomsLevels, setBloomsLevels] = useState([
    { code: "K1", name: "Remember" },
    { code: "K2", name: "Understand" },
    { code: "K3", name: "Apply" },
    { code: "K4", name: "Analyze" },
    { code: "K5", name: "Evaluate" },
    { code: "K6", name: "Create" }
  ]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "blooms_taxonomy"), (snap) => {
      const levelList = [];
      snap.forEach(d => {
        const data = d.data();
        if (Array.isArray(data.levels)) {
          data.levels.forEach(lvl => {
            if (lvl && (lvl.code || lvl.name)) {
              levelList.push({
                code: lvl.code || lvl.name,
                name: lvl.name || lvl.code
              });
            }
          });
        }
      });

      if (levelList.length > 0) {
        const unique = [];
        const seen = new Set();
        levelList.forEach(l => {
          if (!seen.has(l.code)) {
            seen.add(l.code);
            unique.push(l);
          }
        });
        setBloomsLevels(unique);
      }
    });

    return () => unsub();
  }, []);

  // Fetch Question Paper Guidelines from Firestore coe_qp_guidelines
  const [qpGuidelines, setQpGuidelines] = useState([]);
  const [showGuidelinesCollapse, setShowGuidelinesCollapse] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "coe_qp_guidelines"), (snap) => {
      const list = [];
      snap.forEach(d => {
        const data = d.data();
        if (data && data.text) {
          list.push({ id: d.id, ...data });
        }
      });
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
      setQpGuidelines(list);
    });
    return () => unsub();
  }, []);

  // Dynamic Question Paper Data (Loaded from pattern document in Firestore)
  const [qpData, setQpData] = useState({
    title: "",
    duration: "3 Hours",
    maxMarks: 100,
    sections: []
  });

  const [submittingToCoe, setSubmittingToCoe] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  // 1. Fetch Assignment Document & Pattern Data dynamically from Firestore
  useEffect(() => {
    if (!urlAssignmentId) {
      setLoadingAssignment(false);
      return;
    }

    const unsub = onSnapshot(doc(db, "coe_setter_assignments", urlAssignmentId), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAssignment({ id: snap.id, ...data });

        if (data.acceptanceStatus) {
          setInterestStatus(data.acceptanceStatus);
          setAcceptanceSubmitted(true);
        }
        if (data.signatureUrl) {
          setSignatureUrl(data.signatureUrl);
        }

        // If paper was already saved/submitted, use stored paper
        if (data.submittedPaper && data.submittedPaper.sections?.length > 0) {
          setQpData(data.submittedPaper);
        } else if (data.patternId) {
          // Fetch assigned pattern document dynamically from coe_patterns
          try {
            const patSnap = await getDoc(doc(db, "coe_patterns", data.patternId));
            if (patSnap.exists()) {
              const patData = patSnap.data();
              let currentQNo = 1;

              const dynamicSections = (patData.sections || []).map((sec, secIdx) => {
                const count = sec.count || 5;
                const questions = Array.from({ length: count }, (_, i) => {
                  const qNo = currentQNo++;
                  return {
                    qNo,
                    text: "",
                    optionB: sec.choiceType === "either_or" ? "" : undefined,
                    marks: sec.marksPerQ || 2,
                    blooms: `K${(i % 4) + 1}`,
                    co: `CO${(i % 5) + 1}`,
                    pi: `1.1.${(i % 3) + 1}`
                  };
                });

                return {
                  id: sec.id || `section_${secIdx}`,
                  name: sec.name || `Section ${secIdx + 1}`,
                  instructions: sec.instructions || `Answer ALL Questions in ${sec.name}`,
                  questions
                };
              });

              setQpData({
                title: patData.title || `ESE Question Paper - ${data.subjectCode}`,
                duration: patData.duration || "3 Hours",
                maxMarks: patData.totalMarks || 100,
                sections: dynamicSections
              });
            }
          } catch (e) {
            console.error("Error fetching pattern document:", e);
          }
        }
      } else {
        setAssignment(null);
      }
      setLoadingAssignment(false);
    });

    return () => unsub();
  }, [urlAssignmentId]);

  // 2. Fetch Syllabus for Assigned Subject dynamically from Firestore
  useEffect(() => {
    if (!assignment?.subjectCode) return;

    const fetchSyllabus = async () => {
      try {
        const rawCode = assignment.subjectCode;
        const rawTitle = assignment.subjectTitle || "";
        const cleanTargetCode = String(rawCode).replace(/[^A-Za-z0-9]/g, "").toUpperCase();

        let foundUnits = null;
        let foundCos = null;

        // 1st Check: `courses` collection (Course Bank & syllabus documents)
        try {
          const coursesSnap = await getDocs(collection(db, "courses"));
          coursesSnap.forEach(d => {
            if (foundUnits) return;
            const data = d.data();
            const docCode = String(data.code || data.subjectCode || data.courseCode || d.id).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
            if (docCode && (docCode.includes(cleanTargetCode) || cleanTargetCode.includes(docCode))) {
              if (Array.isArray(data.units) && data.units.length > 0) {
                foundUnits = data.units.map((u, idx) => ({
                  unit: u.unit || idx + 1,
                  title: u.title || u.name || `Unit ${idx + 1}`,
                  topics: u.topics || u.content || (typeof u === "string" ? u : "")
                }));
              }
              if (Array.isArray(data.co) && data.co.length > 0) {
                foundCos = data.co;
              }
            }
          });
        } catch (e) {
          console.error("Error checking courses collection:", e);
        }

        // 2nd Check: `co_configuration` collection
        if (!foundUnits) {
          try {
            const coConfigSnap = await getDocs(collection(db, "co_configuration"));
            coConfigSnap.forEach(d => {
              if (foundUnits) return;
              const data = d.data();
              const docCode = String(data.subjectCode || data.courseCode || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
              if (docCode && (docCode.includes(cleanTargetCode) || cleanTargetCode.includes(docCode))) {
                if (Array.isArray(data.units) && data.units.length > 0) {
                  foundUnits = data.units.map((u, idx) => ({
                    unit: u.unit || idx + 1,
                    title: u.title || u.name || `Unit ${idx + 1}`,
                    topics: u.topics || u.content || (typeof u === "string" ? u : "")
                  }));
                }
                if (Array.isArray(data.coData) && data.coData.length > 0) {
                  foundCos = data.coData;
                }
              }
            });
          } catch (e) {
            console.error("Error checking co_configuration collection:", e);
          }
        }

        // 3rd Check: `syllabus_data` collection
        if (!foundUnits) {
          try {
            const syllSnap = await getDocs(collection(db, "syllabus_data"));
            syllSnap.forEach(d => {
              if (foundUnits) return;
              const data = d.data();
              const sems = data.semesters || {};
              Object.values(sems).forEach(semObj => {
                const subList = semObj.subjects || semObj || [];
                if (Array.isArray(subList)) {
                  subList.forEach(s => {
                    const sCode = String(s.code || s.subjectCode || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
                    if (sCode && sCode === cleanTargetCode) {
                      if (Array.isArray(s.units) && s.units.length > 0) {
                        foundUnits = s.units.map((u, idx) => ({
                          unit: u.unit || idx + 1,
                          title: u.title || u.name || `Unit ${idx + 1}`,
                          topics: u.topics || u.content || (typeof u === "string" ? u : "")
                        }));
                      }
                    }
                  });
                }
              });
            });
          } catch (e) {
            console.error("Error checking syllabus_data collection:", e);
          }
        }

        // If found in Firestore:
        if (foundUnits && foundUnits.length > 0) {
          setSyllabusData({
            subjectCode: rawCode,
            subjectTitle: rawTitle,
            units: foundUnits,
            cos: foundCos
          });
          return;
        }

        // 4th Check: Standard Subject Syllabus mapping according to exact Subject Code / Title
        let defaultUnits = [];
        const isPrinciplesOfMgmt = cleanTargetCode.includes("GE3751") || cleanTargetCode.includes("MG") || rawTitle.toUpperCase().includes("MANAGEMENT");

        if (isPrinciplesOfMgmt) {
          defaultUnits = [
            { unit: 1, title: "Unit I: Introduction to Management & Organizations", topics: "Definition of Management, Science or Art, Managerial Roles & Skills, Evolution of Management Thought, Organization Types, Business Ethics & Social Responsibility." },
            { unit: 2, title: "Unit II: Planning & Decision Making", topics: "Nature and Purpose of Planning, Planning Process, Types of Plans, Objectives & MBO, Strategic Planning, Decision Making Steps, Rationality & Techniques." },
            { unit: 3, title: "Unit III: Organizing & Human Resource Management", topics: "Nature & Purpose of Organizing, Organization Structure, Line & Staff Authority, Departmentation, Delegation & Decentralization, Staffing, Human Resource Management Fundamentals." },
            { unit: 4, title: "Unit IV: Directing, Leadership & Motivation", topics: "Human Factors in Managing, Motivation Theories (Maslow, Herzberg, Vroom), Leadership Styles & Theories, Communication Process, Barriers & Effective Communication, Organizational Culture." },
            { unit: 5, title: "Unit V: Controlling & Performance Management", topics: "System & Process of Controlling, Budgetary & Non-Budgetary Control Techniques, Use of IT in Control, Operations Control, Productivity & Overall Performance Management." }
          ];
        } else {
          // Standard dynamic syllabus units based on actual subject title
          defaultUnits = [
            { unit: 1, title: `Unit I: Introduction & Core Concepts of ${rawTitle || rawCode}`, topics: "Basic principles, fundamental definitions, architectural frameworks, foundational theories and scope of study." },
            { unit: 2, title: `Unit II: Analysis & Theoretical Principles of ${rawTitle || rawCode}`, topics: "Detailed mathematical/logical analysis, design methodologies, component models and analytical techniques." },
            { unit: 3, title: `Unit III: Core Systems & Structural Design of ${rawTitle || rawCode}`, topics: "System architecture, core subsystem integration, protocols, functional workflows and component specifications." },
            { unit: 4, title: `Unit IV: Advanced Applications & Implementation of ${rawTitle || rawCode}`, topics: "Practical implementation methods, optimization techniques, error detection/handling and case studies." },
            { unit: 5, title: `Unit V: Modern Trends & Performance Evaluation of ${rawTitle || rawCode}`, topics: "Emerging technological trends, industry standard practices, performance metrics, testing and future developments." }
          ];
        }

        setSyllabusData({
          subjectCode: rawCode,
          subjectTitle: rawTitle,
          units: defaultUnits,
          cos: foundCos
        });

      } catch (err) {
        console.error("Error resolving syllabus:", err);
      }
    };

    fetchSyllabus();
  }, [assignment]);

  // 3. Handle Setter Authentication
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Please enter both Email and Password.");
      return;
    }

    setAuthenticating(true);
    setLoginError("");

    try {
      const q = query(
        collection(db, "coe_external_setters"),
        where("email", "==", loginEmail.trim().toLowerCase())
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setLoginError("Invalid Email or account not found.");
        setAuthenticating(false);
        return;
      }

      let matchedSetter = null;
      snap.forEach(d => {
        const data = d.data();
        if (data.password === loginPassword.trim()) {
          matchedSetter = { id: d.id, ...data };
        }
      });

      if (!matchedSetter) {
        setLoginError("Incorrect password. Please verify credentials sent by COE.");
        setAuthenticating(false);
        return;
      }

      if (matchedSetter.status === "disabled") {
        setLoginError("Your account has been disabled by the Controller of Examinations.");
        setAuthenticating(false);
        return;
      }

      setAuthenticatedSetter(matchedSetter);
    } catch (err) {
      console.error("Login error:", err);
      setLoginError("Login failed: " + err.message);
    } finally {
      setAuthenticating(false);
    }
  };

  // 4. Handle Signature Upload (Strict 30KB Limit)
  const handleSignatureFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Strict 30KB limit check (30 * 1024 = 30,720 bytes)
    const MAX_SIZE_BYTES = 30 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      const fileSizeKB = (file.size / 1024).toFixed(1);
      alert(`Signature file size (${fileSizeKB} KB) exceeds the maximum allowed limit of 30 KB. Please select a smaller file (Max 30 KB).`);
      e.target.value = ""; // Reset input selection
      return;
    }

    setSignatureFile(file);
    setUploadingSig(true);

    try {
      const sigUrl = await uploadFile(`coe_signatures/${urlAssignmentId || "sig"}_${Date.now()}.png`, file);
      setSignatureUrl(sigUrl);
    } catch (err) {
      console.warn("Signature storage upload fallback:", err);
      const reader = new FileReader();
      reader.onload = () => setSignatureUrl(reader.result);
      reader.readAsDataURL(file);
    } finally {
      setUploadingSig(false);
    }
  };

  // 5. Submit Acceptance Form
  const handleSubmitAcceptance = async () => {
    if (interestStatus === "Interested" && !signatureUrl) {
      alert("Please upload your digital signature before accepting.");
      return;
    }

    setUploadingSig(true);
    try {
      await updateDoc(doc(db, "coe_setter_assignments", assignment.id), {
        acceptanceStatus: interestStatus,
        signatureUrl: signatureUrl || null,
        status: interestStatus === "Interested" ? "accepted" : "declined",
        updatedAt: serverTimestamp()
      });

      setAcceptanceSubmitted(true);
      if (interestStatus === "Interested") {
        alert("Acceptance form submitted successfully! You can now start preparing the question paper.");
      } else {
        alert("Your response ('Not Interested') has been communicated to the Controller of Examinations.");
      }
    } catch (err) {
      alert("Failed to submit acceptance form: " + err.message);
    } finally {
      setUploadingSig(false);
    }
  };

  // 6. Click "Move to COE" -> Validate Checklist -> Open Claim Bill Form Modal
  const handleMoveToCoe = () => {
    if (!isChecklistComplete) {
      alert("Please complete all 12 items of the Question Paper Setting Verification Checklist before submitting to COE.");
      setShowChecklistModal(true);
      return;
    }

    setClaimBillStep("form");
    setShowClaimBillModal(true);
  };

  // 7. Validate & Proceed to 1-time Claim Verification step
  const handleVerifyClaimDetails = (e) => {
    if (e) e.preventDefault();
    if (!claimBillData.setterName || !claimBillData.bankName || !claimBillData.accountNumber || !claimBillData.ifscCode) {
      alert("Please fill in all required bank remittance details (Bank Name, Account Number, IFSC Code) before proceeding.");
      return;
    }
    setClaimBillStep("verify");
  };

  // 8. Final Submit to COE (Save Question Paper, Checklist & Claim Bill to Firestore)
  const handleFinalSubmitToCoe = async () => {
    setSubmittingToCoe(true);
    try {
      await updateDoc(doc(db, "coe_setter_assignments", assignment.id), {
        status: "submitted",
        submittedPaper: qpData,
        checklistVerified: true,
        checklistResponses: checklistResponses,
        examMonthYear: examMonthYear,
        claimBillData: {
          ...claimBillData,
          subjectCode: assignment?.subjectCode,
          subjectTitle: assignment?.subjectTitle,
          submissionDate: new Date().toLocaleDateString("en-IN")
        },
        submittedAt: serverTimestamp()
      });

      setShowClaimBillModal(false);
      setSubmittedSuccess(true);
    } catch (err) {
      alert("Failed to submit question paper: " + err.message);
    } finally {
      setSubmittingToCoe(false);
    }
  };

  // Calculate workflow step index
  const activeStep = useMemo(() => {
    if (submittedSuccess || assignment?.status === "submitted") return 4;
    if (viewState === "preview") return 4;
    if (viewState === "editor") return 3;
    if (acceptanceSubmitted) return 2;
    return 1;
  }, [viewState, acceptanceSubmitted, submittedSuccess, assignment]);

  // -------------------------------------------------------------------------
  // RENDER: LOGIN SCREEN (If not authenticated)
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // RENDER: LOGIN SCREEN (If not authenticated)
  // -------------------------------------------------------------------------
  if (!authenticatedSetter) {
    return (
      <div className="min-h-screen relative font-sans text-slate-800 flex flex-col justify-between overflow-hidden bg-slate-50">
        {/* Full-bleed Actual Campus Photo Background Image with Crisp Light Gradient Overlays */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 scale-105"
          style={{ backgroundImage: `url('/ckcet_campus.png')` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-slate-50/70 via-white/35 to-blue-50/45 backdrop-blur-[0.5px]" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-100/70 via-transparent to-slate-50/30" />
          {/* Ambient Lighting Orbs */}
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-amber-400/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 left-1/3 w-[500px] h-[500px] bg-indigo-400/15 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* TOP BRANDING BAR (FULL WIDTH & LARGE LOGO BANNER) */}
        <header className="relative z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl px-4 sm:px-8 lg:px-12 py-4 shadow-sm w-full">
          <div className="w-full flex flex-col md:flex-row items-center justify-between gap-4">

            {/* Left: Prominent Full-Width CKCET Banner Logo + Location Code Badge */}
            <div className="flex items-center gap-4 flex-1">
              <div className="h-16 sm:h-20 lg:h-24 px-5 py-2.5 rounded-2xl bg-white shadow-md ring-1 ring-slate-200/90 shrink-0 flex items-center justify-center">
                <img src="/logo.png" alt="CKCET Banner Logo" className="h-full w-auto max-w-[340px] sm:max-w-[550px] lg:max-w-[780px] object-contain drop-shadow-xs" />
              </div>
              <span className="hidden xl:inline-flex items-center px-4 py-2 rounded-xl bg-blue-50 border border-blue-200/90 text-[#120c7a] text-xs font-black tracking-wider uppercase whitespace-nowrap shadow-2xs">
                Cuddalore • Code: 4207
              </span>
            </div>

            {/* Right: Controller of Examinations Division + Portal Badge */}
            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden lg:flex flex-col items-end">
                <span className="text-xs sm:text-sm font-black text-[#120c7a] uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-blue-700" />
                  Office of the Controller of Examinations
                </span>
                <span className="text-xs text-slate-500 font-semibold mt-0.5">End Semester Examinations Division</span>
              </div>
              <div className="h-10 w-px bg-slate-200/80 hidden lg:block" />
              <div className="px-4 py-2.5 rounded-2xl bg-blue-50/90 border border-blue-200/90 text-[#120c7a] text-xs sm:text-sm font-black flex items-center gap-2 shadow-2xs whitespace-nowrap">
                <Landmark className="h-4 w-4 text-[#120c7a]" />
                <span>External Setter Portal</span>
              </div>
            </div>

          </div>
        </header>

        {/* HERO + LOGIN CONTAINER (LIGHT MODE - FULL SPACE) */}
        <main className="relative z-20 flex-1 flex items-center justify-center p-4 md:p-10">
          <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

            {/* LEFT COLUMN: HERO BRANDING & FEATURES */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-blue-100/90 border border-blue-200 shadow-xs backdrop-blur-md">
                <Sparkles className="h-4 w-4 text-[#120c7a] animate-pulse" />
                <span className="text-xs font-black uppercase tracking-widest text-[#120c7a]">
                  Confidential Question Setter Workbench
                </span>
              </div>

              <div className="space-y-3">
                <h2 className="text-3xl md:text-5xl font-black text-[#120c7a] leading-tight tracking-tight">
                  Next-Gen <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#120c7a] via-blue-700 to-indigo-800">Autonomous Evaluation</span> & Question Portal
                </h2>
                <p className="text-slate-700 text-sm md:text-base leading-relaxed font-medium max-w-2xl">
                  Welcome, Honorable External Expert. Access C.K.C.E.T's confidential Outcome-Based Education (OBE) question paper framing system with integrated CO-PO mapping, Bloom's Taxonomy analytics, and instant verification claim workflows.
                </p>
              </div>



              {/* INSTITUTION FOOTER BADGES */}
              <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] font-bold text-slate-600 border-t border-slate-200/80">
                <span className="flex items-center gap-1.5 text-slate-800 font-extrabold">
                  <Building2 className="h-3.5 w-3.5 text-[#120c7a]" />
                  C.K. College of Engineering & Technology
                </span>
                <span>•</span>
                <span>Autonomous Evaluation Portal</span>
                <span>•</span>
                <span className="text-blue-800">Cuddalore, Tamil Nadu</span>
              </div>
            </div>

            {/* RIGHT COLUMN: ULTRA-HD LIGHT GLASSMORPHISM LOGIN CARD */}
            <div className="lg:col-span-5">
              <div className="relative group">
                {/* Subtle Card Border Glow Effect */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-[#120c7a]/20 via-blue-500/20 to-indigo-500/20 rounded-3xl blur-md opacity-60 group-hover:opacity-100 transition duration-1000" />

                <div className="relative bg-white/95 backdrop-blur-2xl border border-blue-100 rounded-3xl p-7 sm:p-9 shadow-2xl shadow-blue-950/10 space-y-6">

                  {/* Card Header */}
                  <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center h-16 w-16 bg-[#120c7a] rounded-2xl text-white shadow-xl shadow-[#120c7a]/20 ring-4 ring-blue-50 mb-2">
                      <Lock className="h-8 w-8 text-amber-300" />
                    </div>
                    <h3 className="text-2xl font-black text-[#120c7a] tracking-tight font-serif">
                      External Setter Sign In
                    </h3>
                    <p className="text-slate-500 text-xs font-semibold max-w-xs mx-auto">
                      Enter your official email and password sent in your COE invitation document.
                    </p>
                  </div>

                  {/* Login Error Notification */}
                  {loginError && (
                    <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-3 shadow-xs animate-shake">
                      <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  {/* Form */}
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 text-[#120c7a]" />
                          Registered Email Address
                        </label>
                        <span className="text-[10px] text-[#120c7a] font-extrabold uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          COE Issued
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="email"
                          placeholder="professor@iitm.ac.in / name@institution.edu"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm text-slate-900 font-semibold placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/15 transition-all shadow-inner"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Lock className="h-3.5 w-3.5 text-[#120c7a]" />
                          Secure Access Password
                        </label>
                      </div>
                      <div className="relative">
                        <input
                          type="password"
                          placeholder="Enter password sent in official invitation"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm text-slate-900 font-semibold placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/15 transition-all shadow-inner"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={authenticating}
                      className="w-full bg-gradient-to-r from-[#120c7a] via-[#1a1499] to-[#0e0a60] hover:from-[#0e0a60] hover:to-[#080640] text-white font-black py-4 px-6 rounded-2xl shadow-xl shadow-[#120c7a]/25 hover:shadow-[#120c7a]/40 transition-all duration-300 flex items-center justify-center gap-3 text-sm cursor-pointer disabled:opacity-50 border border-blue-900/30 transform active:scale-95 mt-2"
                    >
                      {authenticating ? (
                        <>
                          <RefreshCw className="h-5 w-5 animate-spin text-amber-300" />
                          <span>Verifying COE Credentials...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-5 w-5 text-amber-300" />
                          <span>Log In to Setter Workbench</span>
                          <ChevronRight className="h-4 w-4 text-amber-300" />
                        </>
                      )}
                    </button>
                  </form>

                  {/* Card Security Footer */}
                  <div className="pt-4 border-t border-slate-100 text-center space-y-1">
                    <p className="text-[11px] text-slate-500 font-semibold flex items-center justify-center gap-1">
                      <Lock className="h-3 w-3 text-[#120c7a] inline" />
                      Strictly Confidential • Authorized Personnel Only
                    </p>
                    <p className="text-[10px] text-slate-400 font-semibold">
                      C.K. College of Engineering & Technology • COE Division
                    </p>
                  </div>

                </div>
              </div>
            </div>

          </div>
        </main>

        {/* BOTTOM FOOTER (LIGHT MODE) */}
        <footer className="relative z-20 border-t border-slate-200/80 bg-white/90 backdrop-blur-md px-6 py-3 text-center text-xs text-slate-600 font-semibold">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>© {new Date().getFullYear()} C.K. College of Engineering & Technology. All rights reserved.</span>
            <span className="text-slate-500 text-[11px]">Designed for End Semester Autonomous Examination Framing</span>
          </div>
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: MAIN WORKBENCH (ORIGINAL 1ST COLOR PALETTE - CRISP LIGHT THEME)
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] via-[#e8f0fe] to-[#BBDEFB] font-sans text-zinc-800 flex flex-col selection:bg-[#120c7a] selection:text-white pb-12">

      {/* ========================================================================= */}
      {/* 1. TOP ACADEMIC NAVBAR */}
      {/* ========================================================================= */}
      <header className="relative z-20 bg-white/95 backdrop-blur-md border-b border-zinc-200 shadow-xs px-4 sm:px-8 py-3.5 sticky top-0">
        <div className="w-full flex items-center justify-between gap-4">

          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 bg-[#120c7a] text-white rounded-2xl flex items-center justify-center font-black text-xs shadow-md shrink-0">
              COE
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-[#120c7a] text-base leading-tight tracking-tight">
                  External Setter Workbench
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-extrabold text-emerald-800">
                  <ShieldCheck className="h-3 w-3 text-emerald-600" /> Authenticated
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-semibold flex items-center gap-2">
                <span>Welcome, <strong className="text-zinc-900 font-bold">{authenticatedSetter.name}</strong></span>
                <span className="text-zinc-300">•</span>
                <span className="text-zinc-600 flex items-center gap-1 font-medium">
                  <Building2 className="h-3 w-3 text-zinc-400" /> {authenticatedSetter.collegeName || "Invited Senior Professor"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Syllabus Drawer Button */}
            <button
              onClick={() => setShowSyllabusDrawer(true)}
              className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#120c7a] text-xs font-bold flex items-center gap-2 border border-blue-200 transition-all cursor-pointer shadow-xs"
            >
              <BookOpen className="h-4 w-4 text-[#120c7a]" />
              <span className="hidden md:inline">View Syllabus & Outcomes</span>
            </button>

            {viewState !== "acceptance" && (
              <button
                onClick={() => setViewState("acceptance")}
                className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
              >
                <FileText className="h-4 w-4 text-zinc-600" />
                <span>Acceptance & Order</span>
              </button>
            )}

            <button
              onClick={() => setAuthenticatedSetter(null)}
              className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. STEP PROGRESS TRACKER BAR */}
      {/* ========================================================================= */}
      <div className="relative z-10 bg-white/80 border-b border-zinc-200/80 py-3.5 px-4 sm:px-8 shadow-xs">
        <div className="w-full flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">

          {[
            { step: 1, title: "1. Order & Verification", desc: "Review Appointment Copy" },
            { step: 2, title: "2. Willingness Declaration", desc: "Digital Acceptance & Signature" },
            { step: 3, title: "3. Frame Question Paper", desc: "Pattern & Blooms Taxonomies" },
            { step: 4, title: "4. Confidential Submit", desc: "Encrypted COE Handoff" }
          ].map((s) => {
            const isPassed = activeStep > s.step;
            const isCurrent = activeStep === s.step;
            return (
              <div
                key={s.step}
                className={`flex items-center gap-3 px-3.5 py-2 rounded-2xl transition-all shrink-0 ${isCurrent
                  ? "bg-[#120c7a] text-white shadow-md font-bold"
                  : isPassed
                    ? "bg-emerald-50 text-emerald-900 border border-emerald-200 font-extrabold"
                    : "bg-zinc-100 text-zinc-400 opacity-80"
                  }`}
              >
                <div className={`h-7 w-7 rounded-full flex items-center justify-center font-black text-xs ${isPassed
                  ? "bg-emerald-600 text-white"
                  : isCurrent
                    ? "bg-amber-400 text-slate-950 font-black"
                    : "bg-zinc-200 text-zinc-500"
                  }`}>
                  {isPassed ? <Check className="h-4 w-4 stroke-[3]" /> : s.step}
                </div>
                <div className="text-left">
                  <div className="text-xs font-black leading-tight">{s.title}</div>
                  <div className="text-[10px] font-semibold opacity-85">{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN WORKBENCH CONTENT */}
      {/* ========================================================================= */}
      <main className="relative z-10 w-full px-4 sm:px-8 py-6 space-y-6 flex-1">

        {/* ASSIGNED SUBJECT BANNER CARD (1st Palette Rich Gradient) */}
        {assignment ? (
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-900 via-[#120c7a] to-indigo-950 p-6 sm:p-8 text-white shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border border-blue-800/40">

            {/* Background Decorative Crest Accent */}
            <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 opacity-10 pointer-events-none">
              <Landmark className="h-96 w-96 text-white" />
            </div>

            <div className="space-y-3 relative z-10 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-blue-100 bg-white/10 rounded-full border border-white/20">
                  <Award className="h-3.5 w-3.5 text-amber-300" /> End Semester Examination (ESE)
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-blue-100 bg-white/10 rounded-full border border-white/20">
                  Batch: {assignment.batch}
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-blue-100 bg-white/10 rounded-full border border-white/20">
                  Regulation: R-{assignment.regulation}
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
                <span className="text-amber-300 font-mono mr-2">{assignment.subjectCode}</span>
                {assignment.subjectTitle}
              </h2>

              <div className="flex flex-wrap gap-4 text-xs text-blue-100/90 font-medium pt-1 border-t border-white/15">
                <span className="flex items-center gap-1.5">
                  <strong className="text-blue-200 font-semibold">Department:</strong>
                  <span className="text-white font-bold">{assignment.department}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <strong className="text-blue-200 font-semibold">Total Marks:</strong>
                  <span className="text-amber-300 font-bold">{qpData.maxMarks} Marks</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <strong className="text-blue-200 font-semibold">Duration:</strong>
                  <span className="text-white font-bold">{qpData.duration}</span>
                </span>
              </div>
            </div>

            {/* IN-PAGE VIEW APPOINTMENT ORDER COPY BUTTON (1ST PALETTE WHITE CARD BUTTON) */}
            <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <button
                type="button"
                onClick={() => setShowOrderModal(true)}
                className="px-5 py-3 rounded-xl bg-white hover:bg-blue-50 text-[#120c7a] font-black text-xs flex items-center justify-center gap-2.5 shadow-xl transition-all cursor-pointer shrink-0 active:scale-95 border border-white/40"
              >
                <Eye className="h-4.5 w-4.5 text-[#120c7a] stroke-[2.5]" />
                <span>View Appointment Order Copy</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <span>No active setter assignment document found for this session token. Please verify link from Controller of Examinations.</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 1: ACCEPTANCE FORM & APPOINTMENT DECLARATION */}
        {/* ========================================================================= */}
        {viewState === "acceptance" && assignment && (
          <div className="bg-white rounded-3xl border border-zinc-200 p-6 sm:p-8 shadow-sm space-y-8">

            <div className="border-b border-zinc-100 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-[#120c7a] flex items-center gap-2.5">
                  <FileText className="h-6 w-6 text-indigo-600" />
                  End Semester Examination Question Setter Acceptance Form
                </h2>
                <p className="text-zinc-500 text-xs font-semibold mt-1">
                  Please review the assignment details, upload your signature, and confirm your interest.
                </p>
              </div>

              {acceptanceSubmitted && (
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Acceptance Submitted & Locked
                </span>
              )}
            </div>

            {/* Official Acceptance Document Preview Card (1st Palette Crisp White Paper) */}
            <div className="bg-white text-zinc-900 rounded-2xl p-6 sm:p-10 shadow-md border border-zinc-300 font-serif max-w-3xl mx-auto space-y-6 relative overflow-hidden">

              <div className="text-center border-b border-zinc-200 pb-5 space-y-1">
                <h3 className="text-lg font-bold uppercase tracking-wide text-zinc-900 font-serif">Controller of Examinations</h3>
                <h4 className="text-xs font-bold text-zinc-600 font-sans">Question Paper Setter Willingness & Acceptance Declaration</h4>
                <p className="font-sans text-[11px] text-zinc-400 pt-1">
                  Ref No: <span className="font-mono text-zinc-700">COE/ESE-QP/2026/ACC-{assignment.id?.slice(0, 8).toUpperCase() || "78912"}</span>
                </p>
              </div>

              <div className="text-xs space-y-3 leading-relaxed text-zinc-800 font-serif">
                <p>
                  I, <strong className="text-zinc-900 font-semibold">{authenticatedSetter.name}</strong>,
                  working as Faculty at <strong className="text-zinc-900 font-semibold">{authenticatedSetter.collegeName || "Invited Institution"}</strong>,
                  hereby acknowledge receipt of the appointment order for setting the End Semester Examination (ESE) Question Paper
                  for the course <strong className="text-zinc-900 font-semibold">{assignment.subjectCode} - {assignment.subjectTitle}</strong>
                  (Regulation R-{assignment.regulation}, Batch {assignment.batch}).
                </p>
                <p className="text-[11px] text-zinc-500 font-sans italic border-l-2 border-[#120c7a] pl-3">
                  I undertake to maintain complete secrecy and confidentiality of the question paper framed by me in accordance with the regulations prescribed by the Controller of Examinations.
                </p>
              </div>

              {/* Willingness Option Radios */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3 font-sans">
                <span className="text-xs font-extrabold text-zinc-900 block uppercase tracking-wider">
                  Willingness Option:
                </span>

                <div className="flex flex-col sm:flex-row gap-4">
                  <label className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all flex-1 text-xs font-bold ${interestStatus === "Interested"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs"
                    : "bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300"
                    }`}>
                    <input
                      type="radio"
                      name="interest"
                      value="Interested"
                      checked={interestStatus === "Interested"}
                      onChange={(e) => setInterestStatus(e.target.value)}
                      disabled={acceptanceSubmitted}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Yes, I am Interested to set the ESE Question Paper</span>
                  </label>

                  <label className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all flex-1 text-xs font-bold ${interestStatus === "Not Interested"
                    ? "bg-rose-50 border-rose-500 text-rose-950 shadow-xs"
                    : "bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300"
                    }`}>
                    <input
                      type="radio"
                      name="interest"
                      value="Not Interested"
                      checked={interestStatus === "Not Interested"}
                      onChange={(e) => setInterestStatus(e.target.value)}
                      disabled={acceptanceSubmitted}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span>No, Not Interested</span>
                  </label>
                </div>
              </div>

              {/* Digital Signature Upload & Display */}
              {interestStatus === "Interested" && (
                <div className="p-5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3 font-sans">
                  <span className="text-xs font-bold text-zinc-900 block">
                    Upload Signature Image:
                  </span>

                  {!acceptanceSubmitted && (
                    <div>
                      <input
                        type="file"
                        id="sig-upload-input"
                        accept="image/*"
                        onChange={handleSignatureFileChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="sig-upload-input"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#120c7a] hover:bg-[#0e0a60] text-white rounded-xl font-extrabold text-xs cursor-pointer shadow-md transition-all"
                      >
                        <Upload className="h-4 w-4" />
                        <span>Upload Signature</span>
                      </label>

                      <p className="text-[11px] text-zinc-500 font-semibold italic mt-1.5 flex items-center justify-between">
                        <span>It is used for question paper purpose only</span>
                        <span className="text-amber-700 font-bold not-italic bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Max size: 30 KB</span>
                      </p>
                    </div>
                  )}

                  {/* Render Signature Image */}
                  {signatureUrl && (
                    <div className="pt-2">
                      <span className="text-[10px] text-zinc-500 block uppercase font-bold">Uploaded Signature Preview:</span>
                      <div className="mt-1 p-2 bg-white rounded-lg border border-zinc-300 inline-block">
                        <img
                          src={signatureUrl}
                          alt="Signature Preview"
                          className="h-14 object-contain max-w-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Acceptance Action Footer */}
              <div className="pt-4 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-4 font-sans">
                {acceptanceSubmitted ? (
                  <div className="flex items-center gap-2 text-emerald-800 text-xs font-extrabold bg-emerald-50 p-3.5 rounded-xl border border-emerald-200 w-full justify-center">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Acceptance Form Submitted & Saved</span>
                  </div>
                ) : (
                  <button
                    onClick={handleSubmitAcceptance}
                    disabled={uploadingSig}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 px-6 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
                  >
                    {uploadingSig ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Submitting Acceptance...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Submit Acceptance Form</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* UNLOCK START TO PREPARE QUESTION PAPER BUTTON */}
            <div className="flex justify-center pt-4">
              <button
                onClick={() => setViewState("editor")}
                disabled={!acceptanceSubmitted || interestStatus !== "Interested"}
                className={`px-8 py-4 rounded-2xl font-black text-sm transition-all flex items-center gap-3 shadow-xl cursor-pointer ${acceptanceSubmitted && interestStatus === "Interested"
                  ? "bg-[#120c7a] hover:bg-[#0e0a60] text-white shadow-indigo-900/30 active:scale-95"
                  : "bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed"
                  }`}
              >
                <Sparkles className="h-5 w-5 text-amber-400" />
                <span>Start to Prepare Question Paper</span>
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: QUESTION PAPER PREPARATION WORKBENCH */}
        {/* ========================================================================= */}
        {viewState === "editor" && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 w-full">

            {/* Left Sidebar: Course Syllabus Viewer (CO1 to CO5) */}
            <div className="xl:col-span-3 bg-white border border-zinc-200 rounded-3xl p-5 shadow-sm h-fit space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2 text-[#120c7a] font-black text-xs uppercase tracking-wider">
                  <BookOpen className="h-4 w-4" />
                  <span>Subject Syllabus</span>
                </div>
                <span className="text-[10px] font-black bg-blue-50 text-[#120c7a] border border-blue-100 px-2 py-0.5 rounded-md">
                  {assignment.subjectCode}
                </span>
              </div>

              {syllabusData ? (
                <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
                  {syllabusData.units?.map((u, idx) => (
                    <div key={idx} className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-1">
                      <span className="font-extrabold text-[#120c7a] text-xs block">
                        {u.title || `Unit ${u.unit || idx + 1}`}
                      </span>
                      <p className="text-zinc-600 text-[11px] leading-relaxed font-medium">
                        {u.topics}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-zinc-500 text-xs font-semibold">
                  Loading syllabus details...
                </div>
              )}
            </div>

            {/* Right Main Editor: ESE Question Paper Generator */}
            <div className="xl:col-span-9 space-y-6">

              {/* OFFICIAL COE QUESTION PAPER SETTING GUIDELINES BANNER CARD */}
              <div className="bg-gradient-to-r from-blue-900 via-[#120c7a] to-indigo-900 rounded-3xl p-5 text-white shadow-md border border-blue-800/40 space-y-3">
                <div className="flex items-center justify-between border-b border-white/15 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-400 text-slate-950 font-black shadow-xs">
                      <BookOpen className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="font-black text-white text-sm tracking-tight flex items-center gap-2">
                        Question Paper Setting Guidelines & Instructions
                        <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-extrabold uppercase border border-amber-400/30">
                          Official COE Regulations
                        </span>
                      </h3>
                      <p className="text-[11px] text-blue-200/90 font-medium">
                        Mandatory rules configured by the Controller of Examinations for question paper setting.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowGuidelinesCollapse(!showGuidelinesCollapse)}
                    className="text-xs font-extrabold text-blue-200 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-xl border border-white/20 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>{showGuidelinesCollapse ? "Hide Rules" : "Show Rules"}</span>
                  </button>
                </div>

                {showGuidelinesCollapse && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs text-blue-50 font-medium pt-1">
                    {(qpGuidelines.length > 0 ? qpGuidelines : [
                      { id: "g1", text: "Ensure all questions strictly align with the designated Bloom's Taxonomy cognitive levels (K1 to K6).", category: "Mandatory" },
                      { id: "g2", text: "Each question must map directly to its corresponding Course Outcome (CO1 to CO5).", category: "CO Mapping" },
                      { id: "g3", text: "For Either-OR choice questions (Part B/C), maintain equal difficulty and mark distribution across Option (a) and Option (b).", category: "Format" },
                      { id: "g4", text: "Use the built-in CKEditor MathJax tool for mathematical formulas and upload clear vector/image diagrams.", category: "Formatting" },
                      { id: "g5", text: "Strictly maintain absolute secrecy and confidentiality of the question paper framed.", category: "Confidential" }
                    ]).map((g, idx) => (
                      <div key={g.id || idx} className="flex items-start gap-2.5 bg-white/10 p-3 rounded-2xl border border-white/10">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          {g.category && (
                            <span className="text-[9px] font-black uppercase tracking-wider text-amber-300 bg-amber-400/20 px-1.5 py-0.5 rounded mr-1.5">
                              {g.category}
                            </span>
                          )}
                          <span className="leading-relaxed text-white font-serif text-[11.5px]">{g.text}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
                  <div>
                    <h2 className="text-lg font-black text-[#120c7a] flex items-center gap-2">
                      <Edit3 className="h-5 w-5 text-indigo-600" />
                      ESE Question Paper Editor
                    </h2>
                    <p className="text-zinc-500 text-xs font-semibold mt-0.5">
                      Structured text editor according to ESE Pattern ({qpData.maxMarks} Marks).
                    </p>
                  </div>

                  <button
                    onClick={() => setViewState("preview")}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer"
                  >
                    <Eye className="h-4 w-4" />
                    <span>Preview Question Paper</span>
                  </button>
                </div>

                {/* Dynamic Sections & Question Inputs */}
                <div className="space-y-8">
                  {qpData.sections?.map((sec, secIdx) => (
                    <div key={sec.id || secIdx} className="p-5 rounded-3xl bg-zinc-50 border border-zinc-200 space-y-4">
                      <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                        <div>
                          <h3 className="font-black text-[#120c7a] text-base">{sec.name}</h3>
                          <p className="text-xs font-semibold text-zinc-500">{sec.instructions}</p>
                        </div>
                        <span className="text-xs font-mono bg-white border border-zinc-200 px-3 py-1 rounded-xl text-emerald-700 font-extrabold shadow-xs">
                          {sec.questions?.length || 0} Questions
                        </span>
                      </div>

                      <div className="space-y-4">
                        {sec.questions?.map((q, qIdx) => (
                          <div key={qIdx} className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-xs space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2">
                              <span className="font-extrabold text-[#120c7a] text-xs">
                                Question #{q.qNo} {q.optionB !== undefined ? "(a)" : ""}
                              </span>

                              <div className="flex items-center gap-2">
                                {/* Bloom's Selector */}
                                <select
                                  value={q.blooms}
                                  onChange={(e) => {
                                    const updated = { ...qpData };
                                    updated.sections[secIdx].questions[qIdx].blooms = e.target.value;
                                    setQpData(updated);
                                  }}
                                  className="bg-amber-50 border border-amber-200 text-xs text-amber-800 font-extrabold rounded-lg px-2.5 py-1"
                                >
                                  {bloomsLevels.map((lvl) => (
                                    <option key={lvl.code} value={lvl.code}>
                                      {lvl.code} - {lvl.name}
                                    </option>
                                  ))}
                                </select>

                                {/* CO Selector */}
                                <select
                                  value={q.co}
                                  onChange={(e) => {
                                    const updated = { ...qpData };
                                    updated.sections[secIdx].questions[qIdx].co = e.target.value;
                                    setQpData(updated);
                                  }}
                                  className="bg-blue-50 border border-blue-200 text-xs text-[#120c7a] font-extrabold rounded-lg px-2.5 py-1"
                                >
                                  <option value="CO1">CO1</option>
                                  <option value="CO2">CO2</option>
                                  <option value="CO3">CO3</option>
                                  <option value="CO4">CO4</option>
                                  <option value="CO5">CO5</option>
                                </select>

                                {/* Marks Input */}
                                <input
                                  type="number"
                                  value={q.marks}
                                  onChange={(e) => {
                                    const updated = { ...qpData };
                                    updated.sections[secIdx].questions[qIdx].marks = Number(e.target.value);
                                    setQpData(updated);
                                  }}
                                  className="w-16 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-extrabold rounded-lg px-2 py-1 text-center"
                                  placeholder="Marks"
                                />
                              </div>
                            </div>

                            {/* Question Text Area with CKEditor */}
                            <div>
                              <QuestionCKEditor
                                id={`sec_${secIdx}_q_${qIdx}_main`}
                                value={q.text || ""}
                                onChange={(val) => {
                                  const updated = { ...qpData };
                                  updated.sections[secIdx].questions[qIdx].text = val;
                                  setQpData(updated);
                                }}
                                placeholder={`Enter text for Question ${q.qNo}...`}
                              />
                            </div>

                            {/* Option B for Either-OR Choice questions */}
                            {q.optionB !== undefined && (
                              <div className="pt-2 border-t border-zinc-100">
                                <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider block mb-1">
                                  OR Choice - Option (b) Question Text:
                                </span>
                                <QuestionCKEditor
                                  id={`sec_${secIdx}_q_${qIdx}_optB`}
                                  value={q.optionB || ""}
                                  onChange={(val) => {
                                    const updated = { ...qpData };
                                    updated.sections[secIdx].questions[qIdx].optionB = val;
                                    setQpData(updated);
                                  }}
                                  placeholder={`Enter Option (b) text for Question ${q.qNo}...`}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => setViewState("preview")}
                    className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-md cursor-pointer"
                  >
                    <Eye className="h-4 w-4" />
                    <span>Preview & Proceed to Submit</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: PREVIEW QUESTION PAPER & MOVE TO COE */}
        {/* ========================================================================= */}
        {viewState === "preview" && (
          <div className="bg-white rounded-3xl border border-zinc-200 p-6 md:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-[#120c7a] flex items-center gap-2">
                  <Eye className="h-5 w-5 text-emerald-600" />
                  Official ESE Question Paper Preview
                </h2>
                <p className="text-zinc-500 text-xs font-semibold mt-0.5">
                  Verify questions formatting. Click 'Move to COE' to submit or 'Edit' to return.
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => setShowChecklistModal(true)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer border ${isChecklistComplete
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 shadow-xs"
                    : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 animate-pulse shadow-xs"
                    }`}
                >
                  <ClipboardCheck className={`h-4 w-4 ${isChecklistComplete ? "text-emerald-600" : "text-amber-600"}`} />
                  <span>
                    {isChecklistComplete
                      ? "Checklist Verified (12/12) ✓"
                      : `Verify QP Checklist (${verifiedCount}/12)`}
                  </span>
                </button>

                <button
                  onClick={() => setViewState("editor")}
                  className="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold flex items-center gap-1.5 border border-zinc-200 cursor-pointer"
                >
                  <Edit3 className="h-4 w-4" />
                  <span>Edit Question Paper</span>
                </button>

                {isChecklistComplete ? (
                  <button
                    onClick={handleMoveToCoe}
                    disabled={submittingToCoe || submittedSuccess}
                    className="px-6 py-2.5 rounded-xl bg-[#120c7a] hover:bg-[#0e0a60] text-white text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-[#120c7a]/20 cursor-pointer disabled:opacity-50 transition-all transform hover:scale-102"
                  >
                    {submittingToCoe ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin text-amber-300" />
                        <span>Submitting to COE...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 text-emerald-300" />
                        <span>Move to COE</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      alert("Please complete the Question Paper Setting Verification Checklist before submitting to COE.");
                      setShowChecklistModal(true);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-zinc-200 text-zinc-500 border border-zinc-300 text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-zinc-300 transition-all"
                    title="Complete Checklist to Unlock 'Move to COE'"
                  >
                    <Lock className="h-4 w-4 text-zinc-400" />
                    <span>Move to COE (Locked)</span>
                  </button>
                )}
              </div>
            </div>

            {(submittedSuccess || assignment?.status === "submitted") && (
              <div className="bg-gradient-to-br from-[#120c7a] via-[#18129a] to-[#0a0654] text-white p-8 sm:p-10 rounded-3xl shadow-2xl relative overflow-hidden text-center space-y-6 border border-blue-400/30 font-sans my-4">
                {/* Decorative background blur glow */}
                <div className="absolute -top-12 -right-12 w-64 h-64 bg-amber-400/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-emerald-400/15 rounded-full blur-3xl pointer-events-none" />

                {/* Top Badge & Icon */}
                <div className="relative z-10 flex flex-col items-center justify-center gap-3">
                  <div className="h-16 w-16 bg-white/10 backdrop-blur-md rounded-2xl border border-amber-300/40 text-amber-300 flex items-center justify-center shadow-lg mb-1">
                    <Award className="h-9 w-9 text-amber-300" />
                  </div>

                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-400/20 border border-amber-300/30 text-amber-300 text-xs font-black uppercase tracking-widest shadow-xs">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Official COE Submission Completed
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    Thank You for Setting the ESE Question Paper!
                  </h2>
                </div>

                {/* 5 Lines of Satisfying, Inspiring Gratitude Text */}
                <div className="relative z-10 max-w-3xl mx-auto space-y-3 font-serif text-sm sm:text-base leading-relaxed text-blue-100/90 italic border-t border-b border-white/15 py-5 my-2">
                  <p>
                    We extend our deepest gratitude to you for setting the End Semester Examination question paper for <strong className="text-amber-300 not-italic font-sans font-black">{assignment?.subjectCode} - {assignment?.subjectTitle}</strong>.
                  </p>
                  <p>
                    Your distinguished academic expertise, meticulous Bloom's Taxonomy alignment, and dedication to assessment excellence are deeply appreciated.
                  </p>
                  <p>
                    The confidential question paper, quality control checklist, and your remuneration claim bill have been successfully transmitted to the Controller of Examinations.
                  </p>
                  <p>
                    Thank you for partnering with our institution to nurture the next generation of engineers and academic leaders.
                  </p>
                </div>

                {/* Quick Action Buttons */}
                <div className="relative z-10 flex items-center justify-center gap-4 flex-wrap pt-2 font-sans">
                  <button
                    onClick={() => setShowClaimBillModal(true)}
                    className="px-5 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black text-xs flex items-center gap-2 shadow-xl cursor-pointer transition-all"
                  >
                    <FileText className="h-4 w-4 text-zinc-950" />
                    <span>View Submitted Claim Bill</span>
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-2 border border-white/20 cursor-pointer transition-all"
                  >
                    <Printer className="h-4 w-4 text-white" />
                    <span>Print Submission Record</span>
                  </button>
                </div>
              </div>
            )}

            {/* Official Print/Preview Layout Document */}
            <div className="bg-white text-zinc-900 rounded-2xl p-8 sm:p-12 shadow-md font-serif space-y-6 w-full max-w-7xl mx-auto border border-zinc-300">
              <div className="text-center border-b pb-4">
                <h1 className="text-xl font-bold uppercase tracking-wider text-[#120c7a]">End Semester Examination</h1>
                <h2 className="text-base font-bold mt-1 text-zinc-800">{assignment.subjectCode} - {assignment.subjectTitle}</h2>
                <div className="flex justify-between text-xs mt-3 font-sans font-medium text-zinc-700 px-4">
                  <span>Batch: {assignment.batch}</span>
                  <span>Regulation: R-{assignment.regulation}</span>
                  <span>Max Marks: {qpData.maxMarks}</span>
                  <span>Duration: {qpData.duration}</span>
                </div>
              </div>

              {qpData.sections?.map((sec) => (
                <div key={sec.id} className="space-y-3 my-6">
                  <div className="border-b-2 border-black pb-1">
                    <h3 className="font-bold text-sm uppercase font-sans text-zinc-900">{sec.name}</h3>
                    <p className="text-xs italic text-zinc-700">{sec.instructions}</p>
                  </div>

                  <table className="w-full border-collapse border border-black text-xs font-serif my-2">
                    <thead>
                      <tr className="bg-zinc-200 border-b border-black text-center font-bold font-sans">
                        <th className="border border-black p-2 w-16 text-center">Q. No.</th>
                        <th className="border border-black p-2 text-center">Question</th>
                        <th className="border border-black p-2 w-16 text-center">Marks</th>
                        <th className="border border-black p-2 w-20 text-center">K-Level</th>
                        <th className="border border-black p-2 w-16 text-center">CO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.questions?.map((q, qIdx) => {
                        const isEitherOr = q.optionB !== undefined;
                        const isPartA = !isEitherOr && (q.marks === 2 || !q.marks);
                        const qNoDisplay = isPartA ? (String(q.qNo).padStart(2, '0') + '.') : String(q.qNo);

                        if (!isEitherOr) {
                          return (
                            <tr key={qIdx} className="border-b border-black">
                              <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                                {qNoDisplay}
                              </td>
                              <td className="border border-black p-2.5 align-middle">
                                <div
                                  className="prose prose-sm max-w-none text-zinc-900 leading-relaxed font-serif"
                                  dangerouslySetInnerHTML={{ __html: q.text || "(Question text pending)" }}
                                />
                              </td>
                              <td className="border border-black p-2 text-center font-sans font-bold align-middle">
                                {q.marks || 2}
                              </td>
                              <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                                {q.blooms || "K1"}
                              </td>
                              <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                                {q.co || "CO1"}
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <Fragment key={qIdx}>
                            {/* Option A Row */}
                            <tr className="border-b border-black">
                              <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                                {q.qNo}(a)
                              </td>
                              <td className="border border-black p-2.5 align-middle">
                                <div
                                  className="prose prose-sm max-w-none text-zinc-900 leading-relaxed font-serif"
                                  dangerouslySetInnerHTML={{ __html: q.text || "(Question text pending)" }}
                                />
                              </td>
                              <td className="border border-black p-2 text-center font-sans font-bold align-middle">
                                {q.marks || 16}
                              </td>
                              <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                                {q.blooms || "K1"}
                              </td>
                              <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                                {q.co || "CO1"}
                              </td>
                            </tr>

                            {/* Centered (OR) Divider Row */}
                            <tr className="border-b border-black">
                              <td className="border border-black p-1 bg-zinc-50"></td>
                              <td className="border border-black p-1.5 text-center font-bold font-sans text-xs tracking-widest text-zinc-900 bg-zinc-50">
                                (OR)
                              </td>
                              <td className="border border-black p-1 bg-zinc-50"></td>
                              <td className="border border-black p-1 bg-zinc-50"></td>
                              <td className="border border-black p-1 bg-zinc-50"></td>
                            </tr>

                            {/* Option B Row */}
                            <tr className="border-b border-black">
                              <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                                {q.qNo}(b)
                              </td>
                              <td className="border border-black p-2.5 align-middle">
                                <div
                                  className="prose prose-sm max-w-none text-zinc-900 leading-relaxed font-serif"
                                  dangerouslySetInnerHTML={{ __html: q.optionB || "(Option b text pending)" }}
                                />
                              </td>
                              <td className="border border-black p-2 text-center font-sans font-bold align-middle">
                                {q.marks || 16}
                              </td>
                              <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                                {q.blooms || "K1"}
                              </td>
                              <td className="border border-black p-2 text-center font-bold font-sans align-middle whitespace-nowrap">
                                {q.co || "CO1"}
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}

              <div className="pt-8 border-t flex items-end justify-between text-xs font-sans text-zinc-600">
                <div>
                  <span className="block font-bold">External Setter Signature:</span>
                  {signatureUrl && (
                    <img src={signatureUrl} alt="Signature" className="h-10 object-contain mt-1" />
                  )}
                </div>
                <div className="text-right">
                  <span>Submitted to COE</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ========================================================================= */}
      {/* 4. IN-PAGE APPOINTMENT ORDER COPY WEB PREVIEW MODAL (NO NEW TAB!) */}
      {/* ========================================================================= */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-md p-4 sm:p-6 overflow-y-auto">

          <div className="w-full max-w-4xl bg-white border border-zinc-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in duration-200">

            {/* Modal Header (Crisp #120c7a Royal Blue) */}
            <div className="bg-[#120c7a] text-white px-6 py-4 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 bg-white/10 rounded-xl flex items-center justify-center text-amber-300">
                  <Landmark className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-white text-sm sm:text-base leading-tight">
                    Official Appointment Order Copy (Confidential)
                  </h3>
                  <p className="text-[11px] text-blue-200 font-mono">
                    Ref: COE/ESE-QP/2026/ORD-{assignment?.id?.slice(0, 8).toUpperCase() || "78912"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 border border-white/20 transition-all cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5 text-amber-300" />
                  <span className="hidden sm:inline">Print Document</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowOrderModal(false)}
                  className="h-9 w-9 rounded-xl bg-white/10 hover:bg-rose-600 text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Content Area (Renders File Image / PDF Iframe / Official Academic Template) */}
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-100 space-y-6">

              {assignment?.orderCopyUrl ? (
                /* If orderCopyUrl is provided in Firestore */
                assignment.orderCopyUrl.endsWith(".pdf") ? (
                  <iframe
                    src={assignment.orderCopyUrl}
                    className="w-full h-[65vh] rounded-2xl border border-zinc-300 bg-white shadow-md"
                    title="Appointment Order Copy PDF"
                  />
                ) : (
                  <div className="flex justify-center bg-white p-4 rounded-2xl border border-zinc-200 shadow-md">
                    <img
                      src={assignment.orderCopyUrl}
                      alt="Appointment Order Copy"
                      className="max-h-[70vh] object-contain rounded-xl"
                    />
                  </div>
                )
              ) : (
                /* Official Masterpiece Academic Appointment Order Document Layout */
                <div className="bg-white text-zinc-900 rounded-2xl p-8 sm:p-12 shadow-xl border border-zinc-300 font-serif max-w-3xl mx-auto space-y-6 relative overflow-hidden">

                  {/* Document Header */}
                  <div className="text-center border-b pb-6 space-y-1.5">
                    <h2 className="text-xl font-black uppercase tracking-wider text-[#120c7a] font-sans">
                      OFFICE OF THE CONTROLLER OF EXAMINATIONS
                    </h2>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-600 font-sans">
                      CONFIDENTIAL APPOINTMENT ORDER • END SEMESTER EXAMINATIONS
                    </h3>
                    <div className="flex justify-between text-[11px] font-sans text-zinc-600 pt-3 border-t">
                      <span><strong>Ref:</strong> COE/ESE-QP/2026/SEC-{assignment?.id?.slice(0, 6).toUpperCase() || "88412"}</span>
                      <span><strong>Date:</strong> {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    </div>
                  </div>

                  {/* Order Recipient Address */}
                  <div className="text-xs space-y-1 font-sans text-zinc-800 border-l-2 border-[#120c7a] pl-4 py-1">
                    <p className="font-bold text-zinc-900">TO:</p>
                    <p className="font-bold text-[#120c7a] text-sm">{authenticatedSetter?.name || "Invited External Examiner"}</p>
                    <p>{authenticatedSetter?.collegeName || "Department of Engineering, IIT / NIT / Autonomous University"}</p>
                    <p>Email: {authenticatedSetter?.email || "external.setter@institution.edu"}</p>
                  </div>

                  {/* Body Text */}
                  <div className="text-xs space-y-3 leading-relaxed text-zinc-800">
                    <p>Sir / Madam,</p>
                    <p>
                      I am pleased to inform you that you have been appointed as the <strong>External Question Paper Setter</strong> for the
                      End Semester Examinations (ESE). The details of the subject assigned to you are given below:
                    </p>
                  </div>

                  {/* Subject Details Table */}
                  <div className="overflow-hidden border border-zinc-300 rounded-xl font-sans">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-zinc-100 text-zinc-900 font-extrabold border-b">
                        <tr>
                          <th className="p-3 border-r">Course Code</th>
                          <th className="p-3 border-r">Course Title</th>
                          <th className="p-3 border-r">Regulation</th>
                          <th className="p-3">Max Marks & Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-zinc-800 font-medium">
                        <tr>
                          <td className="p-3 border-r font-bold font-mono text-[#120c7a]">{assignment?.subjectCode}</td>
                          <td className="p-3 border-r font-bold">{assignment?.subjectTitle}</td>
                          <td className="p-3 border-r">R-{assignment?.regulation} ({assignment?.batch})</td>
                          <td className="p-3">{qpData.maxMarks} Marks ({qpData.duration})</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Guidelines & Terms */}
                  <div className="text-[11px] space-y-2 text-zinc-700 leading-relaxed font-sans bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                    <p className="font-extrabold text-zinc-900 uppercase tracking-wider text-[10px]">
                      Important Guidelines for External Question Setter:
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Question paper must strictly adhere to the Bloom's Taxonomy (K1 to K6) and CO-PO mappings provided in the syllabus.</li>
                      <li>Maintain strict confidentiality of the questions framed and ensure no copies are retained.</li>
                      <li>Submit the completed question paper via the secure External Setter Workbench on or before the due date.</li>
                      <li>Remuneration and honorarium will be credited directly to your bank account upon submission.</li>
                    </ul>
                  </div>

                  {/* Document Footer Signatures */}
                  <div className="pt-8 border-t border-zinc-200 flex items-end justify-between text-xs font-sans text-zinc-700">
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-bold">Verified By:</p>
                      <p className="font-bold text-zinc-900">Board of Studies (BoS)</p>
                    </div>
                    <div className="text-right">
                      <div className="h-10 border-b border-dashed border-zinc-400 mb-1 inline-block px-4">
                        <span className="text-[10px] italic text-[#120c7a] font-bold block pt-4">Digitally Signed & Sealed</span>
                      </div>
                      <p className="font-extrabold text-zinc-900">Controller of Examinations</p>
                      <p className="text-[10px] text-zinc-500">Autonomous Examination Wing</p>
                    </div>
                  </div>

                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="bg-zinc-50 border-t border-zinc-200 px-6 py-4 flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-semibold">
                Confidential Document • Web Preview Mode
              </span>

              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="px-6 py-2.5 rounded-xl bg-[#120c7a] hover:bg-[#0e0a60] text-white font-extrabold text-xs shadow-md transition-all cursor-pointer"
              >
                Close Preview
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. FLOATING QUICK SYLLABUS DRAWER */}
      {/* ========================================================================= */}
      {showSyllabusDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-zinc-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border-l border-zinc-200 h-full p-6 shadow-2xl flex flex-col space-y-6 overflow-y-auto animate-in slide-in-from-right duration-300">

            <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
              <div className="flex items-center gap-2 text-[#120c7a] font-black text-sm">
                <BookOpen className="h-5 w-5 text-[#120c7a]" />
                <span>Subject Syllabus Quick Reference</span>
              </div>
              <button
                onClick={() => setShowSyllabusDrawer(false)}
                className="h-8 w-8 rounded-xl bg-zinc-100 text-zinc-500 hover:text-zinc-900 flex items-center justify-center cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {syllabusData ? (
              <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-xs font-bold text-[#120c7a]">
                  {syllabusData.subjectCode} - {syllabusData.subjectTitle}
                </div>

                {syllabusData.units?.map((u, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
                    <span className="font-extrabold text-[#120c7a] text-xs block">
                      {u.title || `Unit ${u.unit || idx + 1}`}
                    </span>
                    <p className="text-zinc-600 text-xs leading-relaxed font-medium">
                      {u.topics}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-500 text-xs font-semibold">
                No syllabus details available.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUESTION PAPER SETTING CHECKLIST & DECLARATION MODAL */}
      {/* ========================================================================= */}
      {showChecklistModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
          <div className="bg-white rounded-3xl border border-zinc-300 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden relative print:max-h-none print:shadow-none print:border-none print:rounded-none">

            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#120c7a] to-[#1a149c] text-white p-5 px-6 flex items-center justify-between shrink-0 print:hidden">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-xl">
                  <ClipboardCheck className="h-6 w-6 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Question Paper Setting Verification Checklist</h3>
                  <p className="text-xs text-blue-200 font-medium">Verify all 12 quality control criteria to unlock "Move to COE" submission</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setChecklistResponses(CHECKLIST_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: "YES" }), {}))}
                  className="px-3 py-1.5 bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-400/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  ✓ Verify All YES
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                >
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setShowChecklistModal(false)}
                  className="p-1.5 rounded-full hover:bg-white/20 text-white transition-all cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="bg-blue-50 px-6 py-2.5 border-b border-blue-100 flex items-center justify-between shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[#120c7a]">Checklist Progress:</span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-white border border-blue-200 text-blue-900 font-mono">
                  {verifiedCount} / 12 Verified (YES)
                </span>
              </div>
              {isChecklistComplete ? (
                <span className="text-xs font-black text-emerald-700 bg-emerald-100 border border-emerald-300 px-3 py-0.5 rounded-full inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Checklist Fully Verified! Click "Confirm & Unlock" below
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 px-3 py-0.5 rounded-full">
                  Select "YES" for all 12 items to unlock submission
                </span>
              )}
            </div>

            {/* Printable Official Document Body */}
            <div className="p-6 md:p-8 overflow-y-auto space-y-6 text-zinc-900 font-serif text-xs leading-relaxed">

              {/* Document Title Header */}
              <div className="text-center space-y-1 border-b pb-4">
                <h2 className="text-sm font-bold tracking-wider uppercase text-zinc-900">Office of the Controller of Examinations</h2>
                <h1 className="text-base font-black uppercase tracking-wider text-[#120c7a]">QUESTION PAPER SETTING – CHECK LIST</h1>
                <p className="text-xs font-bold text-zinc-700">B.E. / B.Tech. / M.E.– End Semester Examinations</p>
              </div>

              {/* Header Fields Table */}
              <table className="w-full border-collapse border border-zinc-900 text-left">
                <tbody>
                  <tr>
                    <td className="border border-zinc-900 p-2.5 font-bold w-1/3 bg-zinc-50">Subject Code and Name:</td>
                    <td className="border border-zinc-900 p-2.5 font-extrabold text-[#120c7a]">
                      {assignment?.subjectCode} - {assignment?.subjectTitle}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Month and Year of Examination:</td>
                    <td className="border border-zinc-900 p-2 font-semibold">
                      <input
                        type="text"
                        value={examMonthYear}
                        onChange={(e) => setExamMonthYear(e.target.value)}
                        className="w-full bg-transparent border-none font-extrabold text-zinc-900 focus:outline-none font-sans"
                        placeholder="e.g. April / May 2026"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Check List Table (12 Items) */}
              <div>
                <h3 className="font-sans font-black text-xs text-[#120c7a] uppercase mb-2">I. Question Paper Quality Verification Criteria</h3>
                <table className="w-full border-collapse border border-zinc-900 text-left font-sans">
                  <thead>
                    <tr className="bg-zinc-200 text-zinc-900 font-bold uppercase text-[11px] border-b border-zinc-900">
                      <th className="border border-zinc-900 p-2.5">Check Item</th>
                      <th className="border border-zinc-900 p-2.5 text-center w-24">YES</th>
                      <th className="border border-zinc-900 p-2.5 text-center w-24">NO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CHECKLIST_ITEMS.map((item, idx) => {
                      const status = checklistResponses[item.id];
                      return (
                        <tr key={item.id} className={status === "YES" ? "bg-emerald-50/40" : status === "NO" ? "bg-rose-50/40" : ""}>
                          <td className="border border-zinc-900 p-2.5 font-semibold text-xs text-zinc-900">
                            <span className="font-bold text-zinc-600 mr-2">{idx + 1}.</span>
                            {item.text}
                          </td>
                          <td className="border border-zinc-900 p-2 text-center">
                            <button
                              type="button"
                              onClick={() => setChecklistResponses(prev => ({ ...prev, [item.id]: "YES" }))}
                              className={`w-full py-1.5 rounded font-black text-xs transition-all cursor-pointer ${status === "YES"
                                ? "bg-emerald-600 text-white shadow-xs"
                                : "bg-zinc-100 hover:bg-emerald-100 text-zinc-700 border border-zinc-300"
                                }`}
                            >
                              YES
                            </button>
                          </td>
                          <td className="border border-zinc-900 p-2 text-center">
                            <button
                              type="button"
                              onClick={() => setChecklistResponses(prev => ({ ...prev, [item.id]: "NO" }))}
                              className={`w-full py-1.5 rounded font-black text-xs transition-all cursor-pointer ${status === "NO"
                                ? "bg-rose-600 text-white shadow-xs"
                                : "bg-zinc-100 hover:bg-rose-100 text-zinc-700 border border-zinc-300"
                                }`}
                            >
                              NO
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Distribution of Questions (Unit-wise) Table */}
              <div className="space-y-3 font-sans">
                <h3 className="font-black text-xs text-[#120c7a] uppercase">II. Distribution of Questions (Unit-wise Summary)</h3>

                {/* Part A Table (Q1 - Q10) */}
                <div className="overflow-x-auto">
                  <p className="font-bold text-[11px] text-zinc-700 mb-1">Part A Questions (1 to 10):</p>
                  <table className="w-full border-collapse border border-zinc-900 text-center text-xs">
                    <thead>
                      <tr className="bg-zinc-200 font-bold border-b border-zinc-900">
                        <th className="border border-zinc-900 p-1.5 font-black bg-zinc-300 text-left px-2">Part A Q. No.</th>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                          <th key={num} className="border border-zinc-900 p-1.5 w-10 font-black">{num}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-zinc-900 p-1.5 font-bold text-left px-2 bg-zinc-50">CO</td>
                        {Array.from({ length: 10 }, (_, i) => {
                          const q = qpData.sections[0]?.questions?.[i];
                          return (
                            <td key={i} className="border border-zinc-900 p-1.5 font-bold text-indigo-900">
                              {q?.co || `CO${(i % 5) + 1}`}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="border border-zinc-900 p-1.5 font-bold text-left px-2 bg-zinc-50">KL-Level</td>
                        {Array.from({ length: 10 }, (_, i) => {
                          const q = qpData.sections[0]?.questions?.[i];
                          return (
                            <td key={i} className="border border-zinc-900 p-1.5 font-bold text-emerald-900">
                              {q?.blooms || `K${(i % 4) + 1}`}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Part B Table (Q11 - Q15 A/B) */}
                <div className="overflow-x-auto pt-2">
                  <p className="font-bold text-[11px] text-zinc-700 mb-1">Part B Questions (11 to 15 Either / Or):</p>
                  <table className="w-full border-collapse border border-zinc-900 text-center text-xs">
                    <thead>
                      <tr className="bg-zinc-200 font-bold border-b border-zinc-900">
                        <th rowSpan={2} className="border border-zinc-900 p-1.5 font-black bg-zinc-300 text-left px-2">Part B Q. No.</th>
                        {[11, 12, 13, 14, 15].map(num => (
                          <th key={num} colSpan={2} className="border border-zinc-900 p-1.5 font-black">{num}</th>
                        ))}
                      </tr>
                      <tr className="bg-zinc-100 font-bold border-b border-zinc-900">
                        {[11, 12, 13, 14, 15].map(num => (
                          <React.Fragment key={num}>
                            <th className="border border-zinc-900 p-1 w-8">A</th>
                            <th className="border border-zinc-900 p-1 w-8">B</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-zinc-900 p-1.5 font-bold text-left px-2 bg-zinc-50">CO</td>
                        {[0, 1, 2, 3, 4].map(idx => {
                          const q = qpData.sections[1]?.questions?.[idx];
                          return (
                            <React.Fragment key={idx}>
                              <td className="border border-zinc-900 p-1 font-bold text-indigo-900">{q?.co || `CO${idx + 1}`}</td>
                              <td className="border border-zinc-900 p-1 font-bold text-indigo-900">{q?.co || `CO${idx + 1}`}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="border border-zinc-900 p-1.5 font-bold text-left px-2 bg-zinc-50">KL-Level</td>
                        {[0, 1, 2, 3, 4].map(idx => {
                          const q = qpData.sections[1]?.questions?.[idx];
                          return (
                            <React.Fragment key={idx}>
                              <td className="border border-zinc-900 p-1 font-bold text-emerald-900">{q?.blooms || `K3`}</td>
                              <td className="border border-zinc-900 p-1 font-bold text-emerald-900">{q?.blooms || `K3`}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-zinc-500 italic font-sans font-medium">
                  Note: Each Part B question includes subdivisions / Either-Or choices as per prescribed regulation structure.
                </p>
              </div>

              {/* Declaration by the Question Paper Setter */}
              <div className="border border-zinc-900 p-4 rounded bg-zinc-50 space-y-4">
                <h3 className="font-sans font-black text-xs text-[#120c7a] uppercase border-b border-zinc-300 pb-1">
                  Declaration by the Question Paper Setter
                </h3>
                <p className="leading-relaxed font-serif text-xs text-zinc-800">
                  This is to certify that I, <span className="font-bold underline px-1">{authenticatedSetter?.name || assignment?.setterName || "External Setter"}</span> (Name),
                  have set the question paper on my own for <span className="font-bold underline px-1">{assignment?.subjectCode} - {assignment?.subjectTitle}</span> (Course Code and Name)
                  as per the guidelines given. The question paper in any form is kept strictly confidential and was not disclosed to any other person(s).
                </p>

                <div className="flex items-end justify-between pt-4 font-sans text-xs">
                  <div>
                    <span className="font-bold text-zinc-600 block text-[10px]">Date:</span>
                    <span className="font-bold text-zinc-900">{new Date().toLocaleDateString("en-IN")}</span>
                  </div>

                  <div className="text-right space-y-1">
                    <span className="font-bold text-zinc-600 block text-[10px]">Signature:</span>
                    {signatureUrl ? (
                      <img src={signatureUrl} alt="Signature" className="h-10 object-contain inline-block border border-zinc-200 rounded p-1 bg-white" />
                    ) : (
                      <span className="font-serif italic font-bold text-indigo-900 border-b border-dashed border-zinc-600 px-3">
                        {authenticatedSetter?.name || assignment?.setterName}
                      </span>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Footer Controls */}
            <div className="bg-zinc-100 p-4 px-6 border-t border-zinc-300 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 print:hidden">
              <div className="text-xs font-semibold text-zinc-600">
                {isChecklistComplete ? (
                  <span className="text-emerald-700 font-extrabold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> All 12 Checklist Items Verified! "Move to COE" button is now unlocked.
                  </span>
                ) : (
                  <span className="text-amber-800 font-bold">
                    {12 - verifiedCount} item(s) remaining. Select "YES" for all criteria to unlock submission.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowChecklistModal(false)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-800 border border-zinc-300 text-xs font-bold transition-all cursor-pointer"
                >
                  Close / Return to Preview
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowChecklistModal(false);
                    if (isChecklistComplete) {
                      handleMoveToCoe();
                    }
                  }}
                  disabled={!isChecklistComplete}
                  className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${isChecklistComplete
                    ? "bg-[#120c7a] hover:bg-[#0e0a60] text-white shadow-lg shadow-[#120c7a]/20"
                    : "bg-zinc-300 text-zinc-500 cursor-not-allowed border border-zinc-300"
                    }`}
                >
                  <Send className="h-4 w-4" />
                  <span>Confirm & Unlock 'Move to COE'</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUESTION PAPER SETTER – CLAIM BILL MODAL */}
      {/* ========================================================================= */}
      {showClaimBillModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
          <div className="bg-white rounded-3xl border border-zinc-300 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden relative print:max-h-none print:shadow-none print:border-none print:rounded-none">

            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#120c7a] to-[#1a149c] text-white p-5 px-6 flex items-center justify-between shrink-0 print:hidden font-sans">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-xl">
                  <Landmark className="h-6 w-6 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Question Paper Setter Remuneration Claim Bill</h3>
                  <p className="text-xs text-blue-200 font-medium">Fill in your bank account details for remuneration remittance</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                >
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setShowClaimBillModal(false)}
                  className="p-1.5 rounded-full hover:bg-white/20 text-white transition-all cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Workflow Step Banner */}
            <div className="bg-blue-50 px-6 py-2.5 border-b border-blue-100 flex items-center justify-between shrink-0 print:hidden text-xs font-sans">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[#120c7a]">Submission Workflow:</span>
                <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${claimBillStep === "form" ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-emerald-100 text-emerald-900 border border-emerald-300"}`}>
                  {claimBillStep === "form" ? "Step 1: Fill Remuneration & Bank Details" : "Step 2: 1-Time Verification & Final Submit"}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-zinc-500">Subject: {assignment?.subjectCode}</span>
            </div>

            {/* Printable Document Body */}
            <div className="p-6 md:p-8 overflow-y-auto space-y-6 text-zinc-900 font-serif text-xs leading-relaxed">

              {/* Document Header Title */}
              <div className="text-center space-y-1 border-b pb-4">
                <h2 className="text-sm font-bold tracking-wider uppercase text-zinc-900">Office of the Controller of Examinations</h2>
                <h1 className="text-base font-black uppercase tracking-wider text-[#120c7a]">QUESTION PAPER SETTER – CLAIM BILL</h1>
              </div>

              {/* Step 2 Verification Banner */}
              {claimBillStep === "verify" && (
                <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 font-sans text-xs font-bold flex items-start gap-3 shadow-xs print:hidden">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-black text-amber-900 block mb-0.5">Please Verify Your Details One Time Before Final Submission:</span>
                    <span>Double-check your Bank Account Number, IFSC Code, and Holder Name below. Once verified, click "Confirm & Final Submit to COE".</span>
                  </div>
                </div>
              )}

              {/* Table 1: Personal & Paper Details */}
              <div className="space-y-2 font-sans">
                <h3 className="font-black text-xs text-[#120c7a] uppercase">I. Setter & Examination Details</h3>
                <table className="w-full border-collapse border border-zinc-900 text-left text-xs">
                  <tbody>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold w-2/5 bg-zinc-50">Name of the Paper Setter:</td>
                      <td className="border border-zinc-900 p-2 font-semibold">
                        {claimBillStep === "verify" || submittedSuccess ? (
                          <span className="font-extrabold text-zinc-900 px-1">{claimBillData.setterName}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.setterName}
                            onChange={(e) => setClaimBillData({ ...claimBillData, setterName: e.target.value })}
                            className="w-full bg-transparent border-none font-extrabold text-zinc-900 focus:outline-none"
                            placeholder="Enter Full Name"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Designation:</td>
                      <td className="border border-zinc-900 p-2 font-semibold">
                        {claimBillStep === "verify" || submittedSuccess ? (
                          <span className="font-bold text-zinc-900 px-1">{claimBillData.designation}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.designation}
                            onChange={(e) => setClaimBillData({ ...claimBillData, designation: e.target.value })}
                            className="w-full bg-transparent border-none font-bold text-zinc-900 focus:outline-none"
                            placeholder="e.g. Professor / Associate Professor"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Department & Institution:</td>
                      <td className="border border-zinc-900 p-2 font-semibold">
                        {claimBillStep === "verify" || submittedSuccess ? (
                          <span className="font-bold text-zinc-900 px-1">{claimBillData.departmentInstitution}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.departmentInstitution}
                            onChange={(e) => setClaimBillData({ ...claimBillData, departmentInstitution: e.target.value })}
                            className="w-full bg-transparent border-none font-bold text-zinc-900 focus:outline-none"
                            placeholder="e.g. Dept of CSE, IIT Madras"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Mobile Number:</td>
                      <td className="border border-zinc-900 p-2 font-semibold">
                        {claimBillStep === "verify" || submittedSuccess ? (
                          <span className="font-bold text-zinc-900 px-1">{claimBillData.mobileNumber}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.mobileNumber}
                            onChange={(e) => setClaimBillData({ ...claimBillData, mobileNumber: e.target.value })}
                            className="w-full bg-transparent border-none font-bold text-zinc-900 focus:outline-none"
                            placeholder="e.g. 9876543210"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Email ID:</td>
                      <td className="border border-zinc-900 p-2 font-semibold font-mono">
                        {claimBillStep === "verify" || submittedSuccess ? (
                          <span className="font-bold text-zinc-900 px-1">{claimBillData.emailId}</span>
                        ) : (
                          <input
                            type="email"
                            value={claimBillData.emailId}
                            onChange={(e) => setClaimBillData({ ...claimBillData, emailId: e.target.value })}
                            className="w-full bg-transparent border-none font-bold text-zinc-900 focus:outline-none"
                            placeholder="e.g. professor@institution.edu"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Subject Code and Name:</td>
                      <td className="border border-zinc-900 p-2.5 font-extrabold text-[#120c7a]">
                        {assignment?.subjectCode} - {assignment?.subjectTitle}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Examination (Month & Year):</td>
                      <td className="border border-zinc-900 p-2.5 font-bold text-zinc-900">
                        {examMonthYear}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Date of Submission of QP:</td>
                      <td className="border border-zinc-900 p-2.5 font-bold text-zinc-900">
                        {new Date().toLocaleDateString("en-IN")}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Table 2: Bank Account Details for Remittance */}
              <div className="space-y-2 font-sans">
                <h3 className="font-black text-xs text-[#120c7a] uppercase">II. Bank Account Details for Remittance</h3>
                <table className="w-full border-collapse border border-zinc-900 text-left text-xs">
                  <tbody>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold w-2/5 bg-zinc-50">Account Holder Name:</td>
                      <td className="border border-zinc-900 p-2 font-semibold">
                        {claimBillStep === "verify" || submittedSuccess ? (
                          <span className="font-extrabold text-zinc-900 px-1">{claimBillData.accHolderName}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.accHolderName}
                            onChange={(e) => setClaimBillData({ ...claimBillData, accHolderName: e.target.value })}
                            className="w-full bg-transparent border-none font-extrabold text-zinc-900 focus:outline-none"
                            placeholder="As per bank passbook"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Bank Name:</td>
                      <td className="border border-zinc-900 p-2 font-semibold">
                        {claimBillStep === "verify" || submittedSuccess ? (
                          <span className="font-extrabold text-zinc-900 px-1">{claimBillData.bankName}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.bankName}
                            onChange={(e) => setClaimBillData({ ...claimBillData, bankName: e.target.value })}
                            className="w-full bg-transparent border-none font-extrabold text-zinc-900 focus:outline-none"
                            placeholder="e.g. State Bank of India"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Branch Name:</td>
                      <td className="border border-zinc-900 p-2 font-semibold">
                        {claimBillStep === "verify" || submittedSuccess ? (
                          <span className="font-bold text-zinc-900 px-1">{claimBillData.branchName}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.branchName}
                            onChange={(e) => setClaimBillData({ ...claimBillData, branchName: e.target.value })}
                            className="w-full bg-transparent border-none font-bold text-zinc-900 focus:outline-none"
                            placeholder="e.g. Main Branch, Chennai"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Account Number:</td>
                      <td className="border border-zinc-900 p-2 font-semibold font-mono">
                        {claimBillStep === "verify" || submittedSuccess ? (
                          <span className="font-extrabold text-emerald-800 text-sm tracking-wider px-1">{claimBillData.accountNumber}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.accountNumber}
                            onChange={(e) => setClaimBillData({ ...claimBillData, accountNumber: e.target.value })}
                            className="w-full bg-transparent border-none font-mono font-extrabold text-indigo-900 focus:outline-none text-sm tracking-wider"
                            placeholder="Enter Account Number"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">IFSC Code:</td>
                      <td className="border border-zinc-900 p-2 font-semibold font-mono">
                        {claimBillStep === "verify" || submittedSuccess ? (
                          <span className="font-extrabold text-indigo-900 text-sm tracking-wider px-1">{claimBillData.ifscCode}</span>
                        ) : (
                          <input
                            type="text"
                            value={claimBillData.ifscCode}
                            onChange={(e) => setClaimBillData({ ...claimBillData, ifscCode: e.target.value.toUpperCase() })}
                            className="w-full bg-transparent border-none font-mono font-extrabold text-indigo-900 uppercase focus:outline-none text-sm tracking-wider"
                            placeholder="e.g. SBIN0001234"
                          />
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-900 p-2.5 font-bold bg-zinc-50">Account Type (SB / CA):</td>
                      <td className="border border-zinc-900 p-2 font-semibold">
                        {claimBillStep === "verify" || submittedSuccess ? (
                          <span className="font-bold text-zinc-900 px-1">{claimBillData.accountType}</span>
                        ) : (
                          <select
                            value={claimBillData.accountType}
                            onChange={(e) => setClaimBillData({ ...claimBillData, accountType: e.target.value })}
                            className="w-full bg-transparent border-none font-bold text-zinc-900 focus:outline-none"
                          >
                            <option value="Savings (SB)">Savings Account (SB)</option>
                            <option value="Current (CA)">Current Account (CA)</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>

            {/* Modal Footer Controls */}
            <div className="bg-zinc-100 p-4 px-6 border-t border-zinc-300 flex items-center justify-between gap-3 shrink-0 print:hidden font-sans">
              <button
                type="button"
                onClick={() => {
                  if (claimBillStep === "verify") {
                    setClaimBillStep("form");
                  } else {
                    setShowClaimBillModal(false);
                  }
                }}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-800 border border-zinc-300 text-xs font-bold transition-all cursor-pointer"
              >
                {claimBillStep === "verify" ? "← Edit Claim Details" : "Cancel / Return"}
              </button>

              {claimBillStep === "form" ? (
                <button
                  type="button"
                  onClick={handleVerifyClaimDetails}
                  className="px-6 py-2.5 rounded-xl bg-[#120c7a] hover:bg-[#0e0a60] text-white font-black text-xs flex items-center gap-2 shadow-md cursor-pointer transition-all"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Verify Details & Proceed</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinalSubmitToCoe}
                  disabled={submittingToCoe}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer disabled:opacity-50 transition-all"
                >
                  {submittingToCoe ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Transmitting to COE...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Confirm & Final Submit to COE</span>
                    </>
                  )}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}


