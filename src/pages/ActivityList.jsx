import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where, orderBy, doc, getDoc, setDoc, getDocs } from "firebase/firestore";
import { 
  Award, Clock, Eye, Download, Check, X, Search, Filter, Users, Loader2,
  Settings, Plus, Trash2, Save, BookOpen, ListTodo, Target, ChevronRight, Info,
  GraduationCap, Building2, User, FileText, Calendar, AlertTriangle, CheckCircle2, XCircle, 
  ArrowRight, BarChart3, Upload, Edit, MessageSquare, AlertCircle, Star, Globe, Layers
} from "lucide-react";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { ACTIVITY_REGISTRY, ACTIVITY_CATEGORIES } from "../data/activityRegistry";

const STATUS_OPTIONS = ["Pending", "Approved", "Returned", "Rejected", "Draft"];

const getCategoryFromCode = (code) => {
  if (code.startsWith("A")) return "student";
  if (code.startsWith("B")) return "department";
  if (code.startsWith("C")) return "faculty";
  return "student";
};

export default function ActivityList() {
  const [searchParams] = useSearchParams();
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [studentsIndex, setStudentsIndex] = useState({});
  const [facultyIndex, setFacultyIndex] = useState({});
  const tabParam = searchParams.get("tab");
  const initialTab = tabParam === "approvals" ? "student" : (tabParam || "student");
  const [activeTab, setActiveTab] = useState(initialTab); // student, faculty, department
  
  // Filters
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedProg, setSelectedProg] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedActivityCode, setSelectedActivityCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal states
  const [reviewActivity, setReviewActivity] = useState(null);
  const [returnComment, setReturnComment] = useState("");
  const [isActioning, setIsActioning] = useState(false);
  const [showReturnInput, setShowReturnInput] = useState(false);
  const [viewActivity, setViewActivity] = useState(null);

  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getActiveBatches } = useBatches(durations);
  const activeBatchesList = useMemo(() => getActiveBatches(), [getActiveBatches]);

  // Load user profile
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            const data = snap.data();
            setCurrentUserData(data);
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

  // Set status filter to Pending when approvals tab is active
  useEffect(() => {
    if (tabParam === "approvals") {
      setSelectedStatus("Pending");
    }
  }, [tabParam]);

  // Real-time activities listener
  useEffect(() => {
    const q = query(
      collection(db, "activity_entries"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setActivities(list);
    }, (err) => console.error("Error loading activities:", err));
    return () => unsub();
  }, []);

  // Load student index
  useEffect(() => {
    const q = collection(db, "student_section_index");
    const unsub = onSnapshot(q, (snapshot) => {
      const index = {};
      snapshot.forEach((d) => {
        const data = d.data();
        Object.entries(data).forEach(([key, val]) => {
          if (typeof val === "object" && val !== null) {
            index[key] = val;
          }
        });
      });
      setStudentsIndex(index);
    });
    return () => unsub();
  }, []);

  // Load faculty index
  useEffect(() => {
    const q = collection(db, "users");
    const unsub = onSnapshot(q, (snapshot) => {
      const index = {};
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.facultyName) {
          index[data.facultyId || d.id] = { name: data.facultyName, department: data.department };
        }
      });
      setFacultyIndex(index);
    });
    return () => unsub();
  }, []);

  // Get activities for current tab
  const currentTabActivities = useMemo(() => {
    return ACTIVITY_REGISTRY.filter(a => getCategoryFromCode(a.code) === activeTab);
  }, [activeTab]);

  // Filter options
  const batchOptions = useMemo(() => {
    const b = new Set();
    activities.forEach(a => { if (a.batch) b.add(a.batch); });
    activeBatchesList.forEach(batch => b.add(batch));
    return Array.from(b).sort();
  }, [activities, activeBatchesList]);

  const deptOptions = useMemo(() => {
    const d = new Set();
    activities.forEach(a => { if (a.department) d.add(a.department); });
    Object.values(PROGRAMME_DEPARTMENTS).forEach(list => list.forEach(dept => d.add(dept)));
    return Array.from(d).sort();
  }, [activities, PROGRAMME_DEPARTMENTS]);

  const sectionOptions = useMemo(() => {
    const s = new Set();
    activities.forEach(a => { if (a.section) s.add(a.section); });
    ["Sec-A", "Sec-B", "Sec-C"].forEach(sec => s.add(sec));
    return Array.from(s).sort();
  }, [activities]);

  const activityCodeOptions = useMemo(() => {
    return currentTabActivities.map(a => ({ code: a.code, name: a.name }));
  }, [currentTabActivities]);

  // Filtered activities
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      const category = getCategoryFromCode(act.activityCode || "");
      if (category !== activeTab) return false;

      const status = act.status || "Draft";
      const matchesStatus = !selectedStatus || status === selectedStatus;
      const matchesBatch = !selectedBatch || act.batch === selectedBatch;
      const matchesDept = !selectedDept || act.department === selectedDept;
      const matchesProg = !selectedProg || act.programme === selectedProg;
      const matchesSection = !selectedSection || act.section === selectedSection;
      const matchesActivityCode = !selectedActivityCode || act.activityCode === selectedActivityCode;

      const matchesSearch = !searchQuery.trim() || 
        (act.studentName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.facultyName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.regNo || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.activityName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.title || "").toLowerCase().includes(searchQuery.toLowerCase());

      return matchesStatus && matchesBatch && matchesDept && matchesProg && matchesSection && matchesActivityCode && matchesSearch;
    });
  }, [activities, activeTab, selectedStatus, selectedBatch, selectedDept, selectedProg, selectedSection, selectedActivityCode, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const catActivities = activities.filter(a => getCategoryFromCode(a.activityCode || "") === activeTab);
    return {
      total: catActivities.length,
      pending: catActivities.filter(a => (a.status || "Draft") === "Pending").length,
      approved: catActivities.filter(a => (a.status || "Draft") === "Approved").length,
      returned: catActivities.filter(a => (a.status || "Draft") === "Returned").length,
      rejected: catActivities.filter(a => (a.status || "Draft") === "Rejected").length,
      draft: catActivities.filter(a => (a.status || "Draft") === "Draft").length
    };
  }, [activities, activeTab]);

  const handleApprove = async () => {
    if (!reviewActivity) return;
    setIsActioning(true);
    try {
      const docRef = doc(db, "activity_entries", reviewActivity.id);
      await setDoc(docRef, {
        status: "Approved",
        comments: "Approved",
        reviewedBy: auth.currentUser?.uid || "",
        reviewedByName: currentUserData?.facultyName || currentUserData?.displayName || "Reviewer",
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert("Activity approved successfully!");
      setReviewActivity(null);
    } catch (err) {
      console.error("Error approving:", err);
      alert("Failed to approve. Please try again.");
    } finally {
      setIsActioning(false);
    }
  };

  const handleReject = async () => {
    if (!reviewActivity) return;
    if (!returnComment.trim()) {
      alert("Please provide rejection reason.");
      return;
    }
    setIsActioning(true);
    try {
      const docRef = doc(db, "activity_entries", reviewActivity.id);
      await setDoc(docRef, {
        status: "Rejected",
        comments: returnComment,
        reviewedBy: auth.currentUser?.uid || "",
        reviewedByName: currentUserData?.facultyName || currentUserData?.displayName || "Reviewer",
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert("Activity rejected.");
      setReviewActivity(null);
      setReturnComment("");
      setShowReturnInput(false);
    } catch (err) {
      console.error("Error rejecting:", err);
      alert("Failed to reject.");
    } finally {
      setIsActioning(false);
    }
  };

  const handleReturn = async () => {
    if (!reviewActivity) return;
    if (!returnComment.trim()) {
      alert("Please provide feedback comments explaining what correction is needed.");
      return;
    }
    setIsActioning(true);
    try {
      const docRef = doc(db, "activity_entries", reviewActivity.id);
      await setDoc(docRef, {
        status: "Returned",
        comments: returnComment,
        reviewedBy: auth.currentUser?.uid || "",
        reviewedByName: currentUserData?.facultyName || currentUserData?.displayName || "Reviewer",
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert("Activity returned for corrections.");
      setReviewActivity(null);
      setReturnComment("");
      setShowReturnInput(false);
    } catch (err) {
      console.error("Error returning:", err);
      alert("Failed to return.");
    } finally {
      setIsActioning(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredActivities.length === 0) {
      alert("No data to export.");
      return;
    }
    let csvContent = "data:text/csv;charset=utf-8,";
    const headers = ["Activity Code", "Activity Name", "Submitted By", "Department", "Batch", "Section", "Date", "Status", "Points", "Created At"];
    csvContent += headers.join(",") + "\n";
    filteredActivities.forEach(act => {
      const row = [
        act.activityCode || "",
        act.activityName || act.title || "",
        act.studentName || act.facultyName || "",
        act.department || "",
        act.batch || "",
        act.section || "",
        act.date || act.fromDate || "",
        act.status || "Draft",
        act.points || act.totalPoints || "",
        act.createdAt || ""
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
      csvContent += row + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Activity_Report_${ACTIVITY_CATEGORIES[activeTab]?.label}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <Layout title="Activity Management">
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="animate-spin text-[#120c7a]" size={40} />
        </div>
      </Layout>
    );
  }

  const currentCategory = ACTIVITY_CATEGORIES[activeTab];
  const CategoryIcon = currentCategory?.icon ? eval(currentCategory.icon) : GraduationCap;

  return (
    <Layout title="Activity Management">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#120c7a] to-[#0e0a5c] rounded-3xl p-6 md:p-8 text-white mb-8 shadow-xl flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
              <CategoryIcon size={32} className="text-yellow-400 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">ERP Administration</span>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-0.5">
                {currentCategory?.label} Dashboard
              </h1>
              <p className="text-blue-100 text-xs mt-1">Manage, review, and track all activities with NBA/NAAC compliance mapping</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
              <span className="text-xs text-blue-200 block uppercase font-bold tracking-wider">Total Entries</span>
              <span className="text-3xl font-black text-white">{stats.total}</span>
            </div>
            <div className="text-center bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
              <span className="text-xs text-blue-200 block uppercase font-bold tracking-wider">Pending Review</span>
              <span className="text-3xl font-black text-yellow-300">{stats.pending}</span>
            </div>
            <div className="text-center bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
              <span className="text-xs text-blue-200 block uppercase font-bold tracking-wider">Approved</span>
              <span className="text-3xl font-black text-emerald-400">{stats.approved}</span>
            </div>
            <div className="text-center bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
              <span className="text-xs text-blue-200 block uppercase font-bold tracking-wider">Returned</span>
              <span className="text-3xl font-black text-rose-400">{stats.returned}</span>
            </div>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex border-b border-zinc-200 mb-6 gap-2 flex-wrap">
          {Object.entries(ACTIVITY_CATEGORIES).map(([key, cat]) => {
            const Icon = eval(cat.icon);
            const count = activities.filter(a => getCategoryFromCode(a.activityCode || "") === key).length;
            return (
              <button
                key={key}
                onClick={() => { setActiveTab(key); setSelectedStatus(""); setSearchQuery(""); }}
                className={`pb-4 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === key 
                    ? "border-[#120c7a] text-[#120c7a]" 
                    : "border-transparent text-zinc-400 hover:text-zinc-600 hover:border-zinc-300"
                }`}
              >
                <Icon size={14} />
                {cat.label}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === key ? "bg-[#120c7a] text-white" : "bg-zinc-100 text-zinc-500"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filters Panel */}
        <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={18} className="text-[#120c7a]" />
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider">Search & Filter Selection</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Batch</label>
              <select value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                <option value="">All Batches</option>
                {batchOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Department</label>
              <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white" disabled={currentUserData?.role === "Faculty" && currentUserData?.department}>
                <option value="">All Departments</option>
                {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Section</label>
              <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                <option value="">All Sections</option>
                {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Status</label>
              <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Activity</label>
              <select value={selectedActivityCode} onChange={e => setSelectedActivityCode(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                <option value="">All Activities</option>
                {activityCodeOptions.map(a => <option key={a.code} value={a.code}>{a.code} - {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input type="text" placeholder="Search by name, roll no, event title..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-4 py-2.5 text-xs font-semibold placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Activity Table */}
        <div className="bg-white rounded-3xl border border-zinc-100 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-zinc-100 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-base font-extrabold text-zinc-800">
                {currentCategory?.label} ({filteredActivities.length} entries)
              </h3>
              <p className="text-xs text-zinc-400 font-medium">Review submissions and cross-check evidence logs.</p>
            </div>
            <button onClick={handleExportCSV} className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-bold text-zinc-700 flex items-center gap-2">
              <Download size={14} /> Export CSV
            </button>
          </div>

          {filteredActivities.length === 0 ? (
            <div className="p-12 text-center text-zinc-400">
              <Clock size={36} className="mx-auto text-zinc-300 mb-3" />
              <p className="text-sm font-semibold text-zinc-600">No activity logs found for current filter selection.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-zinc-600">
                <thead className="bg-zinc-50/70 text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-4">Submitted By</th>
                    <th className="p-4">Department / Batch</th>
                    <th className="p-4">Activity</th>
                    <th className="p-4 text-center">Date</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-center">Points</th>
                    <th className="p-4 text-center">NBA/NAAC</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 font-medium">
                  {filteredActivities.map((act) => {
                    const registry = ACTIVITY_REGISTRY.find(r => r.code === act.activityCode);
                    const status = act.status || "Draft";
                    return (
                      <tr key={act.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-zinc-800">{act.studentName || act.facultyName || "N/A"}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-bold mt-0.5 uppercase">
                            <span>{act.regNo || act.facultyId || ""}</span>
                            {act.regNo && act.facultyId && <span>•</span>}
                          </div>
                        </td>
                        <td className="p-4">
                          <p className="font-bold text-zinc-700">{act.department}</p>
                          <p className="text-[10px] text-zinc-400 font-bold uppercase">{act.batch} • {act.section || "Sec-A"}</p>
                        </td>
                        <td className="p-4 max-w-xs md:max-w-sm">
                          <p className="font-bold text-zinc-800 truncate">{act.activityName || act.title || registry?.name || "Unnamed Activity"}</p>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold mt-1 uppercase bg-blue-50 text-blue-700 border border-blue-100`}>
                            {act.activityCode}
                          </span>
                        </td>
                        <td className="p-4 text-center font-bold text-zinc-700">{act.date || act.fromDate || "-"}</td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                            status === "Approved" ? "bg-emerald-100 text-emerald-800" :
                            status === "Pending" ? "bg-amber-100 text-amber-800" :
                            status === "Returned" ? "bg-rose-100 text-rose-800" :
                            status === "Rejected" ? "bg-red-100 text-red-800" :
                            "bg-zinc-100 text-zinc-600"
                          }`}>
                            {status}
                          </span>
                        </td>
                        <td className="p-4 text-center font-extrabold text-[#120c7a]">{act.points || act.totalPoints || "-"}</td>
                        <td className="p-4 text-center text-[10px] font-bold">
                          {registry?.nbaCriterion && <div className="text-blue-700">NBA: {registry.nbaCriterion}</div>}
                          {registry?.naacCriterion && <div className="text-emerald-700">NAAC: {registry.naacCriterion}</div>}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => {
                              setViewActivity(act);
                              setReviewActivity(act);
                              setReturnComment("");
                              setShowReturnInput(false);
                            }}
                            className="px-3 py-1.5 bg-[#120c7a]/5 hover:bg-[#120c7a]/15 text-[#120c7a] rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye size={12} />
                            {status === "Pending" ? "Review" : "View"}
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
      </div>

      {/* View/Review Modal */}
      {reviewActivity && (
        <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200 text-zinc-800">
            <div className="bg-[#120c7a] p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Award className="text-yellow-400" size={24} />
                <div>
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-blue-200">
                    Activity Verification Board
                  </h4>
                  <p className="text-base font-bold truncate mt-0.5">
                    {reviewActivity.studentName || reviewActivity.facultyName} 
                    ({reviewActivity.regNo || reviewActivity.facultyId || "N/A"})
                  </p>
                </div>
              </div>
              <button onClick={() => setReviewActivity(null)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Event details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Activity Code</span>
                  <span className="text-sm font-extrabold text-zinc-800">{reviewActivity.activityCode}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Activity Name</span>
                  <span className="text-sm font-extrabold text-zinc-800">{reviewActivity.activityName || reviewActivity.title}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Date</span>
                  <span className="text-sm font-bold text-zinc-700">{reviewActivity.date || reviewActivity.fromDate}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Points Claimed</span>
                  <span className="text-sm font-extrabold text-[#120c7a]">{reviewActivity.points || reviewActivity.totalPoints} Pts</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Department / Batch / Section</span>
                  <span className="text-sm font-bold text-zinc-800">{reviewActivity.department} / {reviewActivity.batch} / {reviewActivity.section || "Sec-A"}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">NBA / NAAC Mapping</span>
                  <span className="text-xs font-semibold text-zinc-700">
                    {registry?.nbaCriterion ? `NBA: ${registry.nbaCriterion}` : ""} 
                    {registry?.naacCriterion ? ` | NAAC: ${registry.naacCriterion}` : ""}
                  </span>
                </div>
              </div>

              {/* Additional fields based on activity type */}
              <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 space-y-3 text-xs">
                {Object.entries(reviewActivity).filter(([k, v]) => 
                  v && !["id", "status", "createdAt", "updatedAt", "activityCode", "activityName", "title", "studentName", "facultyName", "regNo", "facultyId", "department", "batch", "section", "date", "fromDate", "points", "totalPoints", "evidenceUrl", "comments", "reviewedBy", "reviewedByName"].includes(k)
                ).map(([key, value]) => (
                  <div key={key} className="flex gap-4">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider w-40 shrink-0">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </span>
                    <span className="text-zinc-700 font-medium">{typeof value === 'object' ? JSON.stringify(value) : value}</span>
                  </div>
                ))}
              </div>

              {/* Evidence Review */}
              {reviewActivity.evidenceUrl && (
                <div>
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Uploaded Evidence</span>
                  <div className="border border-zinc-200 bg-zinc-50 rounded-2xl p-2 flex items-center justify-center min-h-60 overflow-hidden shadow-inner">
                    {reviewActivity.evidenceUrl.endsWith('.pdf') ? (
                      <iframe src={reviewActivity.evidenceUrl} className="w-full h-96 rounded-xl" title="Evidence PDF" />
                    ) : (
                      <img src={reviewActivity.evidenceUrl} alt="Evidence" className="max-w-full max-h-96 object-contain rounded-xl shadow-md" referrerPolicy="no-referrer" />
                    )}
                  </div>
                </div>
              )}

              {/* Return for correction */}
              {showReturnInput && (
                <div className="space-y-2 p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                  <label className="block text-xs font-extrabold text-rose-800 uppercase tracking-wider">Correction Feedback:</label>
                  <textarea
                    rows={3}
                    placeholder="Provide detailed feedback e.g., Certificate not legible, Wrong category selected, Missing signatures..."
                    value={returnComment}
                    onChange={e => setReturnComment(e.target.value)}
                    className="w-full rounded-xl border border-rose-200 p-3 text-xs font-medium placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowReturnInput(false)} className="px-3 py-1.5 bg-zinc-200 text-zinc-600 text-[10px] font-bold rounded-lg cursor-pointer">Cancel</button>
                    <button onClick={handleReturn} disabled={isActioning} className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 cursor-pointer">
                      {isActioning ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />} Return for Correction
                    </button>
                  </div>
                </div>
              )}

              {/* Previous comments */}
              {reviewActivity.comments && (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <span className="text-xs font-bold text-blue-800 uppercase tracking-wider block mb-1">Reviewer Comments:</span>
                  <p className="text-sm text-blue-700">{reviewActivity.comments}</p>
                  {reviewActivity.reviewedByName && (
                    <p className="text-[10px] text-blue-500 font-medium mt-1">Reviewed by: {reviewActivity.reviewedByName}</p>
                  )}
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
                <button onClick={() => setReviewActivity(null)} className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-xs font-extrabold rounded-xl transition-all cursor-pointer">
                  Close
                </button>

                {reviewActivity.status === "Pending" && !showReturnInput && (
                  <>
                    <button onClick={() => setShowReturnInput(true)} className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1 cursor-pointer">
                      <X size={14} /> Return for Correction
                    </button>
                    <button onClick={handleApprove} disabled={isActioning} className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-extrabold rounded-xl shadow-md hover:from-emerald-600 hover:to-teal-700 transition-all flex items-center gap-1 cursor-pointer">
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
    </Layout>
  );
}