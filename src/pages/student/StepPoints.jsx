import { useState, useEffect, useRef } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { 
  Award, Plus, Clock, Image, CheckCircle, AlertTriangle, 
  Trash2, Send, ArrowRight, Loader2, Info, Check, X, Eye, FileText, Printer, FileCheck
} from "lucide-react";

export const STEP_CATEGORIES = {
  technical: {
    label: "Technical Activities",
    maxSemesterPoints: 12,
    color: "from-blue-500 to-indigo-600",
    bgLight: "bg-blue-50",
    textDark: "text-blue-700",
    activities: [
      { id: "tech_org", label: "Organising a technical event / symposium", basePoints: 5, criteria: "Min duration: Half day (4 hours)", evidence: "Certificate and attendance sheet" },
      { id: "tech_coord", label: "Coordinating a technical event", basePoints: 3, criteria: "Min duration: 4 hours", evidence: "Certificate of coordination" },
      { id: "tech_talk", label: "Delivering a technical talk / guest lecture (max 3 events/sem)", basePoints: 3, criteria: "Min duration: 60 minutes", evidence: "Invitation letter and feedback form" },
      { id: "tech_paper", label: "Paper presentation at a seminar / conference", basePoints: 3, criteria: "Min duration: Accepted abstract", evidence: "Certificate and abstract copy" },
      { id: "tech_workshop", label: "Attending technical workshops / seminars", basePoints: 2, criteria: "Min duration: 4 hours", evidence: "Attendance record and certificate" },
      { id: "tech_comp", label: "Participation in technical competitions (max 3 events/sem)", basePoints: 2, criteria: "Min duration: Participation", evidence: "Certificate / entry receipt" },
      { id: "tech_winner", label: "Prize winner — First / Second / Third place", basePoints: 5, criteria: "Min duration: Participation", evidence: "Prize / winner certificate" },
      { id: "tech_volunteer", label: "Student volunteer at a technical event (max 3 events/sem)", basePoints: 2, criteria: "Min duration: 4 hours", evidence: "Coordinator's sign-off" },
      { id: "tech_hackathon", label: "Hackathon / Thon participation (24–48 hours)", basePoints: 4, criteria: "Min duration: Min 8 hours", evidence: "Certificate and team details" },
      { id: "tech_nirf", label: "Participation in Events organized by top NIRF/IIT/NIT", basePoints: 5, criteria: "Min duration: Participation", evidence: "Official invitation / certificate" }
    ]
  },
  research: {
    label: "Innovation & Research",
    maxSemesterPoints: 10,
    color: "from-emerald-500 to-teal-600",
    bgLight: "bg-emerald-50",
    textDark: "text-emerald-700",
    activities: [
      { id: "res_scopus", label: "Research paper published in Scopus-indexed / SCI journal", basePoints: 10, criteria: "Published", evidence: "Journal link / publication copy" },
      { id: "res_indexed", label: "Paper published in other indexed journals / conference proceedings", basePoints: 3, criteria: "Published", evidence: "Publication copy" },
      { id: "res_patent_filed", label: "Patent filed (Indian Patent Office)", basePoints: 10, criteria: "Filed", evidence: "Filing confirmation / application" },
      { id: "res_patent_granted", label: "Patent published / granted", basePoints: 20, criteria: "Published/Granted", evidence: "Official gazette entry / grant certificate" },
      { id: "res_funded_project", label: "SRIC / funded project participation", basePoints: 5, criteria: "Participation", evidence: "Project sanction letter / certificate" },
      { id: "res_product", label: "Product / prototype developed for external showcasing", basePoints: 10, criteria: "Showcasing", evidence: "Showcase certificate / report" },
      { id: "res_poster", label: "Poster presentation at research events", basePoints: 2, criteria: "Presentation", evidence: "Certificate of presentation" }
    ]
  },
  industry: {
    label: "Industry Exposure",
    maxSemesterPoints: 10,
    color: "from-amber-500 to-orange-600",
    bgLight: "bg-amber-50",
    textDark: "text-amber-700",
    activities: [
      { id: "ind_internship", label: "Internship in an industry / research organisation", basePoints: 5, criteria: "Min duration: Min 1 week", evidence: "Offer and completion letter" },
      { id: "ind_visit", label: "Industrial / field visit organised by Department", basePoints: 2, criteria: "Min duration: Half day", evidence: "Attendance and visit report" },
      { id: "ind_workshop", label: "Industry-sponsored workshop / talk attended", basePoints: 2, criteria: "Min duration: 4 hours", evidence: "Certificate" },
      { id: "ind_startup", label: "Start-up / Entrepreneurship event participation", basePoints: 3, criteria: "Participation", evidence: "Certificate / letter of participation" },
      { id: "ind_tbi", label: "MSME / Technology Business Incubator (TBI) activity", basePoints: 4, criteria: "Participation", evidence: "Certificate / letter" }
    ]
  },
  iiy: {
    label: "Invest In Yourself (IIY)",
    maxSemesterPoints: 10,
    color: "from-purple-500 to-violet-600",
    bgLight: "bg-purple-50",
    textDark: "text-purple-700",
    activities: [
      { id: "iiy_mooc", label: "MOOC / online certification — NPTEL / SWAYAM / Coursera (max 2/sem)", basePoints: 5, criteria: "4/8/12 weeks duration", evidence: "Course completion certificate" },
      { id: "iiy_industry", label: "Industry-led certification — AWS / Google / Microsoft / IBM", basePoints: 5, criteria: "Certified", evidence: "Verifiable digital certificate" },
      { id: "iiy_self", label: "Self-paced skill certification from recognised platforms", basePoints: 3, criteria: "Min duration: 20 hours", evidence: "Completion certificate with credentials" }
    ]
  },
  social: {
    label: "Social & Extension Activities",
    maxSemesterPoints: 8,
    color: "from-rose-500 to-pink-600",
    bgLight: "bg-rose-50",
    textDark: "text-rose-700",
    activities: [
      { id: "soc_camp", label: "NSS / NCC camp (residential)", basePoints: 5, criteria: "Min duration: 5 days", evidence: "Certificate from NSS/NCC Officer" },
      { id: "soc_act", label: "NSS / NCC activity (regular)", basePoints: 2, criteria: "Participation", evidence: "Attendance and Officer's sign-off" },
      { id: "soc_outreach", label: "Community outreach / village adoption programme", basePoints: 2, criteria: "Min duration: 4 hours", evidence: "Report and photographs" },
      { id: "soc_blood", label: "Blood donation camp participation", basePoints: 5, criteria: "Donated", evidence: "Donation certificate" },
      { id: "soc_env", label: "Environmental / plantation / Swachh Bharat / Awareness Rally", basePoints: 2, criteria: "Min duration: 2 hours", evidence: "Photographs and faculty certificate" },
      { id: "soc_relief", label: "Disaster relief / health camp volunteering", basePoints: 3, criteria: "Volunteering", evidence: "Letter from organisation" }
    ]
  },
  leadership: {
    label: "Leadership & Management",
    maxSemesterPoints: 8,
    color: "from-cyan-500 to-sky-600",
    bgLight: "bg-cyan-50",
    textDark: "text-cyan-700",
    activities: [
      { id: "lead_exec", label: "Student Council Executive Member", basePoints: 5, criteria: "Per semester", evidence: "Appointment letter" },
      { id: "lead_bearer", label: "Office Bearer — Club / Association / Chapter (max 1 club & 1 assoc)", basePoints: 3, criteria: "Per semester", evidence: "Club registration and role letter" },
      { id: "lead_cr", label: "Class Representative (CR / ACR)", basePoints: 3, criteria: "Per semester", evidence: "HoD's appointment letter" },
      { id: "lead_member", label: "Club / Association member (max 3 clubs)", basePoints: 2, criteria: "Per semester", evidence: "Club membership certificate" },
      { id: "lead_dept_event", label: "Organising events at departmental / institutional level (max 5 students credited)", basePoints: 5, criteria: "Per event", evidence: "Permission letter, budget, event report" },
      { id: "lead_inst_bearer", label: "Institute-level office bearer (General Secretary & equivalent)", basePoints: 5, criteria: "Per semester", evidence: "Principal's appointment order" }
    ]
  },
  sports: {
    label: "Sports & Cultural Activities",
    maxSemesterPoints: 6,
    color: "from-fuchsia-500 to-pink-600",
    bgLight: "bg-fuchsia-50",
    textDark: "text-fuchsia-700",
    activities: [
      { id: "sport_inter_part", label: "Inter-collegiate sports – participation", basePoints: 2, criteria: "Participation", evidence: "Certificate / entry proof" },
      { id: "sport_inter_prize", label: "Inter-collegiate sports – prize (Top 3)", basePoints: 5, criteria: "Prize winner", evidence: "Medal / prize certificate" },
      { id: "sport_cult_part", label: "Cultural festival / fine arts – participation", basePoints: 2, criteria: "Participation", evidence: "Participation certificate" },
      { id: "sport_cult_prize", label: "Cultural festival – prize (Top 3)", basePoints: 3, criteria: "Prize winner", evidence: "Prize certificate" },
      { id: "sport_rep", label: "Representing the Institution at University / State level", basePoints: 10, criteria: "Representation", evidence: "Selection letter and certificate" },
      { id: "sport_lit", label: "Literary events (debate, elocution, quiz)", basePoints: 2, criteria: "Participation", evidence: "Certificate" }
    ]
  }
};

const BONUS_WEIGHTS = [
  { id: "none", label: "No Bonus Criteria Applies", points: 0 },
  { id: "iit", label: "Event by IIT / NIT / Top-50 NIRF (+10 pts)", points: 10, applicable: ["tech_org", "tech_coord", "tech_comp", "tech_hackathon"] },
  { id: "ieee", label: "Event by IEEE / ISTE / ASME / ACM or similar (+10 pts)", points: 10, applicable: ["tech_workshop", "tech_paper"] },
  { id: "national", label: "National-level representation / championship (+15 pts)", points: 15, applicable: ["sport_inter_part", "sport_inter_prize", "tech_comp", "sport_cult_part", "sport_cult_prize"] },
  { id: "international", label: "International-level participation (+20 pts)", points: 20, applicable: [] } // applicable to all
];

export default function StudentStepPoints() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Dynamic STEP configuration states
  const [activeCategories, setActiveCategories] = useState(STEP_CATEGORIES);
  const [activeBonusWeights, setActiveBonusWeights] = useState(BONUS_WEIGHTS);
  const [activeChecklist, setActiveChecklist] = useState([]);
  const [activeGuidelines, setActiveGuidelines] = useState([]);
  const [activeMilestones, setActiveMilestones] = useState({
    regularRequired: 100,
    lateralRequired: 80,
    semesterCap: 20
  });

  const [activities, setActivities] = useState([]);
  const [selectedSemTab, setSelectedSemTab] = useState(2); // default Sem II as per STEP start

  // Deferral State
  const [deferrals, setDeferrals] = useState([]);
  const [showDeferralForm, setShowDeferralForm] = useState(false);
  const [deferralSem, setDeferralSem] = useState(6);
  const [deferralReason, setDeferralReason] = useState("");
  const [deferralTerms, setDeferralTerms] = useState(false);
  const [isSubmittingDeferral, setIsSubmittingDeferral] = useState(false);
  const [deferralError, setDeferralError] = useState("");

  // Form State
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimSem, setClaimSem] = useState(2);
  const [claimCategory, setClaimCategory] = useState("technical");
  const [claimActivityType, setClaimActivityType] = useState("");
  const [claimActivityName, setClaimActivityName] = useState("");
  const [claimDate, setClaimDate] = useState("");
  const [claimDuration, setClaimDuration] = useState("");
  const [claimBonus, setClaimBonus] = useState("none");
  const [claimEvidence, setClaimEvidence] = useState("");
  const [evidenceFileName, setEvidenceFileName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [editClaimId, setEditClaimId] = useState(null); // for editing returned claims

  // Modal View State
  const [viewActivity, setViewActivity] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            setUserData(snap.data());
          }
        } catch (err) {
          console.error("Error loading student profile:", err);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Load dynamic configuration from step_config/step_configuration
  useEffect(() => {
    const docRef = doc(db, "step_config", "step_configuration");
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.categories) setActiveCategories(data.categories);
        if (data.bonusWeights) setActiveBonusWeights(data.bonusWeights);
        if (data.checklist) setActiveChecklist(data.checklist);
        if (data.guidelines) setActiveGuidelines(data.guidelines);
        if (data.milestones) setActiveMilestones(data.milestones);
      }
    });
    return () => unsub();
  }, []);

  // Set default activity type when category changes
  useEffect(() => {
    if (claimCategory && activeCategories[claimCategory]) {
      setClaimActivityType(activeCategories[claimCategory].activities[0]?.id || "");
    }
  }, [claimCategory, activeCategories]);

  useEffect(() => {
    if (!userData || !userData.uid) return;

    // Load active activities log
    const q = query(
      collection(db, "step_activities"),
      where("studentId", "==", userData.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      // Sort by date newest first
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setActivities(list);
    });

    return () => unsub();
  }, [userData]);

  useEffect(() => {
    if (!userData || !userData.uid) return;
    const q = query(
      collection(db, "step_deferrals"),
      where("studentId", "==", userData.uid)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setDeferrals(list);
    }, (err) => console.error("Error loading deferrals:", err));
    return () => unsub();
  }, [userData]);

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleFileSelected = (file) => {
    if (file.size > 307200) { // 300KB
      alert("Certificate size must be under 300KB to ensure storage efficiency.");
      return;
    }
    setEvidenceFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setClaimEvidence(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Point Calculation Logic according to PDF specifications
  const getSelectedActivityConfig = (catKey, actId) => {
    return activeCategories[catKey]?.activities.find(a => a.id === actId);
  };

  // Compute calculated points live
  const calculatedPoints = () => {
    if (!claimCategory || !claimActivityType) return { base: 0, bonus: 0, total: 0 };
    const config = getSelectedActivityConfig(claimCategory, claimActivityType);
    if (!config) return { base: 0, bonus: 0, total: 0 };

    let base = config.basePoints;
    let bonus = 0;

    if (claimBonus !== "none") {
      const bWeight = activeBonusWeights.find(b => b.id === claimBonus);
      if (bWeight) {
        bonus = bWeight.points;
      }
    }

    return {
      base,
      bonus,
      total: base + bonus
    };
  };

  // Compile overall compliance summary per semester
  const summaryData = () => {
    const semesters = [1, 2, 3, 4, 5, 6, 7, 8];
    const semSummaries = {};

    semesters.forEach(s => {
      // Dynamically initialize categoryBreakdown from activeCategories keys
      const categoryBreakdown = {};
      Object.keys(activeCategories).forEach(catKey => {
        categoryBreakdown[catKey] = 0;
      });

      semSummaries[s] = {
        totalEarned: 0,
        uncappedTotal: 0,
        categoryBreakdown,
        activitiesCount: 0
      };
    });

    // Populate approved activities
    const approved = activities.filter(a => a.status === "Approved");

    approved.forEach(act => {
      const sem = act.semester || 2;
      const cat = act.category || "technical";
      if (!semSummaries[sem]) return;

      const pts = Number(act.totalPoints || 0);
      if (semSummaries[sem].categoryBreakdown[cat] !== undefined) {
        semSummaries[sem].categoryBreakdown[cat] += pts;
      } else {
        // Fallback or dynamically created category
        semSummaries[sem].categoryBreakdown[cat] = pts;
      }
      semSummaries[sem].activitiesCount++;
    });

    // Apply category ceilings per semester and then global ceiling of activeMilestones.semesterCap points
    semesters.forEach(s => {
      let semSum = 0;
      let rawSum = 0;
      Object.keys(semSummaries[s].categoryBreakdown).forEach(cat => {
        const catPoints = semSummaries[s].categoryBreakdown[cat];
        const cap = activeCategories[cat]?.maxSemesterPoints || 0;
        const capped = Math.min(catPoints, cap);
        semSummaries[s].categoryBreakdown[cat] = capped; // store capped points
        semSum += capped;
        rawSum += catPoints;
      });

      semSummaries[s].uncappedTotal = rawSum;
      // Global ceiling per semester from activeMilestones
      semSummaries[s].totalEarned = Math.min(semSum, activeMilestones.semesterCap);
    });

    // Overall metrics
    // Regular students require activeMilestones.regularRequired, Lateral entries activeMilestones.lateralRequired.
    const isLateral = userData?.admissionType === "Lateral Entry" || (userData?.batch && userData?.regNo && userData.regNo.startsWith("L"));
    const requiredTotal = isLateral ? activeMilestones.lateralRequired : activeMilestones.regularRequired;
    
    let cumulativeEarned = 0;
    semesters.forEach(s => {
      // Sum points from semesters II to VI
      if (s >= 2 && s <= 6) {
        cumulativeEarned += semSummaries[s].totalEarned;
      }
    });

    return {
      semSummaries,
      requiredTotal,
      cumulativeEarned,
      isLateral,
      progressPercent: Math.min(Math.round((cumulativeEarned / requiredTotal) * 100), 100)
    };
  };

  const currentSummary = summaryData();

  const handleSaveClaim = async (e) => {
    e.preventDefault();
    if (!claimActivityName.trim()) {
      setSubmitError("Please enter the specific name of the event or activity.");
      return;
    }
    if (!claimDate) {
      setSubmitError("Please select the date when the activity was conducted.");
      return;
    }
    if (!claimEvidence && !editClaimId) {
      setSubmitError("You must upload a valid certificate/evidence proof.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const { base, bonus, total } = calculatedPoints();
      const claimId = editClaimId || `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const payload = {
        id: claimId,
        studentId: userData.uid,
        studentName: userData.studentName || "Student",
        regNo: userData.regNo || "",
        batch: userData.batch || "N/A",
        programme: userData.programme || "B_Tech",
        department: userData.department || "unknown",
        semester: Number(claimSem),
        category: claimCategory,
        activityType: claimActivityType,
        activityName: claimActivityName,
        date: claimDate,
        durationHours: claimDuration ? Number(claimDuration) : 0,
        basePoints: base,
        bonusPoints: bonus,
        totalPoints: total,
        bonusCondition: claimBonus,
        status: "Pending",
        comments: "",
        createdAt: editClaimId ? (activities.find(a => a.id === editClaimId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (claimEvidence) {
        payload.evidenceUrl = claimEvidence;
      } else if (editClaimId) {
        payload.evidenceUrl = activities.find(a => a.id === editClaimId)?.evidenceUrl || "";
      }

      await setDoc(doc(db, "step_activities", claimId), payload, { merge: true });

      // Reset Form
      setShowClaimForm(false);
      setClaimActivityName("");
      setClaimDate("");
      setClaimDuration("");
      setClaimBonus("none");
      setClaimEvidence("");
      setEvidenceFileName("");
      setEditClaimId(null);
      alert(editClaimId ? "STEP claim updated and re-submitted successfully!" : "STEP Activity claim submitted successfully for advisor verification!");
    } catch (err) {
      console.error("Error submitting claim:", err);
      setSubmitError("Failed to save. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditReturned = (claim) => {
    setEditClaimId(claim.id);
    setClaimSem(claim.semester || 2);
    setClaimCategory(claim.category || "technical");
    setClaimActivityType(claim.activityType || "");
    setClaimActivityName(claim.activityName || "");
    setClaimDate(claim.date || "");
    setClaimDuration(claim.durationHours ? String(claim.durationHours) : "");
    setClaimBonus(claim.bonusCondition || "none");
    setClaimEvidence(""); // reset to keep existing unless replaced
    setEvidenceFileName("Existing Proof Kept (Click to replace)");
    setShowClaimForm(true);
    setSubmitError("");
    // Scroll to form
    window.scrollTo({ top: 300, behavior: "smooth" });
  };

  const handleDeleteClaim = async (id) => {
    if (!confirm("Are you sure you want to delete this pending claim?")) return;
    try {
      await deleteDoc(doc(db, "step_activities", id));
      alert("Claim deleted successfully.");
    } catch (err) {
      console.error("Error deleting claim:", err);
    }
  };

  const handleSaveDeferral = async (e) => {
    e.preventDefault();
    if (!deferralReason.trim()) {
      setDeferralError("Please provide a valid, detailed explanation for requesting the exam deferral.");
      return;
    }
    if (!deferralTerms) {
      setDeferralError("You must accept the academic undertaking before submitting.");
      return;
    }

    setIsSubmittingDeferral(true);
    setDeferralError("");

    try {
      const defId = `deferral_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const activeSemPoints = currentSummary.semSummaries[deferralSem]?.totalEarned || 0;

      const payload = {
        id: defId,
        studentId: userData.uid,
        studentName: userData.studentName || "Student",
        regNo: userData.regNo || "",
        admissionNo: userData.admissionNo || "",
        batch: userData.batch || "N/A",
        programme: userData.programme || "B_Tech",
        department: userData.department || "unknown",
        section: userData.section || "Sec-A",
        deferralSemester: Number(deferralSem),
        earnedPoints: activeSemPoints,
        reason: deferralReason,
        status: "Pending Advisor Review",
        advisorComments: "",
        hodComments: "",
        principalComments: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "step_deferrals", defId), payload);
      
      setDeferralReason("");
      setDeferralTerms(false);
      setShowDeferralForm(false);
      alert("STEP Deferral Request submitted successfully! It is now sent for Faculty Advisor endorsement.");
    } catch (err) {
      console.error("Error submitting deferral request:", err);
      setDeferralError("Failed to submit request. Please try again.");
    } finally {
      setIsSubmittingDeferral(false);
    }
  };

  const handlePrintLog = () => {
    const printContent = document.getElementById("printable-step-log-sheet")?.innerHTML;
    if (!printContent) {
      alert("No printable data found.");
      return;
    }
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>STEP Activity Log Sheet - ${userData?.studentName || "Student"}</title>
            <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
            <style>
              @media print {
                body { padding: 15px; font-family: 'Century Schoolbook', 'Times New Roman', serif; background-color: white !important; }
                .no-print { display: none; }
              }
              body { padding: 30px; max-width: 850px; margin: 0 auto; font-family: 'Century Schoolbook', 'Times New Roman', serif; background-color: white; color: black; }
              table { border-collapse: collapse; width: 100%; margin-top: 15px; margin-bottom: 15px; }
              th, td { border: 1px solid #111 !important; padding: 6px 10px; text-align: left; font-size: 11px; color: black !important; }
              th { background-color: #f3f4f6 !important; font-weight: bold; }
              .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 12px; }
              .title { font-size: 18px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
              .subtitle { font-size: 12px; font-weight: bold; color: #374151; margin-bottom: 2px; }
              .doc-title { font-size: 14px; font-weight: 800; text-transform: uppercase; margin-top: 10px; color: #111; letter-spacing: 0.5px; }
              .profile-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 8px; margin-bottom: 15px; }
              .profile-item { font-size: 11px; line-height: 1.5; }
              .profile-label { font-weight: bold; display: inline-block; width: 130px; }
              .signature-section { display: grid; grid-template-cols: 1fr 1fr 1fr 1fr; gap: 15px; margin-top: 35px; page-break-inside: avoid; }
              .signature-box { border-top: 1px dashed #000; text-align: center; padding-top: 6px; font-size: 10px; font-weight: bold; }
              .checklist-section { background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; margin-top: 20px; page-break-inside: avoid; }
              .checklist-title { font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 6px; border-bottom: 1px solid #d1d5db; padding-bottom: 3px; }
              .checklist-item { font-size: 10px; display: flex; items-center gap: 8px; margin-bottom: 4px; }
            </style>
          </head>
          <body onload="window.print();">
            ${printContent}
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-center">
          <Loader2 className="animate-spin text-[#120c7a] mx-auto mb-4" size={40} />
          <p className="text-sm font-semibold text-zinc-500">Loading your STEP Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      {/* Title Header Banner */}
      <div className="bg-gradient-to-r from-[#120c7a] to-[#0d075a] rounded-3xl p-6 md:p-8 text-white mb-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
                <Award size={32} className="text-yellow-400" />
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest text-blue-200 uppercase">Enrichment Programme</span>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-0.5">STEP Activity Portal</h1>
                <p className="text-blue-100 text-xs md:text-sm mt-1">
                  Students&apos; Transformation and Enrichment Programme • {userData?.batch}
                </p>
              </div>
            </div>
            
            <button
              onClick={() => {
                setEditClaimId(null);
                setShowClaimForm(!showClaimForm);
                if (!showClaimForm) {
                  // Reset form fields
                  setClaimActivityName("");
                  setClaimDate("");
                  setClaimDuration("");
                  setClaimBonus("none");
                  setClaimEvidence("");
                  setEvidenceFileName("");
                }
              }}
              className="px-5 py-3 bg-yellow-500 hover:bg-yellow-600 text-[#0d075a] text-sm font-bold rounded-2xl shadow-md transition-all flex items-center gap-2"
            >
              {showClaimForm ? <X size={16} /> : <Plus size={16} />}
              {showClaimForm ? "Close Form" : "Claim Activity Points"}
            </button>
          </div>
        </div>
      </div>

      {/* Claim Form Section */}
      {showClaimForm && (
        <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-6 md:p-8 mb-8 animate-in fade-in-50 duration-300">
          <h2 className="text-lg font-bold text-[#120c7a] flex items-center gap-2 mb-6 pb-4 border-b border-zinc-100">
            <Plus size={20} className="text-yellow-500" />
            {editClaimId ? "Edit & Re-Submit Returned STEP Claim" : "Submit New Activity Points Claim"}
          </h2>

          <form onSubmit={handleSaveClaim} className="space-y-6">
            {submitError && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2.5 text-xs font-bold text-rose-600">
                <AlertTriangle size={16} />
                {submitError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Semester Dropdown */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-2">Select Semester</label>
                <select
                  value={claimSem}
                  onChange={(e) => setClaimSem(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all"
                >
                  <option value={1}>Semester I (Nil points)</option>
                  <option value={2}>Semester II ({activeMilestones.semesterCap} Pts Target)</option>
                  <option value={3}>Semester III ({activeMilestones.semesterCap} Pts Target)</option>
                  <option value={4}>Semester IV ({activeMilestones.semesterCap} Pts Target)</option>
                  <option value={5}>Semester V ({activeMilestones.semesterCap} Pts Target)</option>
                  <option value={6}>Semester VI ({activeMilestones.semesterCap} Pts Target)</option>
                  <option value={7}>Semester VII (Nil points)</option>
                  <option value={8}>Semester VIII (Nil points)</option>
                </select>
                <p className="text-[10px] text-zinc-400 mt-1 font-medium">Points earned are credited to the selected semester.</p>
              </div>

              {/* Category Dropdown */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-2">Approved Category</label>
                <select
                  value={claimCategory}
                  onChange={(e) => setClaimCategory(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all"
                >
                  {Object.entries(activeCategories).map(([key, cat]) => (
                    <option key={key} value={key}>{cat.label} (Max {cat.maxSemesterPoints} Pts/Sem)</option>
                  ))}
                </select>
              </div>

              {/* Activity Type Dropdown */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-2">Activity / Rubric Type</label>
                <select
                  value={claimActivityType}
                  onChange={(e) => setClaimActivityType(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all truncate"
                >
                  {activeCategories[claimCategory]?.activities.map((act) => (
                    <option key={act.id} value={act.id}>{act.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Rubric Details Informational Card */}
            {claimActivityType && (
              <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100 flex items-start gap-3">
                <Info size={18} className="text-blue-600 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <p className="font-bold text-blue-900">Rubric Specifications:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-blue-800 font-medium">
                    <li>Base Points: <span className="font-bold">{getSelectedActivityConfig(claimCategory, claimActivityType)?.basePoints} Points</span></li>
                    <li>Required Duration / Criteria: <span className="font-bold">{getSelectedActivityConfig(claimCategory, claimActivityType)?.criteria}</span></li>
                    <li>Mandatory Evidence: <span className="font-bold text-indigo-950">{getSelectedActivityConfig(claimCategory, claimActivityType)?.evidence}</span></li>
                  </ul>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Activity Event Name */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-zinc-500 mb-2">Specific Name of Event / Topic / Club Name</label>
                <input
                  type="text"
                  placeholder="e.g., National Conference on AI, Blood Donation Camp, NSS Special Camp..."
                  value={claimActivityName}
                  onChange={(e) => setClaimActivityName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-medium text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all"
                />
              </div>

              {/* Conducted Date */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-2">Conducted Date</label>
                <input
                  type="date"
                  value={claimDate}
                  onChange={(e) => setClaimDate(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Duration Hours */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-2">Actual Duration / Participation (Hours) <span className="text-zinc-400 font-normal">(Optional)</span></label>
                <input
                  type="number"
                  placeholder="e.g., 4, 8, 12, 24"
                  value={claimDuration}
                  onChange={(e) => setClaimDuration(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-medium text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all"
                />
                <p className="text-[10px] text-zinc-400 mt-1 font-semibold">Note: Standard rule maps 1 Activity Point = 4 hours of participation where direct rubric isn&apos;t capped.</p>
              </div>

              {/* Bonus Criteria Selection */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-2">Special Bonus Weightage Category</label>
                <select
                  value={claimBonus}
                  onChange={(e) => setClaimBonus(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all"
                >
                  {BONUS_WEIGHTS.map((b) => {
                    const isApplicable = b.id === "none" || b.id === "international" || b.applicable.includes(claimActivityType);
                    return (
                      <option key={b.id} value={b.id} disabled={!isApplicable}>
                        {b.label} {!isApplicable ? "(Not Applicable for this Rubric)" : ""}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[10px] text-zinc-400 mt-1 font-medium">Bonus weightages are verified by Faculty Advisor and capped within semester limits.</p>
              </div>
            </div>

            {/* Evidence File Drag & Drop */}
            <div>
              <label className="block text-xs font-bold text-zinc-500 mb-2">Upload Certificate Proof (Max 300KB, JPEG/PNG image preferred)</label>
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-200 hover:border-blue-500 hover:bg-blue-50/20 rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2"
              >
                <Image className="text-zinc-400 group-hover:text-blue-500" size={32} />
                <span className="text-xs font-bold text-zinc-600">
                  {evidenceFileName || "Drag & Drop Certificate here, or Click to Browse"}
                </span>
                <span className="text-[10px] text-zinc-400 font-semibold">JPEG, PNG formats under 300KB</span>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/jpeg,image/png" 
                  className="hidden" 
                />
              </div>

              {claimEvidence && (
                <div className="mt-4 p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img src={claimEvidence} alt="Preview" className="w-12 h-12 rounded-lg object-cover border border-zinc-200 bg-white" />
                    <div>
                      <p className="text-xs font-bold text-zinc-700 truncate max-w-xs">{evidenceFileName || "Uploaded Certificate"}</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase">Ready to submit</p>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => { setClaimEvidence(""); setEvidenceFileName(""); }}
                    className="p-1.5 hover:bg-zinc-200 rounded-lg text-rose-500 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Live Calculated Points Card */}
            <div className="bg-[#120c7a]/5 rounded-2xl p-4 md:p-6 border border-[#120c7a]/10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Live Points Calculation</p>
                <div className="flex items-center gap-3 mt-1.5 text-zinc-700">
                  <span className="text-sm font-semibold">Base: {calculatedPoints().base}</span>
                  <span className="text-sm font-semibold text-zinc-300">|</span>
                  <span className="text-sm font-semibold">Bonus: +{calculatedPoints().bonus}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-zinc-400 uppercase block tracking-wider">Total Claim Points</span>
                <span className="text-3xl font-extrabold text-[#120c7a]">{calculatedPoints().total} Points</span>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setShowClaimForm(false)}
                className="px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-zinc-600 text-sm font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-gradient-to-r from-[#120c7a] to-blue-700 text-white rounded-xl text-sm font-bold shadow-md hover:from-blue-700 hover:to-blue-800 transition-all flex items-center gap-2"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {isSubmitting ? "Submitting..." : editClaimId ? "Save Changes & Submit" : "Submit Claim for Review"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Core Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Left Section: Progress, Stats & Semesters */}
        <div className="lg:col-span-1 space-y-6">
          {/* Overall Compliance Target Card */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100">
            <h3 className="text-sm font-extrabold text-zinc-500 uppercase tracking-wider mb-4">Overall STEP Target</h3>
            <div className="flex items-end justify-between gap-4 mb-2">
              <span className="text-4xl font-extrabold text-[#120c7a]">{currentSummary.cumulativeEarned}</span>
              <span className="text-sm font-extrabold text-zinc-400">/ {currentSummary.requiredTotal} Points</span>
            </div>
            <div className="w-full bg-zinc-100 h-3.5 rounded-full overflow-hidden mb-3">
              <div 
                className="bg-gradient-to-r from-[#120c7a] to-blue-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${currentSummary.progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs font-bold text-zinc-400 uppercase">
              <span>{currentSummary.progressPercent}% Completed</span>
              <span className="text-[#120c7a]">{currentSummary.isLateral ? "Lateral Entry" : "Regular Student"}</span>
            </div>

            <div className="mt-6 pt-5 border-t border-zinc-100 flex items-center gap-3">
              <div className="p-2 bg-yellow-50 rounded-xl text-yellow-600 shrink-0">
                <Clock size={16} />
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500 font-medium">
                <strong>Rubric Limit Constraint:</strong> Maximum <span className="font-bold text-[#120c7a]">{activeMilestones.semesterCap} points</span> are credited per semester. Points earned in excess of individual category caps are excluded from calculations.
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handlePrintLog}
                className="w-full py-2.5 px-4 bg-zinc-900 text-white hover:bg-zinc-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <Printer size={14} />
                Print Official STEP Log Sheet
              </button>

              {currentSummary.cumulativeEarned < currentSummary.requiredTotal ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeferralError("");
                    setShowDeferralForm(true);
                  }}
                  className="w-full py-2.5 px-4 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-orange-200"
                >
                  <FileCheck size={14} />
                  Request Exam Deferral
                </button>
              ) : (
                <div className="bg-emerald-50 text-emerald-800 text-[11px] font-bold py-2 px-3 rounded-xl border border-emerald-200 text-center flex items-center justify-center gap-1.5">
                  <CheckCircle size={12} />
                  Full STEP Compliance Met
                </div>
              )}
            </div>
          </div>

          {/* Semesters Compliance Checklist */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100">
            <h3 className="text-sm font-extrabold text-zinc-500 uppercase tracking-wider mb-4">Semester Compliance</h3>
            <div className="space-y-3">
              {[2, 3, 4, 5, 6].map((sem) => {
                const earned = currentSummary.semSummaries[sem]?.totalEarned || 0;
                const isCompliant = earned >= activeMilestones.semesterCap;
                return (
                  <button
                    key={sem}
                    onClick={() => setSelectedSemTab(sem)}
                    className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-4 ${
                      selectedSemTab === sem 
                        ? "border-[#120c7a] bg-[#120c7a]/5 shadow-sm" 
                        : "border-zinc-100 hover:bg-zinc-50 bg-white"
                    }`}
                  >
                    <div>
                      <p className={`text-xs font-extrabold ${selectedSemTab === sem ? "text-[#120c7a]" : "text-zinc-700"}`}>
                        Semester {sem === 1 ? "I" : sem === 2 ? "II" : sem === 3 ? "III" : sem === 4 ? "IV" : sem === 5 ? "V" : sem === 6 ? "VI" : "VII/VIII"}
                      </p>
                      <p className="text-[10px] text-zinc-400 mt-0.5 font-bold uppercase tracking-wider">
                        Earned: {earned}/{activeMilestones.semesterCap} Points
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCompliant ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-extrabold uppercase rounded-full flex items-center gap-1">
                          <Check size={10} strokeWidth={3} /> Compliant
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[9px] font-extrabold uppercase rounded-full">
                          Pending
                        </span>
                      )}
                      <ArrowRight size={14} className={selectedSemTab === sem ? "text-[#120c7a]" : "text-zinc-300"} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP Deferral Requests List */}
          {deferrals.length > 0 && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100">
              <h3 className="text-sm font-extrabold text-zinc-500 uppercase tracking-wider mb-4">Exam Deferrals</h3>
              <div className="space-y-3">
                {deferrals.map((def) => (
                  <div key={def.id} className="p-3.5 bg-zinc-50 border border-zinc-100 rounded-2xl text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-zinc-700">Sem {def.deferralSemester} Deferral</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                        def.status === "Approved" ? "bg-emerald-100 text-emerald-800" :
                        def.status === "Rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {def.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 font-semibold italic">
                      &quot;{def.reason}&quot;
                    </p>
                    {def.advisorComments && (
                      <p className="text-[10px] text-zinc-400">
                        <strong className="text-zinc-600">Advisor feedback:</strong> {def.advisorComments}
                      </p>
                    )}
                    {def.hodComments && (
                      <p className="text-[10px] text-zinc-400">
                        <strong className="text-zinc-600">HOD feedback:</strong> {def.hodComments}
                      </p>
                    )}
                    {def.principalComments && (
                      <p className="text-[10px] text-zinc-400">
                        <strong className="text-zinc-600">Principal feedback:</strong> {def.principalComments}
                      </p>
                    )}
                    <span className="text-[9px] text-zinc-400 block font-semibold">
                      Submitted on: {new Date(def.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Section: Semester-wise Breakdown & Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Semester Selected Points Breakdown */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100">
            <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-zinc-100">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase block">Active Breakdown</span>
                <h3 className="text-base font-extrabold text-zinc-800">
                  Semester {selectedSemTab} Points Analysis
                </h3>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-[#120c7a]">
                  {currentSummary.semSummaries[selectedSemTab]?.totalEarned} / {activeMilestones.semesterCap}
                </span>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Capped Points</p>
              </div>
            </div>

            {/* Interactive Grid of Categories with Caps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(activeCategories).map(([key, cat]) => {
                const earned = currentSummary.semSummaries[selectedSemTab]?.categoryBreakdown[key] || 0;
                const percent = Math.min(Math.round((earned / cat.maxSemesterPoints) * 100), 100);
                
                return (
                  <div key={key} className={`rounded-2xl p-4 border border-zinc-100 ${cat.bgLight}/10`}>
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <p className="text-xs font-extrabold text-zinc-700">{cat.label}</p>
                        <p className="text-[10px] text-zinc-400 mt-0.5 font-semibold">Max Cap: {cat.maxSemesterPoints} Pts</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cat.bgLight} ${cat.textDark}`}>
                        {earned} Pts
                      </span>
                    </div>

                    <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full bg-gradient-to-r ${cat.color}`} 
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submitted Claims History Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-zinc-800">STEP Submission Log & Status</h3>
                <p className="text-xs text-zinc-400 font-medium">History of all uploaded activity certificates and approvals.</p>
              </div>
              <span className="px-3 py-1 bg-zinc-100 rounded-full text-xs font-bold text-zinc-600">
                {activities.length} Submissions
              </span>
            </div>

            {activities.length === 0 ? (
              <div className="p-12 text-center text-zinc-400">
                <FileText size={36} className="mx-auto text-zinc-300 mb-3" />
                <p className="text-sm font-semibold text-zinc-600">No activity claims submitted yet.</p>
                <p className="text-xs text-zinc-400 mt-1">Click the button in the header banner to submit your first claim!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-600">
                  <thead className="bg-zinc-50/70 text-xs font-extrabold text-zinc-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-4">Sem</th>
                      <th className="p-4">Activity Description</th>
                      <th className="p-4">Points</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-medium">
                    {activities.map((act) => {
                      const catConfig = activeCategories[act.category];
                      const status = act.status || "Pending";
                      
                      return (
                        <tr key={act.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="p-4 font-bold text-zinc-800">Sem {act.semester}</td>
                          <td className="p-4 max-w-xs md:max-w-sm">
                            <p className="font-bold text-zinc-800 truncate">{act.activityName}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-zinc-400">
                              <span className={`px-1.5 py-0.5 rounded ${catConfig?.bgLight} ${catConfig?.textDark} font-bold`}>
                                {catConfig?.label || act.category}
                              </span>
                              <span>•</span>
                              <span>{act.date}</span>
                            </div>
                          </td>
                          <td className="p-4 font-bold text-[#120c7a]">
                            +{act.totalPoints} <span className="text-[10px] text-zinc-400 font-normal">pts</span>
                          </td>
                          <td className="p-4">
                            {status === "Approved" && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
                                <CheckCircle size={12} /> Approved
                              </span>
                            )}
                            {status === "Pending" && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700">
                                <Clock size={12} className="animate-pulse" /> Pending
                              </span>
                            )}
                            {status === "Returned" && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700" title={act.comments}>
                                <AlertTriangle size={12} /> Returned
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {/* View Action */}
                              <button
                                onClick={() => setViewActivity(act)}
                                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-500 hover:text-[#120c7a] transition-all"
                                title="View Details"
                              >
                                <Eye size={16} />
                              </button>

                              {/* Edit Action for Returned Claims */}
                              {status === "Returned" && (
                                <button
                                  onClick={() => handleEditReturned(act)}
                                  className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-xs font-bold transition-all"
                                  title="Edit & Re-Submit"
                                >
                                  Re-Submit
                                </button>
                              )}

                              {/* Delete Option for Pending Claims */}
                              {status === "Pending" && (
                                <button
                                  onClick={() => handleDeleteClaim(act.id)}
                                  className="p-1.5 hover:bg-zinc-100 rounded-lg text-rose-500 transition-all"
                                  title="Delete Claim"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Handbook Guidelines & Policies Section */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-zinc-100 shadow-sm mb-8">
        <h3 className="text-lg font-extrabold text-[#120c7a] flex items-center gap-2 mb-6">
          <Award className="text-yellow-500" size={20} />
          STEP Official Handbook Guidelines & Compliance Policies
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">General Programme Guidelines</h4>
            {activeGuidelines && activeGuidelines.length > 0 ? (
              <ul className="space-y-2.5">
                {activeGuidelines.map((g, idx) => (
                  <li key={idx} className="text-xs text-zinc-600 font-medium leading-relaxed flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-2.5">
                <li className="text-xs text-zinc-600 font-medium leading-relaxed flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                  <span>Only activities conducted/completed during the active semester will be eligible for points claim.</span>
                </li>
                <li className="text-xs text-zinc-600 font-medium leading-relaxed flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                  <span>Maximum capped points are calculated after enforcing both semester-wise caps and category ceilings.</span>
                </li>
                <li className="text-xs text-zinc-600 font-medium leading-relaxed flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                  <span>Mandatory certificate upload is required for all claims; falsified documents will result in disciplinary action.</span>
                </li>
                <li className="text-xs text-zinc-600 font-medium leading-relaxed flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                  <span>Students must maintain their physical STEP File containing printed copies of all certificates and this ERP log sheet.</span>
                </li>
              </ul>
            )}
          </div>
          <div>
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Physical STEP File Submission Checklist</h4>
            {activeChecklist && activeChecklist.length > 0 ? (
              <ul className="space-y-2.5">
                {activeChecklist.map((item, idx) => (
                  <li key={idx} className="text-xs text-zinc-600 font-medium leading-relaxed flex items-start gap-2">
                    <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={14} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-2.5">
                <li className="text-xs text-zinc-600 font-medium leading-relaxed flex items-start gap-2">
                  <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={14} />
                  <span>STEP Activity Log Sheet (printed from this ERP portal)</span>
                </li>
                <li className="text-xs text-zinc-600 font-medium leading-relaxed flex items-start gap-2">
                  <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={14} />
                  <span>Original certificates of participation, coordination, and prizes</span>
                </li>
                <li className="text-xs text-zinc-600 font-medium leading-relaxed flex items-start gap-2">
                  <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={14} />
                  <span>Internship offer and completion letters / industry training reports</span>
                </li>
                <li className="text-xs text-zinc-600 font-medium leading-relaxed flex items-start gap-2">
                  <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={14} />
                  <span>Geo-tagged photographs (mandatory for social, extension, and sports activities)</span>
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* View Activity Verification Modal */}
      {viewActivity && (
        <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-br from-[#120c7a] to-blue-900 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Award className="text-yellow-400" size={24} />
                <div>
                  <h4 className="font-extrabold text-sm uppercase tracking-wider text-blue-200">Activity Claim Verification</h4>
                  <p className="text-base font-bold truncate mt-0.5">{viewActivity.activityName}</p>
                </div>
              </div>
              <button 
                onClick={() => setViewActivity(null)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Core Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Semester Credited</span>
                  <span className="text-sm font-extrabold text-zinc-800">Semester {viewActivity.semester}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Points Applied</span>
                  <span className="text-sm font-extrabold text-[#120c7a]">{viewActivity.totalPoints} Points</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Activity Category</span>
                  <span className="text-sm font-extrabold text-zinc-800">
                    {activeCategories[viewActivity.category]?.label || viewActivity.category}
                  </span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Conducted Date</span>
                  <span className="text-sm font-bold text-zinc-700">{viewActivity.date}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Status</span>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    viewActivity.status === "Approved" ? "bg-emerald-100 text-emerald-800" :
                    viewActivity.status === "Returned" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    {viewActivity.status || "Pending"}
                  </span>
                </div>
              </div>

              {/* Feedback Comment Section if Returned or Reviewed */}
              {viewActivity.comments && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                  <p className="text-xs font-extrabold text-rose-800 uppercase tracking-wider">Advisor Review Feedback</p>
                  <p className="text-sm font-semibold text-rose-950 mt-1 leading-relaxed">
                    &quot;{viewActivity.comments}&quot;
                  </p>
                  {viewActivity.reviewedByName && (
                    <span className="text-[10px] text-rose-400 block mt-2 font-bold">
                      Reviewed by {viewActivity.reviewedByName}
                    </span>
                  )}
                </div>
              )}

              {/* Certificate Image Frame */}
              {viewActivity.evidenceUrl && (
                <div>
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Uploaded Certificate Proof</span>
                  <div className="border border-zinc-200 bg-zinc-50 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center p-2 min-h-60">
                    <img 
                      src={viewActivity.evidenceUrl} 
                      alt="Certificate Evidence" 
                      className="max-w-full max-h-96 object-contain rounded-xl shadow-md" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex justify-end">
              <button
                onClick={() => setViewActivity(null)}
                className="px-5 py-2.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-xs font-extrabold rounded-xl transition-all cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deferral Request Modal */}
      {showDeferralForm && (
        <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-br from-orange-600 to-red-800 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileCheck className="text-white" size={24} />
                <div>
                  <h4 className="font-extrabold text-sm uppercase tracking-wider text-orange-200">Exam Deferral Petition</h4>
                  <p className="text-xs text-white/90 font-semibold mt-0.5">STEP Non-Compliance Escalation Workflow</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowDeferralForm(false);
                  setDeferralError("");
                }}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveDeferral} className="p-6 space-y-4">
              {deferralError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{deferralError}</span>
                </div>
              )}

              <div className="p-4 bg-orange-50/50 border border-orange-100 rounded-2xl text-[11px] leading-relaxed text-orange-800 font-semibold space-y-1.5">
                <p>
                  <strong>Escalation Policy:</strong> Students who are non-compliant with the minimum required STEP Activity points by Semester VI are legally ineligible to write End-Semester Examinations.
                </p>
                <p>
                  By submitting this petition, you request a formal deferral endorsed by your Faculty Advisor, HOD, and approved by the Head of the Institution.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                  Select Deferral Semester
                </label>
                <select
                  value={deferralSem}
                  onChange={(e) => setDeferralSem(Number(e.target.value))}
                  className="w-full p-3 rounded-xl border border-zinc-200 text-sm font-bold bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value={2}>Semester II (Current Earned: {currentSummary.semSummaries[2]?.totalEarned || 0}/20)</option>
                  <option value={3}>Semester III (Current Earned: {currentSummary.semSummaries[3]?.totalEarned || 0}/20)</option>
                  <option value={4}>Semester IV (Current Earned: {currentSummary.semSummaries[4]?.totalEarned || 0}/20)</option>
                  <option value={5}>Semester V (Current Earned: {currentSummary.semSummaries[5]?.totalEarned || 0}/20)</option>
                  <option value={6}>Semester VI (Current Earned: {currentSummary.semSummaries[6]?.totalEarned || 0}/20)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                  Reason for Deferral Request
                </label>
                <textarea
                  value={deferralReason}
                  onChange={(e) => setDeferralReason(e.target.value)}
                  placeholder="State your reasons in detail (e.g. medical emergency, non-availability of certifications, sports representations, etc.)"
                  className="w-full p-3.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 min-h-24 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                />
              </div>

              <label className="flex gap-2.5 p-3.5 bg-zinc-50 rounded-2xl border border-zinc-100 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deferralTerms}
                  onChange={(e) => setDeferralTerms(e.target.checked)}
                  className="mt-0.5 rounded text-orange-600 focus:ring-orange-500"
                />
                <span className="text-[10px] leading-relaxed text-zinc-600 font-bold">
                  I accept the academic undertaking that if this petition is approved, I am cleared for examinations but my 8th Semester Grade Sheet will be legally withheld until my STEP compliance is verified.
                </span>
              </label>

              <div className="flex gap-3 pt-3 border-t border-zinc-100 justify-end">
                <button
                  type="button"
                  onClick={() => setShowDeferralForm(false)}
                  className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-extrabold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDeferral}
                  className="px-5 py-2.5 bg-gradient-to-r from-orange-600 to-red-700 text-white text-xs font-extrabold rounded-xl shadow-md hover:from-orange-700 hover:to-red-800 transition-all flex items-center gap-2"
                >
                  {isSubmittingDeferral ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  Submit Petition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hidden Printable Official STEP Log Sheet Container */}
      <div id="printable-step-log-sheet" className="hidden">
        <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid black', paddingBottom: '12px' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase' }}>COIMBATORE INSTITUTE OF TECHNOLOGY</div>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#374151', textTransform: 'uppercase' }}>
            (A Government Aided Autonomous Institution Affiliated to Anna University)
          </div>
          <div style={{ fontSize: '14px', fontWeight: '800', textTransform: 'uppercase', marginTop: '12px', color: '#111', letterSpacing: '0.5px' }}>
            STUDENTS&apos; TRANSFORMATION AND ENRICHMENT PROGRAMME (STEP)
          </div>
          <div style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', color: '#444', marginTop: '4px' }}>
            OFFICIAL ACTIVITY LOG SHEET & COMPLIANCE EXTRACT
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '15px' }}>
          <div style={{ fontSize: '11px', lineHeight: '1.5' }}>
            <span style={{ fontWeight: 'bold', display: 'inline-block', width: '130px' }}>Student Name:</span> 
            {userData?.studentName || "N/A"}
          </div>
          <div style={{ fontSize: '11px', lineHeight: '1.5' }}>
            <span style={{ fontWeight: 'bold', display: 'inline-block', width: '130px' }}>Register Number:</span> 
            {userData?.regNo || "N/A"}
          </div>
          <div style={{ fontSize: '11px', lineHeight: '1.5' }}>
            <span style={{ fontWeight: 'bold', display: 'inline-block', width: '130px' }}>Admission Number:</span> 
            {userData?.admissionNo || "N/A"}
          </div>
          <div style={{ fontSize: '11px', lineHeight: '1.5' }}>
            <span style={{ fontWeight: 'bold', display: 'inline-block', width: '130px' }}>Degree & Branch:</span> 
            {userData?.programme || "B.E."} - {userData?.department || "N/A"}
          </div>
          <div style={{ fontSize: '11px', lineHeight: '1.5' }}>
            <span style={{ fontWeight: 'bold', display: 'inline-block', width: '130px' }}>Batch:</span> 
            {userData?.batch || "N/A"}
          </div>
          <div style={{ fontSize: '11px', lineHeight: '1.5' }}>
            <span style={{ fontWeight: 'bold', display: 'inline-block', width: '130px' }}>Student Category:</span> 
            {currentSummary.isLateral ? "Lateral Entry" : "Regular Student"}
          </div>
        </div>

        <h4 style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '1px solid #111', paddingBottom: '3px', marginTop: '15px', color: '#111' }}>
          I. Semester-wise Points Distribution (Capped per Rubric)
        </h4>
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '8px', marginBottom: '15px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f3f4f6' }}>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'left' }}>Semester</th>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>Technical (Max 12)</th>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>Research (Max 10)</th>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>Industry (Max 10)</th>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>IIY (Max 10)</th>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>Social (Max 8)</th>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>Leadership (Max 8)</th>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>Sports (Max 6)</th>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center', fontWeight: 'bold' }}>Sem Total (Max 20)</th>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center', fontWeight: 'bold' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[2, 3, 4, 5, 6].map((s) => {
              const sum = currentSummary.semSummaries[s];
              return (
                <tr key={s}>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px', fontWeight: 'bold' }}>Semester {s}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>{sum?.categoryBreakdown?.technical || 0}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>{sum?.categoryBreakdown?.research || 0}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>{sum?.categoryBreakdown?.industry || 0}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>{sum?.categoryBreakdown?.iiy || 0}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>{sum?.categoryBreakdown?.social || 0}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>{sum?.categoryBreakdown?.leadership || 0}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>{sum?.categoryBreakdown?.sports || 0}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center', fontWeight: 'bold', backgroundColor: '#f9fafb' }}>{sum?.totalEarned || 0}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center', fontWeight: 'bold' }}>{sum?.totalEarned >= 20 ? "COMPLIANT" : "PENDING"}</td>
                </tr>
              );
            })}
            <tr style={{ backgroundColor: '#f3f4f6', fontWeight: 'bold' }}>
              <td colSpan="8" style={{ border: '1px solid black', padding: '8px', fontSize: '11px', textTransform: 'uppercase' }}>CUMULATIVE EARNED POINTS (SEMESTER II - VI)</td>
              <td style={{ border: '1px solid black', padding: '8px', fontSize: '11px', textAlign: 'center' }}>{currentSummary.cumulativeEarned} / {currentSummary.requiredTotal}</td>
              <td style={{ border: '1px solid black', padding: '8px', fontSize: '11px', textAlign: 'center' }}>{currentSummary.cumulativeEarned >= currentSummary.requiredTotal ? "COMPLIANT" : "NON-COMPLIANT"}</td>
            </tr>
          </tbody>
        </table>

        <h4 style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '1px solid #111', paddingBottom: '3px', marginTop: '20px', color: '#111' }}>
          II. Approved STEP Activities Log (Official Digital Extract)
        </h4>
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '8px', marginBottom: '15px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f3f4f6' }}>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', width: '8%' }}>Sem</th>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', width: '20%' }}>Category</th>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', width: '45%' }}>Activity / Event Description</th>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', width: '12%', textAlign: 'center' }}>Date</th>
              <th style={{ border: '1px solid black', padding: '6px', fontSize: '10px', width: '15%', textAlign: 'center' }}>Points Awarded</th>
            </tr>
          </thead>
          <tbody>
            {activities.filter(a => a.status === "Approved").length > 0 ? (
              activities.filter(a => a.status === "Approved").map((act) => (
                <tr key={act.id}>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>Sem {act.semester}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px' }}>{STEP_CATEGORIES[act.category]?.label || act.category}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px' }}>{act.activityName}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center' }}>{act.date}</td>
                  <td style={{ border: '1px solid black', padding: '6px', fontSize: '10px', textAlign: 'center', fontWeight: 'bold' }}>{act.totalPoints}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" style={{ border: '1px solid black', padding: '12px', fontSize: '10px', textAlign: 'center', color: '#666' }}>No approved activities logged yet in the digital ERP.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', padding: '10px', borderRadius: '8px', marginTop: '20px' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', borderBottom: '1px solid #d1d5db', paddingBottom: '2px' }}>
            STEP Activity File Checklist (Mandatory Attachments for Physical STEP File Submission)
          </div>
          <div style={{ fontSize: '9px', marginBottom: '3px' }}>[&#10003;] 1. STEP Activity Log Sheet (This formal summary printout)</div>
          <div style={{ fontSize: '9px', marginBottom: '3px' }}>[&nbsp;&nbsp;&nbsp;] 2. Original or attested participation/award certificates for all activities listed above</div>
          <div style={{ fontSize: '9px', marginBottom: '3px' }}>[&nbsp;&nbsp;&nbsp;] 3. Faculty Advisor&apos;s verification sign-off (physical STEP File record card)</div>
          <div style={{ fontSize: '9px', marginBottom: '3px' }}>[&nbsp;&nbsp;&nbsp;] 4. Event brochures, pamphlets, or invitations (where applicable to justify durations)</div>
          <div style={{ fontSize: '9px', marginBottom: '3px' }}>[&nbsp;&nbsp;&nbsp;] 5. Geo-tagged photographs of participation (mandatory for social, extension, and sports activities)</div>
          <div style={{ fontSize: '9px', marginBottom: '3px' }}>[&nbsp;&nbsp;&nbsp;] 6. Internship/industry training project reports (where applicable)</div>
          <div style={{ fontSize: '9px', marginBottom: '3px' }}>[&#10003;] 7. ERP portal upload-confirmation screenshots / official digital logs</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '15px', marginTop: '45px', pageBreakInside: 'avoid' }}>
          <div style={{ borderTop: '1px dashed black', textAlign: 'center', paddingTop: '6px', fontSize: '9px', fontWeight: 'bold' }}>Signature of Student</div>
          <div style={{ borderTop: '1px dashed black', textAlign: 'center', paddingTop: '6px', fontSize: '9px', fontWeight: 'bold' }}>Faculty Advisor / Tutor</div>
          <div style={{ borderTop: '1px dashed black', textAlign: 'center', paddingTop: '6px', fontSize: '9px', fontWeight: 'bold' }}>STEP Faculty Coordinator</div>
          <div style={{ borderTop: '1px dashed black', textAlign: 'center', paddingTop: '6px', fontSize: '9px', fontWeight: 'bold' }}>Head of the Department</div>
        </div>
      </div>
    </div>
  );
}
