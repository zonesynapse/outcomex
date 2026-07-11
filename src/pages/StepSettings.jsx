import { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { 
  Award, Settings, Plus, Trash2, Save, BookOpen, ListTodo, Target, Check, Info, ShieldAlert
} from "lucide-react";
import Layout from "../components/Layout";
import { STEP_CATEGORIES } from "./student/StepPoints";

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

export default function StepSettings() {
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const [subTab, setSubTab] = useState("categories"); // "categories", "checklist", "guidelines", "milestones"
  
  // States for Category editing
  const [selectedCatKey, setSelectedCatKey] = useState(Object.keys(STEP_CATEGORIES)[0] || "");
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [newCatId, setNewCatId] = useState("");
  
  // Category Form Inputs
  const [catLabel, setCatLabel] = useState("");
  const [catMaxPoints, setCatMaxPoints] = useState(10);
  const [catColor, setCatColor] = useState("from-blue-500 to-indigo-600");
  const [catBgLight, setCatBgLight] = useState("bg-blue-50");
  const [catTextDark, setCatTextDark] = useState("text-blue-700");
  
  // Activity / Rubric Form Inputs
  const [editingActivity, setEditingActivity] = useState(null);
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [actId, setActId] = useState("");
  const [actLabel, setActLabel] = useState("");
  const [actBasePoints, setActBasePoints] = useState(2);
  const [actCriteria, setActCriteria] = useState("");
  const [actEvidence, setActEvidence] = useState("");
  
  // Checklist & Guidelines edit state
  const [checklistInput, setChecklistInput] = useState("");
  const [guidelinesInput, setGuidelinesInput] = useState("");
  
  // Milestones input states
  const [regularRequired, setRegularRequired] = useState(100);
  const [lateralRequired, setLateralRequired] = useState(80);
  const [semesterCap, setSemesterCap] = useState(20);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            setCurrentUserData(snap.data());
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
        if (data.milestones) {
          setActiveMilestones(data.milestones);
          setRegularRequired(data.milestones.regularRequired || 100);
          setLateralRequired(data.milestones.lateralRequired || 80);
          setSemesterCap(data.milestones.semesterCap || 20);
        }
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

  // Load category properties when selection changes
  useEffect(() => {
    if (activeCategories[selectedCatKey]) {
      const cat = activeCategories[selectedCatKey];
      setCatLabel(cat.label || "");
      setCatMaxPoints(cat.maxSemesterPoints || 10);
      setCatColor(cat.color || "from-blue-500 to-indigo-600");
      setCatBgLight(cat.bgLight || "bg-blue-50");
      setCatTextDark(cat.textDark || "text-blue-700");
    }
  }, [selectedCatKey, activeCategories]);

  const handleUpdateCategoryMeta = async () => {
    if (!catLabel.trim()) {
      alert("Please enter a category title.");
      return;
    }
    const updatedCategories = { ...activeCategories };
    
    if (isAddingCat) {
      if (!newCatId.trim()) {
        alert("Please specify a unique Category ID.");
        return;
      }
      const cleanId = newCatId.trim().toLowerCase().replace(/\s+/g, "_");
      if (updatedCategories[cleanId]) {
        alert("A category with this ID already exists.");
        return;
      }
      updatedCategories[cleanId] = {
        label: catLabel,
        maxSemesterPoints: Number(catMaxPoints),
        color: catColor,
        bgLight: catBgLight,
        textDark: catTextDark,
        activities: []
      };
      setSelectedCatKey(cleanId);
      setIsAddingCat(false);
      setNewCatId("");
    } else {
      updatedCategories[selectedCatKey] = {
        ...updatedCategories[selectedCatKey],
        label: catLabel,
        maxSemesterPoints: Number(catMaxPoints),
        color: catColor,
        bgLight: catBgLight,
        textDark: catTextDark
      };
    }

    try {
      await setDoc(doc(db, "step_config", "step_configuration"), { categories: updatedCategories }, { merge: true });
      alert("Category settings updated successfully!");
    } catch (err) {
      alert("Failed to update category.");
    }
  };

  const handleDeleteCategory = async (keyToDelete) => {
    if (!confirm(`Are you sure you want to delete category "${activeCategories[keyToDelete]?.label}"? All associated rubrics will be deleted.`)) return;
    const updatedCategories = { ...activeCategories };
    delete updatedCategories[keyToDelete];
    
    try {
      await setDoc(doc(db, "step_config", "step_configuration"), { categories: updatedCategories }, { merge: true });
      const remainingKeys = Object.keys(updatedCategories);
      setSelectedCatKey(remainingKeys[0] || "");
      alert("Category deleted.");
    } catch (err) {
      alert("Failed to delete category.");
    }
  };

  const handleSaveActivityRubric = async (e) => {
    e.preventDefault();
    if (!actLabel.trim()) {
      alert("Please provide the rubric label/description.");
      return;
    }

    const currentCat = activeCategories[selectedCatKey];
    if (!currentCat) return;

    let updatedActivities = [...(currentCat.activities || [])];

    if (isAddingActivity) {
      const generatedId = actId.trim() || `act_${Date.now()}`;
      if (updatedActivities.some(a => a.id === generatedId)) {
        alert("An activity with this ID already exists in this category.");
        return;
      }
      updatedActivities.push({
        id: generatedId,
        label: actLabel,
        basePoints: Number(actBasePoints),
        criteria: actCriteria,
        evidence: actEvidence
      });
    } else if (editingActivity) {
      updatedActivities = updatedActivities.map(a => a.id === editingActivity.id ? {
        ...a,
        label: actLabel,
        basePoints: Number(actBasePoints),
        criteria: actCriteria,
        evidence: actEvidence
      } : a);
    }

    const updatedCategories = {
      ...activeCategories,
      [selectedCatKey]: {
        ...currentCat,
        activities: updatedActivities
      }
    };

    try {
      await setDoc(doc(db, "step_config", "step_configuration"), { categories: updatedCategories }, { merge: true });
      setIsAddingActivity(false);
      setEditingActivity(null);
      setActId("");
      setActLabel("");
      setActBasePoints(2);
      setActCriteria("");
      setActEvidence("");
      alert("Activity Rubric saved!");
    } catch (err) {
      alert("Failed to save activity rubric.");
    }
  };

  const handleDeleteActivity = async (activityIdToDelete) => {
    if (!confirm("Are you sure you want to delete this activity rubric?")) return;
    const currentCat = activeCategories[selectedCatKey];
    if (!currentCat) return;

    const updatedActivities = (currentCat.activities || []).filter(a => a.id !== activityIdToDelete);
    const updatedCategories = {
      ...activeCategories,
      [selectedCatKey]: {
        ...currentCat,
        activities: updatedActivities
      }
    };

    try {
      await setDoc(doc(db, "step_config", "step_configuration"), { categories: updatedCategories }, { merge: true });
      alert("Activity rubric deleted.");
    } catch (err) {
      alert("Failed to delete rubric.");
    }
  };

  const handleSaveChecklistItem = async () => {
    if (!checklistInput.trim()) return;
    const updated = [...activeChecklist, checklistInput.trim()];
    try {
      await setDoc(doc(db, "step_config", "step_configuration"), { checklist: updated }, { merge: true });
      setChecklistInput("");
    } catch (err) {
      alert("Failed to save checklist item.");
    }
  };

  const handleDeleteChecklistItem = async (index) => {
    const updated = activeChecklist.filter((_, i) => i !== index);
    try {
      await setDoc(doc(db, "step_config", "step_configuration"), { checklist: updated }, { merge: true });
    } catch (err) {
      alert("Failed to delete checklist item.");
    }
  };

  const handleSaveGuidelineItem = async () => {
    if (!guidelinesInput.trim()) return;
    const updated = [...activeGuidelines, guidelinesInput.trim()];
    try {
      await setDoc(doc(db, "step_config", "step_configuration"), { guidelines: updated }, { merge: true });
      setGuidelinesInput("");
    } catch (err) {
      alert("Failed to save guideline.");
    }
  };

  const handleDeleteGuidelineItem = async (index) => {
    const updated = activeGuidelines.filter((_, i) => i !== index);
    try {
      await setDoc(doc(db, "step_config", "step_configuration"), { guidelines: updated }, { merge: true });
    } catch (err) {
      alert("Failed to delete guideline.");
    }
  };

  const handleSaveMilestones = async () => {
    try {
      await setDoc(doc(db, "step_config", "step_configuration"), {
        milestones: {
          regularRequired: Number(regularRequired),
          lateralRequired: Number(lateralRequired),
          semesterCap: Number(semesterCap)
        }
      }, { merge: true });
      alert("Target Milestones updated successfully!");
    } catch (err) {
      alert("Failed to save milestones.");
    }
  };

  const isAuthorized = currentUserData?.role === "Admin" || currentUserData?.role === "Principal";

  if (loading) {
    return (
      <Layout title="STEP Configuration & Rubrics">
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-zinc-200 border-t-[#120c7a] animate-spin" />
          <p className="text-sm font-semibold text-zinc-500">Loading Configuration Panel...</p>
        </div>
      </Layout>
    );
  }

  if (!isAuthorized) {
    return (
      <Layout title="STEP Configuration & Rubrics">
        <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-zinc-100 p-8 shadow-sm text-center">
          <ShieldAlert className="text-amber-500 mx-auto mb-4" size={48} />
          <h2 className="text-lg font-black text-zinc-800">Access Denied</h2>
          <p className="text-xs text-zinc-400 font-medium mt-1">
            You do not have administrative privileges to modify the official STEP Handbook or configuration limits.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="STEP Configuration & Rubrics">
      <div className="max-w-7xl mx-auto px-4 py-8 text-left">


        <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6 md:p-8 animate-in fade-in-50 duration-200">
          {/* Sub-Tabs Switcher */}
          <div className="flex border-b border-zinc-100 mb-6 overflow-x-auto gap-2">
            {[
              { id: "categories", label: "Categories & Rubrics", icon: Award },
              { id: "checklist", label: "File Checklist", icon: ListTodo },
              { id: "guidelines", label: "Program Guidelines", icon: BookOpen },
              { id: "milestones", label: "Milestones & Targets", icon: Target }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSubTab(tab.id)}
                  className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                    subTab === tab.id 
                      ? "border-[#120c7a] text-[#120c7a]" 
                      : "border-transparent text-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Categories & Rubrics Editor */}
          {subTab === "categories" && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Categories Sidebar */}
              <div className="lg:col-span-1 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">Categories</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCat(true);
                      setCatLabel("");
                      setCatMaxPoints(10);
                      setNewCatId("");
                    }}
                    className="text-[10px] text-[#120c7a] font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus size={10} /> Add New
                  </button>
                </div>

                {Object.entries(activeCategories).map(([key, cat]) => (
                  <div
                    key={key}
                    onClick={() => {
                      setSelectedCatKey(key);
                      setIsAddingCat(false);
                    }}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between gap-2 group ${
                      selectedCatKey === key && !isAddingCat
                        ? "bg-[#120c7a]/5 border-[#120c7a]"
                        : "border-zinc-100 hover:bg-zinc-50 bg-white"
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-zinc-700">{cat.label}</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">{cat.maxSemesterPoints} Pts Max</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCategory(key);
                      }}
                      className="text-rose-500 hover:text-rose-700 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-rose-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Categories Editor Details Pane */}
              <div className="lg:col-span-3 space-y-6">
                <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-100 text-left">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">
                    {isAddingCat ? "Create New Approved STEP Category" : `Edit "${activeCategories[selectedCatKey]?.label || "Category"}" Meta`}
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isAddingCat && (
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Category Unique ID (slug)</label>
                        <input
                          type="text"
                          placeholder="e.g., social_service, extra_curricular"
                          value={newCatId}
                          onChange={(e) => setNewCatId(e.target.value)}
                          className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#120c7a]"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Category Title / Label</label>
                      <input
                        type="text"
                        placeholder="e.g., Social Responsibility"
                        value={catLabel}
                        onChange={(e) => setCatLabel(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#120c7a]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Max Semester Points Cap</label>
                      <input
                        type="number"
                        value={catMaxPoints}
                        onChange={(e) => setCatMaxPoints(Number(e.target.value))}
                        className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#120c7a]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Visual Gradient Color Choice</label>
                      <select
                        value={catColor}
                        onChange={(e) => {
                          const mapping = {
                            "from-blue-500 to-indigo-600": { bg: "bg-blue-50", text: "text-blue-700" },
                            "from-emerald-500 to-teal-600": { bg: "bg-emerald-50", text: "text-emerald-700" },
                            "from-amber-500 to-orange-600": { bg: "bg-amber-50", text: "text-amber-700" },
                            "from-purple-500 to-violet-600": { bg: "bg-purple-50", text: "text-purple-700" },
                            "from-rose-500 to-pink-600": { bg: "bg-rose-50", text: "text-rose-700" },
                            "from-cyan-500 to-sky-600": { bg: "bg-cyan-50", text: "text-cyan-700" },
                            "from-fuchsia-500 to-pink-600": { bg: "bg-fuchsia-50", text: "text-fuchsia-700" }
                          };
                          setCatColor(e.target.value);
                          const selectedConfig = mapping[e.target.value] || { bg: "bg-blue-50", text: "text-blue-700" };
                          setCatBgLight(selectedConfig.bg);
                          setCatTextDark(selectedConfig.text);
                        }}
                        className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#120c7a]"
                      >
                        <option value="from-blue-500 to-indigo-600">Blue-Indigo (Technical Style)</option>
                        <option value="from-emerald-500 to-teal-600">Emerald-Teal (Research Style)</option>
                        <option value="from-amber-500 to-orange-600">Amber-Orange (Industry Style)</option>
                        <option value="from-purple-500 to-violet-600">Purple-Violet (IIY Style)</option>
                        <option value="from-rose-500 to-pink-600">Rose-Pink (Social Style)</option>
                        <option value="from-cyan-500 to-sky-600">Cyan-Sky (Leadership Style)</option>
                        <option value="from-fuchsia-500 to-pink-600">Fuchsia-Pink (Sports Style)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-100">
                    {isAddingCat && (
                      <button
                        type="button"
                        onClick={() => setIsAddingCat(false)}
                        className="px-3.5 py-1.5 bg-zinc-200 text-zinc-600 text-xs font-bold rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleUpdateCategoryMeta}
                      className="px-4 py-1.5 bg-[#120c7a] hover:bg-[#120c7a]/90 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save size={12} />
                      {isAddingCat ? "Create Category" : "Save Category Meta"}
                    </button>
                  </div>
                </div>

                {/* Rubrics Sub-Editor */}
                {!isAddingCat && activeCategories[selectedCatKey] && (
                  <div className="border border-zinc-100 rounded-2xl p-6 text-left">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-100">
                      <div>
                        <h5 className="text-xs font-extrabold text-zinc-700 uppercase tracking-wider">Approved Activities Rubrics List</h5>
                        <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">Define approved sub-activities, their base points, criteria, and evidence specs.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingActivity(true);
                          setEditingActivity(null);
                          setActId("");
                          setActLabel("");
                          setActBasePoints(2);
                          setActCriteria("");
                          setActEvidence("");
                        }}
                        className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-[#0d075a] text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={12} /> Add Activity Rubric
                      </button>
                    </div>

                    {/* Inline Rubric Form */}
                    {(isAddingActivity || editingActivity) && (
                      <form onSubmit={handleSaveActivityRubric} className="bg-zinc-50 border border-zinc-100 p-4 rounded-xl mb-6 space-y-4">
                        <h6 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                          {isAddingActivity ? "Add New Rubric Entry" : "Edit Rubric Entry"}
                        </h6>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {isAddingActivity && (
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Rubric ID (slug)</label>
                              <input
                                type="text"
                                placeholder="e.g. tech_workshop_attend"
                                value={actId}
                                onChange={(e) => setActId(e.target.value)}
                                className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-xs font-semibold focus:outline-none"
                              />
                            </div>
                          )}
                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Rubric Label / Description</label>
                            <input
                              type="text"
                              placeholder="e.g. Participating in workshops/seminars"
                              value={actLabel}
                              onChange={(e) => setActLabel(e.target.value)}
                              className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-xs font-semibold focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Base Points</label>
                            <input
                              type="number"
                              value={actBasePoints}
                              onChange={(e) => setActBasePoints(Number(e.target.value))}
                              className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-xs font-bold focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Required Criteria / Min Duration</label>
                            <input
                              type="text"
                              placeholder="e.g. Min 4 hours"
                              value={actCriteria}
                              onChange={(e) => setActCriteria(e.target.value)}
                              className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-xs font-semibold focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Mandatory Certificate Evidence</label>
                            <input
                              type="text"
                              placeholder="e.g. Certificate of Participation"
                              value={actEvidence}
                              onChange={(e) => setActEvidence(e.target.value)}
                              className="w-full rounded-lg border border-zinc-200 bg-white p-2 text-xs font-semibold focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingActivity(false);
                              setEditingActivity(null);
                            }}
                            className="px-3 py-1.5 bg-zinc-200 text-zinc-600 text-[10px] font-bold rounded-md cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-3.5 py-1.5 bg-[#120c7a] hover:bg-[#120c7a]/90 text-white text-[10px] font-bold rounded-md flex items-center gap-1 cursor-pointer"
                          >
                            <Check size={10} strokeWidth={3} /> Save Rubric
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Rubrics List Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border border-zinc-100 rounded-xl overflow-hidden">
                        <thead>
                          <tr className="bg-zinc-50 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                            <th className="p-3">ID</th>
                            <th className="p-3">Description</th>
                            <th className="p-3 text-center">Points</th>
                            <th className="p-3">Criteria / Evidence</th>
                            <th className="p-3 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 font-medium">
                          {(activeCategories[selectedCatKey]?.activities || []).map((a) => (
                            <tr key={a.id} className="hover:bg-zinc-50/50">
                              <td className="p-3 text-zinc-400 font-mono text-[10px]">{a.id}</td>
                              <td className="p-3 font-semibold text-zinc-700">{a.label}</td>
                              <td className="p-3 text-center font-bold text-[#120c7a]">+{a.basePoints}</td>
                              <td className="p-3 text-zinc-500">
                                <span className="block text-[10px]"><strong>Criteria:</strong> {a.criteria}</span>
                                <span className="block text-[10px] text-zinc-400"><strong>Evidence:</strong> {a.evidence}</span>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingActivity(a);
                                      setIsAddingActivity(false);
                                      setActId(a.id);
                                      setActLabel(a.label);
                                      setActBasePoints(a.basePoints);
                                      setActCriteria(a.criteria);
                                      setActEvidence(a.evidence);
                                    }}
                                    className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-md cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteActivity(a.id)}
                                    className="p-1 hover:bg-rose-50 text-rose-500 rounded-md cursor-pointer"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Checklist Configuration */}
          {subTab === "checklist" && (
            <div className="space-y-6 text-left max-w-3xl">
              <div>
                <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">Mandatory STEP File Attachments Checklist</h4>
                <p className="text-xs text-zinc-400 font-medium">These items are printed on the physical STEP File record summary sheet and verified during audit.</p>
              </div>

              <div className="space-y-3">
                {activeChecklist.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                    <span className="w-6 h-6 bg-zinc-200 text-zinc-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</span>
                    <span className="text-xs text-zinc-700 font-semibold grow">{item}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteChecklistItem(idx)}
                      className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-all cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100 mt-4 flex-wrap sm:flex-nowrap">
                <input
                  type="text"
                  placeholder="e.g. Original Internship completion letter signed by HR"
                  value={checklistInput}
                  onChange={(e) => setChecklistInput(e.target.value)}
                  className="grow rounded-xl border border-zinc-200 bg-white p-3 text-xs font-semibold focus:outline-none min-w-[200px]"
                />
                <button
                  type="button"
                  onClick={handleSaveChecklistItem}
                  className="px-4 py-3 bg-[#120c7a] hover:bg-[#120c7a]/95 text-white text-xs font-extrabold rounded-xl shrink-0 cursor-pointer w-full sm:w-auto"
                >
                  Add Checklist Item
                </button>
              </div>
            </div>
          )}

          {/* Program Guidelines Configuration */}
          {subTab === "guidelines" && (
            <div className="space-y-6 text-left max-w-3xl">
              <div>
                <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">Academic Program Guidelines & Non-Qualifying Rules</h4>
                <p className="text-xs text-zinc-400 font-medium">Define program exclusions, guidelines and duration rules shown on student portals.</p>
              </div>

              <div className="space-y-3">
                {activeGuidelines.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                    <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
                    <span className="text-xs text-zinc-700 font-semibold grow">{item}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteGuidelineItem(idx)}
                      className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-all cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100 mt-4 flex-wrap sm:flex-nowrap">
                <input
                  type="text"
                  placeholder="e.g. Any certification from online platforms must contain a unique verifiable QR code/credential identifier."
                  value={guidelinesInput}
                  onChange={(e) => setGuidelinesInput(e.target.value)}
                  className="grow rounded-xl border border-zinc-200 bg-white p-3 text-xs font-semibold focus:outline-none min-w-[200px]"
                />
                <button
                  type="button"
                  onClick={handleSaveGuidelineItem}
                  className="px-4 py-3 bg-[#120c7a] hover:bg-[#120c7a]/95 text-white text-xs font-extrabold rounded-xl shrink-0 cursor-pointer w-full sm:w-auto"
                >
                  Add Rule Guideline
                </button>
              </div>
            </div>
          )}

          {/* Milestones and Point Limits */}
          {subTab === "milestones" && (
            <div className="space-y-6 text-left max-w-lg bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
              <div>
                <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">Academic Point Milestones & Semester Targets</h4>
                <p className="text-[10px] text-zinc-400 font-bold uppercase">Configure passing point marks and ceilings.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Regular Entry Target (Points Required)</label>
                  <input
                    type="number"
                    value={regularRequired}
                    onChange={(e) => setRegularRequired(Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Lateral Entry Target (Points Required)</label>
                  <input
                    type="number"
                    value={lateralRequired}
                    onChange={(e) => setLateralRequired(Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Global Semester Capped Points Limit</label>
                  <input
                    type="number"
                    value={semesterCap}
                    onChange={(e) => setSemesterCap(Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={handleSaveMilestones}
                  className="px-5 py-2.5 bg-[#120c7a] hover:bg-[#120c7a]/90 text-white text-xs font-extrabold rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Save size={14} /> Update Point Milestones
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
