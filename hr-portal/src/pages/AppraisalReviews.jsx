import {
  Paperclip, useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import { collection, onSnapshot, doc, updateDoc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  User, CheckCircle2, AlertCircle, FileText, ChevronRight,
  Eye, Check, Search, Building2, Filter, Loader2, ArrowLeft,
  X, Star, Printer, Undo2, Award, Sparkles, Send, GraduationCap, Library
} from "lucide-react";
import HRLayout from "../components/HRLayout";
import { getSchoolShortName, isSameInstitution } from "../utils/appraisalScore";
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

const calculateNonTeachingGrade = (totalMarks) => {
  if (totalMarks > 89) return "A";
  if (totalMarks >= 70) return "B";
  if (totalMarks >= 50) return "C";
  return "D";
};

export default function AppraisalReviews() {
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userDept, setUserDept] = useState(null);
  const [userInstitution, setUserInstitution] = useState(null);
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

  // Non-teaching evaluation states
  const [nonTeachingEvalMarks, setNonTeachingEvalMarks] = useState({
    1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 8: 10, 9: 10, 10: 10
  });
  const [nonTeachingSpecificComment, setNonTeachingSpecificComment] = useState("");
  const [nonTeachingRecommendation, setNonTeachingRecommendation] = useState("His / Her contribution to be appreciated and recommended");
  const [nonTeachingIncrementGrade, setNonTeachingIncrementGrade] = useState("A");

  const isSectionVisible = (id) => {
    const field = customFieldsConfig.find(f => f.id === id);
    return field ? field.visible !== false : true;
  };

  const cleanText = (val) => {
    if (!val) return "";
    if (typeof val !== "string") return val;
    return val.replace(/^"+|"+$/g, "").trim();
  };

  // Normalized dept compare: "Mathematics " vs "mathematics" vs "Maths." etc.
  const normDept = (v) => (v || "").toLowerCase().replace(/[^a-z0-9]/g, "");

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

  const renderExamTableReview = (title, list = []) => {
    return (
      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
        <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
          {title}
        </span>
        {list?.length ? (
          <div className="overflow-x-auto border border-zinc-200 rounded-xl bg-white">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-600 uppercase">
                <tr>
                  <th className="p-2.5">Class</th>
                  <th className="p-2.5">Subject</th>
                  <th className="p-2.5 text-center">Appeared</th>
                  <th className="p-2.5 text-center">Passed</th>
                  <th className="p-2.5 text-center">Pass %</th>
                  <th className="p-2.5 text-center">Subject Average</th>
                  <th className="p-2.5 text-center">Attachment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 font-semibold">
                {list.map((row, i) => (
                  <tr key={i}>
                    <td className="p-2.5 text-slate-800">{row.class || "-"}</td>
                    <td className="p-2.5 text-slate-800">{row.subject || "-"}</td>
                    <td className="p-2.5 text-center text-slate-600">{row.appeared || "0"}</td>
                    <td className="p-2.5 text-center text-slate-600">{row.passed || "0"}</td>
                    <td className="p-2.5 text-center font-black text-indigo-700">{row.passPercent || "-"}</td>
                    <td className="p-2.5 text-center font-black text-emerald-700">{row.subjectAvg || "-"}</td>
                    <td className="p-2.5 text-center">
                      {row.fileUrl ? (
                        <a
                          href={row.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg hover:bg-indigo-100 transition-all"
                          title={row.fileName || "View Proof Attachment"}
                        >
                          <Paperclip className="w-3 h-3" /> Proof
                        </a>
                      ) : (
                        <span className="text-zinc-400 font-semibold text-[10px]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-400 italic">No subject results recorded.</p>
        )}
      </div>
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

    // Unified automated-score source for the review table:
  // - Faculty appraisals store it in autoScore.breakdown (+ totals on autoScore)
  // - Teacher appraisals store it in evaluatedScore (part1Rows/part2Rows + totals)
  const reviewScore = useMemo(() => {
    const app = selectedAppraisal;
    if (!app) return null;
    const sum = (rows, k) => (rows || []).reduce((a, r) => a + (Number(r[k]) || 0), 0);
    if (app.autoScore?.breakdown) {
      const p1 = app.autoScore.breakdown.part1Rows || [];
      const p2 = app.autoScore.breakdown.part2Rows || [];
      return {
        part1Rows: p1,
        part2Rows: p2,
        part1Total: app.autoScore.part1Total ?? sum(p1, "scored"),
        part1Max: sum(p1, "maxMarks"),
        part2Total: app.autoScore.part2Total ?? sum(p2, "scored"),
        part2Max: sum(p2, "maxMarks"),
        grandTotal: app.autoScore.total ?? app.autoScore.grandTotal ?? (sum(p1, "scored") + sum(p2, "scored")),
        grandMax: app.autoScore.maxTotal ?? app.autoScore.grandMax ?? (sum(p1, "maxMarks") + sum(p2, "maxMarks")),
      };
    }
    if (app.evaluatedScore && (app.evaluatedScore.part1Rows || app.evaluatedScore.part2Rows)) {
      const ev = app.evaluatedScore;
      const p1 = ev.part1Rows || [];
      const p2 = ev.part2Rows || [];
      return {
        part1Rows: p1,
        part2Rows: p2,
        part1Total: ev.part1Total ?? sum(p1, "scored"),
        part1Max: ev.part1Max ?? sum(p1, "maxMarks"),
        part2Total: ev.part2Total ?? sum(p2, "scored"),
        part2Max: ev.part2Max ?? sum(p2, "maxMarks"),
        grandTotal: ev.grandTotal ?? (sum(p1, "scored") + sum(p2, "scored")),
        grandMax: ev.grandMax ?? (sum(p1, "maxMarks") + sum(p2, "maxMarks")),
      };
    }
    return null;
  }, [selectedAppraisal]);

  const appraisalTabs = useMemo(() => {    const baseTabs = [
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const uData = userSnap.data();
          const r = uData.role || "Faculty";
          setUserRole(r);
          setUserDept(uData.department || "");
          setUserInstitution(uData.institution || "");
          if (!location.state?.statusFilter) {
            if (r === "Coordinator" || r.toLowerCase().includes("coordinator")) {
              setStatusFilter("Submitted");
            } else if (r === "HOD" || r.toLowerCase().includes("hod") || r === "Principal" || r === "Admin") {
              setStatusFilter("HOD_Approved");
            }
          }
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

  // Fetch all appraisal records (Teaching, Non-Teaching, HOD, Teacher)
  useEffect(() => {
    if (!currentUser) return;
    let facultyList = [];
    let nonTeachingList = [];
    let hodList = [];
    let teacherList = [];

    const unsubFaculty = onSnapshot(collection(db, "faculty_appraisals"), (snap) => {
      facultyList = snap.docs.map((d) => ({ id: d.id, formType: "faculty", facultyName: d.data().facultyName || d.data().name, ...d.data() }));
      setAppraisals([...facultyList, ...nonTeachingList, ...hodList, ...teacherList]);
      setLoading(false);
    });

    const unsubNonTeaching = onSnapshot(collection(db, "non_teaching_appraisals"), (snap) => {
      nonTeachingList = snap.docs.map((d) => ({ id: d.id, formType: "non_teaching", facultyName: d.data().staffName || d.data().name, ...d.data() }));
      setAppraisals([...facultyList, ...nonTeachingList, ...hodList, ...teacherList]);
      setLoading(false);
    });

    const unsubHOD = onSnapshot(collection(db, "hod_appraisals"), (snap) => {
      hodList = snap.docs.map((d) => ({ id: d.id, formType: "hod", facultyName: d.data().hodName || d.data().name, ...d.data() }));
      setAppraisals([...facultyList, ...nonTeachingList, ...hodList, ...teacherList]);
      setLoading(false);
    });

    const unsubTeacher = onSnapshot(collection(db, "teacher_appraisals"), (snap) => {
      teacherList = snap.docs.map((d) => ({ id: d.id, formType: "teacher", facultyName: d.data().facultyName || d.data().name, ...d.data() }));
      setAppraisals([...facultyList, ...nonTeachingList, ...hodList, ...teacherList]);
      setLoading(false);
    });

    return () => {
      unsubFaculty();
      unsubNonTeaching();
      unsubHOD();
      unsubTeacher();
    };
  }, [currentUser]);

  const isCoordinatorRole = userRole === "Coordinator" || (userRole || "").toLowerCase().includes("coordinator");
  const isHODRole = userRole === "HOD" || (userRole || "").toLowerCase().includes("hod");
  const isPrincipalOrHR = userRole === "Principal" || userRole === "Principal / HR" || userRole === "HR" || userRole === "Admin" || userRole === "Super Admin" || (userRole || "").toLowerCase().includes("principal") || (userRole || "").toLowerCase().includes("hr");

  const filteredAppraisals = appraisals.filter((app) => {
    const nameMatch = (app.facultyName || "").toLowerCase().includes(searchTerm.toLowerCase());
    const emailMatch = (app.facultyEmail || "").toLowerCase().includes(searchTerm.toLowerCase());

    // Strict Institution-level Data Segregation: Restrict access to matching school role only
    const appInst = app.institution || app.formData?.institution || "";
    const isSuperAdmin = (userRole === "Admin" || userRole === "Super Admin") && (!userInstitution || userInstitution === "ALL");
    const instMatch = isSuperAdmin || isSameInstitution(userInstitution, appInst);

    const depMatch = (isHODRole || isCoordinatorRole)
      ? normDept(app.department) !== "" && normDept(app.department) === normDept(userDept)
      : (deptFilter === "All" || app.department === deptFilter);

    // Coordinator review workflow segregation:
    // "Submitted" appraisals are pending Coordinator review; hide from HOD/Principal until Coordinator evaluates and forwards.
    if (!isCoordinatorRole && app.status === "Submitted") {
      return false;
    }

    const statusMatch = statusFilter === "All" || app.status === statusFilter;

    return (nameMatch || emailMatch) && instMatch && depMatch && statusMatch;
  });

  const availableDepts = [...new Set(appraisals.filter(a => isSameInstitution(userInstitution, a.institution || a.formData?.institution)).map((a) => a.department))].filter(Boolean);

  const handleOpenDetails = (app) => {
    setSelectedAppraisal(app);
    setActiveDetailsTab(1);

    // Initialize reviewer criteria scores map (HOD / Coordinator editable column).
    // Precedence: saved HOD scores -> saved Coordinator scores -> automated self scores.
    const initialHodScores = {};
    if (app.hodReview?.hodScores) {
      Object.assign(initialHodScores, app.hodReview.hodScores);
    } else if (app.coordinatorReview?.scores) {
      Object.assign(initialHodScores, app.coordinatorReview.scores);
    } else if (app.autoScore?.breakdown) {
      const bd = app.autoScore.breakdown;
      const allRows = [...(bd.part1Rows || []), ...(bd.part2Rows || [])];
      allRows.forEach((r) => {
        initialHodScores[r.id] = r.scored ?? 0;
      });
    } else if (app.evaluatedScore && (app.evaluatedScore.part1Rows || app.evaluatedScore.part2Rows)) {
      const allRows = [...(app.evaluatedScore.part1Rows || []), ...(app.evaluatedScore.part2Rows || [])];
      allRows.forEach((r) => {
        initialHodScores[r.id] = r.scored ?? 0;
      });
    }
    setHodFacultyScoresMap(initialHodScores);

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

    if (isHODRole || isCoordinatorRole) {
      setComments(app.hodReview?.comments || app.coordinatorReview?.comments || "");
      setEvaluationGrade(app.hodReview?.grade || app.coordinatorReview?.grade || "Good");
    } else if (isPrincipalOrHR) {
      setComments(app.principalReview?.comments || "");
      setEvaluationGrade(app.principalReview?.grade || "Good");
      setFinalRating(app.principalReview?.finalRating ?? app.principalReview?.rating ?? "");
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

    // Coordinator-only reviewers save a distinct coordinatorReview (marks +
    // comments) and forward with HOD_Approved so Principal/HOD can see both
    // automated marks and coordinator marks side by side.
    const isCoordOnly = isCoordinatorRole && !isHODRole;

    // Reviewer per-row totals from the editable score map over unified rows
    const revRowsP1 = reviewScore?.part1Rows || [];
    const revRowsP2 = reviewScore?.part2Rows || [];
    const revVal = (r) => {
      const v = hodFacultyScoresMap[r.id];
      return (v === "" || v === undefined || v === null) ? (Number(r.scored) || 0) : (Number(v) || 0);
    };
    const revP1T = Math.round(revRowsP1.reduce((s, r) => s + revVal(r), 0) * 100) / 100;
    const revP2T = Math.round(revRowsP2.reduce((s, r) => s + revVal(r), 0) * 100) / 100;

    if (isCoordOnly) {
      updatePayload.coordinatorReview = {
        scores: { ...hodFacultyScoresMap },
        part1Total: revP1T,
        part2Total: revP2T,
        totalScore: Math.round((revP1T + revP2T) * 100) / 100,
        maxTotal: reviewScore?.grandMax ?? 0,
        comments: comments.trim() || (newStatus === "HOD_Approved" ? "Reviewed by Coordinator" : ""),
        grade: evaluationGrade,
        reviewedBy: currentUser?.email || "",
        reviewedAt: new Date().toISOString()
      };
    } else if (isHODRole) {
      updatePayload.hodReview = {
        comments: isNonTeaching
          ? (nonTeachingSpecificComment.trim() || (newStatus === "HOD_Approved" ? "Reviewed by HOD" : ""))
          : (comments.trim() || (newStatus === "HOD_Approved" ? "Reviewed by HOD" : "")),
        grade: isNonTeaching ? derivedGrade : evaluationGrade,
        reviewedBy: currentUser?.email || "",
        reviewedAt: new Date().toISOString()
      };
    } else if (isPrincipalOrHR) {
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
    }

    if (!isNonTeaching && reviewScore && !isCoordOnly) {
      const p1 = reviewScore.part1Rows || [];
      const p2 = reviewScore.part2Rows || [];
      const p1HodT = p1.reduce((sum, r) => sum + (Number(hodFacultyScoresMap[r.id] ?? r.scored) || 0), 0);
      const p2HodT = p2.reduce((sum, r) => sum + (Number(hodFacultyScoresMap[r.id] ?? r.scored) || 0), 0);
      const gHodT = p1HodT + p2HodT;

      if (!updatePayload.hodReview) {
        updatePayload.hodReview = selectedAppraisal.hodReview || {};
      }
      updatePayload.hodReview.hodScores = hodFacultyScoresMap;
      updatePayload.hodReview.hodPart1Total = p1HodT;
      updatePayload.hodReview.hodPart2Total = p2HodT;
      updatePayload.hodReview.hodTotalScore = gHodT;
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
      const targetColl = isNonTeaching ? "non_teaching_appraisals" : selectedAppraisal.formType === "hod" ? "hod_appraisals" : selectedAppraisal.formType === "teacher" ? "teacher_appraisals" : "faculty_appraisals";
      await updateDoc(doc(db, targetColl, selectedAppraisal.id), updatePayload);
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

    const isNonTeaching = selectedAppraisal.formType === "non_teaching" || selectedAppraisal.collectionName === "non_teaching_appraisals";

    const isCoordOnlyReturn = (userRole === "Coordinator" || (userRole || "").toLowerCase().includes("coordinator")) && !(userRole === "HOD" || (userRole || "").toLowerCase().includes("hod"));

    const updatePayload = {
      status: "Returned",
      updatedAt: new Date().toISOString(),
      hodReview: (isHODRole) ? {
        comments: correctionComments,
        reviewedBy: currentUser?.email || "",
        reviewedAt: new Date().toISOString()
      } : selectedAppraisal.hodReview,
      coordinatorReview: isCoordOnlyReturn ? {
        ...(selectedAppraisal.coordinatorReview || {}),
        comments: correctionComments,
        reviewedBy: currentUser?.email || "",
        reviewedAt: new Date().toISOString()
      } : selectedAppraisal.coordinatorReview,
      principalReview: (isPrincipalOrHR) ? {
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
      const targetColl = isNonTeaching ? "non_teaching_appraisals" : selectedAppraisal.formType === "hod" ? "hod_appraisals" : selectedAppraisal.formType === "teacher" ? "teacher_appraisals" : "faculty_appraisals";
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
    const data = app.formData || app;
    const doc = new jsPDF("p", "pt", "a4");

    doc.setFont("Times", "bold");
    doc.setFontSize(14);
    doc.text("CK COLLEGE OF ENGINEERING & TECHNOLOGY, CUDDALORE - 607 003", 30, 45);
    doc.setFontSize(11);
    doc.setFont("Times", "normal");
    doc.text("SELF APPRAISAL FORM FOR TEACHING FACULTY", 190, 65);
    doc.setFont("Times", "italic");
    doc.text(`Academic Session: ${app.academicYear || ""}`, 230, 80);

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
      <HRLayout title="Appraisal Reviews">
        <div className="flex justify-center items-center py-24">
          <Loader2 size={36} className="animate-spin text-[#120c7a]" />
        </div>
      </HRLayout>
    );
  }

  return (
    <HRLayout title="Faculty Appraisal Requests">
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
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${selectedAppraisal.formType === "hod"
                    ? "bg-purple-500/20 text-purple-700 border border-purple-500/30"
                    : selectedAppraisal.formType === "non_teaching"
                      ? "bg-teal-500/20 text-teal-700 border border-teal-500/30"
                      : selectedAppraisal.formType === "teacher"
                        ? "bg-amber-500/20 text-amber-700 border border-amber-500/30"
                        : "bg-indigo-500/20 text-indigo-700 border border-indigo-500/30"
                  }`}>
                  {selectedAppraisal.formType === "hod" ? "HOD Appraisal" : selectedAppraisal.formType === "non_teaching" ? "Non-Teaching Appraisal" : selectedAppraisal.formType === "teacher" ? "Teacher Appraisal" : "Faculty Appraisal"}
                </span>
                <button
                  onClick={() => handlePrintPDF(selectedAppraisal)}
                  className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Printer size={14} /> Print PDF
                </button>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${selectedAppraisal.status === "Approved" ? "bg-emerald-500/20 text-emerald-700 border border-emerald-500/30" :
                    selectedAppraisal.status === "HOD_Approved" ? "bg-blue-500/20 text-blue-700 border border-blue-500/30" :
                      selectedAppraisal.status === "Submitted" ? "bg-amber-500/20 text-amber-700 border border-amber-500/30" :
                        selectedAppraisal.status === "Returned" ? "bg-rose-500/20 text-rose-700 border border-rose-500/30" :
                          "bg-zinc-500/20 text-zinc-700 border border-zinc-500/30"
                  }`}>
                  {selectedAppraisal.status === "HOD_Approved" ? "COORDINATOR APPROVED" : selectedAppraisal.status.replace("_", " ")}
                </span>
              </div>
            </div>

            {/* Appraisal Details Content */}
            <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">

              {/* Left Column: Form Details & Tables (2 cols wide) */}
              <div className="lg:col-span-2 space-y-8">

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

                  const teacherSubTabs = [
                    { id: 1, name: "1. Staff Profile & Experience" },
                    { id: 2, name: "2. Workload & Academic Results" },
                    { id: 3, name: "3. Invest In Yourself & Growth" },
                    { id: 4, name: "4. Rating, Targets & Self Analysis" }
                  ];

                  const currentSubTabs = selectedAppraisal?.formType === "hod"
                    ? hodSubTabs
                    : selectedAppraisal?.formType === "non_teaching"
                      ? nonTeachingSubTabs
                      : selectedAppraisal?.formType === "teacher"
                        ? teacherSubTabs
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
                    {activeDetailsTab === 1 && (
                      <div className="space-y-6 animate-fadeIn">
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            HOD Profile & Designation Details
                          </span>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-xs">
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">HOD Name</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.hodName || selectedAppraisal.hodName || selectedAppraisal.facultyName}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Department</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.department || selectedAppraisal.department}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Designation</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.designation || selectedAppraisal.designation || "Head of Department"}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Date of Joining</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.doj || selectedAppraisal.doj || "-"}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Qualification</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.qualification || selectedAppraisal.qualification || "-"}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Academic Session</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.academicYear}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDetailsTab === 2 && (
                      <div className="space-y-6 animate-fadeIn">
                        <div className="border-b border-zinc-150 pb-2 mb-4">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Key Result Areas (KRA 1 to KRA 5) Performance Breakdown</h4>
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase">HOD Self Appraisal Scores, Parameters & Evidence Attachments</p>
                        </div>

                        {/* KRA I: ACADEMIC IMPROVEMENT: Academic Performance in Examinations */}
                        {(() => {
                          const k1 = selectedAppraisal.formData?.kra1 || {};
                          const k1Score = selectedAppraisal.kraScores?.kra1 ?? k1.score ?? 0;
                          const tierLabels = {
                            "80_above": "80% & Above (30 Marks)",
                            "60_79": "60 - 79% (25 Marks)",
                            "40_59": "40 - 59% (20 Marks)",
                            "30_39": "30 - 39% (12 Marks)",
                            "21_29": "21 - 29% (8 Marks)",
                            "below_20": "Below 20% (0 Marks)",
                            "65_above": "≥ 65% (30 Marks)"
                          };
                          return (
                            <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                                <span className="text-xs font-black text-[#120c7a] uppercase tracking-wider">
                                  KRA I: ACADEMIC IMPROVEMENT: Academic Performance in Examinations
                                </span>
                                <span className="px-3 py-1 bg-indigo-50 border border-indigo-150 text-[#120c7a] rounded-full text-xs font-extrabold">
                                  Self Score: {k1Score} / 30 Marks
                                </span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                <div className="bg-white p-3 rounded-xl border border-zinc-200">
                                  <span className="block text-[10px] font-black text-zinc-400 uppercase">Overall Exam Pass %</span>
                                  <span className="font-bold text-slate-800">{k1.passPct ? `${k1.passPct}%` : "-"}</span>
                                </div>
                                <div className="bg-white p-3 rounded-xl border border-zinc-200">
                                  <span className="block text-[10px] font-black text-zinc-400 uppercase font-bold">Metrics / Target Tier</span>
                                  <span className="font-bold text-slate-800">{tierLabels[k1.tier] || k1.tier || "-"}</span>
                                </div>
                              </div>
                              {k1.remarks && (
                                <div className="bg-white p-3 rounded-xl border border-zinc-200 text-xs text-slate-700">
                                  <span className="block text-[10px] font-black text-zinc-400 uppercase mb-1">Remarks & Details</span>
                                  <p className="font-medium">{k1.remarks}</p>
                                </div>
                              )}
                              {k1.proof?.fileUrl && (
                                <div className="flex items-center gap-2 pt-1">
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Evidence Document:</span>
                                  <a
                                    href={k1.proof.fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-lg text-xs"
                                  >
                                    View Evidence ({k1.proof.fileName || "File"})
                                  </a>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* KRA II: Department Student Centric Activities */}
                        {(() => {
                          const k2 = selectedAppraisal.formData?.kra2 || {};
                          const k2Score = selectedAppraisal.kraScores?.kra2 ?? 0;
                          const k2SubItems = [
                            { key: "coCurricular", label: "1. Ensured Min 60% Participation in Co-curricular Activities" },
                            { key: "softSkillsSpecial", label: "2. Soft Skill / Career guidance / Govt Exam / Life Skill / Olympiad" }
                          ];
                          return (
                            <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl space-y-4">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                                <span className="text-xs font-black text-[#120c7a] uppercase tracking-wider">
                                  KRA II: STUDENT CENTRIC ACTIVITIES
                                </span>
                                <span className="px-3 py-1 bg-indigo-50 border border-indigo-150 text-[#120c7a] rounded-full text-xs font-extrabold">
                                  Self Score: {k2Score} / 25 Marks
                                </span>
                              </div>
                              <div className="space-y-3">
                                {k2SubItems.map((item) => {
                                  const sub = k2[item.key] || {};
                                  return (
                                    <div key={item.key} className="bg-white p-3.5 rounded-xl border border-zinc-200 text-xs space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="font-bold text-slate-800">{item.label}</span>
                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${sub.achieved ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-zinc-100 text-zinc-500 border border-zinc-200"
                                          }`}>
                                          {sub.achieved ? "100% Target Met (12.5 Marks)" : "Below Target (0 Marks)"}
                                        </span>
                                      </div>
                                      {sub.remarks && (
                                        <p className="text-zinc-600 font-medium text-[11px] bg-slate-50 p-2 rounded-lg border border-zinc-150">
                                          {sub.remarks}
                                        </p>
                                      )}
                                      {sub.fileUrl && (
                                        <div className="flex items-center gap-2 pt-0.5">
                                          <span className="text-[10px] font-bold text-zinc-400 uppercase">Proof:</span>
                                          <a
                                            href={sub.fileUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-md text-[11px]"
                                          >
                                            View Evidence ({sub.fileName || "File"})
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* KRA III: Faculty Enrichment Efforts IIY */}
                        {(() => {
                          const k3 = selectedAppraisal.formData?.kra3 || {};
                          const k3Score = selectedAppraisal.kraScores?.kra3 ?? (k3.achieved ? 20 : 0);
                          return (
                            <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl space-y-4">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                                <span className="text-xs font-black text-[#120c7a] uppercase tracking-wider">
                                  KRA III: TEACHERS ENRICHMENT EFFORTS: Invest in Yourself (IIY)
                                </span>
                                <span className="px-3 py-1 bg-indigo-50 border border-indigo-150 text-[#120c7a] rounded-full text-xs font-extrabold">
                                  Self Score: {k3Score} / 20 Marks
                                </span>
                              </div>
                              <div className="bg-white p-3.5 rounded-xl border border-zinc-200 text-xs space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-800">Knowledge Sharing Sessions & 1 Learned Topic Presented with Good Ratings</span>
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${k3.achieved ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-zinc-100 text-zinc-500 border border-zinc-200"
                                    }`}>
                                    {k3.achieved ? "100% Target Met (20 Marks)" : "Below Target - Nil (0 Marks)"}
                                  </span>
                                </div>
                                {k3.remarks && (
                                  <p className="text-zinc-600 font-medium text-[11px] bg-slate-50 p-2 rounded-lg border border-zinc-150">
                                    {k3.remarks}
                                  </p>
                                )}
                                {k3.proof?.fileUrl && (
                                  <div className="flex items-center gap-2 pt-0.5">
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Proof:</span>
                                    <a
                                      href={k3.proof.fileUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-md text-[11px]"
                                    >
                                      View Evidence ({k3.proof.fileName || "File"})
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* KRA IV: Significant Contribution towards Department / Personal Development */}
                        {(() => {
                          const k4 = selectedAppraisal.formData?.kra4 || [];
                          const k4Score = selectedAppraisal.kraScores?.kra4 ?? 0;
                          return (
                            <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl space-y-4">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                                <span className="text-xs font-black text-[#120c7a] uppercase tracking-wider">
                                  KRA IV: Significant Contribution towards Department / Personal Development
                                </span>
                                <span className="px-3 py-1 bg-indigo-50 border border-indigo-150 text-[#120c7a] rounded-full text-xs font-extrabold">
                                  Self Score: {k4Score} / 5 Marks
                                </span>
                              </div>
                              {Array.isArray(k4) && k4.length > 0 ? (
                                <div className="space-y-3">
                                  {k4.map((item, idx) => (
                                    <div key={idx} className="bg-white p-3.5 rounded-xl border border-zinc-200 text-xs space-y-1">
                                      <span className="font-bold text-slate-800 block text-xs">{idx + 1}. {item.title || "Contribution"}</span>
                                      {item.description && (
                                        <p className="text-zinc-600 font-medium text-[11px]">{item.description}</p>
                                      )}
                                      {item.fileUrl && (
                                        <div className="flex items-center gap-2 pt-1">
                                          <span className="text-[10px] font-bold text-zinc-400 uppercase">Proof:</span>
                                          <a
                                            href={item.fileUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-md text-[11px]"
                                          >
                                            View Evidence ({item.fileName || "File"})
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-zinc-400 italic">No contributions specified.</p>
                              )}
                            </div>
                          );
                        })()}

                        {/* KRA V: Academic Excellence */}
                        {(() => {
                          const k5 = selectedAppraisal.formData?.kra5 || {};
                          const k5Score = selectedAppraisal.kraScores?.kra5 ?? k5.score ?? 0;
                          const k5ResultTierLabels = {
                            "90_above": "90% & Above (20 Marks)",
                            "81_90": "81 - 90% (10 Marks)",
                            "71_80": "71 - 80% (8 Marks)",
                            "61_70": "61 - 70% (6 Marks)",
                            "51_60": "51 - 60% (4 Marks)",
                            "below_50": "Below 50% (0 Marks)"
                          };
                          return (
                            <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl space-y-4">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                                <span className="text-xs font-black text-[#120c7a] uppercase tracking-wider">
                                  KRA V: Academic Excellence
                                </span>
                                <span className="px-3 py-1 bg-indigo-50 border border-indigo-150 text-[#120c7a] rounded-full text-xs font-extrabold">
                                  Self Score: {k5Score} / 20 Marks
                                </span>
                              </div>

                              <div className="space-y-3 text-xs">
                                <div className="bg-white p-3.5 rounded-xl border border-zinc-200 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-800">Public / Annual Examination Result</span>
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-50 text-indigo-800 border border-indigo-200">
                                      {k5ResultTierLabels[k5.tier || k5.resultTier] || k5.tier || k5.resultTier || "Below 50%"}
                                    </span>
                                  </div>

                                  {Array.isArray(k5.subjectResults) && k5.subjectResults.length > 0 ? (
                                    <div className="space-y-2 pt-1">
                                      {k5.subjectResults.map((sub, idx) => (
                                        <div key={idx} className="grid grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-lg border border-zinc-150">
                                          <div>
                                            <span className="block text-[10px] font-bold text-zinc-400 uppercase">
                                              {k5.subjectResults.length > 1 ? `Theory Pass % (#${idx + 1})` : "Theory Pass % (Target: 95%)"}
                                            </span>
                                            <span className="font-bold text-slate-800">{sub.theoryPassPct ? `${sub.theoryPassPct}%` : "-"}</span>
                                          </div>
                                          <div>
                                            <span className="block text-[10px] font-bold text-zinc-400 uppercase">
                                              {k5.subjectResults.length > 1 ? `Practical Pass % (#${idx + 1})` : "Practical Pass % (Target: 90%)"}
                                            </span>
                                            <span className="font-bold text-slate-800">{sub.practicalPassPct ? `${sub.practicalPassPct}%` : "-"}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 gap-3 pt-1">
                                      <div className="bg-slate-50 p-2.5 rounded-lg border border-zinc-150">
                                        <span className="block text-[10px] font-bold text-zinc-400 uppercase">Theory Pass % (Target: 95%)</span>
                                        <span className="font-bold text-slate-800">{k5.theoryPassPct ? `${k5.theoryPassPct}%` : "-"}</span>
                                      </div>
                                      <div className="bg-slate-50 p-2.5 rounded-lg border border-zinc-150">
                                        <span className="block text-[10px] font-bold text-zinc-400 uppercase">Practical Pass % (Target: 90%)</span>
                                        <span className="font-bold text-slate-800">{k5.practicalPassPct ? `${k5.practicalPassPct}%` : "-"}</span>
                                      </div>
                                    </div>
                                  )}

                                  {(k5.remarks || k5.resultRemarks) && (
                                    <p className="text-zinc-600 font-medium text-[11px] bg-slate-50 p-2 rounded-lg border border-zinc-150">
                                      {k5.remarks || k5.resultRemarks}
                                    </p>
                                  )}
                                  {(k5.proof?.fileUrl || k5.resultProof?.fileUrl) && (
                                    <div className="flex items-center gap-2 pt-0.5">
                                      <span className="text-[10px] font-bold text-zinc-400 uppercase">Result Proof:</span>
                                      <a
                                        href={k5.proof?.fileUrl || k5.resultProof?.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-indigo-600 font-bold hover:underline inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-md text-[11px]"
                                      >
                                        View Evidence ({(k5.proof || k5.resultProof)?.fileName || "File"})
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {activeDetailsTab === 3 && (
                      <div className="space-y-6 animate-fadeIn">
                        <div className="bg-gradient-to-br from-indigo-50 to-slate-50 p-6 rounded-2xl border border-indigo-100 space-y-4">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-indigo-100 pb-2">
                            HOD Performance Score Summary
                          </span>
                          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-indigo-100">
                            <div>
                              <span className="text-xs font-bold text-slate-700 block">Total KRA Self Performance Score</span>
                              <span className="text-[10px] text-zinc-400 font-medium">Cumulative score across KRA 1 to KRA 5 (Max 100 Marks)</span>
                            </div>
                            <div className="text-right">
                              <span className="text-2xl font-black text-[#120c7a]">{selectedAppraisal.totalScore || 0}</span>
                              <span className="text-xs font-bold text-zinc-400"> / 100</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-emerald-50/60 p-5 rounded-2xl border border-emerald-100/80 space-y-2">
                          <span className="text-xs font-black text-emerald-950 uppercase tracking-wider block border-b border-emerald-200/50 pb-2">
                            Digital Declaration & Submission
                          </span>
                          <div className="flex items-center gap-2 text-xs text-emerald-900 font-bold pt-1">
                            <CheckCircle2 size={16} className="text-emerald-600" />
                            <span>Self Appraisal information & ratings digitally certified by HOD.</span>
                          </div>
                          {selectedAppraisal.declarationDate && (
                            <span className="text-[10px] text-emerald-700 font-semibold block">
                              Submitted Date: {new Date(selectedAppraisal.declarationDate).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── TEACHER APPRAISAL FORM REVIEW VIEWS ── */}
                {selectedAppraisal?.formType === "teacher" && (
                  <>
                    {/* Sub-Tab 1: Staff Profile & Experience */}
                    {activeDetailsTab === 1 && (
                      <div className="space-y-6 animate-fadeIn">
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            Teacher Profile & Designation Details
                          </span>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-xs">
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Faculty Name</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.name || selectedAppraisal.facultyName}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Date of Birth & Age</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.dob || "-"} {selectedAppraisal.formData?.age ? `(${selectedAppraisal.formData.age} yrs)` : ""}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Designation</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.designation || "-"}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Department</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.department || selectedAppraisal.department}</span>
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
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Academic Qualification</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.qualification || "-"}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider">Subject Interest / Specialization</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.specialization || "-"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            Teaching & Industrial Experience (Years)
                          </span>
                          <div className="grid grid-cols-3 gap-4 text-xs text-center">
                            <div className="p-3 bg-white rounded-xl border border-zinc-200/80">
                              <span className="block text-[10px] font-bold text-zinc-400 uppercase">Teaching at {getSchoolShortName(selectedAppraisal.institution || selectedAppraisal.formData?.institution)}</span>
                              <span className="text-sm font-black text-indigo-700">{selectedAppraisal.formData?.expCKSPE || "0"} Yrs</span>
                            </div>
                            <div className="p-3 bg-white rounded-xl border border-zinc-200/80">
                              <span className="block text-[10px] font-bold text-zinc-400 uppercase">Teaching Elsewhere</span>
                              <span className="text-sm font-black text-indigo-700">{selectedAppraisal.formData?.expOther || "0"} Yrs</span>
                            </div>
                            <div className="p-3 bg-white rounded-xl border border-zinc-200/80">
                              <span className="block text-[10px] font-bold text-zinc-400 uppercase">Industrial Experience</span>
                              <span className="text-sm font-black text-indigo-700">{selectedAppraisal.formData?.expIndustrial || "0"} Yrs</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sub-Tab 2: Workload & Academic Results */}
                    {activeDetailsTab === 2 && (
                      <div className="space-y-6 animate-fadeIn">
                        {/* Workload */}
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            8. Weekly Workload Breakdown (Hrs/Wk)
                          </span>
                          <div className="grid grid-cols-5 gap-3 text-xs text-center">
                            <div className="p-2.5 bg-white rounded-xl border border-zinc-200">
                              <span className="block text-[9px] font-bold text-zinc-400 uppercase">Theory</span>
                              <span className="font-black text-slate-800">{selectedAppraisal.formData?.workload?.theory || "0"}</span>
                            </div>
                            <div className="p-2.5 bg-white rounded-xl border border-zinc-200">
                              <span className="block text-[9px] font-bold text-zinc-400 uppercase">Practical</span>
                              <span className="font-black text-slate-800">{selectedAppraisal.formData?.workload?.practical || "0"}</span>
                            </div>
                            <div className="p-2.5 bg-white rounded-xl border border-zinc-200">
                              <span className="block text-[9px] font-bold text-zinc-400 uppercase">Special Class</span>
                              <span className="font-black text-slate-800">{selectedAppraisal.formData?.workload?.specialClass || "0"}</span>
                            </div>
                            <div className="p-2.5 bg-white rounded-xl border border-zinc-200">
                              <span className="block text-[9px] font-bold text-zinc-400 uppercase">Other Activity</span>
                              <span className="font-black text-slate-800">{selectedAppraisal.formData?.workload?.otherActivity || "0"}</span>
                            </div>
                            <div className="p-2.5 bg-indigo-50 rounded-xl border border-indigo-200">
                              <span className="block text-[9px] font-bold text-indigo-600 uppercase">Total Hrs</span>
                              <span className="font-black text-indigo-900">{selectedAppraisal.formData?.workload?.total || "0"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Exam Tables Helper */}
                        {renderExamTableReview("9. THEORY: Quarterly Examination (Sep)", selectedAppraisal.formData?.resultsQuarterly)}
                        {renderExamTableReview("10. THEORY: Half Yearly Examination (Dec)", selectedAppraisal.formData?.resultsHalfYearly)}
                        {renderExamTableReview("11. THEORY: Annual Examination (April)", selectedAppraisal.formData?.resultsAnnualTheory)}
                        {renderExamTableReview("PRACTICALS: Annual Examination (April)", selectedAppraisal.formData?.resultsAnnualPractical)}

                        {/* Attribution */}
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-2">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            12. Results Attributed To
                          </span>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {Object.entries(selectedAppraisal.formData?.resultsAttributedTo || {}).map(([key, val]) => val && (
                              <span key={key} className="px-3 py-1 bg-indigo-100 border border-indigo-200 text-indigo-900 rounded-full text-xs font-bold capitalize">
                                {key.replace(/([A-Z])/g, ' $1')}
                              </span>
                            ))}
                            {!Object.values(selectedAppraisal.formData?.resultsAttributedTo || {}).some(Boolean) && (
                              <span className="text-xs text-zinc-400 italic">No attribution selected</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sub-Tab 3: Invest In Yourself & Growth */}
                    {activeDetailsTab === 3 && (
                      <div className="space-y-6 animate-fadeIn">
                        {/* IIY Classes */}
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            14. A) Classes Handled per Week ({selectedAppraisal.academicYear || ""})
                          </span>
                          {selectedAppraisal.formData?.iiyClasses?.length ? (
                            <div className="overflow-x-auto border border-zinc-200 rounded-xl bg-white">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-600 uppercase">
                                  <tr>
                                    <th className="p-2.5">Topic</th>
                                    <th className="p-2.5 text-center">No. of Classes</th>
                                    <th className="p-2.5 text-center">Knowledge Sharing Date</th>
                                    <th className="p-2.5 text-center">Teachers Rating</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 font-semibold">
                                  {selectedAppraisal.formData.iiyClasses.map((row, i) => (
                                    <tr key={i}>
                                      <td className="p-2.5 text-slate-800">{row.topic || "-"}</td>
                                      <td className="p-2.5 text-center text-slate-600">{row.numClasses || "-"}</td>
                                      <td className="p-2.5 text-center text-slate-600">{row.sessionDate || "-"}</td>
                                      <td className="p-2.5 text-center font-bold text-indigo-700">{row.rating ? `${row.rating} / 10` : "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : <p className="text-xs text-zinc-400 italic">No classes recorded.</p>}
                        </div>

                        {/* IIY Outcome */}
                        {selectedAppraisal.formData?.iiyOutcome && (
                          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-2">
                            <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                              IIY Outcome & Achievements
                            </span>
                            <p className="text-xs font-semibold text-slate-800 leading-relaxed bg-white p-3 rounded-xl border border-zinc-200">
                              {selectedAppraisal.formData.iiyOutcome}
                            </p>
                          </div>
                        )}

                        {/* Workshops */}
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            Workshops / Conferences / Seminars Participation
                          </span>
                          {selectedAppraisal.formData?.workshops?.length ? (
                            <div className="overflow-x-auto border border-zinc-200 rounded-xl bg-white">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-600 uppercase">
                                  <tr>
                                    <th className="p-2.5">Title of Program</th>
                                    <th className="p-2.5 text-center">Dates</th>
                                    <th className="p-2.5 text-center">Days</th>
                                    <th className="p-2.5">Organization</th>
                                    <th className="p-2.5 text-center">Report Submitted</th>
                                    <th className="p-2.5 text-center">Attachment</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 font-semibold">
                                  {selectedAppraisal.formData.workshops.map((w, i) => (
                                    <tr key={i}>
                                      <td className="p-2.5 text-slate-800">{w.title || "-"}</td>
                                      <td className="p-2.5 text-center text-slate-600">{w.dates || "-"}</td>
                                      <td className="p-2.5 text-center text-slate-600">{w.numDays || "-"}</td>
                                      <td className="p-2.5 text-slate-700">{w.organization || "-"}</td>
                                      <td className="p-2.5 text-center font-bold">{w.reportSubmitted || "Yes"}</td>
                                      <td className="p-2.5 text-center">
                                        {w.fileUrl ? (
                                          <a
                                            href={w.fileUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg hover:bg-indigo-100 transition-all"
                                            title={w.fileName || "View Attachment"}
                                          >
                                            <Paperclip className="w-3 h-3" /> Proof
                                          </a>
                                        ) : (
                                          <span className="text-zinc-400 font-semibold text-[10px]">-</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : <p className="text-xs text-zinc-400 italic">No workshops recorded.</p>}
                        </div>

                        {/* Qualification */}
                        {selectedAppraisal.formData?.improvingQualification === "Yes" && (
                          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                            <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                              Qualification Improvements
                            </span>
                            <div className="overflow-x-auto border border-zinc-200 rounded-xl bg-white">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-600 uppercase">
                                  <tr>
                                    <th className="p-2.5">Degree</th>
                                    <th className="p-2.5">Specialization</th>
                                    <th className="p-2.5">University</th>
                                    <th className="p-2.5 text-center">Duration</th>
                                    <th className="p-2.5 text-center">Status</th>
                                    <th className="p-2.5 text-center">NOC Obtained</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 font-semibold">
                                  {selectedAppraisal.formData?.qualificationDetails?.map((q, i) => (
                                    <tr key={i}>
                                      <td className="p-2.5 text-slate-800">{q.degree || "-"}</td>
                                      <td className="p-2.5 text-slate-700">{q.specialization || "-"}</td>
                                      <td className="p-2.5 text-slate-700">{q.university || "-"}</td>
                                      <td className="p-2.5 text-center text-slate-600">{q.duration || "-"}</td>
                                      <td className="p-2.5 text-center text-slate-600">{q.status || "-"}</td>
                                      <td className="p-2.5 text-center font-bold">{q.nocObtained || "Yes"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Department Development */}
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            Department Development & Student Welfare
                          </span>
                          {selectedAppraisal.formData?.deptInvolvement?.length ? (
                            <div className="overflow-x-auto border border-zinc-200 rounded-xl bg-white">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-600 uppercase">
                                  <tr>
                                    <th className="p-2.5">Description</th>
                                    <th className="p-2.5">Role</th>
                                    <th className="p-2.5">Outcome</th>
                                    <th className="p-2.5 text-center">Records Maintained</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 font-semibold">
                                  {selectedAppraisal.formData.deptInvolvement.map((d, i) => (
                                    <tr key={i}>
                                      <td className="p-2.5 text-slate-800">{d.description || "-"}</td>
                                      <td className="p-2.5 text-slate-700">{d.role || "-"}</td>
                                      <td className="p-2.5 text-slate-700">{d.outcome || "-"}</td>
                                      <td className="p-2.5 text-center font-bold">{d.recordsMaintained || "Yes"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : <p className="text-xs text-zinc-400 italic">No department activities recorded.</p>}
                        </div>
                      </div>
                    )}

                    {/* Sub-Tab 4: Rating, Targets & Self Analysis */}
                    {activeDetailsTab === 4 && (
                      <div className="space-y-6 animate-fadeIn">
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            25 & 26. Department Rating & Potential Utilization
                          </span>
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div className="p-3 bg-white rounded-xl border border-zinc-200">
                              <span className="block text-[10px] font-bold text-zinc-400 uppercase">Department Rating</span>
                              <span className="font-black text-indigo-900">{selectedAppraisal.formData?.deptRating || "Good"}</span>
                              {selectedAppraisal.formData?.deptRatingReason && (
                                <p className="text-xs text-slate-600 mt-1 italic">"{selectedAppraisal.formData.deptRatingReason}"</p>
                              )}
                            </div>
                            <div className="p-3 bg-white rounded-xl border border-zinc-200">
                              <span className="block text-[10px] font-bold text-zinc-400 uppercase">Potential Utilization</span>
                              <span className="font-black text-indigo-900">{selectedAppraisal.formData?.potentialUtilization || "Properly Utilized"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Targets & Strategy */}
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            27. Next Academic Year Targets & Strategy
                          </span>
                          <div className="space-y-3 text-xs">
                            <div>
                              <span className="block text-[10px] font-bold text-zinc-400 uppercase">Targets</span>
                              <p className="font-semibold text-slate-800 bg-white p-3 rounded-xl border border-zinc-200 mt-1">
                                {selectedAppraisal.formData?.targetsNextYear || "No targets specified."}
                              </p>
                            </div>
                            <div>
                              <span className="block text-[10px] font-bold text-zinc-400 uppercase">Strategy / Planning</span>
                              <p className="font-semibold text-slate-800 bg-white p-3 rounded-xl border border-zinc-200 mt-1">
                                {selectedAppraisal.formData?.targetsStrategy || "No strategy specified."}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Self Analysis Strengths & Weaknesses */}
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            30. Self-Analysis (Strengths & Weaknesses)
                          </span>
                          {selectedAppraisal.formData?.selfAnalysis?.length ? (
                            <div className="overflow-x-auto border border-zinc-200 rounded-xl bg-white">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-600 uppercase">
                                  <tr>
                                    <th className="p-2.5 text-emerald-800">Strengths</th>
                                    <th className="p-2.5 text-rose-800">Areas for Improvement / Weaknesses</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 font-semibold">
                                  {selectedAppraisal.formData.selfAnalysis.map((s, i) => (
                                    <tr key={i}>
                                      <td className="p-2.5 text-emerald-900">{s.strength || "-"}</td>
                                      <td className="p-2.5 text-rose-900">{s.weakness || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : <p className="text-xs text-zinc-400 italic">No strengths/weaknesses provided.</p>}
                        </div>

                        {/* Self Placement & Declaration */}
                        <div className="bg-emerald-50/60 p-5 rounded-2xl border border-emerald-100 space-y-2 text-xs">
                          <span className="text-xs font-black text-emerald-950 uppercase tracking-wider block border-b border-emerald-200/50 pb-2">
                            Assessment Placement & Declaration
                          </span>
                          <div className="flex items-center justify-between text-emerald-900 font-bold pt-1">
                            <span>Self Assessment Placement: <strong className="text-indigo-900">{selectedAppraisal.formData?.selfAssessmentPlacement || "At par"}</strong></span>
                            {selectedAppraisal.formData?.declarationDate && (
                              <span>Declaration Date: {selectedAppraisal.formData.declarationDate}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
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
                              <span className="block text-[10px] font-black text-zinc-400 uppercase">No. of CL Taken in Last Academic Year</span>
                              <span className="font-bold text-slate-800">{selectedAppraisal.formData?.consumeBalanceCL !== undefined && selectedAppraisal.formData?.consumeBalanceCL !== "" ? `${selectedAppraisal.formData.consumeBalanceCL} / 12 Days` : "-"}</span>
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
                        {/* Q21 Admissions Contributed to Institutions */}
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                          <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                            21. Admissions Contributed to Institutions
                          </span>
                          {(selectedAppraisal.formData?.admissionsInstitutions && selectedAppraisal.formData.admissionsInstitutions.length > 0) || (selectedAppraisal.formData?.admissionsContributed && selectedAppraisal.formData.admissionsContributed.length > 0) ? (
                            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-zinc-50 text-zinc-700 font-bold border-b border-zinc-200">
                                  <tr>
                                    <th className="p-2.5">Area / Region</th>
                                    <th className="p-2.5 text-center">No of Admissions Contributed</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                  {(selectedAppraisal.formData.admissionsInstitutions || selectedAppraisal.formData.admissionsContributed).map((a, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50">
                                      <td className="p-2.5 font-bold text-slate-800">{a.area || a.teamNoArea || "-"}</td>
                                      <td className="p-2.5 text-center font-black text-teal-800">{a.count || "0"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-400 italic">No institutional admissions recorded.</p>
                          )}
                        </div>

                        {/* Q21b Admissions Contributed to Vijayadashami */}
                        {selectedAppraisal.formData?.admissionsVijayadashami && selectedAppraisal.formData.admissionsVijayadashami.length > 0 && (
                          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                            <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                              21b. Admissions Contributed to Vijayadashami
                            </span>
                            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-zinc-50 text-zinc-700 font-bold border-b border-zinc-200">
                                  <tr>
                                    <th className="p-2.5">Area / Region</th>
                                    <th className="p-2.5 text-center">No of Admissions Contributed</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                  {selectedAppraisal.formData.admissionsVijayadashami.map((a, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50">
                                      <td className="p-2.5 font-bold text-slate-800">{a.area || "-"}</td>
                                      <td className="p-2.5 text-center font-black text-teal-800">{a.count || "0"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Q22 Any other relevant information */}
                        {selectedAppraisal.formData?.otherInfo && (
                          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-2">
                            <span className="text-xs font-black text-indigo-950 uppercase tracking-wider block border-b border-zinc-200 pb-2">
                              22. Additional Relevant Information
                            </span>
                            <p className="text-xs font-semibold text-slate-800 bg-white p-3 rounded-xl border border-zinc-200 leading-relaxed">
                              {selectedAppraisal.formData.otherInfo}
                            </p>
                          </div>
                        )}
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
                                {getSectionTitle("sec_subjects_results", "2.1 SUBJECTS HANDLED & PASS PERCENTAGE")}
                              </span>
                              {getSectionDescription("sec_subjects_results") && (
                                <p className="text-[10px] text-zinc-400 font-semibold uppercase mt-0.5">{getSectionDescription("sec_subjects_results")}</p>
                              )}
                            </div>

                            {/* Odd Semester */}
                            <div>
                              <span className="text-xs font-black text-[#120c7a] block mb-2 uppercase tracking-wider">
                                {getSectionTitle("f_subjects_odd_theory_title", "THEORY : Quarterly Examination")}
                              </span>
                              <table className="w-full border-collapse border border-zinc-200 text-xs">
                                <tr className="bg-zinc-50 font-bold">
                                  <th className="border border-zinc-200 p-2 text-center w-12">Sl. No.</th>
                                  <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_class", "Class")}</th>
                                  <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_code", "Subject")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_appeared", "Appeared")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passed", "Passed")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passPercent", "Pass Percentage")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_feedback", "Feedback Rating")}</th>
                                  {renderRowEvidenceHeader("sec_subjects_results")}
                                </tr>
                                {(selectedAppraisal.formData?.oddTheorySubjects || []).map((row, i) => (
                                  <tr key={i}>
                                    <td className="border border-zinc-200 p-2 text-center font-bold">{i + 1}</td>
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
                              <span className="text-xs font-black text-[#120c7a] block mb-2 uppercase tracking-wider">
                                {getSectionTitle("f_subjects_odd_practical_title", "THEORY: Half Yearly Examination")}
                              </span>
                              <table className="w-full border-collapse border border-zinc-200 text-xs">
                                <tr className="bg-zinc-50 font-bold">
                                  <th className="border border-zinc-200 p-2 text-center w-12">Sl. No.</th>
                                  <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_class", "Class")}</th>
                                  <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_code", "Subject")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_appeared", "Appeared")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passed", "Passed")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passPercent", "Pass Percentage")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_feedback", "Feedback Rating")}</th>
                                  {renderRowEvidenceHeader("sec_subjects_results")}
                                </tr>
                                {(selectedAppraisal.formData?.oddPracticalSubjects || []).map((row, i) => (
                                  <tr key={i}>
                                    <td className="border border-zinc-200 p-2 text-center font-bold">{i + 1}</td>
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
                              <span className="text-xs font-black text-[#120c7a] block mb-2 uppercase tracking-wider">
                                {getSectionTitle("f_subjects_even_theory_title", "THEORY: Annual Examination")}
                              </span>
                              <table className="w-full border-collapse border border-zinc-200 text-xs">
                                <tr className="bg-zinc-50 font-bold">
                                  <th className="border border-zinc-200 p-2 text-center w-12">Sl. No.</th>
                                  <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_class", "Class")}</th>
                                  <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_code", "Subject")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_appeared", "Appeared")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passed", "Passed")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passPercent", "Pass Percentage")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_feedback", "Feedback Rating")}</th>
                                  {renderRowEvidenceHeader("sec_subjects_results")}
                                </tr>
                                {(selectedAppraisal.formData?.evenTheorySubjects || []).map((row, i) => (
                                  <tr key={i}>
                                    <td className="border border-zinc-200 p-2 text-center font-bold">{i + 1}</td>
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
                              <span className="text-xs font-black text-[#120c7a] block mb-2 uppercase tracking-wider">
                                {getSectionTitle("f_subjects_even_practical_title", "PRACTICALS – Annual Examination")}
                              </span>
                              <table className="w-full border-collapse border border-zinc-200 text-xs">
                                <tr className="bg-zinc-50 font-bold">
                                  <th className="border border-zinc-200 p-2 text-center w-12">Sl. No.</th>
                                  <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_class", "Class")}</th>
                                  <th className="border border-zinc-200 p-2">{getSectionTitle("f_subjects_code", "Subject")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_appeared", "Appeared")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passed", "Passed")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_passPercent", "Pass Percentage")}</th>
                                  <th className="border border-zinc-200 p-2 text-center">{getSectionTitle("f_subjects_feedback", "Feedback Rating")}</th>
                                  {renderRowEvidenceHeader("sec_subjects_results")}
                                </tr>
                                {(selectedAppraisal.formData?.evenPracticalSubjects || []).map((row, i) => (
                                  <tr key={i}>
                                    <td className="border border-zinc-200 p-2 text-center font-bold">{i + 1}</td>
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
                {/* Unified source: faculty autoScore.breakdown OR teacher evaluatedScore.
                    Columns: Self (automated) | Coordinator (saved coordinatorReview) |
                    Reviewer editable (Coordinator while Submitted, else HOD/Principal). */}
                {reviewScore && (
                  <div className="mt-8 border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                    <div className="bg-indigo-50/70 px-4 py-2.5 border-b border-indigo-100 flex items-center justify-between">
                      <span className="text-[11px] font-black text-indigo-950 uppercase tracking-widest">Performance Score (Criteria Evaluation)</span>
                      {(() => {
                        const p1 = reviewScore.part1Rows || [];
                        const p2 = reviewScore.part2Rows || [];
                        const sumHod = (rows) => rows.reduce((a, r) => a + (Number(hodFacultyScoresMap[r.id] ?? r.scored) || 0), 0);
                        const gHodT = sumHod(p1) + sumHod(p2);
                        const gM = reviewScore.grandMax;
                        return (
                          <span className="text-[10px] font-black text-emerald-800 bg-emerald-100/70 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            {(isCoordinatorRole && !selectedAppraisal.coordinatorReview) ? "Coordinator" : "HOD"} Score: {gHodT} / {gM}
                          </span>
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
                          {selectedAppraisal.coordinatorReview && (
                            <th className="p-2.5 text-center text-amber-700 font-black">Coordinator Score</th>
                          )}
                          <th className="p-2.5 text-center text-emerald-700 font-black">{(isCoordinatorRole && !selectedAppraisal.coordinatorReview) ? "Coordinator Score" : "HOD Score"}</th>
                        </tr>
                      </thead>
                      {(() => {
                        const p1 = reviewScore.part1Rows || [];
                        const p2 = reviewScore.part2Rows || [];
                        const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
                        const sumHod = (rows) => rows.reduce((a, r) => a + (Number(hodFacultyScoresMap[r.id] ?? r.scored) || 0), 0);

                        const p1T = reviewScore.part1Total;
                        const p1M = reviewScore.part1Max;
                        const p1HodT = sumHod(p1);

                        const p2T = reviewScore.part2Total;
                        const p2M = reviewScore.part2Max;
                        const p2HodT = sumHod(p2);

                        const gT = reviewScore.grandTotal;
                        const gM = reviewScore.grandMax;
                        const gHodT = p1HodT + p2HodT;

                        const showCoordCol = !!selectedAppraisal.coordinatorReview;
                        const coordScores = selectedAppraisal.coordinatorReview?.scores || {};
                        const colSpan = showCoordCol ? 6 : 5;

                        const canReview = isCoordinatorRole || isHODRole || isPrincipalOrHR;
                        const isEditable = canReview && selectedAppraisal.status !== "Approved";

                        const rowEls = (rows) => rows.map((r) => {
                          const hodVal = hodFacultyScoresMap[r.id] ?? r.scored;
                          const cVal = coordScores[r.id];
                          return (
                            <tr key={r.id} className="hover:bg-slate-50/50">
                              <td className="p-2.5 font-semibold text-slate-700">{r.particulars}</td>
                              <td className="p-2.5 text-center text-zinc-500">{r.value === null ? "—" : String(r.value)}</td>
                              <td className="p-2.5 text-center font-bold text-zinc-600">{r.maxMarks}</td>
                              <td className="p-2.5 text-center font-black text-indigo-700">{r.scored}</td>
                              {showCoordCol && (
                                <td className="p-2.5 text-center font-black text-amber-700">{cVal === undefined || cVal === null || cVal === "" ? "—" : cVal}</td>
                              )}
                              <td className="p-2.5 text-center font-black">
                                {isEditable ? (
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max={r.maxMarks}
                                    value={hodVal === undefined || hodVal === null ? "" : hodVal}
                                    onChange={(e) => {
                                      const inputVal = e.target.value;
                                      const parsed = inputVal === "" ? "" : Math.min(Number(r.maxMarks), Math.max(0, Number(inputVal)));
                                      setHodFacultyScoresMap((prev) => ({
                                        ...prev,
                                        [r.id]: parsed
                                      }));
                                    }}
                                    className="w-16 text-center font-black text-emerald-900 bg-white border-2 border-emerald-400 rounded-lg py-1 px-1.5 shadow-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-600 focus:outline-none"
                                  />
                                ) : (
                                  <span className="text-emerald-700 font-bold">{hodVal}</span>
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
                                  <td colSpan={colSpan} className="p-2 text-[10px] font-black text-zinc-500 uppercase tracking-wider">Part 1 — Academic & Feedback</td>
                                </tr>
                              )}
                              {rowEls(p1)}
                              {p1.length > 0 && (
                                <tr className="bg-slate-50/70 font-bold">
                                  <td className="p-2 text-right text-[11px] text-zinc-600 uppercase" colSpan={2}>Part 1 Total</td>
                                  <td className="p-2 text-center text-zinc-700">{p1M}</td>
                                  <td className="p-2 text-center text-indigo-800 font-black">{p1T}</td>
                                  {showCoordCol && (
                                    <td className="p-2 text-center text-amber-800 font-black">{selectedAppraisal.coordinatorReview?.part1Total ?? "—"}</td>
                                  )}
                                  <td className="p-2 text-center text-emerald-800 font-black">{p1HodT}</td>
                                </tr>
                              )}
                              {p2.length > 0 && (
                                <tr className="bg-slate-50/70">
                                  <td colSpan={colSpan} className="p-2 text-[10px] font-black text-zinc-500 uppercase tracking-wider">Part 2 — Self & Department Contributions</td>
                                </tr>
                              )}
                              {rowEls(p2)}
                              {p2.length > 0 && (
                                <tr className="bg-slate-50/70 font-bold">
                                  <td className="p-2 text-right text-[11px] text-zinc-600 uppercase" colSpan={2}>Part 2 Total</td>
                                  <td className="p-2 text-center text-zinc-700">{p2M}</td>
                                  <td className="p-2 text-center text-indigo-800 font-black">{p2T}</td>
                                  {showCoordCol && (
                                    <td className="p-2 text-center text-amber-800 font-black">{selectedAppraisal.coordinatorReview?.part2Total ?? "—"}</td>
                                  )}
                                  <td className="p-2 text-center text-emerald-800 font-black">{p2HodT}</td>
                                </tr>
                              )}
                            </tbody>
                            <tfoot>
                              <tr className="bg-gradient-to-r from-indigo-700 via-emerald-700 to-teal-800 text-white font-black">
                                <td className="p-3 text-right text-xs uppercase tracking-wider" colSpan={2}>Grand Total</td>
                                <td className="p-3 text-center text-zinc-200">{gM}</td>
                                <td className="p-3 text-center text-base">{gT}</td>
                                {showCoordCol && (
                                  <td className="p-3 text-center text-base text-amber-200">{selectedAppraisal.coordinatorReview?.totalScore ?? "—"}</td>
                                )}
                                <td className="p-3 text-center text-base text-emerald-200">{gHodT}</td>
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
                                        disabled={selectedAppraisal.status === "Approved"}
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
                          disabled={selectedAppraisal.status === "Approved"}
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
                            disabled={selectedAppraisal.status === "Approved"}
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
                            disabled={selectedAppraisal.status === "Approved"}
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
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 h-fit space-y-6">

                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Star size={14} className="text-[#120c7a]" /> Evaluation & Recommendation
                  </h4>
                  <p className="text-[11px] text-zinc-500">Provide evaluation grade and recommendation comments for this appraisal request.</p>
                </div>

                {/* Coordinator Review (shown to HOD / Principal / Admin once forwarded) */}
                {selectedAppraisal.coordinatorReview && (userRole === "HOD" || isHODRole || isPrincipalOrHR) && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-2">
                    <span className="text-[10px] font-black text-amber-900 uppercase tracking-widest block border-b border-amber-200 pb-1">Coordinator Review & Marks</span>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-amber-700 uppercase tracking-wider">Coordinator Total:</span>
                      <span className="text-xs font-black text-amber-900">{selectedAppraisal.coordinatorReview.totalScore ?? "—"} / {selectedAppraisal.coordinatorReview.maxTotal ?? reviewScore?.grandMax ?? "—"}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-amber-700 uppercase tracking-wider">Evaluated Grade:</span>
                      <span className="text-xs font-black text-amber-900">{selectedAppraisal.coordinatorReview.grade}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-amber-700 uppercase tracking-wider">Remarks:</span>
                      <p className="text-xs text-amber-950 font-medium">{selectedAppraisal.coordinatorReview.comments || "—"}</p>
                    </div>
                    <div className="text-[10px] text-amber-600 italic">
                      - Reviewed by {selectedAppraisal.coordinatorReview.reviewedBy}
                    </div>
                  </div>
                )}

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

                {/* Principal checkboxes (shown to Principal/HR only) */}
                {isPrincipalOrHR && (
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

                {/* Final Rating Number Input Box (shown to Principal/HR only) */}
                {isPrincipalOrHR && (
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
                  {(userRole === "HOD" || isCoordinatorRole) && selectedAppraisal.status === "Submitted" && (
                    <>
                      <button
                        onClick={() => handleReviewAction("HOD_Approved")}
                        disabled={actioning}
                        className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-850 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-100 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} /> {isCoordinatorRole && userRole !== "HOD" ? "Add Marks & Forward to Principal / HOD" : "Evaluate & Forward"}
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

                  {/* School HOD can add/update their own evaluation after Coordinator forwards */}
                  {(userRole === "HOD" || isHODRole) && selectedAppraisal.status === "HOD_Approved" && (
                    <>
                      <button
                        onClick={() => handleReviewAction("HOD_Approved")}
                        disabled={actioning}
                        className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-blue-100 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} /> {actioning ? "Saving..." : "Save HOD Evaluation"}
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

                  {isPrincipalOrHR && (selectedAppraisal.status === "HOD_Approved" || selectedAppraisal.status === "Submitted") && (
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
                      <th className="p-4 text-center">Coordinator Recommendation</th>
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
                            {app.hodReview?.grade ? (
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
    </HRLayout>
  );
}
