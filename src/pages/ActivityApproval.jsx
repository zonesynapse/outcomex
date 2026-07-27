import React, { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, where, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { 
  Award, Clock, Eye, Download, Search, Filter, Calendar, Users, 
  CheckCircle2, Loader2, BookOpen, Layers, X, FileText, Printer, ArrowRight, AlertCircle
} from "lucide-react";
import Layout from "../components/Layout";
import { ACTIVITY_REGISTRY } from "../data/activityRegistry";
import { formatProgDisplay, formatBatchDisplay, sanitizeKey } from "../lib/utils";

export default function ActivityApproval() {
  const [currentUserData, setCurrentUserData] = useState(null);
  const [userRole, setUserRole] = useState("");
  const [userDept, setUserDept] = useState("");
  const [currentUid, setCurrentUid] = useState("");
  
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedProg, setSelectedProg] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedActivityCode, setSelectedActivityCode] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  const [reviewActivity, setReviewActivity] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [isForwarding, setIsForwarding] = useState(false);
  const [reportStatusDoc, setReportStatusDoc] = useState(null);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Load current user details
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUid(user.uid);
        const userRef = doc(db, 'users', user.uid);
        getDoc(userRef).then(snap => {
          if (snap.exists()) {
            const ud = snap.data();
            setCurrentUserData(ud);
            setUserRole(ud.role || "");
            const dept = ud.department || ud.assignedDepartment || ud.departmentName || ud.dept || ud.deptName || ud.facultyDepartment || ud.departmentCode || "";
            setUserDept(dept);
            // Auto-filter by HOD's department
            if (ud.role === "HOD" && dept) {
              setSelectedDept(dept);
            }
          }
        });
      }
    });
    return () => unsub();
  }, []);

  // Real-time approved activities listener
  useEffect(() => {
    setLoading(true);
    let list1 = [];
    let list2 = [];

    const q1 = query(
      collection(db, "activity_entries"),
      where("status", "==", "Approved")
    );
    const unsub1 = onSnapshot(q1, (snapshot) => {
      list1 = [];
      snapshot.forEach((d) => {
        list1.push({ id: d.id, ...d.data() });
      });
      combineAndSet();
    }, (err) => console.error("Error loading activity_entries:", err));

    const q2 = query(
      collection(db, "step_activities"),
      where("status", "==", "Approved")
    );
    const unsub2 = onSnapshot(q2, (snapshot) => {
      list2 = [];
      snapshot.forEach((d) => {
        list2.push({ id: d.id, isStep: true, activityCode: "STEP", ...d.data() });
      });
      combineAndSet();
    }, (err) => console.error("Error loading step_activities:", err));

    const combineAndSet = () => {
      const combined = [...list1, ...list2].sort((a, b) => {
        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
      setActivities(combined);
      setLoading(false);
    };

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  // Fetch report status (forwarded to Principal or Approved)
  useEffect(() => {
    if (!selectedDept || !selectedMonth || !selectedYear) {
      setReportStatusDoc(null);
      return;
    }
    const reportId = `report_${sanitizeKey(selectedDept)}_${selectedMonth}_${selectedYear}`;
    const unsub = onSnapshot(doc(db, "monthly_reports", reportId), (snap) => {
      if (snap.exists()) {
        setReportStatusDoc(snap.data());
      } else {
        setReportStatusDoc(null);
      }
    });
    return () => unsub();
  }, [selectedDept, selectedMonth, selectedYear]);

  // Derive dropdown options dynamically
  const deptOptions = useMemo(() => [...new Set(activities.map(a => a.department).filter(Boolean))].sort(), [activities]);
  const batchOptions = useMemo(() => [...new Set(activities.map(a => a.batch).filter(Boolean))].sort(), [activities]);
  const programmeOptions = useMemo(() => [...new Set(activities.map(a => a.programme).filter(Boolean))].sort(), [activities]);
  const sectionOptions = useMemo(() => [...new Set(activities.map(a => a.section).filter(Boolean))].sort(), [activities]);
  const activityCodeOptions = useMemo(() => [...new Set(activities.map(a => a.activityCode).filter(Boolean))].sort(), [activities]);

  // Filtered Approved Activities
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      if (userRole === "HOD" && userDept && act.department !== userDept) return false;
      if (selectedDept && act.department !== selectedDept) return false;

      const matchesBatch = !selectedBatch || act.batch === selectedBatch;
      const matchesProg = !selectedProg || act.programme === selectedProg;
      const matchesSection = !selectedSection || act.section === selectedSection;
      const matchesActivityCode = !selectedActivityCode || act.activityCode === selectedActivityCode;

      const matchesSearch = !searchQuery.trim() || 
        (act.studentName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.facultyName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.regNo || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.activityName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (act.title || "").toLowerCase().includes(searchQuery.toLowerCase());

      if (selectedMonth) {
        const dateVal = act.date || act.fromDate || "";
        const m = dateVal.split("-")[1];
        if (m && parseInt(m) !== parseInt(selectedMonth)) return false;
      }
      if (selectedYear) {
        const dateVal = act.date || act.fromDate || "";
        const y = dateVal.split("-")[0];
        if (y && y !== selectedYear) return false;
      }

      return matchesBatch && matchesProg && matchesSection && matchesActivityCode && matchesSearch;
    });
  }, [activities, selectedBatch, selectedDept, selectedProg, selectedSection, selectedActivityCode, searchQuery, userRole, userDept, selectedMonth, selectedYear]);

  // Group activities month-wise
  const groupedByMonth = useMemo(() => {
    const groups = {};
    filteredActivities.forEach(act => {
      let mKey = "Unknown Month";
      const dateVal = act.date || act.fromDate;
      if (dateVal) {
        const d = new Date(dateVal + 'T00:00:00');
        if (!isNaN(d)) {
          mKey = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
      }
      if (!groups[mKey]) groups[mKey] = [];
      groups[mKey].push(act);
    });

    return Object.entries(groups).sort((a, b) => {
      if (a[0] === "Unknown Month") return 1;
      if (b[0] === "Unknown Month") return -1;
      const dateAStr = a[1]?.[0]?.date || a[1]?.[0]?.fromDate || "";
      const dateBStr = b[1]?.[0]?.date || b[1]?.[0]?.fromDate || "";
      if (!dateAStr) return 1;
      if (!dateBStr) return -1;
      const da = new Date(dateAStr + 'T00:00:00');
      const db = new Date(dateBStr + 'T00:00:00');
      return db - da;
    });
  }, [filteredActivities]);

  // Extract images from activity
  const getImages = (act) => {
    const urls = [];
    if (act.evidenceUrl) {
      const isImg = /\.(jpg|jpeg|png|webp|gif)/i.test(act.evidenceUrl) || act.evidenceUrl.includes("alt=media");
      if (isImg && !act.evidenceUrl.endsWith(".pdf")) {
        urls.push({ url: act.evidenceUrl, title: act.activityName || act.title || "Evidence File" });
      }
    }
    if (Array.isArray(act.evidenceFiles)) {
      act.evidenceFiles.forEach(f => {
        if (f.url) {
          const isImg = /\.(jpg|jpeg|png|webp|gif)/i.test(f.url) || f.url.includes("alt=media");
          if (isImg && !f.url.endsWith(".pdf")) {
            urls.push({ url: f.url, title: f.name || "Evidence File" });
          }
        }
      });
    }
    return urls;
  };

  // Sections for A4 compiled document report
  const partA_GuestLectures = useMemo(() => filteredActivities.filter(a => a.activityCode === "B9" || (a.isStep && a.category === "industry")), [filteredActivities]);
  const partA_Association = useMemo(() => filteredActivities.filter(a => a.isStep && a.category === "leadership"), [filteredActivities]);
  const partA_Internships = useMemo(() => filteredActivities.filter(a => a.isStep && (a.category === "industry" || (a.activityName || "").toLowerCase().includes("internship"))), [filteredActivities]);
  const partA_OnlineCourses = useMemo(() => filteredActivities.filter(a => a.isStep && a.category === "onlineCourse"), [filteredActivities]);
  const partA_PaperPresentations = useMemo(() => filteredActivities.filter(a => a.isStep && (a.category === "research" && ((a.activityName || "").toLowerCase().includes("present") || (a.activityType || "").toLowerCase().includes("present")))), [filteredActivities]);
  const partA_Publications = useMemo(() => filteredActivities.filter(a => a.isStep && (a.category === "research" && ((a.activityName || "").toLowerCase().includes("publ") || (a.activityType || "").toLowerCase().includes("publ")))), [filteredActivities]);
  const partA_Conferences = useMemo(() => filteredActivities.filter(a => a.isStep && a.category === "technical"), [filteredActivities]);
  const partA_ExtraCurricular = useMemo(() => filteredActivities.filter(a => a.isStep && (a.category === "sports" || a.category === "social")), [filteredActivities]);
  const partA_Placements = useMemo(() => filteredActivities.filter(a => a.isStep && a.category === "placement"), [filteredActivities]);

  const partB_Meetings = useMemo(() => filteredActivities.filter(a => a.activityCode === "B1"), [filteredActivities]);
  const partB_Advisory = useMemo(() => filteredActivities.filter(a => a.activityCode === "B2"), [filteredActivities]);
  const partB_Purchases = useMemo(() => filteredActivities.filter(a => a.activityCode === "B3"), [filteredActivities]);
  const partB_Mous = useMemo(() => filteredActivities.filter(a => a.activityCode === "B4"), [filteredActivities]);
  const partB_Parents = useMemo(() => filteredActivities.filter(a => a.activityCode === "B5"), [filteredActivities]);
  const partB_Audits = useMemo(() => filteredActivities.filter(a => a.activityCode === "B7"), [filteredActivities]);
  const partB_Newsletters = useMemo(() => filteredActivities.filter(a => a.activityCode === "B8"), [filteredActivities]);

  const partC_Phd = useMemo(() => filteredActivities.filter(a => a.activityCode === "C1"), [filteredActivities]);
  const partC_Publications = useMemo(() => filteredActivities.filter(a => a.activityCode === "C2"), [filteredActivities]);
  const partC_Attended = useMemo(() => filteredActivities.filter(a => a.activityCode === "C3"), [filteredActivities]);
  const partC_Organized = useMemo(() => filteredActivities.filter(a => a.activityCode === "C4"), [filteredActivities]);
  const partC_Online = useMemo(() => filteredActivities.filter(a => a.activityCode === "C5"), [filteredActivities]);
  const partC_Funding = useMemo(() => filteredActivities.filter(a => a.activityCode === "C6"), [filteredActivities]);
  const partC_Patents = useMemo(() => filteredActivities.filter(a => a.activityCode === "C7"), [filteredActivities]);
  const partC_Contributions = useMemo(() => filteredActivities.filter(a => a.activityCode === "C8"), [filteredActivities]);
  const partC_Achievements = useMemo(() => filteredActivities.filter(a => a.activityCode === "C9"), [filteredActivities]);

  const allReportImages = useMemo(() => {
    const imagesList = [];
    filteredActivities.forEach(act => {
      const imgs = getImages(act);
      imgs.forEach(i => imagesList.push(i));
    });
    return imagesList;
  }, [filteredActivities]);

  const handleForwardToPrincipal = async () => {
    if (!selectedDept || !selectedMonth || !selectedYear) return;
    setIsForwarding(true);
    const reportId = `report_${sanitizeKey(selectedDept)}_${selectedMonth}_${selectedYear}`;
    try {
      await setDoc(doc(db, "monthly_reports", reportId), {
        id: reportId,
        department: selectedDept,
        month: selectedMonth,
        monthName: months[parseInt(selectedMonth) - 1],
        year: selectedYear,
        status: "Principal_Pending",
        submittedBy: currentUid,
        submittedByName: currentUserData?.facultyName || "HOD",
        submittedAt: new Date().toISOString(),
        comments: ""
      }, { merge: true });
      alert("Monthly Report successfully forwarded to Principal for approval!");
    } catch (err) {
      console.error("Error forwarding monthly report:", err);
      alert("Failed to forward report. Please try again.");
    } finally {
      setIsForwarding(false);
    }
  };

  return (
    <Layout>
      <style>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .print-container {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          table {
            page-break-inside: auto;
            border-collapse: collapse !important;
            width: 100% !important;
          }
          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          thead {
            display: table-header-group !important;
          }
          img {
            max-height: 250px !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {!previewMode ? (
          <>
            {/* Header Block */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-950 rounded-3xl p-6 md:p-8 shadow-xl text-white mb-8 relative overflow-hidden">
              <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
              <div className="absolute left-1/3 bottom-0 translate-y-12 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
              
              <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-bold text-blue-200">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    Verified Accomplishments
                  </div>
                  <h1 className="text-3xl font-black tracking-tight md:text-4xl">Approved Activity Registry</h1>
                  <p className="text-sm text-blue-200 font-medium max-w-xl">
                    Comprehensive log of all approved student and faculty activities verified by HOD, segmented month-wise.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 text-center shrink-0 min-w-32">
                    <span className="text-[10px] font-black text-blue-300 uppercase tracking-widest block">Approved Total</span>
                    <span className="text-3xl font-black block mt-1">{filteredActivities.length}</span>
                  </div>
                  {selectedMonth && selectedDept && (
                    <button
                      onClick={() => setPreviewMode(true)}
                      className="px-5 py-3 bg-white text-[#120c7a] rounded-2xl text-xs font-black shadow-lg hover:bg-zinc-50 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Printer size={14} /> Document Preview
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Filters Panel */}
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6 mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Filter size={18} className="text-[#120c7a]" />
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider">Filter Verified Submissions</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Search Query</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-3.5 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Search name, register number, or title..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-4 py-2.5 text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Program</label>
                  <select value={selectedProg} onChange={e => setSelectedProg(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    <option value="">All Programs</option>
                    {programmeOptions.map(p => <option key={p} value={p}>{formatProgDisplay(p)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Department</label>
                  <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white" disabled={userRole === "HOD" && userDept}>
                    <option value="">All Departments</option>
                    {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Month</label>
                  <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    <option value="">All Months</option>
                    {months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Year</label>
                  <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white">
                    {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* List View */}
            <div className="bg-white rounded-3xl border border-zinc-100 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-zinc-100">
                <h3 className="text-base font-extrabold text-zinc-800">Verified Activity Log List</h3>
                <p className="text-xs text-zinc-400 font-medium">Click view on any record to inspect uploader logs and attached certificates.</p>
              </div>

              {loading ? (
                <div className="p-16 text-center">
                  <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={32} />
                  <p className="text-sm font-semibold text-zinc-600">Loading approved activity registry...</p>
                </div>
              ) : filteredActivities.length === 0 ? (
                <div className="p-16 text-center text-zinc-400">
                  <Clock size={36} className="mx-auto text-zinc-300 mb-3" />
                  <p className="text-sm font-semibold text-zinc-600">No approved activity records found matching filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-zinc-600">
                    <thead className="bg-zinc-50/70 text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                      <tr>
                        <th className="p-4">Submitted By</th>
                        <th className="p-4">Department / Batch</th>
                        <th className="p-4">Activity Name</th>
                        <th className="p-4 text-center">Date</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">Points</th>
                        <th className="p-4 text-center">NBA/NAAC</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 font-medium">
                      {groupedByMonth.map(([monthName, activitiesList]) => (
                        <React.Fragment key={monthName}>
                          <tr className="bg-zinc-50 border-y border-zinc-100">
                            <td colSpan={8} className="px-4 py-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                                  <Calendar size={13} className="text-[#120c7a]" />
                                  {monthName}
                                </span>
                                <span className="text-[9px] bg-zinc-200 text-zinc-700 px-2.5 py-0.5 rounded-full font-bold">
                                  {activitiesList.length} approved
                                </span>
                              </div>
                            </td>
                          </tr>
                          {activitiesList.map((act) => {
                            const registry = ACTIVITY_REGISTRY.find(r => r.code === act.activityCode);
                            return (
                              <tr key={act.id} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="p-4">
                                  <p className="font-bold text-zinc-800">{act.studentName || act.facultyName || "N/A"}</p>
                                  <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">{act.regNo || act.facultyId || ""}</p>
                                </td>
                                <td className="p-4">
                                  <p className="font-bold text-zinc-700">{act.department}</p>
                                  <p className="text-[10px] text-zinc-400 font-bold uppercase">{act.batch} • {act.section || "Sec-A"}</p>
                                </td>
                                <td className="p-4 max-w-xs md:max-w-sm">
                                  <p className="font-bold text-zinc-800 truncate">{act.activityName || act.title || registry?.name || "Unnamed Activity"}</p>
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold mt-1 bg-blue-50 text-blue-700 border border-blue-100 uppercase">
                                    {act.activityCode}
                                  </span>
                                </td>
                                <td className="p-4 text-center font-bold text-zinc-700">{act.date || act.fromDate || "-"}</td>
                                <td className="p-4 text-center">
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-100 text-emerald-800">
                                    Approved
                                  </span>
                                </td>
                                <td className="p-4 text-center font-extrabold text-[#120c7a]">{act.points || act.totalPoints || "-"}</td>
                                <td className="p-4 text-center text-[10px] font-bold">
                                  {registry?.nbaCriterion && <div className="text-blue-700">NBA: {registry.nbaCriterion}</div>}
                                  {registry?.naacCriterion && <div className="text-emerald-700">NAAC: {registry.naacCriterion}</div>}
                                </td>
                                <td className="p-4 text-center">
                                  <button
                                    onClick={() => setReviewActivity(act)}
                                    className="px-3 py-1.5 bg-[#120c7a]/5 hover:bg-[#120c7a]/15 text-[#120c7a] rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Eye size={12} /> View Details
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Report Preview Mode with Forward to Principal Workflow */
          <div className="space-y-6">
            
            {/* Status bar */}
            <div className="no-print">
              {reportStatusDoc?.status === "Approved" ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-2 text-xs font-bold shadow-sm">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>This Monthly Report has been approved and signed by the Principal! (Approved on {new Date(reportStatusDoc.approvedAt).toLocaleDateString()})</span>
                </div>
              ) : reportStatusDoc?.status === "Principal_Pending" ? (
                <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl flex items-center gap-2 text-xs font-bold shadow-sm">
                  <Clock size={16} className="text-amber-600 shrink-0 animate-pulse" />
                  <span>This Monthly Report is currently forwarded to the Principal and is pending approval.</span>
                </div>
              ) : reportStatusDoc?.status === "Returned" ? (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex flex-col gap-1.5 text-xs shadow-sm">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertCircle size={16} className="text-rose-600 shrink-0" />
                    <span>Report Returned for Correction:</span>
                  </div>
                  <p className="pl-6 font-semibold italic text-rose-700">Comments: "{reportStatusDoc.comments}"</p>
                </div>
              ) : (
                <div className="p-4 bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-2xl flex items-center gap-2 text-xs font-bold shadow-sm">
                  <AlertCircle size={16} className="text-zinc-500 shrink-0" />
                  <span>Report Draft: This compiled report has not been forwarded to the Principal yet.</span>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="bg-white p-4 border border-zinc-200 rounded-2xl flex justify-between items-center no-print">
              <button
                onClick={() => setPreviewMode(false)}
                className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <X size={14} /> Back to List
              </button>

              <div className="flex items-center gap-3">
                {(!reportStatusDoc || reportStatusDoc.status === "Returned") && (
                  <button
                    onClick={handleForwardToPrincipal}
                    disabled={isForwarding}
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white rounded-xl text-xs font-black shadow-md hover:from-blue-800 hover:to-indigo-900 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {isForwarding ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                    Forward to Principal
                  </button>
                )}
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2.5 bg-zinc-800 text-white rounded-xl text-xs font-black shadow-md hover:bg-zinc-900 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={15} /> Print/Download PDF
                </button>
              </div>
            </div>

            {/* Document sheet */}
            <div className="bg-white shadow-xl border border-zinc-200 p-12 rounded-3xl max-w-4xl mx-auto print-container font-serif text-zinc-900 leading-relaxed space-y-8">
              
              {/* Document Header */}
              <div className="text-center border-b-2 border-black pb-4 mb-6">
                <h2 className="text-xl font-bold tracking-wide uppercase">CK COLLEGE OF ENGINEERING & TECHNOLOGY</h2>
                <p className="text-xs uppercase font-semibold text-zinc-600">Jayaram Nagar, Chellangkuppam, Cuddalore - 607 003.</p>
                <h3 className="text-base font-bold mt-3 uppercase tracking-wider">
                  DEPARTMENT OF {selectedDept ? selectedDept.toUpperCase() : "ELECTRICAL AND ELECTRONICS ENGINEERING"}
                </h3>
                <h4 className="text-sm font-black mt-2 underline uppercase tracking-widest">
                  MONTHLY REPORT FOR THE MONTH OF {months[parseInt(selectedMonth) - 1]?.toUpperCase()} - {selectedYear}
                </h4>
              </div>

              {/* PART A */}
              <div className="space-y-6">
                <h2 className="text-base font-black border-b border-zinc-400 pb-1 uppercase tracking-wide">
                  Part A: Activities related to the Students
                </h2>

                {/* A.1 Guest Lectures */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">1. Industry Oriented Guest Lectures Organized</h3>
                  {partA_GuestLectures.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">S.No</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">No. of Students</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Program Details</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Resource Person</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partA_GuestLectures.map((act, index) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 text-center">{index + 1}</td>
                            <td className="border border-zinc-400 p-2">{act.date || act.fromDate || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.studentsCount || act.noOfStudents || "-"}</td>
                            <td className="border border-zinc-400 p-2 font-bold">{act.activityName || act.title || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.resourcePerson || act.speaker || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* A.2 Association activities */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">2. Students Association Activities</h3>
                  {partA_Association.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">S.No</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Event Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">No. of Students</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Outcome/Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partA_Association.map((act, index) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 text-center">{index + 1}</td>
                            <td className="border border-zinc-400 p-2">{act.date || act.fromDate || "-"}</td>
                            <td className="border border-zinc-400 p-2 font-bold">{act.activityName || act.title || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.noOfStudents || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.remarks || act.outcome || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* A.3 Internships / Industrial Training */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">3. Industrial Practical Training / Internships</h3>
                  {partA_Internships.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">S.No</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Duration</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Company / Venue</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">No. of Students</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Program Title</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partA_Internships.map((act, index) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 text-center">{index + 1}</td>
                            <td className="border border-zinc-400 p-2">{act.duration || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.hostInstitution || act.company || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.students || act.noOfStudents || "1"}</td>
                            <td className="border border-zinc-400 p-2 font-bold">{act.activityName || act.title || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* A.4 Online Courses (NPTEL) */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">4. Student Co-curricular Online Courses</h3>
                  {partA_OnlineCourses.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">S.No</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Course Title</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Platform / University</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Duration</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Students Registered</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partA_OnlineCourses.map((act, index) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 text-center">{index + 1}</td>
                            <td className="border border-zinc-400 p-2 font-bold">{act.activityName || act.title || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.platform || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.weeks || act.duration || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.studentName || act.noOfStudents || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center text-emerald-700 font-bold uppercase">{act.status || "Completed"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* A.5 Presentations / Symposia */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">5. Paper presented / Project presented / Symposia</h3>
                  {partA_PaperPresentations.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">S.No</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Student Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Organized By</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Event Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Prize/Participated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partA_PaperPresentations.map((act, index) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 text-center">{index + 1}</td>
                            <td className="border border-zinc-400 p-2 font-bold">{act.studentName || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.hostInstitution || act.organizedBy || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.activityName || act.title || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.date || act.fromDate || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center font-bold">{act.remarks || "Participated"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* A.6 Extra-curricular (Sports & NSS) */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">6. Extra-Curricular activities (Sports/NSS/NCC)</h3>
                  {partA_ExtraCurricular.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">S.No</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Game/Event</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Venue</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Students Count</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Prize Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partA_ExtraCurricular.map((act, index) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 text-center">{index + 1}</td>
                            <td className="border border-zinc-400 p-2 font-bold">{act.activityName || act.title || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.date || act.fromDate || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.venue || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.noOfStudents || "1"}</td>
                            <td className="border border-zinc-400 p-2 font-bold text-center">{act.remarks || act.prize || "Participated"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* A.7 Training & Placements */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">7. Placements / Training Activities</h3>
                  {partA_Placements.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">S.No</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Company Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Salary (LPA)</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Students Placed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partA_Placements.map((act, index) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 text-center">{index + 1}</td>
                            <td className="border border-zinc-400 p-2 font-bold">{act.company || act.activityName || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.date || act.fromDate || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center font-bold text-emerald-700">{act.salary || act.remarks || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.studentName || act.noOfStudents || "1"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* PART B */}
              <div className="space-y-6">
                <h2 className="text-base font-black border-b border-zinc-400 pb-1 uppercase tracking-wide">
                  Part B: Details of Department Level Activities
                </h2>

                {/* B.1 Class Committee Meetings */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">1. Class Committee Meetings</h3>
                  {partB_Meetings.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Meeting No</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Chairman</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Agenda</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Decisions / Action Taken</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partB_Meetings.map((act) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 text-center font-mono">{act.meetingNo || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.date || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.chairman || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.agenda || "-"}</td>
                            <td className="border border-zinc-400 p-2 font-semibold text-blue-800">{act.decisions || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* B.2 Laboratory Equipment Purchased / Maintenance */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">2. Equipment Purchased / Service & Maintenance</h3>
                  {partB_Purchases.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Equipment Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Lab Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Type</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Cost (₹)</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Vendor</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partB_Purchases.map((act) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 font-bold">{act.equipmentName || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.labName || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center font-bold uppercase text-zinc-500">{act.type || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-right font-bold text-indigo-700">₹{parseFloat(act.cost || 0).toLocaleString("en-IN")}</td>
                            <td className="border border-zinc-400 p-2">{act.vendor || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center uppercase font-black">{act.status || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* B.3 Parents Teacher Meet Conducted */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">3. Parent-Teacher Meetings</h3>
                  {partB_Parents.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Attended / Invited</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Issues Raised</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Action Taken</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partB_Parents.map((act) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 text-center">{act.date || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center font-bold">{act.parentsAttended || 0} / {act.parentsInvited || 0}</td>
                            <td className="border border-zinc-400 p-2">{act.issuesRaised || "-"}</td>
                            <td className="border border-zinc-400 p-2 font-bold text-emerald-800">{act.actionTaken || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* B.4 MoUs Signed */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">4. MoUs / Collaborations Signed</h3>
                  {partB_Mous.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Organisation</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Type</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Level</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date Signed</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Benefits / Activities</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partB_Mous.map((act) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 font-bold">{act.organisationName || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center font-bold text-blue-700">{act.type || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.level || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.dateSigned || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.keyActivities || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* PART C */}
              <div className="space-y-6">
                <h2 className="text-base font-black border-b border-zinc-400 pb-1 uppercase tracking-wide">
                  Part C: Activities related to Staff members
                </h2>

                {/* C.1 Ph.D. work Progress */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">1. Ph.D. work Progress of Faculty members</h3>
                  {partC_Phd.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Faculty Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Supervisor</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">University</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Monthly Progress Details</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partC_Phd.map((act) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 font-bold">{act.facultyName || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.supervisor || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.university || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.monthlyProgress || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center uppercase font-bold text-indigo-700">{act.status || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* C.2 Faculty Publications */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">2. Faculty Publications (Conference & Journals)</h3>
                  {partC_Publications.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Faculty Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Type</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Title of Paper</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Publisher / Conference</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date Published</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partC_Publications.map((act) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 font-bold">{act.facultyName || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center font-bold uppercase text-zinc-500">{act.type || "-"}</td>
                            <td className="border border-zinc-400 p-2 font-bold">{act.title || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.journalConference || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.datePublished || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* C.3 FDPs / Seminars Attended */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">3. Faculty Conferences/FDPs/Workshops Participated</h3>
                  {partC_Attended.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Faculty Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Program Title</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Organized By</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Duration (Days)</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Dates</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partC_Attended.map((act) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 font-bold">{act.facultyName || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.programmeTitle || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.organisedBy || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center font-bold">{act.durationDays || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center text-[10px]">{act.fromDate} to {act.toDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* C.4 Faculty Online Courses */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">4. Status of Faculty Pursuing Online Courses</h3>
                  {partC_Online.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Faculty Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Course Title</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Platform / University</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Duration (Weeks)</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partC_Online.map((act) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 font-bold">{act.facultyName || "-"}</td>
                            <td className="border border-zinc-400 p-2 font-bold">{act.courseName || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.platform || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.weeks || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center text-emerald-800 font-bold uppercase">{act.status || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* C.5 R&D Project Funding Received */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">5. Funded Research Projects / Consultancy</h3>
                  {partC_Funding.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Project Title</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Funding Agency</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">PI Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Grant Amount (₹)</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partC_Funding.map((act) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 font-bold">{act.projectTitle || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.fundingAgency || "-"}</td>
                            <td className="border border-zinc-400 p-2 font-bold">{act.piName || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-right font-bold text-emerald-700">₹{parseFloat(act.grantAmount || 0).toLocaleString("en-IN")}</td>
                            <td className="border border-zinc-400 p-2 text-center font-bold uppercase">{act.status || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* PHOTO GALLERY AT THE END */}
              {allReportImages.length > 0 && (
                <div className="pt-8 border-t border-zinc-300">
                  <h2 className="text-sm font-bold text-center uppercase tracking-widest text-zinc-600 mb-4">
                    PHOTO GALLERY FOR THE DEPARTMENTS EVENTS & INVOLVEMENTS
                  </h2>
                  <div className="grid grid-cols-2 gap-6 justify-center">
                    {allReportImages.map((img, i) => (
                      <div key={i} className="flex flex-col items-center justify-center p-3 bg-zinc-50 border border-zinc-200 rounded-2xl page-break-inside-avoid">
                        <img 
                          src={img.url} 
                          alt={img.title} 
                          className="max-w-full max-h-48 object-contain rounded-lg shadow-sm"
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-[10px] font-bold text-zinc-500 text-center mt-2 uppercase tracking-wide">
                          {img.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Signatures footer */}
              <div className="pt-12 grid grid-cols-3 text-center text-xs font-bold font-serif gap-4 mt-8 page-break-inside-avoid">
                <div>
                  <p className="mt-8 border-t border-zinc-400 pt-2 mx-6">Prepared & Verified By</p>
                  <p className="text-[9px] text-zinc-500 font-sans mt-0.5">Faculty Coordinator</p>
                </div>
                <div>
                  <p className="mt-8 border-t border-zinc-400 pt-2 mx-6">Head of the Department</p>
                  <p className="text-[9px] text-zinc-500 font-sans mt-0.5">HOD ({reportStatusDoc?.submittedByName || "Signed"})</p>
                </div>
                <div>
                  <p className="mt-8 border-t border-zinc-400 pt-2 mx-6">Principal</p>
                  <p className="text-[9px] text-zinc-500 font-sans mt-0.5">
                    {reportStatusDoc?.status === "Approved" ? "Approved & Signed" : "CKCET"}
                  </p>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* View Detail Modal */}
      {reviewActivity && (
        <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200 text-zinc-800">
            <div className="bg-[#120c7a] p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Award className="text-yellow-400" size={24} />
                <div>
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-blue-200">
                    Approved Activity Details
                  </h4>
                  <p className="text-base font-bold truncate mt-0.5">
                    {reviewActivity.studentName || reviewActivity.facultyName} 
                    ({reviewActivity.regNo || reviewActivity.facultyId || "N/A"})
                  </p>
                </div>
              </div>
              <button onClick={() => setReviewActivity(null)} className="p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Fields */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Activity Code</span>
                  <span className="text-sm font-extrabold text-zinc-800">{reviewActivity.activityCode || "STEP"}</span>
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
                  <span className="text-sm font-extrabold text-[#120c7a]">{reviewActivity.points || reviewActivity.totalPoints || "-"} Pts</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Department / Batch / Section</span>
                  <span className="text-sm font-bold text-zinc-800">{reviewActivity.department} / {reviewActivity.batch} / {reviewActivity.section || "Sec-A"}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">NBA / NAAC Mapping</span>
                  <span className="text-xs font-semibold text-zinc-700">
                    {reviewActivity.nbaCriterion ? `NBA: ${reviewActivity.nbaCriterion}` : ""} 
                    {reviewActivity.naacCriterion ? ` | NAAC: ${reviewActivity.naacCriterion}` : ""}
                  </span>
                </div>
              </div>

              {/* Additional fields */}
              <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-100 space-y-4 text-xs">
                {Object.entries(reviewActivity).filter(([k, v]) => 
                  v && !["id", "status", "createdAt", "updatedAt", "activityCode", "activityName", "title", "studentName", "facultyName", "regNo", "facultyId", "department", "batch", "section", "date", "fromDate", "points", "totalPoints", "evidenceUrl", "comments", "reviewedBy", "reviewedByName", "submittedById", "submittedByRole", "isStep"].includes(k)
                ).map(([key, value]) => {
                  if (key === "formData") {
                    if (Array.isArray(value) && value.length > 0) {
                      const basicInfoKeys = new Set(["programme", "department", "batch", "academicYear", "semester", "section", "date", "submittedBy", "month"]);
                      const headers = Object.keys(value[0]).filter(hk => !basicInfoKeys.has(hk));
                      return (
                        <div key={key} className="space-y-2 w-full">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                            Activity Record List
                          </span>
                          <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="bg-zinc-50 border-b border-zinc-200">
                                  {headers.map(h => (
                                    <th key={h} className="px-3 py-2 text-[9px] font-bold text-zinc-400 uppercase">
                                      {h.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100">
                                {value.map((row, rIdx) => (
                                  <tr key={rIdx} className="hover:bg-zinc-50/50">
                                    {headers.map(h => (
                                      <td key={h} className="px-3 py-2 text-zinc-700 font-medium">
                                        {row[h] || "—"}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }

                  if (key === "evidenceFiles") {
                    if (Array.isArray(value) && value.length > 0) {
                      return (
                        <div key={key} className="space-y-1.5 w-full">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                            Attached Files Info
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {value.map((file, fIdx) => (
                              <div key={fIdx} className="flex items-center gap-1.5 bg-white border border-zinc-200 rounded-lg text-[10px] font-medium text-zinc-600 shadow-sm">
                                <FileText size={12} className="text-blue-500" />
                                <span>{file.name}</span>
                                <span className="text-[9px] text-zinc-400">({(file.size / 1024).toFixed(1)} KB)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }

                  if (["submittedBy", "month", "academicYear", "semester", "programme"].includes(key)) {
                    return null;
                  }

                  return (
                    <div key={key} className="flex gap-4">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider w-40 shrink-0">
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                      </span>
                      <span className="text-zinc-700 font-medium">
                        {typeof value === 'object' ? JSON.stringify(value) : value}
                      </span>
                    </div>
                  );
                })}
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

              {reviewActivity.comments && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block mb-1">Approval Verification Info:</span>
                  <p className="text-sm text-emerald-700">{reviewActivity.comments}</p>
                  {reviewActivity.reviewedByName && (
                    <p className="text-[10px] text-emerald-600 font-bold mt-1">Verified By: {reviewActivity.reviewedByName}</p>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex justify-end">
              <button onClick={() => setReviewActivity(null)} className="px-5 py-2 bg-[#120c7a] text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
