import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import { collection, onSnapshot, doc, updateDoc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  User, CheckCircle2, AlertCircle, FileText, ChevronRight,
  Eye, Check, Search, Building2, Filter, Loader2, ArrowLeft,
  X, Star, Printer, Undo2, Award, Sparkles, Send, GraduationCap, Library, Paperclip, Save, Edit2
} from "lucide-react";
import Layout from "../components/Layout";
import { getSchoolShortName, isSameInstitution, getSchoolBannerTitle } from "../utils/appraisalScore";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

const NON_TEACHING_EVALUATION_CATEGORIES = [
  { id: 1, text: "Perceptive to the needs of the student, faculty and institution" },
  { id: 2, text: "Responds positively to any instruction, guidance, correction and discipline given by Superiors" },
  { id: 3, text: "Cooperation towards organizing programs in the department/Institute" },
  { id: 4, text: "Attendance, Discipline, Punctuality and Completion of work on schedule" },
  { id: 5, text: "Maintenance of Files / Records / Ambiance of the Department / Laboratory" },
  { id: 6, text: "Ability and willingness to take up additional load in times of requirements" },
  { id: 7, text: "Contribution towards admission" },
  { id: 8, text: "IIY / Improve knowledge (Theory & Hands on Training) on all aspects of the job to perform satisfactorily" },
  { id: 9, text: "The ability and ease in expressing ideas, opinions and information clearly and accurately" },
  { id: 10, text: "Special efforts taken / Contributions for the development of the Institution / Department" }
];

export const HOD_ATTITUDE_EVALUATION_QUESTIONS = [
  {
    id: 1,
    title: "Ownership & Accountability",
    statement: "Takes full responsibility for their role, decisions, and outcomes."
  },
  {
    id: 2,
    title: "Emotional Intelligence & Collaboration",
    statement: "Stays self-aware and empathetic, and works effectively with others."
  },
  {
    id: 3,
    title: "Student Focus & Empathy",
    statement: "Keeps the learner, parent, or stakeholder at the centre of their decisions."
  },
  {
    id: 4,
    title: "Resilience & Adaptability",
    statement: "Remains steady and effective through setbacks, pressure, and change."
  },
  {
    id: 5,
    title: "Growth Mindset",
    statement: "Continuously improves, quickly acquires new skills, and unlearns old habits where needed."
  },
  {
    id: 6,
    title: "Inquisitiveness & Critical Thinking & Problem-Solving",
    statement: "Asks probing questions, evaluates answers critically, and solves problems in novel ways."
  },
  {
    id: 7,
    title: "AI Literacy & Judgment",
    statement: "Proactively learns and uses AI tools, and exercises judgment on when to trust AI output versus human intuition."
  },
  {
    id: 8,
    title: "Integrity & Ethical Judgement",
    statement: "Acts with consistent honesty, fairness, and principled conduct."
  },
  {
    id: 9,
    title: "Clarity in Communication",
    statement: "Articulates ideas clearly and persuasively, in speech and in writing."
  },
  {
    id: 10,
    title: "Change Agent & Innovation Torch-Bearer",
    statement: "Actively drives improvement in pedagogy, curriculum, or department practice."
  },
  {
    id: 11,
    title: "High Consulting Capability",
    statement: "Advises students, peers, or the department with sound, well-reasoned judgment."
  },
  {
    id: 12,
    title: "Long-Term Vision & Sustainability",
    statement: "Prioritises long-term vision and sustainability over short-term approaches."
  },
  {
    id: 13,
    title: "Analytical & Strategy Torch-Bearer",
    statement: "Brings rigorous, evidence-based thinking to academic or departmental strategy."
  },
  {
    id: 14,
    title: "Decisive & Meritocratic",
    statement: "Practises meritocracy, is decisive, and remains intolerant of mediocrity."
  },
  {
    id: 15,
    title: "Excellence-Building",
    statement: "Builds a high-performance culture and strong teams, and champions process discipline for continual improvement."
  },
  {
    id: 16,
    title: "Systems Thinking (Departmental)",
    statement: "Sees the interconnectedness of curriculum, faculty capability, student outcomes, and quality/accreditation requirements."
  },
  {
    id: 17,
    title: "Human-Centric Leadership",
    statement: "Coaches and builds the capability of their team, and fosters psychological safety."
  },
  {
    id: 18,
    title: "Departmental Ownership",
    statement: "Takes full accountability for department-level KRAs, quality outcomes, and compliance timelines."
  }
];

export const TEACHER_ATTITUDE_EVALUATION_QUESTIONS = [
  { id: 1, title: "Ownership & Accountability", statement: "Takes full responsibility for their role, decisions, and outcomes." },
  { id: 2, title: "Emotional Intelligence & Collaboration", statement: "Stays self-aware and empathetic, and works effectively with others." },
  { id: 3, title: "Student Focus & Empathy", statement: "Keeps the learner, parent, or stakeholder at the centre of their decisions." },
  { id: 4, title: "Resilience & Adaptability", statement: "Remains steady and effective through setbacks, pressure, and change." },
  { id: 5, title: "Growth Mindset", statement: "Continuously improves, quickly acquires new skills, and unlearns old habits where needed." },
  { id: 6, title: "Inquisitiveness & Critical Thinking & Problem-Solving", statement: "Asks probing questions, evaluates answers critically, and solves problems in novel ways." },
  { id: 7, title: "AI Literacy & Judgment", statement: "Proactively learns and uses AI tools, and exercises judgment on when to trust AI output versus human intuition." },
  { id: 8, title: "Integrity & Ethical Judgement", statement: "Acts with consistent honesty, fairness, and principled conduct." },
  { id: 9, title: "Clarity in Communication", statement: "Articulates ideas clearly and persuasively, in speech and in writing." },
  { id: 10, title: "Diligence & Ownership", statement: "Is consistently punctual and executes assigned duties thoroughly, flawlessly meeting KRAs." },
  { id: 11, title: "Learning & Applying (EdTech)", statement: "Shows visible progress through IIY and by embracing EdTech in their work." },
  { id: 12, title: "Classroom EQ & Leadership", statement: "Leads an attentive, engaged classroom, stays open and approachable, motivates students, and builds rapport with parents." },
  { id: 13, title: "Proactive", statement: "Anticipates needs and acts ahead of requirements." },
  { id: 14, title: "Going the Extra Mile", statement: "Consistently exceeds baseline expectations in their role." },
  { id: 15, title: "Change Agent & Innovation Torch-Bearer", statement: "Actively drives improvement in pedagogy, curriculum, or department practice." },
  { id: 16, title: "High Consulting Capability", statement: "Advises students, peers, or the department with sound, well-reasoned judgment." }
];

export const NON_TEACHING_GENERAL_ATTITUDE_QUESTIONS = [
  { id: 1, title: "Punctuality & Reliability", statement: "Is consistently present, on time, and dependable in carrying out assigned duties." },
  { id: 2, title: "Ownership & Accountability", statement: "Takes full responsibility for the quality and completion of their work." },
  { id: 3, title: "Integrity & Honesty", statement: "Handles institutional property, information, and resources in a trustworthy manner." },
  { id: 4, title: "Teamwork & Cooperation", statement: "Works well with colleagues and other departments." },
  { id: 5, title: "Service Orientation & Courtesy", statement: "Treats staff, students, parents, and visitors with courtesy and helpfulness." },
  { id: 6, title: "Adaptability & Willingness to Learn", statement: "Stays open to new instructions, tools, and ways of working." },
  { id: 7, title: "Safety & Compliance Consciousness", statement: "Follows safety norms and institutional protocols without being reminded." },
  { id: 8, title: "Attention to Detail & Documentation Accuracy", statement: "Handles records, correspondence, and data carefully and accurately." },
  { id: 9, title: "Confidentiality & Discretion", statement: "Safeguards sensitive institutional, staff, and student information." },
  { id: 10, title: "Responsiveness", statement: "Responds to requests from staff, students, and parents in a timely and courteous manner." },
  { id: 11, title: "Basic Digital & AI Literacy", statement: "Uses digital tools and AI-assisted systems comfortably for records and communication." },
  { id: 12, title: "AI Literacy & Judgment", statement: "Proactively learns and uses AI tools, and exercises judgment on when to trust AI output versus human intuition." },
  { id: 13, title: "Growth Mindset", statement: "Continuously improves, quickly acquires new skills, and unlearns old habits where needed." },
  { id: 14, title: "Clarity in Communication", statement: "Articulates ideas clearly and persuasively, in speech and in writing." },
  { id: 15, title: "Inquisitiveness & Critical Thinking & Problem-Solving", statement: "Asks probing questions, evaluates answers critically, and solves problems in novel ways." },
  { id: 16, title: "Proactive", statement: "Anticipates needs and acts ahead of requirements." },
  { id: 17, title: "Stakeholder Focus & Empathy", statement: "Keeps students, staff, and other stakeholders at the centre of their decisions." },
  { id: 18, title: "Process & Service Improvement", statement: "Actively looks for ways to improve processes and service delivery in their area." },
  { id: 19, title: "Advisory Capability", statement: "Advises colleagues, departments, or stakeholders with sound, well-reasoned judgment." }
];

export const NON_TEACHING_DRIVER_ATTITUDE_QUESTIONS = [
  { id: 1, title: "Punctuality & Reliability", statement: "Is consistently present, on time, and dependable in carrying out assigned duties." },
  { id: 2, title: "Ownership & Accountability", statement: "Takes full responsibility for the quality and completion of their work." },
  { id: 3, title: "Integrity & Honesty", statement: "Handles institutional property, information, and resources in a trustworthy manner." },
  { id: 4, title: "Teamwork & Cooperation", statement: "Works well with colleagues and other departments." },
  { id: 5, title: "Service Orientation & Courtesy", statement: "Treats staff, students, parents, and visitors with courtesy and helpfulness." },
  { id: 6, title: "Adaptability & Willingness to Learn", statement: "Stays open to new instructions, tools, and ways of working." },
  { id: 7, title: "Safety & Compliance Consciousness", statement: "Follows safety norms and institutional protocols without being reminded." },
  { id: 8, title: "Road & Vehicle Safety Discipline", statement: "Practises defensive driving and strictly adheres to traffic and safety norms, especially with students as passengers." },
  { id: 9, title: "Vehicle & Asset Care", statement: "Maintains the assigned vehicle diligently, including cleanliness and fuel discipline." },
  { id: 10, title: "Composure Under Pressure", statement: "Stays calm and safe under traffic, time, or emergency pressure." },
  { id: 11, title: "Predictable Availability", statement: "Is punctually and dependably present, aligned to institutional schedules." }
];

export const NON_TEACHING_HOUSEKEEPING_ATTITUDE_QUESTIONS = [
  { id: 1, title: "Punctuality & Reliability", statement: "Is consistently present, on time, and dependable in carrying out assigned duties." },
  { id: 2, title: "Ownership & Accountability", statement: "Takes full responsibility for the quality and completion of their work." },
  { id: 3, title: "Integrity & Honesty", statement: "Handles institutional property, information, and resources in a trustworthy manner." },
  { id: 4, title: "Teamwork & Cooperation", statement: "Works well with colleagues and other departments." },
  { id: 5, title: "Service Orientation & Courtesy", statement: "Treats staff, students, parents, and visitors with courtesy and helpfulness." },
  { id: 6, title: "Adaptability & Willingness to Learn", statement: "Stays open to new instructions, tools, and ways of working." },
  { id: 7, title: "Safety & Compliance Consciousness", statement: "Follows safety norms and institutional protocols without being reminded." },
  { id: 8, title: "Hygiene & Cleanliness Standards", statement: "Maintains consistent, high standards of cleanliness across assigned spaces." },
  { id: 9, title: "Proactive Upkeep", statement: "Notices and addresses issues — spills, wear, shortages — without being prompted." },
  { id: 10, title: "Respect for Privacy of Spaces", statement: "Handles others' spaces and belongings carefully and respectfully while on duty." },
  { id: 11, title: "Physical Diligence & Consistency", statement: "Sustains reliable effort and diligence across every shift." }
];

export const getAttitudeQuestions = (app) => {
  if (app?.formType === "hod") {
    return HOD_ATTITUDE_EVALUATION_QUESTIONS;
  }
  if (app?.formType === "non_teaching" || app?.collectionName === "non_teaching_appraisals") {
    const rawDesig = (app?.designation || app?.formData?.designation || app?.staffDesignation || "");
    const rawDept = (app?.department || app?.formData?.department || "");
    const rawRole = (app?.role || app?.formData?.role || "");
    const combinedStr = `${rawDesig} ${rawDept} ${rawRole}`.toLowerCase();
    const normalizedStr = combinedStr.replace(/[^a-z0-9]/g, "");

    if (
      normalizedStr.includes("housekeeping") || 
      normalizedStr.includes("housekeeper") || 
      combinedStr.includes("house keeping")
    ) {
      return NON_TEACHING_HOUSEKEEPING_ATTITUDE_QUESTIONS;
    }
    if (
      normalizedStr.includes("driver") || 
      normalizedStr.includes("transport") || 
      combinedStr.includes("driver") ||
      combinedStr.includes("transport")
    ) {
      return NON_TEACHING_DRIVER_ATTITUDE_QUESTIONS;
    }
    return NON_TEACHING_GENERAL_ATTITUDE_QUESTIONS;
  }
  return TEACHER_ATTITUDE_EVALUATION_QUESTIONS;
};

export const ATTITUDE_RATING_OPTIONS = [
  { 
    value: 1, 
    code: "1", 
    label: "Needs Significant Improvement", 
    badgeBg: "bg-rose-100 text-rose-800 border-rose-300", 
    color: "hover:bg-rose-50 text-rose-700 border-rose-200" 
  },
  { 
    value: 2, 
    code: "2", 
    label: "Needs Improvement", 
    badgeBg: "bg-orange-100 text-orange-800 border-orange-300", 
    color: "hover:bg-orange-50 text-orange-700 border-orange-200" 
  },
  { 
    value: 3, 
    code: "3", 
    label: "Meets Expectations", 
    badgeBg: "bg-amber-100 text-amber-800 border-amber-300", 
    color: "hover:bg-amber-50 text-amber-700 border-amber-200" 
  },
  { 
    value: 4, 
    code: "4", 
    label: "Exceeds Expectations", 
    badgeBg: "bg-blue-100 text-blue-800 border-blue-300", 
    color: "hover:bg-blue-50 text-blue-700 border-blue-200" 
  },
  { 
    value: 5, 
    code: "5", 
    label: "Outstanding", 
    badgeBg: "bg-emerald-100 text-emerald-800 border-emerald-300", 
    color: "hover:bg-teal-50 text-teal-700 border-teal-200" 
  }
];

export default function AppraisalReviews() {
  const location = useLocation();
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
  const [statusFilter, setStatusFilter] = useState(() => {
    return location.state?.statusFilter || "HOD_Approved";
  });
  const [selectedAppraisal, setSelectedAppraisal] = useState(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState(1);

  // Scoring states (Parity with HODDashboard review modal)
  const [hodFacultyScoresMap, setHodFacultyScoresMap] = useState({});
  const [principalFacultyScoresMap, setPrincipalFacultyScoresMap] = useState({});
  const [principalHodScoresMap, setPrincipalHodScoresMap] = useState({});

  // Non-teaching evaluation states
  const [nonTeachingEvalMarks, setNonTeachingEvalMarks] = useState({
    1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 8: 10, 9: 10, 10: 10
  });
  const [nonTeachingSpecificComment, setNonTeachingSpecificComment] = useState("");
  const [nonTeachingRecommendation, setNonTeachingRecommendation] = useState("His / Her contribution to be appreciated and recommended");
  const [nonTeachingIncrementGrade, setNonTeachingIncrementGrade] = useState("A");

  // Universal proof extraction helper for single files, arrays, and nested structures
  const extractProofList = (target) => {
    if (!target) return [];
    if (Array.isArray(target)) {
      return target
        .filter(p => p && (p.fileUrl || typeof p === "string"))
        .map(p => typeof p === "string" ? { fileUrl: p, fileName: "Proof Document" } : p);
    }
    if (Array.isArray(target.proofs)) return target.proofs;
    if (Array.isArray(target.proof)) return target.proof;
    if (Array.isArray(target.proofFiles)) return target.proofFiles;
    if (target.fileUrl) return [{ fileUrl: target.fileUrl, fileName: target.fileName || "Proof Attachment" }];
    if (target.proof && typeof target.proof === "object" && target.proof.fileUrl) {
      return [{ fileUrl: target.proof.fileUrl, fileName: target.proof.fileName || "Proof Attachment" }];
    }
    return [];
  };

  const isSectionVisible = (id) => {
    const field = customFieldsConfig.find(f => f.id === id);
    return field ? field.visible !== false : true;
  };

  const cleanText = (val) => {
    if (!val) return "";
    if (typeof val !== "string") return val;
    return val.replace(/^"+|"+$/g, "").trim();
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
  const [finalRating, setFinalRating] = useState("");

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

  // Attitude Evaluation Modal States
  const [attitudeModalOpen, setAttitudeModalOpen] = useState(false);
  const [attitudeAppraisal, setAttitudeAppraisal] = useState(null);
  const [attitudeRatings, setAttitudeRatings] = useState({});
  const [attitudeRemarks, setAttitudeRemarks] = useState("");
  const [attitudeSaving, setAttitudeSaving] = useState(false);

  const handleOpenAttitudeModal = (app) => {
    setAttitudeAppraisal(app);
    const existing = app.attitudeEvaluation || app.attitudeForm || {};
    const isPrincipalOrHR = userRole === "Principal" || userRole === "HR" || userRole === "Admin";
    const defaultRatings = isPrincipalOrHR
      ? (existing.principalRatings || existing.hodRatings || existing.ratings || {})
      : (existing.hodRatings || existing.ratings || {});
    setAttitudeRatings({ ...defaultRatings });
    setAttitudeRemarks(existing.remarks || "");
    setAttitudeModalOpen(true);
  };

  const handleSetRating = (qId, value) => {
    setAttitudeRatings(prev => ({
      ...prev,
      [qId]: Number(value)
    }));
  };

  const handleSetAllRatings = (val) => {
    const activeQuestions = getAttitudeQuestions(attitudeAppraisal);
    const updated = {};
    activeQuestions.forEach(q => {
      updated[q.id] = val;
    });
    setAttitudeRatings(updated);
  };

  const handleSaveAttitudeEvaluation = async () => {
    if (!attitudeAppraisal) return;
    setAttitudeSaving(true);
    try {
      const isPrincipalOrHR = userRole === "Principal" || userRole === "HR" || userRole === "Admin";
      const activeQuestions = getAttitudeQuestions(attitudeAppraisal);
      const totalScore = Object.values(attitudeRatings).reduce((sum, v) => sum + (Number(v) || 0), 0);
      const maxScore = activeQuestions.length * 5;
      const evaluatedCount = Object.keys(attitudeRatings).filter(k => (Number(attitudeRatings[k]) || 0) > 0).length;
      const percentage = maxScore > 0 ? ((totalScore / maxScore) * 100).toFixed(1) : "0.0";
      const average = evaluatedCount > 0 ? (totalScore / evaluatedCount).toFixed(2) : "0.0";

      const isNonTeaching = attitudeAppraisal.formType === "non_teaching" || attitudeAppraisal.collectionName === "non_teaching_appraisals";

      const evalPayload = {
        ...(attitudeAppraisal.attitudeEvaluation || {}),
        formTitle: isNonTeaching 
          ? "Non-Teaching Attitude Form" 
          : attitudeAppraisal.formType === "hod" 
          ? "A.2 College — Head of Department (HoD)" 
          : "Teacher Attitude Evaluation",
        subtitle: isNonTeaching 
          ? "CKGEI — Non-Teaching Staff Evaluation Questionnaire" 
          : attitudeAppraisal.formType === "hod" 
          ? "CKGEI — Coordinator / HoD Evaluation Questionnaire" 
          : "CKGEI — Teacher Evaluation Questionnaire",
        ratings: attitudeRatings,
        principalRatings: isPrincipalOrHR ? attitudeRatings : (attitudeAppraisal.attitudeEvaluation?.principalRatings || {}),
        hodRatings: attitudeAppraisal.attitudeEvaluation?.hodRatings || (!isPrincipalOrHR ? attitudeRatings : attitudeAppraisal.attitudeEvaluation?.ratings) || {},
        remarks: attitudeRemarks.trim(),
        totalScore,
        maxScore,
        percentage,
        average,
        evaluatedCount,
        totalQuestions: activeQuestions.length,
        evaluatedAt: new Date().toISOString(),
        evaluatedBy: currentUser?.displayName || currentUser?.email || (isPrincipalOrHR ? "Principal" : "Reviewer"),
        evaluatedByRole: userRole || (isPrincipalOrHR ? "Principal" : "Reviewer")
      };

      const targetColl = attitudeAppraisal.formType === "hod"
        ? "hod_appraisals"
        : (attitudeAppraisal.formType === "non_teaching" || attitudeAppraisal.collectionName === "non_teaching_appraisals")
        ? "non_teaching_appraisals"
        : "faculty_appraisals";

      await updateDoc(doc(db, targetColl, attitudeAppraisal.id), {
        attitudeEvaluation: evalPayload,
        attitudeForm: evalPayload
      });

      // Update state locally
      setAppraisals(prev => prev.map(a => a.id === attitudeAppraisal.id ? { ...a, attitudeEvaluation: evalPayload, attitudeForm: evalPayload } : a));
      if (selectedAppraisal?.id === attitudeAppraisal.id) {
        setSelectedAppraisal(prev => ({
          ...prev,
          attitudeEvaluation: evalPayload,
          attitudeForm: evalPayload
        }));
      }

      showToast("Attitude Evaluation saved successfully!", "success");
      setAttitudeModalOpen(false);
    } catch (err) {
      console.error("Failed to save attitude evaluation:", err);
      showToast("Failed to save evaluation. Please try again.", "error");
    } finally {
      setAttitudeSaving(false);
    }
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
    if (location.state?.statusFilter) {
      setStatusFilter(location.state.statusFilter);
    }
  }, [location.state]);

  useEffect(() => {
    const docRef = doc(db, "appraisal_config", "form_fields");
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setCustomFieldsConfig(snap.data().fields || []);
      }
    });
    return unsub;
  }, []);

  const NON_TEACHING_EVALUATION_CATEGORIES = [
    { id: 1, text: "Perceptive to the needs of the student, faculty and institution" },
    { id: 2, text: "Responds positively to any instruction, guidance, correction and discipline given by Superiors" },
    { id: 3, text: "Cooperation towards organizing programs in the department/Institute" },
    { id: 4, text: "Attendance, Discipline, Punctuality and Completion of work on schedule" },
    { id: 5, text: "Maintenance of Files / Records / Ambiance of the Department / Laboratory" },
    { id: 6, text: "Ability and willingness to take up additional load in times of requirements" },
    { id: 7, text: "Contribution towards admission" },
    { id: 8, text: "IIY / Improve knowledge (Theory & Hands on Training) on all aspects of the job to perform satisfactorily" },
    { id: 9, text: "The ability and ease in expressing ideas, opinions and information clearly and accurately" },
    { id: 10, text: "Special efforts taken / Contributions for the development of the Institution / Department" }
  ];

  const calculateNonTeachingGrade = (totalMarks) => {
    if (totalMarks > 89) return "A";
    if (totalMarks >= 70) return "B";
    if (totalMarks >= 50) return "C";
    return "D";
  };

  // Fetch all appraisal records (Teaching, Non-Teaching, HOD)
  useEffect(() => {
    if (!currentUser) return;
    let facultyList = [];
    let nonTeachingList = [];
    let hodList = [];

    const unsubFaculty = onSnapshot(collection(db, "faculty_appraisals"), (snap) => {
      facultyList = snap.docs.map((d) => ({ id: d.id, formType: "faculty", facultyName: d.data().facultyName || d.data().name, ...d.data() }));
      setAppraisals([...facultyList, ...nonTeachingList, ...hodList]);
      setLoading(false);
    });

    const unsubNonTeaching = onSnapshot(collection(db, "non_teaching_appraisals"), (snap) => {
      nonTeachingList = snap.docs.map((d) => {
        const data = d.data() || {};
        const dept = String(data.department || data.formData?.department || "").toLowerCase().trim();
        const normDept = dept.replace(/[^a-z0-9]/g, '');
        const isAdministration = normDept === "administration" || normDept === "admin" || (normDept.includes("administration") && !normDept.includes("business"));

        let effectiveStatus = data.status;
        if (isAdministration && effectiveStatus === "Submitted") {
          effectiveStatus = "HOD_Approved";
          try {
            updateDoc(doc(db, "non_teaching_appraisals", d.id), {
              status: "HOD_Approved",
              coordinatorApproved: true,
              "hodReview.comments": "Forwarded directly to Principal for review (Administration Department - Coordinator Approved).",
              "hodReview.grade": "Good",
              "hodReview.reviewedBy": "Administration Coordinator",
              "hodReview.reviewedAt": new Date().toISOString()
            }).catch(() => {});
          } catch (e) {}
        }

        return {
          id: d.id,
          formType: "non_teaching",
          facultyName: data.staffName || data.name,
          ...data,
          status: effectiveStatus
        };
      });
      setAppraisals([...facultyList, ...nonTeachingList, ...hodList]);
      setLoading(false);
    });

    const unsubHOD = onSnapshot(collection(db, "hod_appraisals"), (snap) => {
      hodList = snap.docs.map((d) => {
        const data = d.data();
        const fData = data.formData || {};
        return {
          id: d.id,
          formType: "hod",
          facultyName: fData.hodName || data.hodName || data.name || "Head of Department",
          facultyEmail: fData.hodEmail || data.hodEmail || data.email || "",
          department: fData.department || data.department || "",
          designation: fData.designation || data.designation || "Head of the Department",
          ...data
        };
      });
      setAppraisals([...facultyList, ...nonTeachingList, ...hodList]);
      setLoading(false);
    });

    return () => {
      unsubFaculty();
      unsubNonTeaching();
      unsubHOD();
    };
  }, [currentUser]);

  const filteredAppraisals = appraisals.filter((app) => {
    const nameMatch = (app.facultyName || app.hodName || app.staffName || "").toLowerCase().includes(searchTerm.toLowerCase());
    const emailMatch = (app.facultyEmail || app.hodEmail || app.staffEmail || app.email || "").toLowerCase().includes(searchTerm.toLowerCase());

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

    // Initialize HOD faculty criteria scores map
    const initialHodScores = {};
    if (app.hodReview?.hodScores) {
      Object.assign(initialHodScores, app.hodReview.hodScores);
    } else if (app.autoScore?.breakdown) {
      const bd = app.autoScore.breakdown;
      const allRows = [...(bd.part1Rows || []), ...(bd.part2Rows || [])];
      allRows.forEach((r) => {
        initialHodScores[r.id] = r.scored ?? 0;
      });
    }
    setHodFacultyScoresMap(initialHodScores);

    // Initialize Principal faculty criteria scores map (defaults to HOD scores)
    const initialPrincipalScores = {};
    if (app.principalReview?.principalScores) {
      Object.assign(initialPrincipalScores, app.principalReview.principalScores);
    } else {
      Object.assign(initialPrincipalScores, initialHodScores);
    }
    setPrincipalFacultyScoresMap(initialPrincipalScores);

    // Initialize Principal HOD KRA scores map
    const k1 = app.formData?.kra1 || app.kra1 || {};
    const k5 = app.formData?.kra5 || app.kra5 || {};
    const initHodKraScores = {
      kra1: app.principalReview?.kraScores?.kra1 ?? app.kraScores?.kra1 ?? k1.score ?? 0,
      kra2: app.principalReview?.kraScores?.kra2 ?? app.kraScores?.kra2 ?? 0,
      kra3: app.principalReview?.kraScores?.kra3 ?? app.kraScores?.kra3 ?? 0,
      kra4: app.principalReview?.kraScores?.kra4 ?? app.kraScores?.kra4 ?? 0,
      kra5: app.principalReview?.kraScores?.kra5 ?? app.kraScores?.kra5 ?? k5.score ?? 0
    };
    setPrincipalHodScoresMap(initHodKraScores);

    const bd = app.autoScore?.breakdown;
    const allRows = bd ? [...(bd.part1Rows || []), ...(bd.part2Rows || [])] : [];
    const initPrincipalTotal = allRows.length > 0
      ? allRows.reduce((a, r) => a + (Number(initialPrincipalScores[r.id] ?? initialHodScores[r.id] ?? r.scored) || 0), 0)
      : (app.formType === "hod" ? (app.principalReview?.finalRating ?? app.totalScore ?? Object.values(initHodKraScores).reduce((a, b) => a + Number(b || 0), 0)) : "");

    // Initialize non-teaching performance evaluation rating states
    const existingEval = app.performanceEvaluation;
    if (existingEval?.marks) {
      setNonTeachingEvalMarks(existingEval.marks);
      setNonTeachingSpecificComment(existingEval.specificComments || app.hodReview?.comments || "");
      setNonTeachingRecommendation(existingEval.recommendation || "His / Her contribution to be appreciated and recommended");
      setNonTeachingIncrementGrade(existingEval.incrementGrade || "A");
    } else {
      setNonTeachingEvalMarks({ 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 8: 10, 9: 10, 10: 10 });
      setNonTeachingSpecificComment(app.hodReview?.comments || "");
      setNonTeachingRecommendation("His / Her contribution to be appreciated and recommended");
      setNonTeachingIncrementGrade("A");
    }

    if (userRole === "HOD") {
      setComments(app.hodReview?.comments || "");
      setEvaluationGrade(app.hodReview?.grade || "Good");
    } else if (userRole === "Principal" || userRole === "Admin") {
      setComments(app.principalReview?.comments || "");
      setEvaluationGrade(app.principalReview?.grade || "Good");
      const existingRating = app.principalReview?.finalRating ?? app.principalReview?.rating;
      setFinalRating(
        existingRating !== undefined && existingRating !== null && existingRating !== ""
          ? String(existingRating)
          : (initPrincipalTotal !== "" ? String(initPrincipalTotal) : "")
      );
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
    const isNonTeaching = selectedAppraisal.formType === "non_teaching" || selectedAppraisal.collectionName === "non_teaching_appraisals";

    setActioning(true);

    let totalScore = 0;
    let derivedGrade = evaluationGrade;

    if (isNonTeaching) {
      totalScore = Object.values(nonTeachingEvalMarks).reduce((sum, v) => sum + (Number(v) || 0), 0);
      derivedGrade = calculateNonTeachingGrade(totalScore);
    }

    const updatePayload = {
      status: newStatus,
      updatedAt: new Date().toISOString()
    };

    if (userRole === "HOD") {
      updatePayload.hodReview = {
        comments: isNonTeaching
          ? (nonTeachingSpecificComment.trim() || (newStatus === "HOD_Approved" ? "Reviewed by HOD" : ""))
          : (comments.trim() || (newStatus === "HOD_Approved" ? "Reviewed by HOD" : "")),
        grade: isNonTeaching ? derivedGrade : evaluationGrade,
        reviewedBy: currentUser?.email || "",
        reviewedAt: new Date().toISOString()
      };
    } else if (userRole === "Principal" || userRole === "Admin") {
      updatePayload.principalReview = {
        comments: comments || "Approved by Principal",
        grade: isNonTeaching ? derivedGrade : evaluationGrade,
        finalRating: finalRating !== "" ? finalRating : (selectedAppraisal.principalReview?.finalRating ?? ""),
        checkboxes: principalCheckboxes,
        reviewedBy: currentUser?.email || "",
        reviewedAt: new Date().toISOString()
      };
      if (selectedAppraisal.hodReview) {
        updatePayload.hodReview = selectedAppraisal.hodReview;
      }
      if (selectedAppraisal.formType === "hod") {
        updatePayload.principalReview.kraScores = principalHodScoresMap;
        updatePayload.principalReview.principalTotalScore = finalRating !== "" 
          ? Number(finalRating) 
          : Object.values(principalHodScoresMap).reduce((a, b) => a + (Number(b) || 0), 0);
        if (!updatePayload.principalReview.finalRating) {
          updatePayload.principalReview.finalRating = String(updatePayload.principalReview.principalTotalScore);
        }
      }
    }

    if (!isNonTeaching && selectedAppraisal.autoScore?.breakdown) {
      const bd = selectedAppraisal.autoScore.breakdown;
      const p1 = bd.part1Rows || [];
      const p2 = bd.part2Rows || [];
      const p1HodT = p1.reduce((sum, r) => sum + (Number(hodFacultyScoresMap[r.id] ?? r.scored) || 0), 0);
      const p2HodT = p2.reduce((sum, r) => sum + (Number(hodFacultyScoresMap[r.id] ?? r.scored) || 0), 0);
      const gHodT = p1HodT + p2HodT;

      const p1PrincipalT = p1.reduce((sum, r) => sum + (Number(principalFacultyScoresMap[r.id] ?? hodFacultyScoresMap[r.id] ?? r.scored) || 0), 0);
      const p2PrincipalT = p2.reduce((sum, r) => sum + (Number(principalFacultyScoresMap[r.id] ?? hodFacultyScoresMap[r.id] ?? r.scored) || 0), 0);
      const gPrincipalT = p1PrincipalT + p2PrincipalT;

      if (!updatePayload.hodReview) {
        updatePayload.hodReview = selectedAppraisal.hodReview || {};
      }
      updatePayload.hodReview.hodScores = hodFacultyScoresMap;
      updatePayload.hodReview.hodPart1Total = p1HodT;
      updatePayload.hodReview.hodPart2Total = p2HodT;
      updatePayload.hodReview.hodTotalScore = gHodT;

      if (!updatePayload.principalReview) {
        updatePayload.principalReview = selectedAppraisal.principalReview || {};
      }
      updatePayload.principalReview.principalScores = principalFacultyScoresMap;
      updatePayload.principalReview.principalPart1Total = p1PrincipalT;
      updatePayload.principalReview.principalPart2Total = p2PrincipalT;
      updatePayload.principalReview.principalTotalScore = gPrincipalT;
      if (!updatePayload.principalReview.finalRating) {
        updatePayload.principalReview.finalRating = finalRating !== "" ? String(finalRating) : String(gPrincipalT);
      }
    }

    if (isNonTeaching) {
      updatePayload.performanceEvaluation = {
        marks: nonTeachingEvalMarks,
        totalMarks: totalScore,
        gradeSecured: derivedGrade,
        specificComments: nonTeachingSpecificComment.trim(),
        recommendation: nonTeachingRecommendation,
        incrementGrade: nonTeachingIncrementGrade,
        reviewedBy: currentUser?.email || "",
        reviewedAt: new Date().toISOString()
      };
    }

    try {
      const targetColl = isNonTeaching ? "non_teaching_appraisals" : selectedAppraisal.formType === "hod" ? "hod_appraisals" : "faculty_appraisals";
      await updateDoc(doc(db, targetColl, selectedAppraisal.id), updatePayload);
      const isAlreadyApproved = selectedAppraisal.status === "Approved" && newStatus === "Approved";
      showToast(isAlreadyApproved ? "Appraisal marks updated successfully!" : `Appraisal successfully updated to: ${newStatus.replace("_", " ")}`, "success");
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

    const isNonTeaching = selectedAppraisal.formType === "non_teaching" || selectedAppraisal.collectionName === "non_teaching_appraisals";

    const updatePayload = {
      status: "Returned",
      updatedAt: new Date().toISOString(),
      hodReview: userRole === "HOD" ? {
        comments: correctionComments,
        reviewedBy: currentUser?.email || "",
        reviewedAt: new Date().toISOString()
      } : selectedAppraisal.hodReview,
      principalReview: (userRole === "Principal" || userRole === "Admin") ? {
        comments: correctionComments,
        reviewedBy: currentUser?.email || "",
        reviewedAt: new Date().toISOString()
      } : selectedAppraisal.principalReview
    };

    if (isNonTeaching) {
      const totalScore = Object.values(nonTeachingEvalMarks).reduce((sum, v) => sum + (Number(v) || 0), 0);
      const derivedGrade = calculateNonTeachingGrade(totalScore);
      updatePayload.performanceEvaluation = {
        marks: nonTeachingEvalMarks,
        totalMarks: totalScore,
        gradeSecured: derivedGrade,
        specificComments: nonTeachingSpecificComment.trim(),
        recommendation: nonTeachingRecommendation,
        incrementGrade: nonTeachingIncrementGrade,
        reviewedBy: currentUser?.email || "",
        reviewedAt: new Date().toISOString()
      };
    }

    try {
      const targetColl = isNonTeaching ? "non_teaching_appraisals" : selectedAppraisal.formType === "hod" ? "hod_appraisals" : "faculty_appraisals";
      await updateDoc(doc(db, targetColl, selectedAppraisal.id), updatePayload);
      showToast("Appraisal returned to staff for correction.", "success");
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
    if (app.formType === "hod") {
      const data = app.formData || app;
      const doc = new jsPDF("p", "pt", "a4");

      doc.setFont("Times", "bold");
      doc.setFontSize(14);
      doc.text("CK COLLEGE OF ENGINEERING & TECHNOLOGY, CUDDALORE - 607 003", 30, 45);
      doc.setFontSize(10);
      doc.setFont("Times", "normal");
      doc.text("An ISO 9001:2015 Certified Institution", 220, 60);
      doc.setFont("Times", "bold");
      doc.setFontSize(12);
      doc.text(`HEAD OF THE DEPARTMENT'S PERFORMANCE APPRAISAL (${app.academicYear || "2024-2025"})`, 90, 80);

      doc.setDrawColor(200, 200, 200);
      doc.line(30, 95, 565, 95);

      // Profile Details Grid
      doc.setFont("Times", "bold");
      doc.setFontSize(10);
      doc.text("1. GENERAL INFORMATION OF HOD", 30, 115);

      const info = [
        ["HOD Name:", data.hodName || app.facultyName || "", "Department:", data.department || app.department || ""],
        ["Designation:", data.designation || "Head of the Department", "Date of Joining:", data.doj || "-"],
        ["Qualification:", data.qualification || "-", "Academic Session:", app.academicYear || ""],
        ["Email ID:", app.hodEmail || app.facultyEmail || "-", "Status:", app.status || ""]
      ];

      doc.autoTable({
        startY: 125,
        margin: { left: 30, right: 30 },
        body: info,
        theme: "plain",
        styles: { font: "Times", fontSize: 9, cellPadding: 4 },
        columnStyles: { 0: { fontStyle: "bold", width: 90 }, 2: { fontStyle: "bold", width: 90 } }
      });

      // 5 KRAs Summary Table
      doc.setFont("Times", "bold");
      doc.text("2. KEY RESULT AREAS (KRA 1 TO 5) SCORE SUMMARY", 30, doc.lastAutoTable.finalY + 25);

      const k1 = data.kra1 || app.kra1 || {};
      const k5 = data.kra5 || app.kra5 || {};
      const s1 = app.kraScores?.kra1 ?? k1.score ?? 0;
      const s2 = app.kraScores?.kra2 ?? 0;
      const s3 = app.kraScores?.kra3 ?? 0;
      const s4 = app.kraScores?.kra4 ?? 0;
      const s5 = app.kraScores?.kra5 ?? k5.score ?? 0;
      const st = app.totalScore ?? (s1 + s2 + s3 + s4 + s5);

      const ps1 = app.principalReview?.kraScores?.kra1 ?? s1;
      const ps2 = app.principalReview?.kraScores?.kra2 ?? s2;
      const ps3 = app.principalReview?.kraScores?.kra3 ?? s3;
      const ps4 = app.principalReview?.kraScores?.kra4 ?? s4;
      const ps5 = app.principalReview?.kraScores?.kra5 ?? s5;
      const pst = app.principalReview?.finalRating ? Number(app.principalReview.finalRating) : (ps1 + ps2 + ps3 + ps4 + ps5);

      const kraData = [
        ["KRA I: Department Academic Improvement", "30", String(s1), String(ps1)],
        ["KRA II: Department Student Centric Activities", "25", String(s2), String(ps2)],
        ["KRA III: Faculty Enrichment Efforts for Department", "20", String(s3), String(ps3)],
        ["KRA IV: Significant Contribution towards Dept / Personal Dev.", "5", String(s4), String(ps4)],
        ["KRA V: Academic Excellence and Self Development (IIY)", "20", String(s5), String(ps5)],
        ["Grand Total Score", "100", String(st), String(pst)]
      ];

      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 35,
        margin: { left: 30, right: 30 },
        head: [["Key Result Area (KRA) Particulars", "Max Marks", "Self Score", "Principal Score"]],
        body: kraData,
        theme: "striped",
        headStyles: { fillColor: [18, 12, 122], textColor: 255, font: "Times", fontStyle: "bold", fontSize: 9 },
        styles: { font: "Times", fontSize: 9 }
      });

      // Evaluation Sheet
      doc.addPage();
      doc.setFont("Times", "bold");
      doc.setFontSize(12);
      doc.text("PRINCIPAL EVALUATION & APPROVAL SHEET", 30, 45);
      doc.line(30, 55, 565, 55);

      const cb = app.principalReview?.checkboxes || {};
      const cbText = [
        cb.appreciated ? "[x] His / Her contribution to be appreciated and recommended" : "[ ] His / Her contribution to be appreciated and recommended",
        cb.satisfactory ? "[x] Satisfactory performance" : "[ ] Satisfactory performance",
        cb.underutilized ? "[x] Potential underutilized" : "[ ] Potential underutilized",
        cb.counseling ? "[x] Counseling is required" : "[ ] Counseling is required",
        cb.improvementDesired ? "[x] Performance improvement is desired / to be warned" : "[ ] Performance improvement is desired / to be warned"
      ].join("\n");

      const principalInfo = [
        ["Final Rating / Total Score:", String(pst)],
        ["Recommended Appraisal Grade:", app.principalReview?.grade || "Pending Approval"],
        ["Principal Remarks / Checkboxes:", cbText],
        ["Review Comments:", app.principalReview?.comments || "N/A"],
        ["Approved / Reviewed By:", app.principalReview?.reviewedBy || "-"],
        ["Date:", app.principalReview?.reviewedAt ? new Date(app.principalReview.reviewedAt).toLocaleDateString() : "-"]
      ];

      doc.autoTable({
        startY: 75,
        margin: { left: 30, right: 30 },
        body: principalInfo,
        theme: "plain",
        styles: { font: "Times", fontSize: 9, cellPadding: 5 },
        columnStyles: { 0: { fontStyle: "bold", width: 140 } }
      });

      const finalY = doc.lastAutoTable.finalY + 70;
      doc.setFont("Times", "bold");
      doc.text("Digital Signature of HoD", 30, finalY);
      doc.text("Signature of Principal", 410, finalY);

      doc.save(`HOD_Appraisal_${(app.facultyName || app.hodName || "HOD").replace(/\s+/g, "_")}_${app.academicYear || "2024-2025"}.pdf`);
      return;
    }

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
      ["Age:", data.age || "", "DOJ School:", data.dojCollege || ""],
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
      [`Teaching at ${getSchoolShortName(selectedAppraisal.institution || selectedAppraisal.formData?.institution)}`, data.experience?.teachingCKCET || data.expCKCET || data.expCKSPE || "0"],
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
      ["Final Rating:", app.principalReview?.finalRating ? String(app.principalReview.finalRating) : "-"],
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
      <div className="w-full pb-8">

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
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  selectedAppraisal.formType === "hod"
                    ? "bg-purple-500/20 text-purple-700 border border-purple-500/30"
                    : selectedAppraisal.formType === "non_teaching"
                    ? "bg-teal-500/20 text-teal-700 border border-teal-500/30"
                    : "bg-indigo-500/20 text-indigo-700 border border-indigo-500/30"
                }`}>
                  {selectedAppraisal.formType === "hod" ? "HOD Appraisal" : selectedAppraisal.formType === "non_teaching" ? "Non-Teaching Appraisal" : "Faculty Appraisal"}
                </span>
                <button
                  onClick={() => handlePrintPDF(selectedAppraisal)}
                  className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Printer size={14} /> Print PDF
                </button>
                <button
                  onClick={() => handleOpenAttitudeModal(selectedAppraisal)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    (selectedAppraisal.attitudeSubmittedToPrincipal === true || selectedAppraisal.attitudeEvaluation?.submittedToPrincipal === true)
                      ? "bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700"
                      : (selectedAppraisal.attitudeDraft || selectedAppraisal.attitudeEvaluation?.isDraft)
                      ? "bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700"
                      : "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700"
                  }`}
                  title={
                    (selectedAppraisal.attitudeSubmittedToPrincipal === true || selectedAppraisal.attitudeEvaluation?.submittedToPrincipal === true)
                      ? "Attitude Form (Submitted by HOD)"
                      : (selectedAppraisal.attitudeDraft || selectedAppraisal.attitudeEvaluation?.isDraft)
                      ? "Attitude Form (Draft on HOD end - Not yet submitted to Principal)"
                      : "Attitude Form"
                  }
                >
                  <Award size={14} /> Attitude Form
                  {(selectedAppraisal.attitudeSubmittedToPrincipal === true || selectedAppraisal.attitudeEvaluation?.submittedToPrincipal === true) ? (
                    <span className="ml-1 bg-teal-200 text-teal-900 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                      {selectedAppraisal.attitudeEvaluation?.totalScore ?? selectedAppraisal.attitudeForm?.totalScore}/{selectedAppraisal.attitudeEvaluation?.maxScore || selectedAppraisal.attitudeForm?.maxScore || (getAttitudeQuestions(selectedAppraisal).length * 5)}
                    </span>
                  ) : (selectedAppraisal.attitudeDraft || selectedAppraisal.attitudeEvaluation?.isDraft) ? (
                    <span className="ml-1 bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                      Draft (HOD)
                    </span>
                  ) : null}
                </button>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${selectedAppraisal.status === "Approved" ? "bg-emerald-500/20 text-emerald-700 border border-emerald-500/30" :
                    selectedAppraisal.status === "HOD_Approved" ? "bg-blue-500/20 text-blue-700 border border-blue-500/30" :
                      selectedAppraisal.status === "Submitted" ? "bg-amber-500/20 text-amber-700 border border-amber-500/30" :
                        selectedAppraisal.status === "Returned" ? "bg-rose-500/20 text-rose-700 border border-rose-500/30" :
                          "bg-zinc-500/20 text-zinc-700 border border-zinc-500/30"
                  }`}>
                  {selectedAppraisal.status === "HOD_Approved" ? "COORDINATOR APPROVED" : selectedAppraisal.status.replace("_", " ")}
                </span>
                {(userRole === "Principal" || userRole === "Admin") && selectedAppraisal.status === "Approved" && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                    Principal Editable
                  </span>
                )}
              </div>
            </div>

            {/* Appraisal Details Content */}
            <div className="p-4 sm:p-6 md:p-8 grid grid-cols-1 xl:grid-cols-12 gap-8">

              {/* Left Column: Form Details & Tables (8-9 cols wide on xl/2xl) */}
              <div className="xl:col-span-8 2xl:col-span-9 space-y-8">

                {/* Custom internal detail tabs */}
                {(() => {
                  const hodSubTabs = [
                    { id: 1, name: "1. Profile & Info" },
                    { id: 2, name: "2. KRA Performance (1-5)" },
                    { id: 3, name: "3. Scores & Declaration" }
                  ];

                  const nonTeachingSubTabs = [
                    { id: 1, name: "1. Staff Profile & Experience" },
                    { id: 2, name: "2. Roles & Leaves" },
                    { id: 3, name: "3. Work Habits & Grievances" },
                    { id: 4, name: "4. IIY & Admissions" }
                  ];

                  const currentSubTabs = selectedAppraisal?.formType === "hod"
                    ? hodSubTabs
                    : selectedAppraisal?.formType === "non_teaching"
                    ? nonTeachingSubTabs
                    : appraisalTabs;

                  return (
                    <div className="flex border-b border-zinc-100 overflow-x-auto gap-2 no-scrollbar mb-4">
                      {currentSubTabs.map((subTab) => (
                        <button
                          key={subTab.id}
                          onClick={() => setActiveDetailsTab(subTab.id)}
                          className={`pb-3 px-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${activeDetailsTab === subTab.id
                              ? "border-indigo-600 text-indigo-600"
                              : "border-transparent text-zinc-500 hover:text-zinc-700"
                            }`}
                        >
                          {subTab.name}
                        </button>
                      ))}
                    </div>
                  );
                })()}

                {/* ── HOD APPRAISAL FORM REVIEW VIEWS ── */}
                {selectedAppraisal?.formType === "hod" && (
                  <>
                    {/* Sub-Tab 1: Profile & Info */}
                    {activeDetailsTab === 1 && (() => {
                      const fData = selectedAppraisal.formData || {};
                      const hodName = fData.hodName || selectedAppraisal.hodName || selectedAppraisal.facultyName || selectedAppraisal.name || "Head of Department";
                      const department = fData.department || selectedAppraisal.department || "-";
                      const designation = fData.designation || selectedAppraisal.designation || "Head of the Department";
                      const doj = fData.doj || selectedAppraisal.doj || "-";
                      const qualification = fData.qualification || selectedAppraisal.qualification || "-";
                      const email = fData.hodEmail || selectedAppraisal.hodEmail || selectedAppraisal.email || selectedAppraisal.facultyEmail || "-";
                      const facultyId = selectedAppraisal.facultyId || selectedAppraisal.staffId || selectedAppraisal.employeeId || selectedAppraisal.uid || "-";
                      const academicYear = selectedAppraisal.academicYear || "2024-2025";
                      const status = selectedAppraisal.status || "Draft";
                      const submittedAt = selectedAppraisal.submittedAt || selectedAppraisal.declarationDate || selectedAppraisal.updatedAt;
                      const declaration = selectedAppraisal.declaration === true;
                      const totalScore = selectedAppraisal.totalScore || 0;

                      return (
                        <div className="space-y-6 animate-fadeIn">
                          {/* Profile Overview Card */}
                          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3">
                              <div className="flex items-center gap-2">
                                <User className="text-[#120c7a]" size={18} />
                                <span className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                                  General Information of HoD
                                </span>
                              </div>
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                                status === "Approved" ? "bg-emerald-100 text-emerald-800 border-emerald-300" :
                                status === "HOD_Approved" ? "bg-blue-100 text-blue-800 border-blue-300" :
                                status === "Submitted" ? "bg-amber-100 text-amber-800 border-amber-300" :
                                status === "Returned" ? "bg-rose-100 text-rose-800 border-rose-300" :
                                "bg-zinc-100 text-zinc-700 border-zinc-200"
                              }`}>
                                {status === "HOD_Approved" ? "Coordinator Approved" : status.replace("_", " ")}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
                              <div className="bg-white p-3 rounded-2xl border border-zinc-150">
                                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Name of the HoD</span>
                                <span className="font-extrabold text-slate-850 text-sm">{hodName}</span>
                              </div>
                              <div className="bg-white p-3 rounded-2xl border border-zinc-150">
                                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Department</span>
                                <span className="font-extrabold text-slate-850">{department}</span>
                              </div>
                              <div className="bg-white p-3 rounded-2xl border border-zinc-150">
                                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Designation</span>
                                <span className="font-extrabold text-slate-850">{designation}</span>
                              </div>
                              <div className="bg-white p-3 rounded-2xl border border-zinc-150">
                                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Date of Joining</span>
                                <span className="font-bold text-slate-800">{doj}</span>
                              </div>
                              <div className="bg-white p-3 rounded-2xl border border-zinc-150">
                                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Qualification</span>
                                <span className="font-bold text-slate-800">{qualification}</span>
                              </div>
                              <div className="bg-white p-3 rounded-2xl border border-zinc-150">
                                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Official Email</span>
                                <span className="font-bold text-slate-800 break-all">{email}</span>
                              </div>
                            </div>
                          </div>

                          {/* Digital Declaration Notice */}
                          <div className={`p-4 rounded-2xl border flex items-start gap-3 ${declaration ? "bg-emerald-50/70 border-emerald-200 text-emerald-950" : "bg-amber-50/70 border-amber-200 text-amber-950"}`}>
                            {declaration ? (
                              <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                            )}
                            <div className="space-y-0.5 text-xs">
                              <span className="font-extrabold uppercase tracking-wide block">
                                {declaration ? "Digitally Certified Declaration" : "Declaration Pending"}
                              </span>
                              <p className="font-medium text-[11px] leading-relaxed opacity-90">
                                "I hereby declare that the particulars furnished above in my HOD Performance Appraisal for the Academic Year <strong>{academicYear}</strong> are true, correct, and complete to the best of my knowledge and belief."
                              </p>
                              <div className="pt-1 text-[10px] font-bold opacity-80">
                                Digital Signature: <span className="underline">{hodName}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Sub-Tab 2: KRA Performance (1-5) */}
                    {activeDetailsTab === 2 && (() => {
                      const fData = selectedAppraisal.formData || {};

                      // KRA 1
                      const k1 = fData.kra1 || selectedAppraisal.kra1 || {};
                      const k1Score = selectedAppraisal.kraScores?.kra1 ?? k1.score ?? 0;
                      const k1TierLabels = {
                        "65_above": "≥ 65% Pass (30 Marks)",
                        "50_64": "50 – 64% Pass (25 Marks)",
                        "40_49": "40 – 49% Pass (20 Marks)",
                        "30_39": "30 – 39% Pass (12 Marks)",
                        "21_29": "21 – 29% Pass (8 Marks)",
                        "below_20": "< 20% Pass (0 Marks)"
                      };
                      const getK1AutoLabel = (p) => {
                        const num = parseFloat(p);
                        if (isNaN(num)) return null;
                        if (num >= 65) return "≥ 65% Pass (30 Marks)";
                        if (num >= 50) return "50 – 64% Pass (25 Marks)";
                        if (num >= 40) return "40 – 49% Pass (20 Marks)";
                        if (num >= 30) return "30 – 39% Pass (12 Marks)";
                        if (num >= 21) return "21 – 29% Pass (8 Marks)";
                        return "< 20% Pass (0 Marks)";
                      };
                      const k1Proofs = extractProofList(k1.proof || k1.proofs);

                      // KRA 2
                      const k2 = fData.kra2 || selectedAppraisal.kra2 || {};
                      const k2Score = selectedAppraisal.kraScores?.kra2 ?? 0;
                      const k2Items = [
                        { key: "coCurricular", label: "1. Ensured Minimum of 60% Student's Participation in Co-curricular Activities (Student Innovation Club) and Remarkable Achievements" },
                        { key: "ipkt", label: "2. Industrial Practical Knowledge Training (IPKT) (2/Semester per Class)" },
                        { key: "guestLectures", label: "3. Industrial Oriented Guest Lecture – 3 /Semester" },
                        { key: "valueAdded", label: "4. Conduction of Value Added Course (min. of 4 days duration) – 1/Year" },
                        { key: "softSkillsPlacement", label: "5. Soft Skill Training / Career guidance / GATE awareness / Life Skill Program / Placement Special Efforts" }
                      ];

                      // KRA 3
                      const k3 = fData.kra3 || selectedAppraisal.kra3 || {};
                      const k3Score = selectedAppraisal.kraScores?.kra3 ?? 0;
                      const k3Items = [
                        { key: "fundingProposal", label: "1. Submission of Major funding proposal – 1 per Year" },
                        { key: "testingConsultancy", label: "2. Revenue generation through Testing & Consultancy / Other sources – as per Target" },
                        { key: "onlineCourse", label: "3. Online Course – 1 per faculty / Semester" },
                        { key: "publications", label: "4. Publications of Research Papers in reputed Journal / International Conference - 2 per faculty / Semester" }
                      ];
                      const k3TierLabels = {
                        "100": "100% Target Met (5 Marks)",
                        "80-99": "80% – 99% Target Met (2.5 Marks)",
                        "80_99": "80% – 99% Target Met (2.5 Marks)",
                        "below": "Below 80% Target (0 Marks)"
                      };

                      // KRA 4
                      const k4 = Array.isArray(fData.kra4 || selectedAppraisal.kra4) 
                        ? (fData.kra4 || selectedAppraisal.kra4) 
                        : (fData.kra4 || selectedAppraisal.kra4 ? Object.values(fData.kra4 || selectedAppraisal.kra4) : []);
                      const k4Score = selectedAppraisal.kraScores?.kra4 ?? 0;

                      // KRA 5
                      const k5 = fData.kra5 || selectedAppraisal.kra5 || {};
                      const k5Score = selectedAppraisal.kraScores?.kra5 ?? k5.score ?? 0;
                      const k5ResultTierLabels = {
                        "90_above": "≥ 90% Pass (10 Marks)",
                        "81_90": "81% – 90% Pass (8 Marks)",
                        "71_80": "71% – 80% Pass (6 Marks)",
                        "61_70": "61% – 70% Pass (4 Marks)",
                        "51_60": "51% – 60% Pass (2 Marks)",
                        "below_50": "< 50% Pass (0 Marks)"
                      };
                      const k5ResultProofs = extractProofList(k5.resultProof || k5.resultProofs);
                      const k5CourseProofs = extractProofList(k5.onlineCourse);
                      const k5PubProofs = extractProofList(k5.publication);

                      return (
                        <div className="space-y-8 animate-fadeIn">
                          <div className="border-b border-zinc-150 pb-2">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                              Key Result Areas (KRA 1 to KRA 5) Performance Breakdown
                            </h4>
                            <p className="text-[10px] text-zinc-400 font-semibold uppercase">
                              HOD Self Appraisal Scores, Qualitative Parameters, Metric Tiers & Attached Evidence
                            </p>
                          </div>

                          {/* KRA I: Department Academic Improvement */}
                          <div className="bg-slate-50 border border-slate-200/80 p-6 rounded-3xl space-y-4 shadow-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">
                                  I
                                </span>
                                <div>
                                  <span className="text-xs font-black text-[#120c7a] uppercase tracking-wider block">
                                    KRA I: Department Academic Improvement
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-medium">
                                    Department Performance in Anna University Examination (Target: Overall Pass % = 65%)
                                  </span>
                                </div>
                              </div>
                              <span className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-[#120c7a] rounded-full text-xs font-extrabold shadow-2xs">
                                Self Score: {k1Score} / 30 Marks
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                              <div className="bg-white p-3.5 rounded-2xl border border-zinc-200">
                                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Overall Dept Pass % Achieved</span>
                                <span className="font-extrabold text-slate-850 text-base">{k1.passPct ? `${k1.passPct}%` : "Not specified"}</span>
                              </div>
                              <div className="bg-white p-3.5 rounded-2xl border border-zinc-200">
                                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Performance Metric Tier</span>
                                <span className="font-extrabold text-slate-850 text-sm">
                                  {k1TierLabels[k1.tier] || getK1AutoLabel(k1.passPct) || k1.tier || "No Tier Selected"}
                                </span>
                              </div>
                            </div>

                            {k1.remarks && (
                              <div className="bg-white p-3.5 rounded-2xl border border-zinc-200 text-xs">
                                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">
                                  Remarks / Details on Exam Performance
                                </span>
                                <p className="font-medium text-slate-750 leading-relaxed">{cleanText(k1.remarks)}</p>
                              </div>
                            )}

                            {k1Proofs.length > 0 && (
                              <div className="bg-white p-3.5 rounded-2xl border border-zinc-200">
                                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2">
                                  Attached Evidence Document(s):
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                  {k1Proofs.map((pf, pIdx) => (
                                    <a
                                      key={pIdx}
                                      href={pf.fileUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl text-xs transition-all hover:bg-indigo-100"
                                    >
                                      <Paperclip size={12} className="text-indigo-500" />
                                      <span className="truncate max-w-[260px]">{pf.fileName || `Evidence Doc #${pIdx + 1}`}</span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* KRA II: Department Student Centric Activities */}
                          <div className="bg-slate-50 border border-slate-200/80 p-6 rounded-3xl space-y-4 shadow-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">
                                  II
                                </span>
                                <div>
                                  <span className="text-xs font-black text-[#120c7a] uppercase tracking-wider block">
                                    KRA II: Department Student Centric Activities
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-medium">
                                    Organizing Student Centered Special Programs & Co-curricular Participation (5 Marks each parameter)
                                  </span>
                                </div>
                              </div>
                              <span className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-[#120c7a] rounded-full text-xs font-extrabold shadow-2xs">
                                Self Score: {k2Score} / 25 Marks
                              </span>
                            </div>

                            <div className="space-y-3.5">
                              {k2Items.map((item, idx) => {
                                const sub = k2[item.key] || {};
                                const proofs = extractProofList(sub);
                                return (
                                  <div key={item.key} className="bg-white p-4 rounded-2xl border border-zinc-200 text-xs space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                      <span className="font-bold text-slate-850 text-xs leading-relaxed">{item.label}</span>
                                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 w-fit ${
                                        sub.achieved ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                                      }`}>
                                        {sub.achieved ? "100% Target Achieved (5 Marks)" : "Below Target (0 Marks)"}
                                      </span>
                                    </div>
                                    {sub.remarks && (
                                      <p className="text-slate-700 font-medium text-[11px] bg-slate-50 p-2.5 rounded-xl border border-zinc-150 leading-relaxed">
                                        {cleanText(sub.remarks)}
                                      </p>
                                    )}
                                    {proofs.length > 0 && (
                                      <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <span className="text-[10px] font-bold text-zinc-400 uppercase">Attached Proof(s):</span>
                                        {proofs.map((pf, pIdx) => (
                                          <a
                                            key={pIdx}
                                            href={pf.fileUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg text-[11px]"
                                          >
                                            <Paperclip size={11} className="text-indigo-500" />
                                            <span className="truncate max-w-[240px]">{pf.fileName || `Proof #${pIdx + 1}`}</span>
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* KRA III: Faculty Enrichment Efforts for Department */}
                          <div className="bg-slate-50 border border-slate-200/80 p-6 rounded-3xl space-y-4 shadow-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">
                                  III
                                </span>
                                <div>
                                  <span className="text-xs font-black text-[#120c7a] uppercase tracking-wider block">
                                    KRA III: Faculty Enrichment Efforts for Department
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-medium">
                                    Developing Ambience for R&D Activities & Invest in Yourself (100% Target: 5 Marks | 80-99%: 2.5 Marks)
                                  </span>
                                </div>
                              </div>
                              <span className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-[#120c7a] rounded-full text-xs font-extrabold shadow-2xs">
                                Self Score: {k3Score} / 20 Marks
                              </span>
                            </div>

                            <div className="space-y-3.5">
                              {k3Items.map((item) => {
                                const sub = k3[item.key] || {};
                                const proofs = extractProofList(sub);
                                return (
                                  <div key={item.key} className="bg-white p-4 rounded-2xl border border-zinc-200 text-xs space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                      <span className="font-bold text-slate-850 text-xs leading-relaxed">{item.label}</span>
                                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 w-fit border ${
                                        sub.tier === "100" 
                                          ? "bg-emerald-100 text-emerald-800 border-emerald-300" 
                                          : (sub.tier === "80-99" || sub.tier === "80_99")
                                          ? "bg-indigo-100 text-indigo-800 border-indigo-300"
                                          : "bg-zinc-100 text-zinc-600 border-zinc-200"
                                      }`}>
                                        {k3TierLabels[sub.tier] || sub.tier || "Below 80% (0 Marks)"}
                                      </span>
                                    </div>
                                    {sub.remarks && (
                                      <p className="text-slate-700 font-medium text-[11px] bg-slate-50 p-2.5 rounded-xl border border-zinc-150 leading-relaxed">
                                        {cleanText(sub.remarks)}
                                      </p>
                                    )}
                                    {proofs.length > 0 && (
                                      <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <span className="text-[10px] font-bold text-zinc-400 uppercase">Attached Proof(s):</span>
                                        {proofs.map((pf, pIdx) => (
                                          <a
                                            key={pIdx}
                                            href={pf.fileUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg text-[11px]"
                                          >
                                            <Paperclip size={11} className="text-indigo-500" />
                                            <span className="truncate max-w-[240px]">{pf.fileName || `Proof #${pIdx + 1}`}</span>
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* KRA IV: Significant Contribution towards Department / Personal Development */}
                          <div className="bg-slate-50 border border-slate-200/80 p-6 rounded-3xl space-y-4 shadow-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">
                                  IV
                                </span>
                                <div>
                                  <span className="text-xs font-black text-[#120c7a] uppercase tracking-wider block">
                                    KRA IV: Significant Contribution towards Dept / Personal Development
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-medium">
                                    CoE / MoU / Book, Chapter Publication / Interaction with outside world / Foreign visit / Special Awards (2.5 Marks each, Max 5 Marks)
                                  </span>
                                </div>
                              </div>
                              <span className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-[#120c7a] rounded-full text-xs font-extrabold shadow-2xs">
                                Self Score: {k4Score} / 5 Marks
                              </span>
                            </div>

                            {k4 && k4.length > 0 ? (
                              <div className="space-y-3.5">
                                {k4.map((contrib, idx) => {
                                  const proofs = extractProofList(contrib);
                                  return (
                                    <div key={idx} className="bg-white p-4 rounded-2xl border border-zinc-200 text-xs space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="font-extrabold text-slate-850 text-xs">
                                          Contribution #{idx + 1}: {contrib.title || "Institutional Contribution"}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-800 border border-indigo-200">
                                          2.5 Marks
                                        </span>
                                      </div>
                                      {contrib.description && (
                                        <p className="text-slate-700 font-medium text-[11px] leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-zinc-150">
                                          {cleanText(contrib.description)}
                                        </p>
                                      )}
                                      {proofs.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                          <span className="text-[10px] font-bold text-zinc-400 uppercase">Attached Proof(s):</span>
                                          {proofs.map((pf, pIdx) => (
                                            <a
                                              key={pIdx}
                                              href={pf.fileUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg text-[11px]"
                                            >
                                              <Paperclip size={11} className="text-indigo-500" />
                                              <span className="truncate max-w-[240px]">{pf.fileName || `Proof #${pIdx + 1}`}</span>
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="bg-white p-4 rounded-2xl border border-dashed border-zinc-250 text-center text-zinc-400 italic text-xs">
                                No specific contributions submitted for KRA IV.
                              </div>
                            )}
                          </div>

                          {/* KRA V: Academic Excellence and Self Development (IIY) */}
                          <div className="bg-slate-50 border border-slate-200/80 p-6 rounded-3xl space-y-4 shadow-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-xl bg-indigo-100 text-[#120c7a] font-black text-xs flex items-center justify-center">
                                  V
                                </span>
                                <div>
                                  <span className="text-xs font-black text-[#120c7a] uppercase tracking-wider block">
                                    KRA V: Academic Excellence and Self Development (IIY)
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-medium">
                                    Anna University Subject Exam Pass % (Max 10 Marks) + Online Course (5 Marks) + Research Publication (5 Marks)
                                  </span>
                                </div>
                              </div>
                              <span className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-[#120c7a] rounded-full text-xs font-extrabold shadow-2xs">
                                Self Score: {k5Score} / 20 Marks
                              </span>
                            </div>

                            <div className="space-y-3.5 text-xs">
                              {/* Sub 1: Anna University Exam Result */}
                              <div className="bg-white p-4 rounded-2xl border border-zinc-200 space-y-2">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <span className="font-bold text-slate-850 text-xs">
                                    1. Anna University Examination Result (Theory Pass % Target: 95% | Analytical Pass % Target: 90%)
                                  </span>
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-800 border border-indigo-200 shrink-0 w-fit">
                                    {k5ResultTierLabels[k5.resultTier] || k5.resultTier || "Below 50% (0 Marks)"}
                                  </span>
                                </div>
                                {k5.resultRemarks && (
                                  <p className="text-slate-700 font-medium text-[11px] bg-slate-50 p-2.5 rounded-xl border border-zinc-150 leading-relaxed">
                                    {cleanText(k5.resultRemarks)}
                                  </p>
                                )}
                                {k5ResultProofs.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Result Sheet Proof(s):</span>
                                    {k5ResultProofs.map((pf, pIdx) => (
                                      <a
                                        key={pIdx}
                                        href={pf.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg text-[11px]"
                                      >
                                        <Paperclip size={11} className="text-indigo-500" />
                                        <span className="truncate max-w-[240px]">{pf.fileName || `Result Proof #${pIdx + 1}`}</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Sub 2: Online Course */}
                              <div className="bg-white p-4 rounded-2xl border border-zinc-200 space-y-2">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <span className="font-bold text-slate-850 text-xs">
                                    2. Online Course – 1 per Semester
                                  </span>
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 w-fit ${
                                    k5.onlineCourse?.achieved ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                                  }`}>
                                    {k5.onlineCourse?.achieved ? "100% Target Achieved (5 Marks)" : "Below Target (0 Marks)"}
                                  </span>
                                </div>
                                {k5.onlineCourse?.remarks && (
                                  <p className="text-slate-700 font-medium text-[11px] bg-slate-50 p-2.5 rounded-xl border border-zinc-150 leading-relaxed">
                                    {cleanText(k5.onlineCourse.remarks)}
                                  </p>
                                )}
                                {k5CourseProofs.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Certificate Proof(s):</span>
                                    {k5CourseProofs.map((pf, pIdx) => (
                                      <a
                                        key={pIdx}
                                        href={pf.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg text-[11px]"
                                      >
                                        <Paperclip size={11} className="text-indigo-500" />
                                        <span className="truncate max-w-[240px]">{pf.fileName || `Certificate #${pIdx + 1}`}</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Sub 3: Research Paper Publication */}
                              <div className="bg-white p-4 rounded-2xl border border-zinc-200 space-y-2">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <span className="font-bold text-slate-850 text-xs">
                                    3. Publication of Research Paper in reputed Journal / International Conference – 1 per Semester
                                  </span>
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 w-fit ${
                                    k5.publication?.achieved ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                                  }`}>
                                    {k5.publication?.achieved ? "100% Target Achieved (5 Marks)" : "Below Target (0 Marks)"}
                                  </span>
                                </div>
                                {k5.publication?.remarks && (
                                  <p className="text-slate-700 font-medium text-[11px] bg-slate-50 p-2.5 rounded-xl border border-zinc-150 leading-relaxed">
                                    {cleanText(k5.publication.remarks)}
                                  </p>
                                )}
                                {k5PubProofs.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Publication Copy Proof(s):</span>
                                    {k5PubProofs.map((pf, pIdx) => (
                                      <a
                                        key={pIdx}
                                        href={pf.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg text-[11px]"
                                      >
                                        <Paperclip size={11} className="text-indigo-500" />
                                        <span className="truncate max-w-[240px]">{pf.fileName || `Publication #${pIdx + 1}`}</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Sub-Tab 3: Scores & Declaration */}
                    {activeDetailsTab === 3 && (() => {
                      const fData = selectedAppraisal.formData || {};
                      const k1 = fData.kra1 || selectedAppraisal.kra1 || {};
                      const k5 = fData.kra5 || selectedAppraisal.kra5 || {};
                      const s1 = selectedAppraisal.kraScores?.kra1 ?? k1.score ?? 0;
                      const s2 = selectedAppraisal.kraScores?.kra2 ?? 0;
                      const s3 = selectedAppraisal.kraScores?.kra3 ?? 0;
                      const s4 = selectedAppraisal.kraScores?.kra4 ?? 0;
                      const s5 = selectedAppraisal.kraScores?.kra5 ?? k5.score ?? 0;
                      const totalScore = selectedAppraisal.totalScore ?? (s1 + s2 + s3 + s4 + s5);
                      const hodName = fData.hodName || selectedAppraisal.hodName || selectedAppraisal.facultyName || "Head of Department";
                      const academicYear = selectedAppraisal.academicYear || "2024-2025";
                      const submittedAt = selectedAppraisal.submittedAt || selectedAppraisal.declarationDate || selectedAppraisal.updatedAt;

                      const kraRows = [
                        { sno: "I", title: "Department Academic Improvement", desc: "Anna University Exam Results (Target: 65% Pass)", max: 30, score: s1 },
                        { sno: "II", title: "Department Student Centric Activities", desc: "Co-curricular, IPKT, Guest Lectures, VAC, Soft Skills", max: 25, score: s2 },
                        { sno: "III", title: "Faculty Enrichment Efforts for Department", desc: "Funding Proposals, Testing, Online Courses, Publications", max: 20, score: s3 },
                        { sno: "IV", title: "Significant Contribution towards Department / Personal Dev.", desc: "CoE, MoUs, Books, International Collaborations, Awards", max: 5, score: s4 },
                        { sno: "V", title: "Academic Excellence and Self Development (IIY)", desc: "Subject Pass % (10), Online Course (5), Research Paper (5)", max: 20, score: s5 }
                      ];

                      return (
                        <div className="space-y-6 animate-fadeIn">
                          {/* KRA Breakdown Table */}
                          <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-xs">
                            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-5 py-3 border-b border-indigo-100 flex items-center justify-between">
                              <span className="text-xs font-black text-indigo-950 uppercase tracking-widest">
                                Institutional KRA Performance Score Breakdown
                              </span>
                              <span className="text-xs font-black text-[#120c7a] bg-white px-3 py-1 rounded-xl border border-indigo-150">
                                Total: {totalScore} / 100
                              </span>
                            </div>

                            <table className="w-full border-collapse text-xs">
                              <thead>
                                <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold text-left">
                                  <th className="p-3 w-12 text-center">S.No</th>
                                  <th className="p-3">Key Result Area (KRA)</th>
                                  <th className="p-3 text-center w-24">Max Marks</th>
                                  <th className="p-3 text-center w-28 text-indigo-800">Self Score</th>
                                  <th className="p-3 text-center w-24">% Score</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-150">
                                {kraRows.map((row) => (
                                  <tr key={row.sno} className="hover:bg-slate-50/50">
                                    <td className="p-3 text-center font-bold text-zinc-500">{row.sno}</td>
                                    <td className="p-3">
                                      <span className="font-extrabold text-slate-850 block">{row.title}</span>
                                      <span className="text-[10px] text-zinc-400 font-medium">{row.desc}</span>
                                    </td>
                                    <td className="p-3 text-center font-bold text-zinc-600">{row.max}</td>
                                    <td className="p-3 text-center font-black text-indigo-750 text-sm">{row.score}</td>
                                    <td className="p-3 text-center font-bold text-slate-700">
                                      {row.max > 0 ? `${((row.score / row.max) * 100).toFixed(0)}%` : "-"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-[#120c7a] text-white font-black">
                                  <td colSpan={2} className="p-3.5 text-right text-xs uppercase tracking-wider">
                                    Grand Total Performance Score
                                  </td>
                                  <td className="p-3.5 text-center text-zinc-200">100</td>
                                  <td className="p-3.5 text-center text-base text-amber-300">{totalScore}</td>
                                  <td className="p-3.5 text-center text-sm">{totalScore}%</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>

                          {/* Digital Declaration Card */}
                          <div className="bg-emerald-50/60 p-6 rounded-3xl border border-emerald-200/80 space-y-4">
                            <div className="flex items-center gap-2 border-b border-emerald-200/50 pb-2">
                              <CheckCircle2 size={18} className="text-emerald-700" />
                              <span className="text-xs font-black text-emerald-950 uppercase tracking-wider">
                                Official Digital Declaration & Verification
                              </span>
                            </div>
                            <p className="text-xs font-medium text-emerald-950 leading-relaxed">
                              "I hereby declare that the particulars furnished above in my HOD Performance Appraisal for the Academic Year <strong>{academicYear}</strong> are true, correct, and complete to the best of my knowledge and belief."
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs">
                              <div className="bg-white/80 p-3 rounded-2xl border border-emerald-200">
                                <span className="block text-[10px] font-black text-emerald-700 uppercase tracking-wider">Digital Signature of HoD</span>
                                <span className="font-extrabold text-emerald-950 text-sm underline">{hodName}</span>
                              </div>
                              <div className="bg-white/80 p-3 rounded-2xl border border-emerald-200">
                                <span className="block text-[10px] font-black text-emerald-700 uppercase tracking-wider">Certification Timestamp</span>
                                <span className="font-extrabold text-emerald-950">
                                  {submittedAt ? new Date(submittedAt).toLocaleString("en-IN") : "Digital Signature Registered"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}

                {/* ── NON-TEACHING APPRAISAL FORM REVIEW VIEWS ── */}
                {selectedAppraisal?.formType === "non_teaching" && (
                  <>
                    {activeDetailsTab === 1 && (
                      <div className="space-y-6 animate-fadeIn">
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            Staff Personal & Post Details
                          </span>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-xs">
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Staff Name</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.name || selectedAppraisal.staffName || selectedAppraisal.facultyName}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Designation</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.designation || selectedAppraisal.designation}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Department</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.department || selectedAppraisal.department}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Date of Birth</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.dob || "-"}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Age</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.age || "-"}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Academic Qualification</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.qualification || "-"}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">DOJ School</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.dojCollege || "-"}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">DOJ Present Post</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.dojPresentPost || "-"}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Academic Session</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.academicYear}</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            Experience Summary (Years)
                          </span>
                          <div className="grid grid-cols-3 gap-4 text-xs">
                            <div className="bg-white p-3 rounded-xl border border-zinc-200 text-center">
                              <span className="block text-[10px] font-black text-zinc-400 uppercase">Experience at {getSchoolShortName(selectedAppraisal.institution || selectedAppraisal.formData?.institution)}</span>
                              <span className="text-sm font-black text-indigo-950">{selectedAppraisal.formData?.expCKCET || selectedAppraisal.formData?.expCKSPE || selectedAppraisal.formData?.experience?.teachingCKCET || "0"} Yrs</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-zinc-200 text-center">
                              <span className="block text-[10px] font-black text-zinc-400 uppercase">Experience Elsewhere</span>
                              <span className="text-sm font-black text-indigo-950">{selectedAppraisal.formData?.expOther || "0"} Yrs</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-zinc-200 text-center">
                              <span className="block text-[10px] font-black text-zinc-400 uppercase">Industrial Experience</span>
                              <span className="text-sm font-black text-indigo-950">{selectedAppraisal.formData?.expIndustrial || "0"} Yrs</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDetailsTab === 2 && (
                      <div className="space-y-6 animate-fadeIn">
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            Roles & Responsibilities Carried Out
                          </span>
                          <div className="bg-white p-4 rounded-xl border border-zinc-200 text-xs font-medium text-slate-700">
                            {selectedAppraisal.formData?.rolesResponsibilities || <span className="italic text-zinc-400">No details specified.</span>}
                          </div>
                          {selectedAppraisal.formData?.rolesEvidenceUrl && (
                            <div className="flex items-center gap-2 pt-1">
                              <span className="text-[10px] font-bold text-zinc-400 uppercase">Evidence Document:</span>
                              <a
                                href={selectedAppraisal.formData.rolesEvidenceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-lg text-xs"
                              >
                                View Evidence ({selectedAppraisal.formData.rolesEvidenceName || "Attachment"})
                              </a>
                            </div>
                          )}
                        </div>

                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            Punctuality & Discipline Habits
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div className="bg-white p-3 rounded-xl border border-zinc-200">
                              <span className="block text-[10px] font-black text-zinc-400 uppercase">Reporting at Scheduled Time</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.reportScheduledTime || "-"}</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-zinc-200">
                              <span className="block text-[10px] font-black text-zinc-400 uppercase">Seeking Permission for Outside Work</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.seekPermissionOutside || "-"}</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-zinc-200">
                              <span className="block text-[10px] font-black text-zinc-400 uppercase">Applying Leave in Advance</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.applyLeaveAdvance || "-"}</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-zinc-200">
                              <span className="block text-[10px] font-black text-zinc-400 uppercase">Tendency to Consume Balance CL</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.consumeBalanceCL || "-"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            Leave Details Breakdown
                          </span>
                          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
                            <div className="bg-white p-2.5 rounded-xl border border-zinc-200 text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase">CL</span>
                              <span className="font-black text-slate-800">{selectedAppraisal.formData?.leaveDetails?.cl || "0"}</span>
                            </div>
                            <div className="bg-white p-2.5 rounded-xl border border-zinc-200 text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase">C.Off</span>
                              <span className="font-black text-slate-800">{selectedAppraisal.formData?.leaveDetails?.coff || "0"}</span>
                            </div>
                            <div className="bg-white p-2.5 rounded-xl border border-zinc-200 text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase">LLP</span>
                              <span className="font-black text-slate-800">{selectedAppraisal.formData?.leaveDetails?.llp || "0"}</span>
                            </div>
                            <div className="bg-white p-2.5 rounded-xl border border-zinc-200 text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase">OD Dept</span>
                              <span className="font-black text-slate-800">{selectedAppraisal.formData?.leaveDetails?.odDept || "0"}</span>
                            </div>
                            <div className="bg-white p-2.5 rounded-xl border border-zinc-200 text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase">OD Inst</span>
                              <span className="font-black text-slate-800">{selectedAppraisal.formData?.leaveDetails?.odInst || "0"}</span>
                            </div>
                            <div className="bg-white p-2.5 rounded-xl border border-zinc-200 text-center">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase">OD Others</span>
                              <span className="font-black text-slate-800">{selectedAppraisal.formData?.leaveDetails?.odOthers || "0"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDetailsTab === 3 && (
                      <div className="space-y-6 animate-fadeIn">
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            Work Habits, Relationships & Grievances
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div className="bg-white p-3 rounded-xl border border-zinc-200">
                              <span className="block text-[10px] font-black text-zinc-400 uppercase">Grievances Resolution Status</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.happyWithGrievances || "-"}</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-zinc-200">
                              <span className="block text-[10px] font-black text-zinc-400 uppercase">Timely Accomplishment of Assignments</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.accomplishAssignmentInTime || "-"}</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-zinc-200">
                              <span className="block text-[10px] font-black text-zinc-400 uppercase">Potential Utilization</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.potentialUtilization || "-"}</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-zinc-200">
                              <span className="block text-[10px] font-black text-zinc-400 uppercase">Self Assessment Placement</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.selfAssessmentPlacement || "-"}</span>
                            </div>
                          </div>

                          <div className="space-y-3 pt-2">
                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Interpersonal Relationships Rating</span>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                              <div className="bg-white p-3 rounded-xl border border-zinc-200">
                                <span className="block text-[9px] font-black text-zinc-400 uppercase">With Students</span>
                                <span className="font-bold text-slate-800">{selectedAppraisal.formData?.relStudents?.rating || "-"}</span>
                                {selectedAppraisal.formData?.relStudents?.reason && (
                                  <p className="text-[10px] text-zinc-500 mt-1">{selectedAppraisal.formData.relStudents.reason}</p>
                                )}
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-zinc-200">
                                <span className="block text-[9px] font-black text-zinc-400 uppercase">With Colleagues</span>
                                <span className="font-bold text-slate-800">{selectedAppraisal.formData?.relColleagues?.rating || "-"}</span>
                                {selectedAppraisal.formData?.relColleagues?.reason && (
                                  <p className="text-[10px] text-zinc-500 mt-1">{selectedAppraisal.formData.relColleagues.reason}</p>
                                )}
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-zinc-200">
                                <span className="block text-[9px] font-black text-zinc-400 uppercase">With Superiors</span>
                                <span className="font-bold text-slate-800">{selectedAppraisal.formData?.relSuperiors?.rating || "-"}</span>
                                {selectedAppraisal.formData?.relSuperiors?.reason && (
                                  <p className="text-[10px] text-zinc-500 mt-1">{selectedAppraisal.formData.relSuperiors.reason}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDetailsTab === 4 && (
                      <div className="space-y-6 animate-fadeIn">
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            Invest In Yourself (IIY) Courses Completed
                          </span>
                          {selectedAppraisal.formData?.iiyCourses && selectedAppraisal.formData.iiyCourses.length > 0 ? (
                            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-zinc-50 text-zinc-700 font-bold border-b border-zinc-200">
                                  <tr>
                                    <th className="p-2.5">Course Title</th>
                                    <th className="p-2.5">Platform</th>
                                    <th className="p-2.5">Duration</th>
                                    <th className="p-2.5">Certificate</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                  {selectedAppraisal.formData.iiyCourses.map((c, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50">
                                      <td className="p-2.5 font-bold text-slate-800">{c.title || "-"}</td>
                                      <td className="p-2.5 text-zinc-600">{c.platform || "-"}</td>
                                      <td className="p-2.5 text-zinc-600">{c.startDate} - {c.endDate} ({c.weeks} wks)</td>
                                      <td className="p-2.5 font-bold text-emerald-600">{c.certificateReceived || "Yes"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-400 italic">No IIY courses recorded.</p>
                          )}

                          {selectedAppraisal.formData?.iiyOutcome && (
                            <div className="bg-white p-3 rounded-xl border border-zinc-200 text-xs mt-2">
                              <span className="block text-[10px] font-black text-zinc-400 uppercase">IIY Skill Outcome</span>
                              <p className="font-medium text-slate-700">{selectedAppraisal.formData.iiyOutcome}</p>
                            </div>
                          )}
                        </div>

                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            Contributions Towards Admissions
                          </span>
                          {selectedAppraisal.formData?.admissionsContributed && selectedAppraisal.formData.admissionsContributed.length > 0 ? (
                            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-zinc-50 text-zinc-700 font-bold border-b border-zinc-200">
                                  <tr>
                                    <th className="p-2.5">Team No / Area</th>
                                    <th className="p-2.5">Count</th>
                                    <th className="p-2.5">Team Leader</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                  {selectedAppraisal.formData.admissionsContributed.map((a, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50">
                                      <td className="p-2.5 font-bold text-slate-800">{a.teamNoArea || "-"}</td>
                                      <td className="p-2.5 text-zinc-600">{a.count || "0"}</td>
                                      <td className="p-2.5 text-zinc-600">{a.teamLeader || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-400 italic">No admissions recorded.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── FACULTY APPRAISAL FORM REVIEW VIEWS ── */}
                {(selectedAppraisal?.formType === "faculty" || (!selectedAppraisal?.formType && selectedAppraisal?.formData)) && (
                  <>
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
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_dojCollege", "DOJ School")}</span>
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
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_teachingCKCET", `Teaching ${getSchoolShortName(selectedAppraisal.institution || selectedAppraisal.formData?.institution)}`)}</span>
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
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                        <span style={{ fontSize: "11px" }} className="font-extrabold text-indigo-950 block border-b border-zinc-200 pb-1 uppercase tracking-wider">
                          {getSectionTitle("sec_profile_workload", "1.3 WEEKLY WORKLOAD GRID")}
                        </span>
                        {getSectionDescription("sec_profile_workload") && (
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase">{getSectionDescription("sec_profile_workload")}</p>
                        )}
                        
                        {/* Odd Semester Workload Card */}
                        {isSectionVisible("f_workload_odd_title") && (
                          <div className="bg-white p-4 rounded-xl border border-zinc-200 space-y-2">
                            <span className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                              {getSectionTitle("f_workload_odd_title", "ODD SEMESTER WORKLOAD / WEEK (HRS)")}
                            </span>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              {isSectionVisible("f_oddTheory") && (
                                <div className="bg-slate-50 border border-zinc-200 p-2.5 rounded-lg text-center">
                                  <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_oddTheory", "THEORY CLASSES")}</span>
                                  <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.oddTheory || "0"} Hrs</span>
                                </div>
                              )}
                              {isSectionVisible("f_oddPractical") && (
                                <div className="bg-slate-50 border border-zinc-200 p-2.5 rounded-lg text-center">
                                  <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_oddPractical", "PRACTICAL CLASSES")}</span>
                                  <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.oddPractical || "0"} Hrs</span>
                                </div>
                              )}
                              {isSectionVisible("f_oddSpecial") && (
                                <div className="bg-slate-50 border border-zinc-200 p-2.5 rounded-lg text-center">
                                  <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_oddSpecial", "C) SPECIAL CLASS (HRS)")}</span>
                                  <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.oddSpecial || "0"} Hrs</span>
                                </div>
                              )}
                              {isSectionVisible("f_oddOther") && (
                                <div className="bg-slate-50 border border-zinc-200 p-2.5 rounded-lg text-center">
                                  <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_oddOther", "D) OTHER ACTIVITY (HRS)")}</span>
                                  <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.oddOther || "0"} Hrs</span>
                                </div>
                              )}
                              {isSectionVisible("f_oddTotal") && (
                                <div className="bg-slate-50 border border-zinc-200 p-2.5 rounded-lg text-center">
                                  <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_oddTotal", "ODD TOTAL HOURS")}</span>
                                  <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.oddTotal || "0"} Hrs</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Even Semester Workload Card */}
                        {isSectionVisible("f_workload_even_title") && (
                          <div className="bg-white p-4 rounded-xl border border-zinc-200 space-y-2">
                            <span className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                              {getSectionTitle("f_workload_even_title", "EVEN SEMESTER WORKLOAD / WEEK (HRS)")}
                            </span>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              {isSectionVisible("f_evenTheory") && (
                                <div className="bg-slate-50 border border-zinc-200 p-2.5 rounded-lg text-center">
                                  <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_evenTheory", "EVEN SEM THEORY HOURS")}</span>
                                  <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.evenTheory || "0"} Hrs</span>
                                </div>
                              )}
                              {isSectionVisible("f_evenPractical") && (
                                <div className="bg-slate-50 border border-zinc-200 p-2.5 rounded-lg text-center">
                                  <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_evenPractical", "EVEN PRACTICAL/PROJECT HOURS")}</span>
                                  <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.evenPractical || "0"} Hrs</span>
                                </div>
                              )}
                              {isSectionVisible("f_evenSpecial") && (
                                <div className="bg-slate-50 border border-zinc-200 p-2.5 rounded-lg text-center">
                                  <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_evenSpecial", "C) SPECIAL CLASS (HRS)")}</span>
                                  <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.evenSpecial || "0"} Hrs</span>
                                </div>
                              )}
                              {isSectionVisible("f_evenOther") && (
                                <div className="bg-slate-50 border border-zinc-200 p-2.5 rounded-lg text-center">
                                  <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_evenOther", "D) OTHER ACTIVITY (HRS)")}</span>
                                  <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.evenOther || "0"} Hrs</span>
                                </div>
                              )}
                              {isSectionVisible("f_evenTotal") && (
                                <div className="bg-slate-50 border border-zinc-200 p-2.5 rounded-lg text-center">
                                  <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider truncate">{getSectionTitle("f_evenTotal", "EVEN TOTAL HOURS")}</span>
                                  <span className="text-xs font-bold text-slate-850">{selectedAppraisal.formData?.workloadWeek?.evenTotal || "0"} Hrs</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
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
                              <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_class", "Class")}</th>
                              <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_code", "Subject Code & Title")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_appeared", "Appeared")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passed", "Passed")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passPercent", "% Result")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_feedback", "Feedback Rating")}</th>
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
                              <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_class", "Class")}</th>
                              <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_code", "Subject Code & Title")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_appeared", "Appeared")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passed", "Passed")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passPercent", "% Result")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_feedback", "Feedback Rating")}</th>
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
                              <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_class", "Class")}</th>
                              <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_code", "Subject Code & Title")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_appeared", "Appeared")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passed", "Passed")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passPercent", "% Result")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_feedback", "Feedback Rating")}</th>
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
                              <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_class", "Class")}</th>
                              <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_code", "Subject Code & Title")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_appeared", "Appeared")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passed", "Passed")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passPercent", "% Result")}</th>
                              <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_feedback", "Feedback Rating")}</th>
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
                          <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider">Result Attribution Opinion</span>
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
                            <p className="text-zinc-600 font-medium">{selectedAppraisal.formData.onlineCoursesOutcome}</p>
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
                                <p className="font-semibold text-slate-800">{selectedAppraisal.formData.resultImprovementHOD}</p>
                              </div>
                            )}
                            {isSectionVisible("f_deptAdministrationHOD") && selectedAppraisal.formData?.deptAdministrationHOD && (
                              <div className="mt-2">
                                <span className="block text-[9px] font-black text-zinc-400 uppercase">
                                  {getSectionTitle("f_deptAdministrationHOD", "Department Administration & Planning")}:
                                </span>
                                <p className="font-semibold text-slate-800">{selectedAppraisal.formData.deptAdministrationHOD}</p>
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
                            <p className="font-semibold text-slate-850">{selectedAppraisal.formData.otherRolesContribution}</p>
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
                              {(selectedAppraisal.formData?.relationStudents || {}).reason && <p className="text-[10px] text-zinc-500 mt-1">Reason: {(selectedAppraisal.formData?.relationStudents || {}).reason}</p>}
                            </div>
                          )}
                          {isSectionVisible("f_relationColleagues") && (
                            <div className="bg-zinc-50 border border-zinc-200/50 p-4 rounded-xl">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_relationColleagues", "Colleagues")}</span>
                              <span className="text-xs font-black text-[#120c7a]">{(selectedAppraisal.formData?.relationColleagues || {}).rating || "Good"}</span>
                              {(selectedAppraisal.formData?.relationColleagues || {}).reason && <p className="text-[10px] text-zinc-500 mt-1">Reason: {(selectedAppraisal.formData?.relationColleagues || {}).reason}</p>}
                            </div>
                          )}
                          {isSectionVisible("f_relationSuperiors") && (
                            <div className="bg-zinc-50 border border-zinc-200/50 p-4 rounded-xl">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_relationSuperiors", "Superiors")}</span>
                              <span className="text-xs font-black text-[#120c7a]">{(selectedAppraisal.formData?.relationSuperiors || {}).rating || "Good"}</span>
                              {(selectedAppraisal.formData?.relationSuperiors || {}).reason && <p className="text-[10px] text-zinc-500 mt-1">Reason: {(selectedAppraisal.formData?.relationSuperiors || {}).reason}</p>}
                            </div>
                          )}
                          {isSectionVisible("f_relationDepartment") && (
                            <div className="bg-zinc-50 border border-zinc-200/50 p-4 rounded-xl">
                              <span className="block text-[9px] font-black text-zinc-400 uppercase tracking-wider">{getSectionTitle("f_relationDepartment", "Department")}</span>
                              <span className="text-xs font-black text-[#120c7a]">{(selectedAppraisal.formData?.relationDepartment || {}).rating || "Good"}</span>
                              {(selectedAppraisal.formData?.relationDepartment || {}).reason && <p className="text-[10px] text-zinc-500 mt-1">Reason: {(selectedAppraisal.formData?.relationDepartment || {}).reason}</p>}
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
                            <p className="text-xs text-slate-700 font-medium bg-slate-50 p-3 rounded-xl border border-zinc-150">{selectedAppraisal.formData?.targetsNextSemester || "N/A"}</p>
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
                            <p className="text-xs text-slate-700 font-medium bg-slate-50 p-3 rounded-xl border border-zinc-150">{selectedAppraisal.formData?.targetsStrategy || "N/A"}</p>
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
                  </>
                )}

                {/* ── PERFORMANCE SCORE (CRITERIA EVALUATION) TABLE ── */}
                {selectedAppraisal.autoScore?.breakdown && (
                  <div className="mt-8 border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                    <div className="bg-indigo-50/70 px-4 py-2.5 border-b border-indigo-100 flex items-center justify-between">
                      <span className="text-[11px] font-black text-indigo-950 uppercase tracking-widest">Performance Score (Criteria Evaluation)</span>
                      {(() => {
                        const bd = selectedAppraisal.autoScore.breakdown;
                        const p1 = bd.part1Rows || [];
                        const p2 = bd.part2Rows || [];
                        const sumHod = (rows) => rows.reduce((a, r) => a + (Number(hodFacultyScoresMap[r.id] ?? r.scored) || 0), 0);
                        const sumPrincipal = (rows) => rows.reduce((a, r) => a + (Number(principalFacultyScoresMap[r.id] ?? hodFacultyScoresMap[r.id] ?? r.scored) || 0), 0);
                        const gHodT = sumHod(p1) + sumHod(p2);
                        const gPrincipalT = sumPrincipal(p1) + sumPrincipal(p2);
                        const gM = selectedAppraisal.autoScore.maxTotal || (p1.length ? p1.reduce((a, r) => a + (Number(r.maxMarks) || 0), 0) : 0) + (p2.length ? p2.reduce((a, r) => a + (Number(r.maxMarks) || 0), 0) : 0);
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-emerald-800 bg-emerald-100/70 px-2.5 py-0.5 rounded-full border border-emerald-200">
                              HOD Score: {gHodT} / {gM}
                            </span>
                            <span className="text-[10px] font-black text-purple-800 bg-purple-100/70 px-2.5 py-0.5 rounded-full border border-purple-200">
                              Principal Score: {gPrincipalT} / {gM}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-zinc-50 text-zinc-500 font-bold border-b border-zinc-200">
                          <th className="p-2.5 text-left">Particulars</th>
                          <th className="p-2.5 text-center">Value</th>
                          <th className="p-2.5 text-center">Max</th>
                          <th className="p-2.5 text-center text-indigo-700 font-black">Self Analyse Score</th>
                          <th className="p-2.5 text-center text-emerald-700 font-black">HOD Score</th>
                          <th className="p-2.5 text-center text-purple-700 font-black">Principal Score</th>
                        </tr>
                      </thead>
                      {(() => {
                        const bd = selectedAppraisal.autoScore.breakdown;
                        const p1 = bd.part1Rows || [];
                        const p2 = bd.part2Rows || [];
                        const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
                        const sumHod = (rows) => rows.reduce((a, r) => a + (Number(hodFacultyScoresMap[r.id] ?? r.scored) || 0), 0);
                        const sumPrincipal = (rows) => rows.reduce((a, r) => a + (Number(principalFacultyScoresMap[r.id] ?? hodFacultyScoresMap[r.id] ?? r.scored) || 0), 0);

                        const p1T = selectedAppraisal.autoScore.part1Total ?? sum(p1, "scored");
                        const p1M = p1.length ? sum(p1, "maxMarks") : 0;
                        const p1HodT = sumHod(p1);
                        const p1PrincipalT = sumPrincipal(p1);

                        const p2T = selectedAppraisal.autoScore.part2Total ?? sum(p2, "scored");
                        const p2M = p2.length ? sum(p2, "maxMarks") : 0;
                        const p2HodT = sumHod(p2);
                        const p2PrincipalT = sumPrincipal(p2);

                        const gT = selectedAppraisal.autoScore.total ?? p1T + p2T;
                        const gM = selectedAppraisal.autoScore.maxTotal ?? p1M + p2M;
                        const gHodT = p1HodT + p2HodT;
                        const gPrincipalT = p1PrincipalT + p2PrincipalT;

                        const isPrincipalUser = userRole === "Principal" || userRole === "Admin";
                        const isEditable = isPrincipalUser || selectedAppraisal.status !== "Approved";

                        const rowEls = (rows) => rows.map((r) => {
                          const hodVal = hodFacultyScoresMap[r.id] ?? r.scored;
                          const principalVal = principalFacultyScoresMap[r.id] ?? hodVal;
                          return (
                            <tr key={r.id} className="hover:bg-slate-50/50">
                              <td className="p-2.5 font-semibold text-slate-700">{r.particulars}</td>
                              <td className="p-2.5 text-center text-zinc-500">{r.value === null ? "—" : String(r.value)}</td>
                              <td className="p-2.5 text-center font-bold text-zinc-600">{r.maxMarks}</td>
                              <td className="p-2.5 text-center font-black text-indigo-700">{r.scored}</td>
                              <td className="p-2.5 text-center font-black text-emerald-700 font-bold">
                                {hodVal}
                              </td>
                              <td className="p-2.5 text-center font-black">
                                {isEditable ? (
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max={r.maxMarks}
                                    value={principalVal === undefined || principalVal === null ? "" : principalVal}
                                    onChange={(e) => {
                                      const inputVal = e.target.value;
                                      const parsed = inputVal === "" ? "" : Math.min(Number(r.maxMarks), Math.max(0, Number(inputVal)));
                                      const nextMap = {
                                        ...principalFacultyScoresMap,
                                        [r.id]: parsed
                                      };
                                      setPrincipalFacultyScoresMap(nextMap);
                                      const allRows = [...p1, ...p2];
                                      const newTotal = allRows.reduce((a, row) => a + (Number(nextMap[row.id] ?? hodFacultyScoresMap[row.id] ?? row.scored) || 0), 0);
                                      setFinalRating(String(newTotal));
                                    }}
                                    className="w-16 text-center font-black text-purple-900 bg-white border-2 border-purple-400 rounded-lg py-1 px-1.5 shadow-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-600 focus:outline-none"
                                  />
                                ) : (
                                  <span className="text-purple-700 font-bold">{principalVal}</span>
                                )}
                              </td>
                            </tr>
                          );
                        });

                        return (
                          <>
                            <tbody className="divide-y divide-zinc-100">
                              {p1.length > 0 && (
                                <tr className="bg-slate-50/70">
                                  <td colSpan={6} className="p-2 text-[10px] font-black text-zinc-500 uppercase tracking-wider">Part 1 — Academic & Feedback</td>
                                </tr>
                              )}
                              {rowEls(p1)}
                              {p1.length > 0 && (
                                <tr className="bg-slate-50/70 font-bold">
                                  <td className="p-2 text-right text-[11px] text-zinc-600 uppercase" colSpan={2}>Part 1 Total</td>
                                  <td className="p-2 text-center text-zinc-700">{p1M}</td>
                                  <td className="p-2 text-center text-indigo-800 font-black">{p1T}</td>
                                  <td className="p-2 text-center text-emerald-800 font-black">{p1HodT}</td>
                                  <td className="p-2 text-center text-purple-800 font-black">{p1PrincipalT}</td>
                                </tr>
                              )}
                              {p2.length > 0 && (
                                <tr className="bg-slate-50/70">
                                  <td colSpan={6} className="p-2 text-[10px] font-black text-zinc-500 uppercase tracking-wider">Part 2 — Self & Department Contributions</td>
                                </tr>
                              )}
                              {rowEls(p2)}
                              {p2.length > 0 && (
                                <tr className="bg-slate-50/70 font-bold">
                                  <td className="p-2 text-right text-[11px] text-zinc-600 uppercase" colSpan={2}>Part 2 Total</td>
                                  <td className="p-2 text-center text-zinc-700">{p2M}</td>
                                  <td className="p-2 text-center text-indigo-800 font-black">{p2T}</td>
                                  <td className="p-2 text-center text-emerald-800 font-black">{p2HodT}</td>
                                  <td className="p-2 text-center text-purple-800 font-black">{p2PrincipalT}</td>
                                </tr>
                              )}
                            </tbody>
                            <tfoot>
                              <tr className="bg-gradient-to-r from-indigo-700 via-emerald-700 to-teal-800 text-white font-black">
                                <td className="p-3 text-right text-xs uppercase tracking-wider" colSpan={2}>Grand Total</td>
                                <td className="p-3 text-center text-zinc-200">{gM}</td>
                                <td className="p-3 text-center text-base">{gT}</td>
                                <td className="p-3 text-center text-base text-emerald-200">{gHodT}</td>
                                <td className="p-3 text-center text-base text-purple-200">{gPrincipalT}</td>
                              </tr>
                            </tfoot>
                          </>
                        );
                      })()}
                    </table>
                  </div>
                )}

                {/* ── HOD PERFORMANCE EVALUATION SCORECARD (5 KRAs EVALUATION) ── */}
                {selectedAppraisal.formType === "hod" && (
                  <div className="mt-8 border border-zinc-200 rounded-3xl overflow-hidden bg-white shadow-xs">
                    <div className="bg-indigo-50/70 px-5 py-3.5 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-black text-indigo-950 uppercase tracking-widest block">
                          HOD Performance Evaluation Scorecard (5 KRAs Evaluation)
                        </span>
                        <span className="text-[10px] text-indigo-700 font-medium">
                          Principal review of self scores across the 5 institutional Key Result Areas (Max 100 Marks)
                        </span>
                      </div>
                      {(() => {
                        const fData = selectedAppraisal.formData || {};
                        const k1 = fData.kra1 || selectedAppraisal.kra1 || {};
                        const k5 = fData.kra5 || selectedAppraisal.kra5 || {};
                        const s1 = selectedAppraisal.kraScores?.kra1 ?? k1.score ?? 0;
                        const s2 = selectedAppraisal.kraScores?.kra2 ?? 0;
                        const s3 = selectedAppraisal.kraScores?.kra3 ?? 0;
                        const s4 = selectedAppraisal.kraScores?.kra4 ?? 0;
                        const s5 = selectedAppraisal.kraScores?.kra5 ?? k5.score ?? 0;
                        const selfTotal = selectedAppraisal.totalScore ?? (s1 + s2 + s3 + s4 + s5);
                        const principalTotal = Object.values(principalHodScoresMap).reduce((a, b) => a + (Number(b) || 0), 0);
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-indigo-800 bg-indigo-100/70 px-2.5 py-0.5 rounded-full border border-indigo-200">
                              Self Score: {selfTotal} / 100
                            </span>
                            <span className="text-[10px] font-black text-purple-800 bg-purple-100/70 px-2.5 py-0.5 rounded-full border border-purple-200">
                              Principal Score: {principalTotal} / 100
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-zinc-50 text-zinc-500 font-bold border-b border-zinc-200">
                          <th className="p-3 text-left">Key Result Area (KRA) Particulars</th>
                          <th className="p-3 text-center w-24">Max Marks</th>
                          <th className="p-3 text-center w-28 text-indigo-700 font-black">HOD Self Score</th>
                          <th className="p-3 text-center w-36 text-purple-700 font-black">Principal Score</th>
                        </tr>
                      </thead>
                      {(() => {
                        const fData = selectedAppraisal.formData || {};
                        const k1 = fData.kra1 || selectedAppraisal.kra1 || {};
                        const k5 = fData.kra5 || selectedAppraisal.kra5 || {};
                        const s1 = selectedAppraisal.kraScores?.kra1 ?? k1.score ?? 0;
                        const s2 = selectedAppraisal.kraScores?.kra2 ?? 0;
                        const s3 = selectedAppraisal.kraScores?.kra3 ?? 0;
                        const s4 = selectedAppraisal.kraScores?.kra4 ?? 0;
                        const s5 = selectedAppraisal.kraScores?.kra5 ?? k5.score ?? 0;
                        const selfTotal = selectedAppraisal.totalScore ?? (s1 + s2 + s3 + s4 + s5);

                        const isPrincipalUser = userRole === "Principal" || userRole === "Admin";
                        const isEditable = isPrincipalUser || selectedAppraisal.status !== "Approved";

                        const kraItems = [
                          { key: "kra1", title: "KRA I: Department Academic Improvement", desc: "Anna University exam pass percentage (Target: 65%)", max: 30, selfScore: s1 },
                          { key: "kra2", title: "KRA II: Department Student Centric Activities", desc: "Co-curricular, IPKT, Guest Lectures, VAC, Soft Skills (5 each)", max: 25, selfScore: s2 },
                          { key: "kra3", title: "KRA III: Faculty Enrichment Efforts for Department", desc: "R&D funding, testing consultancy, online courses, publications", max: 20, selfScore: s3 },
                          { key: "kra4", title: "KRA IV: Significant Contribution towards Dept / Personal Dev.", desc: "CoE, MoUs, books, international visits, awards (2.5 each)", max: 5, selfScore: s4 },
                          { key: "kra5", title: "KRA V: Academic Excellence and Self Development (IIY)", desc: "Theory pass % (10), Online course (5), Research publication (5)", max: 20, selfScore: s5 }
                        ];

                        const principalTotal = Object.values(principalHodScoresMap).reduce((a, b) => a + (Number(b) || 0), 0);

                        return (
                          <>
                            <tbody className="divide-y divide-zinc-100">
                              {kraItems.map((item) => {
                                const currentPrincipalVal = principalHodScoresMap[item.key] ?? item.selfScore;
                                return (
                                  <tr key={item.key} className="hover:bg-slate-50/50">
                                    <td className="p-3">
                                      <span className="font-extrabold text-slate-800 block">{item.title}</span>
                                      <span className="text-[10px] text-zinc-400 font-medium">{item.desc}</span>
                                    </td>
                                    <td className="p-3 text-center font-bold text-zinc-600">{item.max}</td>
                                    <td className="p-3 text-center font-black text-indigo-700 text-sm">{item.selfScore}</td>
                                    <td className="p-3 text-center font-black">
                                      {isEditable ? (
                                        <input
                                          type="number"
                                          step="0.5"
                                          min="0"
                                          max={item.max}
                                          value={currentPrincipalVal === undefined || currentPrincipalVal === null ? "" : currentPrincipalVal}
                                          onChange={(e) => {
                                            const inputVal = e.target.value;
                                            const parsed = inputVal === "" ? 0 : Math.min(item.max, Math.max(0, Number(inputVal)));
                                            const nextMap = {
                                              ...principalHodScoresMap,
                                              [item.key]: parsed
                                            };
                                            setPrincipalHodScoresMap(nextMap);
                                            const newTotal = Object.values(nextMap).reduce((a, b) => a + (Number(b) || 0), 0);
                                            setFinalRating(String(newTotal));
                                          }}
                                          className="w-16 text-center font-black text-purple-900 bg-white border-2 border-purple-400 rounded-lg py-1 px-1.5 shadow-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-600 focus:outline-none"
                                        />
                                      ) : (
                                        <span className="text-purple-700 font-bold">{currentPrincipalVal}</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-gradient-to-r from-[#120c7a] via-indigo-800 to-purple-800 text-white font-black">
                                <td className="p-3 text-right text-xs uppercase tracking-wider">Grand Total Performance Score</td>
                                <td className="p-3 text-center text-zinc-200">100</td>
                                <td className="p-3 text-center text-base text-amber-300">{selfTotal}</td>
                                <td className="p-3 text-center text-base text-purple-200">{principalTotal}</td>
                              </tr>
                            </tfoot>
                          </>
                        );
                      })()}
                    </table>
                  </div>
                )}

                {/* ── NON-TEACHING PERFORMANCE EVALUATION SHEET (RATING & MARKS) ── */}
                {(selectedAppraisal.formType === "non_teaching" || selectedAppraisal.collectionName === "non_teaching_appraisals") && (
                  <div className="mt-8 border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-xs p-5 space-y-6">
                    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-1.5">
                          <Star size={14} className="text-[#120c7a]" /> PERFORMANCE EVALUATION SHEET (Review Rating)
                        </h4>
                        <p className="text-[11px] text-indigo-700 font-medium mt-0.5">
                          Select mark for each category (10, 9, 8, 6, 5, 4, 2). Total Marks out of 100.
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="block text-[9px] font-black text-indigo-400 uppercase tracking-widest">Calculated Grade</span>
                        <span className={`text-xl font-black ${
                          calculateNonTeachingGrade(Object.values(nonTeachingEvalMarks).reduce((a, b) => a + (Number(b) || 0), 0)) === 'A' ? 'text-emerald-600' :
                          calculateNonTeachingGrade(Object.values(nonTeachingEvalMarks).reduce((a, b) => a + (Number(b) || 0), 0)) === 'B' ? 'text-blue-600' :
                          calculateNonTeachingGrade(Object.values(nonTeachingEvalMarks).reduce((a, b) => a + (Number(b) || 0), 0)) === 'C' ? 'text-amber-600' : 'text-rose-600'
                        }`}>
                          Grade {calculateNonTeachingGrade(Object.values(nonTeachingEvalMarks).reduce((a, b) => a + (Number(b) || 0), 0))}
                        </span>
                      </div>
                    </div>

                    {/* 10 Categories Rating Table */}
                    <div className="overflow-x-auto border border-zinc-200 rounded-2xl">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-zinc-100 text-zinc-700 font-bold border-b border-zinc-200">
                            <th className="p-3 w-12 text-center border-r border-zinc-200">S. No</th>
                            <th className="p-3 border-r border-zinc-200">CATEGORY</th>
                            <th className="p-3 text-center w-72">Marks (10, 9, 8, 6, 5, 4, 2)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                          {NON_TEACHING_EVALUATION_CATEGORIES.map((cat) => {
                            const currentScore = Number(nonTeachingEvalMarks[cat.id]) || 10;
                            return (
                              <tr key={cat.id} className="hover:bg-zinc-50/50">
                                <td className="p-3 text-center font-bold text-zinc-500 border-r border-zinc-200">{cat.id}</td>
                                <td className="p-3 font-semibold text-zinc-800 border-r border-zinc-200">{cat.text}</td>
                                <td className="p-2 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {[10, 9, 8, 6, 5, 4, 2].map((mVal) => (
                                      <button
                                        key={mVal}
                                        type="button"
                                        disabled={!(userRole === "Principal" || userRole === "Admin") && selectedAppraisal.status === "Approved"}
                                        onClick={() => setNonTeachingEvalMarks({ ...nonTeachingEvalMarks, [cat.id]: mVal })}
                                        className={`w-7 h-7 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                          currentScore === mVal
                                            ? "bg-indigo-600 text-white shadow-md scale-105"
                                            : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
                                        } disabled:opacity-75`}
                                      >
                                        {mVal}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-indigo-50/80 font-bold border-t border-indigo-200">
                            <td colSpan={2} className="p-3 text-right text-indigo-950 font-bold text-xs uppercase tracking-wider">
                              Total Marks (100)
                            </td>
                            <td className="p-3 text-center text-indigo-700 font-black text-sm">
                              {Object.values(nonTeachingEvalMarks).reduce((a, b) => a + (Number(b) || 0), 0)} / 100
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Specific Comments & Recommendations */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-700 mb-1.5">Any other specific comment:</label>
                        <textarea
                          rows={3}
                          disabled={!(userRole === "Principal" || userRole === "Admin") && selectedAppraisal.status === "Approved"}
                          value={nonTeachingSpecificComment}
                          onChange={(e) => setNonTeachingSpecificComment(e.target.value)}
                          className="w-full rounded-2xl border border-zinc-200 p-3 text-xs font-medium focus:ring-2 focus:ring-indigo-500 bg-white outline-none"
                          placeholder="Enter evaluation remarks or improvement suggestions..."
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-zinc-700 mb-1.5">Recommendation</label>
                          <select
                            disabled={!(userRole === "Principal" || userRole === "Admin") && selectedAppraisal.status === "Approved"}
                            value={nonTeachingRecommendation}
                            onChange={(e) => setNonTeachingRecommendation(e.target.value)}
                            className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="His / Her contribution to be appreciated and recommended">His / Her contribution to be appreciated and recommended</option>
                            <option value="Satisfactory performance">Satisfactory performance</option>
                            <option value="Potential underutilized">Potential underutilized</option>
                            <option value="Counseling is required">Counseling is required</option>
                            <option value="Performance improvement is desired">Performance improvement is desired</option>
                            <option value="To be warned">To be warned</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-zinc-700 mb-1.5">Recommend for Suitable Increment Under Grade</label>
                          <select
                            disabled={!(userRole === "Principal" || userRole === "Admin") && selectedAppraisal.status === "Approved"}
                            value={nonTeachingIncrementGrade}
                            onChange={(e) => setNonTeachingIncrementGrade(e.target.value)}
                            className="w-full rounded-xl border border-zinc-200 p-2.5 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="A">Grade A (Above 89)</option>
                            <option value="B">Grade B (70 – 88)</option>
                            <option value="C">Grade C (50 – 69)</option>
                            <option value="D">Grade D (&lt; 50)</option>
                          </select>
                        </div>
                      </div>

                      {/* Grade Scale Summary */}
                      <div className="border border-zinc-200 rounded-2xl overflow-hidden text-xs bg-zinc-50/60 p-4 space-y-2">
                        <span className="block font-bold text-zinc-700 uppercase tracking-wider text-[10px]">Evaluation Grade Scale Summary</span>
                        <div className="grid grid-cols-4 gap-2 text-center font-bold">
                          <div className={`p-2 rounded-xl border ${calculateNonTeachingGrade(Object.values(nonTeachingEvalMarks).reduce((a, b) => a + (Number(b) || 0), 0)) === 'A' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-zinc-200 text-zinc-600'}`}>
                            <span>Above 89</span>
                            <span className="block text-xs font-black">Grade A</span>
                          </div>
                          <div className={`p-2 rounded-xl border ${calculateNonTeachingGrade(Object.values(nonTeachingEvalMarks).reduce((a, b) => a + (Number(b) || 0), 0)) === 'B' ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-zinc-200 text-zinc-600'}`}>
                            <span>70 – 88</span>
                            <span className="block text-xs font-black">Grade B</span>
                          </div>
                          <div className={`p-2 rounded-xl border ${calculateNonTeachingGrade(Object.values(nonTeachingEvalMarks).reduce((a, b) => a + (Number(b) || 0), 0)) === 'C' ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-zinc-200 text-zinc-600'}`}>
                            <span>50 – 69</span>
                            <span className="block text-xs font-black">Grade C</span>
                          </div>
                          <div className={`p-2 rounded-xl border ${calculateNonTeachingGrade(Object.values(nonTeachingEvalMarks).reduce((a, b) => a + (Number(b) || 0), 0)) === 'D' ? 'bg-rose-100 border-rose-300 text-rose-800' : 'bg-white border-zinc-200 text-zinc-600'}`}>
                            <span>&lt; 50</span>
                            <span className="block text-xs font-black">Grade D</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Reviewing Actions & Comments Portlet */}
              <div className="xl:col-span-4 2xl:col-span-3 bg-slate-50 border border-slate-200 rounded-3xl p-6 h-fit space-y-6 sticky top-6">

                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Star size={14} className="text-[#120c7a]" /> Evaluation & Recommendation
                  </h4>
                  <p className="text-[11px] text-zinc-500">Provide evaluation grade and recommendation comments for this appraisal request.</p>
                </div>

                {/* HOD Recommendations (shown to Principal/Admin for faculty/staff) */}
                {selectedAppraisal.hodReview && userRole !== "HOD" && selectedAppraisal.formType !== "hod" && (
                  <div className="bg-blue-50 border border-blue-150 p-4 rounded-2xl space-y-2">
                    <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest block border-b border-blue-200 pb-1">HOD Review Recommendations</span>
                    <div>
                      <span className="block text-[9px] font-black text-blue-700 uppercase tracking-wider">Evaluated Grade:</span>
                      <span className="text-xs font-black text-blue-900">{selectedAppraisal.hodReview.grade}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-blue-700 uppercase tracking-wider">Remarks:</span>
                      <p className="text-xs text-blue-950 font-medium">{selectedAppraisal.hodReview.comments}</p>
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

                {/* Final Rating Number Input Box */}
                {(userRole === "Principal" || userRole === "Admin") && (
                  <div>
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">Final Rating</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 0 to 100"
                      value={finalRating}
                      onChange={(e) => setFinalRating(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-bold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a]"
                    />
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

                  {(userRole === "Principal" || userRole === "Admin") && (
                    selectedAppraisal.status === "Approved" ? (
                      <div className="space-y-2">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center">
                          <span className="text-[11px] font-bold text-emerald-800 flex items-center justify-center gap-1">
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            Appraisal Approved
                          </span>
                          <p className="text-[10px] text-emerald-700 mt-0.5 font-medium">
                            Unlocked for Principal: You can modify marks, ratings, or remarks and save updates anytime.
                          </p>
                        </div>
                        <button
                          onClick={() => handleReviewAction("Approved")}
                          disabled={actioning}
                          className="w-full py-2.5 bg-gradient-to-r from-purple-700 to-indigo-800 hover:from-purple-800 hover:to-indigo-900 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-purple-100 cursor-pointer disabled:opacity-50"
                        >
                          {actioning ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Updated Marks
                        </button>
                        <button
                          onClick={() => setCorrectionModalOpen(true)}
                          disabled={actioning}
                          className="w-full py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Undo2 size={13} /> Re-route for Correction
                        </button>
                      </div>
                    ) : (selectedAppraisal.status === "HOD_Approved" || selectedAppraisal.status === "Submitted") ? (
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
                    ) : null
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
                    <option value="HOD_Approved">Coordinator Approved</option>
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
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${app.status === "Approved" ? "bg-emerald-500/10 text-emerald-700" :
                                app.status === "HOD_Approved" ? "bg-blue-500/10 text-blue-700" :
                                  app.status === "Submitted" ? "bg-amber-500/10 text-amber-700" :
                                    app.status === "Returned" ? "bg-rose-500/10 text-rose-700" :
                                      "bg-zinc-500/10 text-zinc-700"
                              }`}>
                              {app.status === "HOD_Approved" ? "Coordinator Approved" : app.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="p-4 text-center font-bold text-indigo-950">
                            {app.formType === "hod" ? (
                              <span className="inline-flex items-center justify-center gap-1 text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full text-xs font-black border border-indigo-200 shadow-2xs">
                                Self: {app.totalScore ?? 0} / 100
                              </span>
                            ) : app.hodReview?.grade ? (
                              <span className="flex items-center justify-center gap-1">
                                <Star size={10} className="fill-amber-400 text-amber-400" /> {app.hodReview.grade}
                              </span>
                            ) : (
                              <span className="text-zinc-300">-</span>
                            )}
                          </td>
                          <td className="p-4 text-center font-bold text-emerald-950">
                            {(app.principalReview?.finalRating !== undefined && app.principalReview?.finalRating !== null && app.principalReview?.finalRating !== "") ? (
                              <span className="inline-flex items-center justify-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-xs font-black border border-emerald-200 shadow-sm">
                                <Star size={11} className="fill-amber-400 text-amber-400" /> {app.principalReview.finalRating}
                              </span>
                            ) : app.principalReview?.grade ? (
                              <span className="flex items-center justify-center gap-1">
                                <Star size={10} className="fill-amber-400 text-amber-400" /> {app.principalReview.grade}
                              </span>
                            ) : (
                              <span className="text-zinc-300">-</span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap min-w-[200px]">
                              <button
                                onClick={() => handleOpenDetails(app)}
                                className={`px-3 py-1.5 text-white rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all inline-flex items-center gap-1 cursor-pointer shadow-xs ${
                                  (userRole === "Principal" || userRole === "Admin") && app.status === "Approved"
                                    ? "bg-purple-700 hover:bg-purple-800"
                                    : "bg-[#120c7a] hover:bg-[#1a10a0]"
                                }`}
                              >
                                {(userRole === "Principal" || userRole === "Admin") && app.status === "Approved" ? (
                                  <>
                                    <Edit2 size={12} /> Edit Marks
                                  </>
                                ) : (
                                  <>
                                    <Eye size={12} /> Review
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleOpenAttitudeModal(app)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all inline-flex items-center gap-1 cursor-pointer shadow-xs ${
                                  (app.attitudeSubmittedToPrincipal === true || app.attitudeEvaluation?.submittedToPrincipal === true)
                                    ? "bg-teal-700 hover:bg-teal-800 text-white"
                                    : (app.attitudeDraft || app.attitudeEvaluation?.isDraft)
                                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                }`}
                                title={
                                  (app.attitudeSubmittedToPrincipal === true || app.attitudeEvaluation?.submittedToPrincipal === true)
                                    ? "Attitude Form (Submitted by HOD)"
                                    : (app.attitudeDraft || app.attitudeEvaluation?.isDraft)
                                    ? "Attitude Form (Draft on HOD end - Not yet submitted to Principal)"
                                    : "Attitude Form"
                                }
                              >
                                <Award size={12} /> Attitude Form
                                {(app.attitudeSubmittedToPrincipal === true || app.attitudeEvaluation?.submittedToPrincipal === true) ? (
                                  <span className="ml-0.5 bg-black/25 text-white px-1.5 py-0.2 rounded text-[9px] font-black">
                                    {app.attitudeEvaluation?.totalScore ?? app.attitudeForm?.totalScore}/{app.attitudeEvaluation?.maxScore || app.attitudeForm?.maxScore || (getAttitudeQuestions(app).length * 5)}
                                  </span>
                                ) : (app.attitudeDraft || app.attitudeEvaluation?.isDraft) ? (
                                  <span className="ml-0.5 bg-amber-950/40 text-amber-100 px-1.5 py-0.2 rounded text-[9px] font-black">
                                    Draft (HOD)
                                  </span>
                                ) : null}
                              </button>
                            </div>
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

        {/* Attitude & Competency Evaluation Form Modal */}
        {attitudeModalOpen && attitudeAppraisal && (() => {
          const activeQuestions = getAttitudeQuestions(attitudeAppraisal);
          const maxScore = activeQuestions.length * 5;
          const currentTotal = Object.values(attitudeRatings).reduce((sum, v) => sum + (Number(v) || 0), 0);
          const evaluatedCount = Object.keys(attitudeRatings).filter(k => (Number(attitudeRatings[k]) || 0) > 0).length;
          const isNonTeaching = attitudeAppraisal.formType === "non_teaching" || attitudeAppraisal.collectionName === "non_teaching_appraisals";
          const isPrincipalOrHR = userRole === "Principal" || userRole === "HR" || userRole === "Admin";

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 md:p-6 overflow-y-auto">
              <div className="bg-white rounded-3xl w-full max-w-5xl border border-zinc-200 shadow-2xl overflow-hidden animate-scaleUp flex flex-col max-h-[92vh]">
                
                {/* Header */}
                <div className="bg-[#1c355e] text-white p-5 md:px-8 md:py-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-black text-lg md:text-xl">
                        {isNonTeaching 
                          ? "Non-Teaching Staff Attitude Form" 
                          : attitudeAppraisal.formType === "hod" 
                          ? "A.2 College — Head of Department (HoD)" 
                          : "Teacher Attitude Evaluation"}
                      </span>
                      <span className="bg-white/15 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-white/20">
                        Evaluation Form
                      </span>
                    </div>
                    <p className="text-xs text-blue-100 font-medium italic">
                      {isNonTeaching 
                        ? "CKGEI — Non-Teaching Staff Evaluation Questionnaire" 
                        : attitudeAppraisal.formType === "hod" 
                        ? "CKGEI — Coordinator / HoD Evaluation Questionnaire" 
                        : "CKGEI — Teacher Evaluation Questionnaire"}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-blue-200">
                      <span><strong>Staff / Faculty:</strong> {attitudeAppraisal.facultyName || attitudeAppraisal.staffName || attitudeAppraisal.hodName || attitudeAppraisal.name}</span>
                      <span>•</span>
                      <span><strong>Designation:</strong> {attitudeAppraisal.designation || attitudeAppraisal.formData?.designation || attitudeAppraisal.staffDesignation || "N/A"}</span>
                      <span>•</span>
                      <span><strong>Dept:</strong> {attitudeAppraisal.department || "N/A"}</span>
                      <span>•</span>
                      <span><strong>Year:</strong> {attitudeAppraisal.academicYear || "2024-2025"}</span>
                    </div>
                  </div>

                  {/* Score KPI Pill */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="bg-white/10 border border-white/20 rounded-2xl px-4 py-2 text-center">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-blue-200">Total Score</div>
                      <div className="text-lg font-black text-amber-300">
                        {currentTotal} / {maxScore}
                      </div>
                    </div>
                    <div className="bg-white/10 border border-white/20 rounded-2xl px-4 py-2 text-center">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-blue-200">Average</div>
                      <div className="text-lg font-black text-white">
                        {evaluatedCount > 0 ? (currentTotal / evaluatedCount).toFixed(2) : "0.00"} <span className="text-xs font-normal text-blue-200">/ 5.0</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setAttitudeModalOpen(false)}
                      className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Pending / Draft Banner */}
                {(!attitudeAppraisal.attitudeSubmittedToPrincipal && !attitudeAppraisal.attitudeEvaluation?.submittedToPrincipal) && (
                  <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs text-amber-900">
                    <span className="font-bold flex items-center gap-1.5">
                      <Clock size={14} className="text-amber-600" />
                      Status: {attitudeAppraisal.attitudeDraft ? "Draft Saved on HOD end (Pending final submission to Principal)" : "Pending evaluation by HOD (Not yet submitted to Principal)"}
                    </span>
                  </div>
                )}

                {/* Quick Actions & Legend Bar */}
                <div className="bg-blue-50/60 border-b border-blue-100 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 text-zinc-600 font-medium">
                    <span className="text-zinc-500 font-bold">Progress:</span>
                    <span className="text-[#1c355e] font-black">
                      {evaluatedCount}
                    </span> of {activeQuestions.length} statements evaluated
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSetAllRatings(5)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[11px] font-bold transition-all cursor-pointer"
                    >
                      Set all 5 (Outstanding)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetAllRatings(4)}
                      className="px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-800 text-[11px] font-bold transition-all cursor-pointer"
                    >
                      Set all 4 (Exceeds Expectations)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttitudeRatings({})}
                      className="px-2.5 py-1 rounded-lg bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-[11px] font-bold transition-all cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                {/* Questionnaire Table (Scrollable) */}
                <div className="overflow-y-auto p-4 md:p-6 space-y-5 flex-1">

                  {/* Evaluation Rubrics Reference Guide Card */}
                  <div className="bg-gradient-to-r from-slate-50 via-blue-50/40 to-slate-50 border border-blue-200/80 rounded-2xl p-4 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#1c355e] text-amber-400 flex items-center justify-center font-black text-xs shadow-2xs">
                          <Award size={13} />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-[#1c355e] uppercase tracking-wider">
                            Evaluation Rubrics & Scoring Criteria
                          </h4>
                          <p className="text-[11px] text-zinc-500 font-medium">
                            Standardized 5-point performance scale applied across all evaluation parameters.
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-[#1c355e] bg-white px-2.5 py-1 rounded-full border border-blue-200 shadow-2xs">
                        Rubric Scale: 1 (Lowest) to 5 (Highest)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                      {ATTITUDE_RATING_OPTIONS.map((rubric) => (
                        <div
                          key={rubric.value}
                          className="flex items-center gap-2.5 p-2.5 rounded-xl border border-zinc-200/90 bg-white shadow-2xs transition-all hover:border-blue-300 hover:shadow-xs"
                        >
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-sm shrink-0 border shadow-2xs ${rubric.badgeBg}`}>
                            {rubric.value}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider">
                              Score {rubric.value}
                            </div>
                            <div className="text-xs font-bold text-zinc-800 leading-tight" title={rubric.label}>
                              {rubric.label}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-zinc-300 rounded-2xl overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#1c355e] text-white text-xs uppercase tracking-wider font-bold">
                          <th className="p-3.5 w-12 text-center border-r border-blue-900/60">#</th>
                          <th className="p-3.5 border-r border-blue-900/60">Attitude & Statement</th>
                          {ATTITUDE_RATING_OPTIONS.map((opt) => (
                            <th key={opt.value} className="p-2.5 w-28 text-center border-r border-blue-900/60" title={`Score ${opt.value}: ${opt.label}`}>
                              <div className="flex items-center justify-center gap-1 mb-0.5">
                                <span className="w-5 h-5 rounded-md bg-white/20 text-white font-black text-xs inline-flex items-center justify-center">
                                  {opt.value}
                                </span>
                              </div>
                              <div className="text-[10px] font-medium text-blue-100 leading-tight tracking-normal">
                                {opt.label}
                              </div>
                            </th>
                          ))}
                          {isPrincipalOrHR && (
                            <th className="p-3 w-28 text-center border-l border-blue-900/60 bg-[#142847]" title="Principal / HR Mark (1 to 5)">
                              <div className="font-black text-xs text-amber-300">Score (1-5)</div>
                              <div className="text-[9px] text-zinc-300 font-medium tracking-normal lowercase first-letter:uppercase">Principal / HR</div>
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 text-xs">
                        {activeQuestions.map((q) => {
                          const currentVal = attitudeRatings[q.id];
                          return (
                            <tr key={q.id} className="hover:bg-blue-50/30 transition-colors">
                              <td className="p-3.5 font-bold text-center text-zinc-700 bg-zinc-50/50 border-r border-zinc-200">
                                {q.id}
                              </td>
                              <td className="p-3.5 border-r border-zinc-200">
                                <div className="font-bold text-[#1c355e] text-xs mb-0.5">
                                  {q.title}
                                </div>
                                <div className="text-zinc-600 text-[11px] leading-relaxed">
                                  {q.statement}
                                </div>
                              </td>
                              {ATTITUDE_RATING_OPTIONS.map((opt) => {
                                const isSelected = currentVal === opt.value;
                                return (
                                  <td
                                    key={opt.value}
                                    onClick={() => handleSetRating(q.id, opt.value)}
                                    className={`p-2 text-center border-r border-zinc-200 last:border-r-0 cursor-pointer transition-all ${
                                      isSelected ? "bg-teal-500/15" : "hover:bg-zinc-100"
                                    }`}
                                  >
                                    <div className="flex items-center justify-center">
                                      <div
                                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                          isSelected
                                            ? "bg-[#1c355e] border-[#1c355e] text-white shadow-xs"
                                            : "border-zinc-400 bg-white hover:border-[#1c355e]"
                                        }`}
                                      >
                                        {isSelected && <Check size={13} className="stroke-[3]" />}
                                      </div>
                                    </div>
                                  </td>
                                );
                              })}
                              {isPrincipalOrHR && (
                                <td className="p-2.5 text-center bg-amber-50/40 border-l border-zinc-200">
                                  <div className="flex items-center justify-center">
                                    <input
                                      type="number"
                                      min={1}
                                      max={5}
                                      value={currentVal || ""}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        if (raw === "") {
                                          handleSetRating(q.id, 0);
                                          return;
                                        }
                                        const num = parseInt(raw, 10);
                                        if (!isNaN(num)) {
                                          const clamped = Math.max(1, Math.min(5, num));
                                          handleSetRating(q.id, clamped);
                                        }
                                      }}
                                      className="w-14 h-8 text-center text-xs font-bold text-[#1c355e] bg-white border-2 border-amber-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                                      placeholder="1-5"
                                    />
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Remarks / Evidence Section */}
                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 md:p-5 space-y-2">
                    <label className="block text-xs font-bold text-[#1c355e] uppercase tracking-wider">
                      Remarks / Evidence:
                    </label>
                    <textarea
                      value={attitudeRemarks}
                      onChange={(e) => setAttitudeRemarks(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-zinc-300 p-3 text-xs text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1c355e]/20 focus:border-[#1c355e]"
                      placeholder="Enter qualitative comments, achievements observed, evidence, or feedback..."
                    />
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="bg-zinc-50 border-t border-zinc-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-xs text-zinc-600">
                    Total Evaluated Score: <strong className="text-[#1c355e] text-sm font-black">{currentTotal} / {maxScore}</strong>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setAttitudeModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl border border-zinc-300 hover:bg-zinc-100 text-zinc-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAttitudeEvaluation}
                      disabled={attitudeSaving}
                      className="px-6 py-2.5 rounded-xl bg-[#1c355e] hover:bg-[#152847] text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md shadow-blue-900/20"
                    >
                      {attitudeSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Save Attitude Evaluation
                    </button>
                  </div>
                </div>

              </div>
            </div>
          );
        })()}

      </div>
    </Layout>
  );
}
