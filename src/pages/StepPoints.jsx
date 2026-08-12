import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, doc, getDoc, setDoc } from "firebase/firestore";
import { 
  Award, Clock, Eye, Download, Check, X, Search, Filter, Users, Loader2,
  Settings, Plus, Trash2, Save, BookOpen, ListTodo, Target, ChevronRight, Info
} from "lucide-react";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { STEP_CATEGORIES } from "./student/StepPoints";
import { formatDepartmentDisplay } from "../lib/utils";

function sanitizeKey(key) {
  if (!key) return "";
  return String(key).replace(/[.#$[\]/ ]/g, '_');
}

const DEFAULT_CHECKLIST = [
  "STEP Activity Log Sheet (This formal summary printout)",
  "Original or attested participation/award certificates for all activities listed above",
  "Faculty Advisor's verification sign-off (physical STEP File record card)",
  "Event brochures, pamphlets, or invitations (where applicable to justify durations)",
  "Geo-tagged photographs of participation (mandatory for social, extension, and sports activities)",
  "Internship/industry training project reports (where applicable)",
  "ERP portal upload-confirmation screenshots / official digital logs"
];

const DEFAULT_GUIDELINES = [
  "Regular class attendance, laboratory sessions and curricular examinations shall not be counted for Activity Points.",
  "Activities organised by a student independently, without the prior sanction or affiliation of the Institution, shall not be counted.",
  "Online webinars or video sessions without a verifiable completion certificate shall not be counted.",
  "For activities involving long-duration participation, 1 Activity Point is granted for every 4 hours of verified work (unless direct rubric is specified).",
  "Any certificate containing alterations, missing signatures, or non-verifiable credentials will be returned for correction immediately."
];

const BONUS_WEIGHTS = [
  { id: "none", label: "No Bonus Criteria Applies", points: 0 },
  { id: "iit", label: "Event by IIT / NIT / Top-50 NIRF (+10 pts)", points: 10, applicable: ["tech_org", "tech_coord", "tech_comp", "tech_hackathon"] },
  { id: "ieee", label: "Event by IEEE / ISTE / ASME / ACM or similar (+10 pts)", points: 10, applicable: ["tech_workshop", "tech_paper"] },
  { id: "national", label: "National-level representation / championship (+15 pts)", points: 15, applicable: ["sport_inter_part", "sport_inter_prize", "tech_comp", "sport_cult_part", "sport_cult_prize"] },
  { id: "international", label: "International-level participation (+20 pts)", points: 20, applicable: [] }
];

export default function StepPoints() {
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [studentsIndex, setStudentsIndex] = useState({});
  const [sectionConfigs, setSectionConfigs] = useState({});

  // Deferral State
  const [deferralRequests, setDeferralRequests] = useState([]);
  const [reviewDeferral, setReviewDeferral] = useState(null);
  const [deferralActionComments, setDeferralActionComments] = useState("");
  const [isDeferralActioning, setIsDeferralActioning] = useState(false);

  // Filters State
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedProg, setSelectedProg] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("pending"); // "pending", "approved", "returned", "compliance", "deferrals"

  // Dynamic STEP configuration states
  const [activeCategories, setActiveCategories] = useState(STEP_CATEGORIES);
  const [activeBonusWeights, setActiveBonusWeights] = useState(BONUS_WEIGHTS);
  const [activeChecklist, setActiveChecklist] = useState(DEFAULT_CHECKLIST);
  const [activeGuidelines, setActiveGuidelines] = useState(DEFAULT_GUIDELINES);
  const [activeMilestones, setActiveMilestones] = useState({
    regularRequired: 100,
    lateralRequired: 80,
    semesterCap: 20
  });

  const showConfigTab = currentUserData?.role === "Admin" || currentUserData?.role === "Principal";

  // Modal State
  const [reviewActivity, setReviewActivity] = useState(null);
  const [returnComment, setReturnComment] = useState("");
  const [isActioning, setIsActioning] = useState(false);
  const [showReturnInput, setShowReturnInput] = useState(false);

  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getActiveBatches } = useBatches(durations);

  const activeBatchesList = useMemo(() => getActiveBatches(), [getActiveBatches]);

  // Department-scoped visibility: any user who has this page visible sees claims,
  // but Faculty/HOD (and other staff) only see students from their own department.
  const normalizeDept = (d) => (d || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const masterAdminEmail = (import.meta.env.VITE_MASTER_ADMIN_EMAIL || "").toLowerCase();
  const isAdminView = currentUserData?.role === "Admin" || currentUserData?.role === "Principal" ||
    (auth.currentUser?.email || "").toLowerCase() === masterAdminEmail;
  const currentUserDept = currentUserData?.department || "";
  const canViewClaim = (claimDept) =>
    isAdminView || (claimDept && normalizeDept(claimDept) === normalizeDept(currentUserDept));

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            const data = snap.data();
            setCurrentUserData(data);
            
            // Auto-populate filters based on Faculty profile
            if (data.role === "Faculty" || data.role === "HOD") {
              if (data.department) setSelectedDept(data.department);
              if (data.programme) setSelectedProg(data.programme);
            }
          }
        } catch (err) {
          console.error("Error loading user profile:", err);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Real-time synchronization of dynamic STEP settings from Firestore
  useEffect(() => {
    const docRef = doc(db, "step_config", "step_configuration");
    const unsub = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.categories) setActiveCategories(data.categories);
        if (data.bonusWeights) setActiveBonusWeights(data.bonusWeights);
        if (data.checklist) setActiveChecklist(data.checklist);
        if (data.guidelines) setActiveGuidelines(data.guidelines);
        if (data.milestones) setActiveMilestones(data.milestones);
      } else {
        // Auto-initialize if Admin
        if (currentUserData?.role === "Admin") {
          const defaultData = {
            categories: STEP_CATEGORIES,
            bonusWeights: BONUS_WEIGHTS,
            checklist: DEFAULT_CHECKLIST,
            guidelines: DEFAULT_GUIDELINES,
            milestones: {
              regularRequired: 100,
              lateralRequired: 80,
              semesterCap: 20
            }
          };
          setDoc(docRef, defaultData).catch(err => console.error("Error auto-initializing STEP config:", err));
        }
      }
    });
    return () => unsub();
  }, [currentUserData]);

  // Fetch all activities in real-time
  useEffect(() => {
    const q = collection(db, "step_activities");
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setActivities(list);
    }, (err) => console.error("Error loading activities:", err));

    return () => unsub();
  }, []);

  // Load bulk student records from student_section_index for name matching if needed
  useEffect(() => {
    const q = collection(db, "student_section_index");
    const unsub = onSnapshot(q, (snapshot) => {
      const index = {};
      snapshot.forEach((d) => {
        const data = d.data();
        Object.entries(data).forEach(([key, val]) => {
          if (typeof val === "object" && val !== null) {
            index[key] = val; // maps admissionNo/regNo -> student profile
          }
        });
      });
      setStudentsIndex(index);
    });
    return () => unsub();
  }, []);

  // Fetch all deferrals in real-time
  useEffect(() => {
    const q = collection(db, "step_deferrals");
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setDeferralRequests(list);
    }, (err) => console.error("Error loading deferrals:", err));

    return () => unsub();
  }, []);

  // Section configs from Curriculum.jsx (batch_sections collection)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "batch_sections"), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setSectionConfigs(data);
    }, (err) => console.error("Error loading section configs:", err));
    return () => unsub();
  }, []);

  const filteredDeferralRequests = useMemo(() => {
    return deferralRequests.filter((def) => {
      if (!canViewClaim(def.department)) return false;
      const matchesBatch = !selectedBatch || def.batch === selectedBatch;
      const matchesDept = !selectedDept || normalizeDept(def.department) === normalizeDept(selectedDept);
      const matchesProg = !selectedProg || def.programme === selectedProg;
      const matchesSection = !selectedSection || def.section === selectedSection;

      const matchesSearch = !searchQuery.trim() || 
        (def.studentName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (def.regNo || "").toLowerCase().includes(searchQuery.toLowerCase());

      return matchesBatch && matchesDept && matchesProg && matchesSection && matchesSearch;
    });
  }, [deferralRequests, selectedBatch, selectedDept, selectedProg, selectedSection, searchQuery, canViewClaim]);

  const pendingDeferralsCount = useMemo(() => {
    return deferralRequests.filter(d => {
      if (!canViewClaim(d.department)) return false;
      if (currentUserData?.role === "Faculty") return d.status === "Pending Advisor Review";
      if (currentUserData?.role === "HOD") return d.status === "Pending HOD Review";
      if (currentUserData?.role === "Principal") return d.status === "Pending Principal Review";
      return d.status.startsWith("Pending");
    }).length;
  }, [deferralRequests, currentUserData, canViewClaim]);

  // Filter lists derived dynamically from activities
  const batchOptions = useMemo(() => {
    const b = new Set();
    activities.forEach(a => { if (a.batch) b.add(a.batch); });
    activeBatchesList.forEach(batch => b.add(batch));
    return Array.from(b).sort();
  }, [activities, activeBatchesList]);

  const deptOptions = useMemo(() => {
    const d = new Set();
    activities.forEach(a => { if (a.department) d.add(a.department); });
    // also add all departments from hooks
    Object.values(PROGRAMME_DEPARTMENTS).forEach(list => {
      list.forEach(dept => d.add(dept));
    });
    return Array.from(d).sort();
  }, [activities, PROGRAMME_DEPARTMENTS]);

  const sectionOptions = useMemo(() => {
    const s = new Set();
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const matchDept = (cfgDept) => {
      if (selectedDept) return normalizeDept(cfgDept) === normalizeDept(selectedDept);
      return isAdminView || normalizeDept(cfgDept) === normalizeDept(currentUserDept);
    };
    Object.values(sectionConfigs).forEach(cfg => {
      if (!cfg || !cfg.numSections) return;
      if (!matchDept(cfg.department)) return;
      if (selectedBatch && cfg.batch && sanitizeKey(cfg.batch) !== sanitizeKey(selectedBatch)) return;
      Array.from({ length: cfg.numSections }, (_, i) => s.add(`Sec-${letters[i]}`));
    });
    // Fallback to sections actually present in claims when no config exists for the department
    if (s.size === 0) {
      activities.forEach(a => {
        if (!a.section) return;
        if (!canViewClaim(a.department)) return;
        if (selectedDept && normalizeDept(a.department) !== normalizeDept(selectedDept)) return;
        s.add(a.section);
      });
    }
    return Array.from(s).sort();
  }, [activities, sectionConfigs, selectedBatch, selectedDept, currentUserDept, isAdminView, canViewClaim]);

  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      if (!canViewClaim(act.department)) return false;
      const status = act.status || "Pending";
      const matchesTab = 
        activeTab === "pending" ? status === "Pending" :
        activeTab === "approved" ? status === "Approved" :
        activeTab === "returned" ? status === "Returned" : true;

      const matchesBatch = !selectedBatch || act.batch === selectedBatch;
      const matchesDept = !selectedDept || normalizeDept(act.department) === normalizeDept(selectedDept);
      const matchesProg = !selectedProg || act.programme === selectedProg;
      const matchesSection = !selectedSection || act.section === selectedSection;

      const matchesSearch = !searchQuery.trim() || 
        (act.studentName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.regNo || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.activityName || "").toLowerCase().includes(searchQuery.toLowerCase());

      return matchesTab && matchesBatch && matchesDept && matchesProg && matchesSection && matchesSearch;
    });
  }, [activities, activeTab, selectedBatch, selectedDept, selectedProg, selectedSection, searchQuery, canViewClaim]);

  // Aggregate points per student for the compliance spreadsheet tab
  const studentComplianceData = useMemo(() => {
    const studentsMap = {};

    // Group activities by student
    activities.forEach((act) => {
      if (!canViewClaim(act.department)) return;
      // Filter by selection
      if (selectedBatch && act.batch !== selectedBatch) return;
      if (selectedDept && normalizeDept(act.department) !== normalizeDept(selectedDept)) return;
      if (selectedProg && act.programme !== selectedProg) return;
      if (selectedSection && act.section !== selectedSection) return;

      const reg = act.regNo;
      if (!reg) return;

      if (!studentsMap[reg]) {
        studentsMap[reg] = {
          regNo: reg,
          name: act.studentName || studentsIndex[reg]?.name || "Unknown",
          batch: act.batch,
          department: act.department,
          programme: act.programme,
          section: act.section || "Sec-A",
          semCategories: {
            2: {}, 3: {}, 4: {}, 5: {}, 6: {}
          },
          totalEarned: 0
        };
      }

      if (act.status === "Approved") {
        const sem = act.semester || 2;
        const pts = Number(act.totalPoints || 0);
        const cat = act.category || "technical";
        
        if (studentsMap[reg].semCategories[sem]) {
          studentsMap[reg].semCategories[sem][cat] = (studentsMap[reg].semCategories[sem][cat] || 0) + pts;
        }
      }
    });

    const result = Object.values(studentsMap);
    result.forEach((st) => {
      // For each semester, compute capped points per category, then sum them up, then apply semester cap
      const getSemCappedPoints = (sem) => {
        let semTotal = 0;
        const cats = st.semCategories[sem] || {};
        Object.keys(activeCategories).forEach(cat => {
          const earned = cats[cat] || 0;
          const cap = activeCategories[cat]?.maxSemesterPoints || 0;
          semTotal += Math.min(earned, cap);
        });
        return Math.min(semTotal, activeMilestones.semesterCap);
      };

      st.sem2Capped = getSemCappedPoints(2);
      st.sem3Capped = getSemCappedPoints(3);
      st.sem4Capped = getSemCappedPoints(4);
      st.sem5Capped = getSemCappedPoints(5);
      st.sem6Capped = getSemCappedPoints(6);

      st.totalEarned = st.sem2Capped + st.sem3Capped + st.sem4Capped + st.sem5Capped + st.sem6Capped;
      
      const isLateral = st.regNo.startsWith("L") || st.regNo.includes("/L");
      st.target = isLateral ? activeMilestones.lateralRequired : activeMilestones.regularRequired;
      st.isCompliant = st.totalEarned >= st.target;
    });

    // Sort by name
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [activities, selectedBatch, selectedDept, selectedProg, selectedSection, studentsIndex, activeCategories, activeMilestones, canViewClaim]);

  const handleApprove = async () => {
    if (!reviewActivity) return;
    setIsActioning(true);
    try {
      const docRef = doc(db, "step_activities", reviewActivity.id);
      await setDoc(docRef, {
        status: "Approved",
        comments: "Approved by Advisor",
        reviewedBy: auth.currentUser?.uid || "",
        reviewedByName: currentUserData?.displayName || currentUserData?.studentName || "Faculty Advisor",
        updatedAt: new Date().toISOString()
      }, { merge: true });

      alert("Activity claim successfully approved!");
      setReviewActivity(null);
    } catch (err) {
      console.error("Error approving:", err);
      alert("Failed to approve. Please try again.");
    } finally {
      setIsActioning(false);
    }
  };

  const handleReturn = async () => {
    if (!reviewActivity) return;
    if (!returnComment.trim()) {
      alert("Please provide feedback comments explaining what correction the student needs to make.");
      return;
    }
    setIsActioning(true);
    try {
      const docRef = doc(db, "step_activities", reviewActivity.id);
      await setDoc(docRef, {
        status: "Returned",
        comments: returnComment,
        reviewedBy: auth.currentUser?.uid || "",
        reviewedByName: currentUserData?.displayName || currentUserData?.studentName || "Faculty Advisor",
        updatedAt: new Date().toISOString()
      }, { merge: true });

      alert("Claim returned to student for corrections.");
      setReviewActivity(null);
      setReturnComment("");
      setShowReturnInput(false);
    } catch (err) {
      console.error("Error returning:", err);
      alert("Failed to return claim.");
    } finally {
      setIsActioning(false);
    }
  };

  const handleDeferralAction = async (actionType) => {
    if (!reviewDeferral) return;
    if (!deferralActionComments.trim() && actionType !== "Approve") {
      alert("Please provide comments/feedback for this action.");
      return;
    }

    setIsDeferralActioning(true);
    try {
      const docRef = doc(db, "step_deferrals", reviewDeferral.id);
      let nextStatus = reviewDeferral.status;
      const updates = {
        updatedAt: new Date().toISOString()
      };

      const reviewerName = currentUserData?.displayName || currentUserData?.studentName || "Faculty Evaluator";

      if (currentUserData?.role === "Faculty") {
        if (actionType === "Recommend") {
          nextStatus = "Pending HOD Review";
          updates.advisorComments = deferralActionComments || "Recommended by Advisor";
          updates.advisorName = reviewerName;
        } else if (actionType === "Return") {
          nextStatus = "Returned by Advisor";
          updates.advisorComments = deferralActionComments;
          updates.advisorName = reviewerName;
        }
      } else if (currentUserData?.role === "HOD") {
        if (actionType === "Recommend") {
          nextStatus = "Pending Principal Review";
          updates.hodComments = deferralActionComments || "Recommended by HOD";
          updates.hodName = reviewerName;
        } else if (actionType === "Return") {
          nextStatus = "Returned by HOD";
          updates.hodComments = deferralActionComments;
          updates.hodName = reviewerName;
        }
      } else if (currentUserData?.role === "Principal") {
        if (actionType === "Approve") {
          nextStatus = "Approved";
          updates.principalComments = deferralActionComments || "Approved by Principal";
          updates.principalName = reviewerName;
        } else if (actionType === "Reject") {
          nextStatus = "Rejected";
          updates.principalComments = deferralActionComments;
          updates.principalName = reviewerName;
        }
      } else if (currentUserData?.role === "Admin") {
        if (actionType === "Approve") {
          nextStatus = "Approved";
          updates.principalComments = deferralActionComments || "Approved by Admin";
        } else if (actionType === "Reject") {
          nextStatus = "Rejected";
          updates.principalComments = deferralActionComments;
        }
      }

      updates.status = nextStatus;
      await setDoc(docRef, updates, { merge: true });

      alert(`Deferral petition status updated to: ${nextStatus}`);
      setReviewDeferral(null);
      setDeferralActionComments("");
    } catch (err) {
      console.error("Error actioning deferral:", err);
      alert("Failed to update petition. Please try again.");
    } finally {
      setIsDeferralActioning(false);
    }
  };

  const handleExportCSV = () => {
    if (studentComplianceData.length === 0) {
      alert("No data to export.");
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Register No,Student Name,Batch,Department,Section,Sem II,Sem III,Sem IV,Sem V,Sem VI,Total Points,Target,Compliance Status\n";

    studentComplianceData.forEach((st) => {
      const status = st.isCompliant ? "COMPLIANT" : "PENDING";
      csvContent += `"${st.regNo}","${st.name}","${st.batch}","${st.department}","${st.section}","${st.sem2Capped}","${st.sem3Capped}","${st.sem4Capped}","${st.sem5Capped}","${st.sem6Capped}","${st.totalEarned}","${st.target}","${status}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `STEP_Compliance_Report_${selectedBatch || "all"}_${selectedDept || "all"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <Layout title="STEP Management">
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="animate-spin text-[#120c7a]" size={40} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="STEP Activity Points">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* Top Summary Stats Banner */}
        <div className="bg-gradient-to-r from-[#120c7a] to-[#0e0a5c] rounded-3xl p-6 md:p-8 text-white mb-8 shadow-xl flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
              <Award size={32} className="text-yellow-400 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">ERP Administration</span>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-0.5">STEP Activity Dashboard</h1>
              <p className="text-blue-100 text-xs mt-1">Review student claims, track semester milestones, and monitor program compliance.</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
              <span className="text-xs text-blue-200 block uppercase font-bold tracking-wider">Pending Review</span>
              <span className="text-3xl font-black text-yellow-300">
                {activities.filter(a => a.status === "Pending" && canViewClaim(a.department)).length}
              </span>
            </div>
            <div className="text-center bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
              <span className="text-xs text-blue-200 block uppercase font-bold tracking-wider">Compliance Rate</span>
              <span className="text-3xl font-black text-emerald-400">
                {studentComplianceData.length > 0 
                  ? `${Math.round((studentComplianceData.filter(s => s.isCompliant).length / studentComplianceData.length) * 100)}%`
                  : "0%"
                }
              </span>
            </div>
          </div>
        </div>

        {/* Filters Controls Panel */}
        <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={18} className="text-[#120c7a]" />
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider">Search & Filter Selection</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Batch Filter */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Batch</label>
              <select
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
              >
                <option value="">All Batches</option>
                {batchOptions.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Department Filter */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Department</label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                disabled={currentUserData?.role === "Faculty" && currentUserData?.department}
              >
                <option value="">All Departments</option>
                {deptOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Section Filter */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Section</label>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
              >
                <option value="">All Sections</option>
                {sectionOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Search Students / Activities</label>
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search by student name, register number or event title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-4 py-2.5 text-xs font-semibold placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Tabs Menu */}
        <div className="flex border-b border-zinc-200 mb-6 gap-2 flex-wrap">
          {[
            { id: "pending", label: "Pending Approvals", count: activities.filter(a => a.status === "Pending" && canViewClaim(a.department)).length },
            { id: "approved", label: "Approved Claims", count: null },
            { id: "returned", label: "Returned Logs", count: null },
            { id: "compliance", label: "Compliance Sheet", count: null },
            { id: "deferrals", label: "Exam Deferrals", count: pendingDeferralsCount }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-4 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === tab.id 
                  ? "border-[#120c7a] text-[#120c7a]" 
                  : "border-transparent text-zinc-400 hover:text-zinc-600 hover:border-zinc-300"
              }`}
            >
              {tab.label}
              {tab.count !== null && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === tab.id ? "bg-[#120c7a] text-white" : "bg-zinc-100 text-zinc-500"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content Panels */}
        {activeTab === "deferrals" ? (
          /* Deferrals Tab Panel */
          <div className="bg-white rounded-3xl border border-zinc-100 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-zinc-100">
              <h3 className="text-base font-extrabold text-zinc-800 font-sans tracking-tight">Written Exam Deferrals Petitions</h3>
              <p className="text-xs text-zinc-400 font-medium mt-0.5">Track, review, endorse, and approve exam eligibility deferral requests for non-compliant candidates.</p>
            </div>

            {filteredDeferralRequests.length === 0 ? (
              <div className="p-12 text-center text-zinc-400">
                <Users size={36} className="mx-auto text-zinc-300 mb-3 animate-pulse" />
                <p className="text-sm font-semibold text-zinc-600">No deferral requests found matching filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-600">
                  <thead className="bg-zinc-50/70 text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-4">Student Info</th>
                      <th className="p-4">Target Semester</th>
                      <th className="p-4">Earned Points</th>
                      <th className="p-4">Current Status</th>
                      <th className="p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-medium">
                    {filteredDeferralRequests.map((def) => (
                      <tr key={def.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-zinc-800">{def.studentName}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-bold mt-0.5 uppercase">
                            <span>{def.regNo || def.admissionNo}</span>
                            <span>•</span>
                            <span>{formatDepartmentDisplay(def.department, def.programme)} • {def.section || "Sec-A"}</span>
                          </div>
                        </td>
                        <td className="p-4 font-bold text-zinc-700">Semester {def.deferralSemester}</td>
                        <td className="p-4 font-extrabold text-[#120c7a]">{def.earnedPoints || 0} Points</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                            def.status === "Approved" ? "bg-emerald-100 text-emerald-800" :
                            def.status === "Rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                          }`}>
                            {def.status}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => {
                              setReviewDeferral(def);
                              setDeferralActionComments("");
                            }}
                            className="px-3 py-1.5 bg-[#120c7a]/5 hover:bg-[#120c7a]/15 text-[#120c7a] rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye size={12} />
                            Process Petition
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === "compliance" ? (
          /* Compliance Sheet Tab */
          <div className="bg-white rounded-3xl border border-zinc-100 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-base font-extrabold text-zinc-800">Student STEP Milestone Compliance Log</h3>
                <p className="text-xs text-zinc-400 font-medium">Summary of semesters II-VI points credited per student.</p>
              </div>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-bold text-zinc-700 flex items-center gap-2"
              >
                <Download size={14} /> Export Compliance Sheet
              </button>
            </div>

            {studentComplianceData.length === 0 ? (
              <div className="p-12 text-center text-zinc-400">
                <Users size={36} className="mx-auto text-zinc-300 mb-3" />
                <p className="text-sm font-semibold text-zinc-600">No student claims found matching current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-600">
                  <thead className="bg-zinc-50/70 text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-4">Register No</th>
                      <th className="p-4">Student Name</th>
                      <th className="p-4 text-center">Sem II</th>
                      <th className="p-4 text-center">Sem III</th>
                      <th className="p-4 text-center">Sem IV</th>
                      <th className="p-4 text-center">Sem V</th>
                      <th className="p-4 text-center">Sem VI</th>
                      <th className="p-4 text-center">Total Points</th>
                      <th className="p-4 text-center">Target</th>
                      <th className="p-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-medium">
                    {studentComplianceData.map((st) => (
                      <tr key={st.regNo} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="p-4 font-bold text-zinc-800">{st.regNo}</td>
                        <td className="p-4">
                          <p className="font-bold text-zinc-800">{st.name}</p>
                          <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">{formatDepartmentDisplay(st.department, st.programme)} • {st.section}</p>
                        </td>
                        <td className="p-4 text-center font-semibold text-zinc-700">{st.sem2Capped}</td>
                        <td className="p-4 text-center font-semibold text-zinc-700">{st.sem3Capped}</td>
                        <td className="p-4 text-center font-semibold text-zinc-700">{st.sem4Capped}</td>
                        <td className="p-4 text-center font-semibold text-zinc-700">{st.sem5Capped}</td>
                        <td className="p-4 text-center font-semibold text-zinc-700">{st.sem6Capped}</td>
                        <td className="p-4 text-center font-extrabold text-[#120c7a]">{st.totalEarned} Pts</td>
                        <td className="p-4 text-center font-semibold text-zinc-400">/{st.target}</td>
                        <td className="p-4 text-center">
                          {st.isCompliant ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 uppercase">
                              <Check size={10} strokeWidth={3} /> Compliant
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 uppercase">
                              Incomplete
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Active approvals/history lists tab */
          <div className="bg-white rounded-3xl border border-zinc-100 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-zinc-100">
              <h3 className="text-base font-extrabold text-zinc-800">
                STEP Activity Log ({activeTab.toUpperCase()})
              </h3>
              <p className="text-xs text-zinc-400 font-medium">Verify submissions and cross-check evidence logs.</p>
            </div>

            {filteredActivities.length === 0 ? (
              <div className="p-12 text-center text-zinc-400">
                <Clock size={36} className="mx-auto text-zinc-300 mb-3" />
                <p className="text-sm font-semibold text-zinc-600">No activity logs found for current category/filter selection.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-600">
                  <thead className="bg-zinc-50/70 text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-4">Student Info</th>
                      <th className="p-4">Semester</th>
                      <th className="p-4">Activity Name</th>
                      <th className="p-4 text-center">Claim Points</th>
                      <th className="p-4 text-center">Review Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-medium">
                    {filteredActivities.map((act) => {
                      const catConfig = activeCategories[act.category];
                      return (
                        <tr key={act.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="p-4">
                            <p className="font-bold text-zinc-800">{act.studentName}</p>
                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-bold mt-0.5 uppercase">
                              <span>{act.regNo}</span>
                              <span>•</span>
                              <span>{formatDepartmentDisplay(act.department, act.programme)} • {act.section || "Sec-A"}</span>
                            </div>
                          </td>
                          <td className="p-4 font-bold text-zinc-700">Sem {act.semester}</td>
                          <td className="p-4 max-w-xs md:max-w-sm">
                            <p className="font-bold text-zinc-800 truncate">{act.activityName}</p>
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold mt-1 uppercase ${catConfig?.bgLight} ${catConfig?.textDark}`}>
                              {catConfig?.label || act.category}
                            </span>
                          </td>
                          <td className="p-4 text-center font-extrabold text-[#120c7a]">
                            +{act.totalPoints}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => {
                                setReviewActivity(act);
                                setReturnComment("");
                                setShowReturnInput(false);
                              }}
                              className="px-3 py-1.5 bg-[#120c7a]/5 hover:bg-[#120c7a]/15 text-[#120c7a] rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={12} />
                              {activeTab === "pending" ? "Review Claim" : "View Info"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Review Modal */}
      {reviewActivity && (
        <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200 text-zinc-800">
            <div className="bg-[#120c7a] p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Award className="text-yellow-400" size={24} />
                <div>
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-blue-200">
                    STEP Activity Verification Board
                  </h4>
                  <p className="text-base font-bold truncate mt-0.5">
                    {reviewActivity.studentName} ({reviewActivity.regNo})
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setReviewActivity(null)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Event details block */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Semester Credited</span>
                  <span className="text-sm font-extrabold text-zinc-800">Semester {reviewActivity.semester}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Points Applied</span>
                  <span className="text-sm font-extrabold text-[#120c7a]">{reviewActivity.totalPoints} Points</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Specific Activity Topic/Title</span>
                  <span className="text-sm font-extrabold text-zinc-800 leading-relaxed block mt-0.5">{reviewActivity.activityName}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Category / Rubric Type</span>
                  <span className="text-xs font-semibold text-zinc-700 leading-relaxed block mt-1">
                    {activeCategories[reviewActivity.category]?.label || reviewActivity.category} • {reviewActivity.activityType}
                  </span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Conducted Date</span>
                  <span className="text-sm font-bold text-zinc-700">{reviewActivity.date}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Duration (Hours)</span>
                  <span className="text-sm font-bold text-zinc-700">{reviewActivity.durationHours || "Not specified"} Hrs</span>
                </div>
              </div>

              {/* Special Bonus Information */}
              {reviewActivity.bonusCondition && reviewActivity.bonusCondition !== "none" && (
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl text-xs font-semibold text-indigo-800">
                  <span className="font-bold text-indigo-950 uppercase tracking-wider block mb-1">Applied Special Bonus weightage:</span>
                  {reviewActivity.bonusCondition === "iit" && "Event conducted by IIT / NIT / Top-50 NIRF institution (+10 points)"}
                  {reviewActivity.bonusCondition === "ieee" && "Event conducted by IEEE, ISTE, ASME, ACM or similar (+10 points)"}
                  {reviewActivity.bonusCondition === "national" && "National-level representation / championship (+15 points)"}
                  {reviewActivity.bonusCondition === "international" && "International-level participation (+20 points)"}
                </div>
              )}

              {/* Evidence Review Image */}
              {reviewActivity.evidenceUrl && (
                <div>
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Uploaded Certificate Evidence</span>
                  <div className="border border-zinc-200 bg-zinc-50 rounded-2xl p-2 flex items-center justify-center min-h-60 overflow-hidden shadow-inner">
                    <img 
                      src={reviewActivity.evidenceUrl} 
                      alt="Certificate Evidence" 
                      className="max-w-full max-h-96 object-contain rounded-xl shadow-md" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              )}

              {/* Return for correction notes block */}
              {showReturnInput && (
                <div className="space-y-2 p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                  <label className="block text-xs font-extrabold text-rose-800 uppercase tracking-wider">Provide Correction Feedback comments:</label>
                  <textarea
                    rows={3}
                    placeholder="Provide detailed feedback e.g., Certificate is not legible, Please re-upload with HOD signature, Wrong category selected..."
                    value={returnComment}
                    onChange={(e) => setReturnComment(e.target.value)}
                    className="w-full rounded-xl border border-rose-200 p-3 text-xs font-medium placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowReturnInput(false)}
                      className="px-3 py-1.5 bg-zinc-200 text-zinc-700 text-[10px] font-bold rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleReturn}
                      disabled={isActioning}
                      className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg flex items-center gap-1"
                    >
                      {isActioning ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
                      Confirm Return Log
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between gap-4">
              <div>
                {reviewActivity.status !== "Pending" && (
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    reviewActivity.status === "Approved" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}>
                    Review Complete • {reviewActivity.status}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setReviewActivity(null)}
                  className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-xs font-extrabold rounded-xl transition-all cursor-pointer"
                >
                  Close
                </button>

                {reviewActivity.status === "Pending" && !showReturnInput && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowReturnInput(true)}
                      className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <X size={14} /> Return Claim
                    </button>
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={isActioning}
                      className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-extrabold rounded-xl shadow-md hover:from-emerald-600 hover:to-teal-700 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      {isActioning ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                      Approve & Grant Points
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Deferral Modal */}
      {reviewDeferral && (
        <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200 text-zinc-800 text-left">
            <div className="bg-[#120c7a] p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="text-yellow-400" size={24} />
                <div>
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-blue-200">
                    STEP Exam Deferral Board
                  </h4>
                  <p className="text-base font-bold truncate mt-0.5">
                    {reviewDeferral.studentName} ({reviewDeferral.regNo || reviewDeferral.admissionNo})
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setReviewDeferral(null)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl">
                <h5 className="font-extrabold text-amber-900 text-sm">Exam Blockage & Deferral Rule Handbook</h5>
                <p className="text-xs text-amber-800 font-medium mt-1 leading-relaxed">
                  According to the Coimbatore Institute of Technology STEP guidelines, students lacking the minimum required activity points (100 for regular, 80 for lateral) in semesters II-VI are strictly blocked from registering for Semester examinations. Non-compliant students must submit a formal written deferral petition to be reviewed sequentially by their Faculty Advisor, HOD, and Principal.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-left">
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Target Semester</span>
                  <span className="text-sm font-extrabold text-zinc-800">Semester {reviewDeferral.deferralSemester}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Currently Earned</span>
                  <span className="text-sm font-extrabold text-[#120c7a]">{reviewDeferral.earnedPoints || 0} Points</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Reason for Deferral Petition</span>
                  <span className="text-sm font-extrabold text-zinc-800 leading-relaxed block mt-1">
                    {reviewDeferral.reason}
                  </span>
                </div>
              </div>

              {/* Sequential Sign-off Timeline status */}
              <div className="border border-zinc-100 rounded-2xl p-4 space-y-4 bg-zinc-50/50 text-left">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Sequential Sign-Off Timeline</span>
                
                <div className="space-y-3">
                  {/* Advisor */}
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      reviewDeferral.advisorName ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-500"
                    }`}>
                      {reviewDeferral.advisorName ? "✓" : "1"}
                    </div>
                    <div>
                      <h6 className="text-xs font-bold text-zinc-800">Faculty Advisor Endorsement</h6>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {reviewDeferral.advisorName ? `Endorsed by ${reviewDeferral.advisorName}` : "Pending Review"}
                      </p>
                      {reviewDeferral.advisorComments && (
                        <p className="text-xs italic bg-white border border-zinc-100 rounded-lg p-2 text-zinc-600 mt-1">
                          &ldquo;{reviewDeferral.advisorComments}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>

                  {/* HOD */}
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      reviewDeferral.hodName ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-500"
                    }`}>
                      {reviewDeferral.hodName ? "✓" : "2"}
                    </div>
                    <div>
                      <h6 className="text-xs font-bold text-zinc-800">HOD Approval & Forwarding</h6>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {reviewDeferral.hodName ? `Endorsed by ${reviewDeferral.hodName}` : "Pending Review"}
                      </p>
                      {reviewDeferral.hodComments && (
                        <p className="text-xs italic bg-white border border-zinc-100 rounded-lg p-2 text-zinc-600 mt-1">
                          &ldquo;{reviewDeferral.hodComments}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Principal */}
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      reviewDeferral.status === "Approved" ? "bg-emerald-500 text-white" :
                      reviewDeferral.status === "Rejected" ? "bg-rose-500 text-white" : "bg-zinc-200 text-zinc-500"
                    }`}>
                      {reviewDeferral.status === "Approved" ? "✓" : reviewDeferral.status === "Rejected" ? "✗" : "3"}
                    </div>
                    <div>
                      <h6 className="text-xs font-bold text-zinc-800">Principal Final Clearance</h6>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {reviewDeferral.status === "Approved" ? "Approved" : reviewDeferral.status === "Rejected" ? "Rejected" : "Pending Review"}
                      </p>
                      {reviewDeferral.principalComments && (
                        <p className="text-xs italic bg-white border border-zinc-100 rounded-lg p-2 text-zinc-600 mt-1">
                          &ldquo;{reviewDeferral.principalComments}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action input text area */}
              {reviewDeferral.status.startsWith("Pending") && (
                <div className="space-y-2 text-left">
                  <label className="block text-xs font-extrabold text-[#120c7a] uppercase tracking-wider">
                    Add Comments / Recommendation:
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide your official assessment comments, feedback or endorsement logic..."
                    value={deferralActionComments}
                    onChange={(e) => setDeferralActionComments(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 p-3 text-xs font-medium placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#120c7a]"
                  />
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewDeferral(null)}
                className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-xs font-extrabold rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>

              {reviewDeferral.status === "Pending Advisor Review" && currentUserData?.role === "Faculty" && (
                <>
                  <button
                    type="button"
                    onClick={() => handleDeferralAction("Return")}
                    disabled={isDeferralActioning}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-extrabold rounded-xl transition-all cursor-pointer"
                  >
                    Return to Student
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeferralAction("Recommend")}
                    disabled={isDeferralActioning}
                    className="px-5 py-2 bg-[#120c7a] hover:bg-[#120c7a]/90 text-white text-xs font-extrabold rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Endorse & Forward to HOD
                  </button>
                </>
              )}

              {reviewDeferral.status === "Pending HOD Review" && currentUserData?.role === "HOD" && (
                <>
                  <button
                    type="button"
                    onClick={() => handleDeferralAction("Return")}
                    disabled={isDeferralActioning}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-extrabold rounded-xl transition-all cursor-pointer"
                  >
                    Return with Comments
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeferralAction("Recommend")}
                    disabled={isDeferralActioning}
                    className="px-5 py-2 bg-[#120c7a] hover:bg-[#120c7a]/90 text-white text-xs font-extrabold rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Endorse & Forward to Principal
                  </button>
                </>
              )}

              {reviewDeferral.status === "Pending Principal Review" && currentUserData?.role === "Principal" && (
                <>
                  <button
                    type="button"
                    onClick={() => handleDeferralAction("Reject")}
                    disabled={isDeferralActioning}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-extrabold rounded-xl transition-all cursor-pointer"
                  >
                    Reject Deferral
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeferralAction("Approve")}
                    disabled={isDeferralActioning}
                    className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-extrabold rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Approve Deferral
                  </button>
                </>
              )}

              {/* Admin full access override */}
              {currentUserData?.role === "Admin" && reviewDeferral.status.startsWith("Pending") && (
                <>
                  <button
                    type="button"
                    onClick={() => handleDeferralAction("Reject")}
                    disabled={isDeferralActioning}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-extrabold rounded-xl transition-all cursor-pointer"
                  >
                    Reject Petition
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeferralAction("Approve")}
                    disabled={isDeferralActioning}
                    className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-extrabold rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Approve Petition
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
