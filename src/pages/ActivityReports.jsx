import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, doc, getDoc, where } from "firebase/firestore";
import { 
  FileText, Download, Filter, Loader2, Calendar, BarChart3, 
  Users, Award, Pencil, Printer, X, Eye, CheckCircle2 
} from "lucide-react";
import Layout from "../components/Layout";
import { ACTIVITY_REGISTRY, ACTIVITY_CATEGORIES } from "../data/activityRegistry";
import { sanitizeKey } from "../lib/utils";

const getCategoryFromCode = (code) => {
  if (code.startsWith("A")) return "student";
  if (code.startsWith("B")) return "department";
  if (code.startsWith("C")) return "faculty";
  return "student";
};

export default function ActivityReports() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [currentUserData, setCurrentUserData] = useState(null);
  
  // Filters
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedDept, setSelectedDept] = useState("");

  // Tabs and monthly reports approved list
  const [activeTab, setActiveTab] = useState("monthly"); // "monthly" or "individual"
  const [approvedReports, setApprovedReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  // Views
  const [previewMode, setPreviewMode] = useState(false);
  const [detailActivity, setDetailActivity] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        getDoc(doc(db, "users", user.uid)).then(snap => {
          if (snap.exists()) {
            const ud = snap.data();
            setCurrentUserData(ud);
            const dept = ud.department || ud.assignedDepartment || ud.departmentName || ud.dept || ud.deptName || ud.facultyDepartment || ud.departmentCode || "";
            if (ud.role === "HOD" && dept) {
              setSelectedDept(dept);
            }
          }
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "monthly_reports"),
      where("status", "==", "Approved")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setApprovedReports(list);
      setReportsLoading(false);
    }, (err) => {
      console.error("Error loading approved reports:", err);
      setReportsLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredReports = useMemo(() => {
    const userRole = currentUserData?.role || "";
    const userDept = currentUserData?.department || currentUserData?.assignedDepartment || currentUserData?.departmentName || currentUserData?.dept || currentUserData?.deptName || currentUserData?.facultyDepartment || currentUserData?.departmentCode || "";
    
    return approvedReports.filter(rep => {
      if (userRole === "HOD" && userDept && rep.department !== userDept) return false;
      if (selectedDept && rep.department !== selectedDept) return false;
      if (selectedMonth && parseInt(rep.month) !== parseInt(selectedMonth)) return false;
      if (selectedYear && rep.year !== selectedYear) return false;
      return true;
    });
  }, [approvedReports, currentUserData, selectedDept, selectedMonth, selectedYear]);

  const [reportStatusDoc, setReportStatusDoc] = useState(null);

  useEffect(() => {
    if (!selectedDept || !selectedMonth || !selectedYear || !previewMode) {
      setReportStatusDoc(null);
      return;
    }
    const reportId = `report_${sanitizeKey(selectedDept)}_${selectedMonth}_${selectedYear}`;
    getDoc(doc(db, "monthly_reports", reportId)).then(snap => {
      if (snap.exists()) {
        setReportStatusDoc(snap.data());
      } else {
        setReportStatusDoc(null);
      }
    });
  }, [selectedDept, selectedMonth, selectedYear, previewMode]);

  useEffect(() => {
    let list1 = [];
    let list2 = [];

    const q1 = query(
      collection(db, "activity_entries"),
      orderBy("createdAt", "desc")
    );
    const unsub1 = onSnapshot(q1, (snapshot) => {
      list1 = [];
      snapshot.forEach((d) => {
        list1.push({ id: d.id, ...d.data() });
      });
      const combined = [...list1, ...list2].sort((a, b) => {
        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
      setActivities(combined);
    }, (err) => console.error("Error loading activity_entries:", err));

    const q2 = query(
      collection(db, "step_activities"),
      orderBy("createdAt", "desc")
    );
    const unsub2 = onSnapshot(q2, (snapshot) => {
      list2 = [];
      snapshot.forEach((d) => {
        const data = d.data();
        let nba = "";
        let naac = "";
        if (data.category === "technical") { nba = "C2.2.3"; naac = "3.2.2"; }
        else if (data.category === "research") { nba = "C3.4"; naac = "3.3.3"; }
        else if (data.category === "industry") { nba = "C2.8"; naac = "3.2.1"; }
        else if (data.category === "social") { nba = "C9.11"; naac = "7.1.1"; }
        else if (data.category === "leadership") { nba = "C9.7"; naac = "5.3.1"; }
        else { nba = "C9.2"; naac = "5.1.2"; }

        list2.push({ 
          id: d.id, 
          isStep: true, 
          activityCode: "STEP", 
          activityName: data.activityName || data.activityType || "STEP Activity", 
          nbaCriterion: nba,
          naacCriterion: naac,
          ...data 
        });
      });
      const combined = [...list1, ...list2].sort((a, b) => {
        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
      setActivities(combined);
    }, (err) => console.error("Error loading step_activities:", err));

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Derive dropdown options dynamically
  const deptOptions = useMemo(() => {
    return [...new Set(activities.map(a => a.department).filter(Boolean))].sort();
  }, [activities]);

  const filteredActivities = useMemo(() => {
    return activities.filter(a => {
      if (selectedCategory !== "all" && getCategoryFromCode(a.activityCode || "") !== selectedCategory) return false;
      if (selectedStatus !== "all" && a.status !== selectedStatus) return false;
      if (selectedDept && a.department !== selectedDept) return false;
      
      if (selectedMonth) {
        const date = a.date || a.fromDate || "";
        const m = date.split("-")[1];
        if (m && parseInt(m) !== parseInt(selectedMonth)) return false;
      }
      if (selectedYear) {
        const date = a.date || a.fromDate || "";
        const y = date.split("-")[0];
        if (y && y !== selectedYear) return false;
      }
      return true;
    });
  }, [activities, selectedCategory, selectedMonth, selectedYear, selectedStatus, selectedDept]);

  const stats = useMemo(() => {
    const total = filteredActivities.length;
    const approved = filteredActivities.filter(a => a.status === "Approved").length;
    const pending = filteredActivities.filter(a => a.status === "Pending" || a.status === "HOD_Pending").length;
    const rejected = filteredActivities.filter(a => a.status === "Rejected").length;
    return { total, approved, pending, rejected };
  }, [filteredActivities]);

  const handleCSVExport = () => {
    const headers = ["ID", "Activity Code", "Activity Name", "Category", "Status", "Submitted By", "Department", "Date", "NBA Criterion", "NAAC Criterion"];
    const rows = filteredActivities.map(a => {
      const reg = ACTIVITY_REGISTRY.find(r => r.code === a.activityCode);
      return [
        a.id, a.activityCode, a.activityName || "",
        ACTIVITY_CATEGORIES[getCategoryFromCode(a.activityCode || "")]?.label || "",
        a.status, a.facultyName || a.studentName || "", a.department || "",
        a.date || a.fromDate || "", reg?.nbaCriterion || a.nbaCriterion || "", reg?.naacCriterion || a.naacCriterion || ""
      ];
    });
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Activity_Report_${selectedYear}${selectedMonth ? "_" + selectedMonth : ""}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to extract image evidence URLs
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

  // Group verified activities strictly for the monthly report preview
  const reportActivities = useMemo(() => {
    return activities.filter(a => {
      // Must be approved HOD / Admin verified
      if (a.status !== "Approved") return false;
      
      // Strict department matching
      if (selectedDept && a.department !== selectedDept) return false;
      
      // Date verification
      const dateVal = a.date || a.fromDate || "";
      if (selectedMonth && dateVal) {
        const m = dateVal.split("-")[1];
        if (m && parseInt(m) !== parseInt(selectedMonth)) return false;
      } else {
        return false; // Month filter is required for report generation
      }
      
      if (selectedYear && dateVal) {
        const y = dateVal.split("-")[0];
        if (y && y !== selectedYear) return false;
      }
      return true;
    });
  }, [activities, selectedDept, selectedMonth, selectedYear]);

  // Section Filters for Monthly Report
  const partA_GuestLectures = useMemo(() => reportActivities.filter(a => a.activityCode === "B9" || (a.isStep && a.category === "industry")), [reportActivities]);
  const partA_Association = useMemo(() => reportActivities.filter(a => a.isStep && a.category === "leadership"), [reportActivities]);
  const partA_Internships = useMemo(() => reportActivities.filter(a => a.isStep && (a.category === "industry" || (a.activityName || "").toLowerCase().includes("internship"))), [reportActivities]);
  const partA_OnlineCourses = useMemo(() => reportActivities.filter(a => a.isStep && a.category === "onlineCourse"), [reportActivities]);
  const partA_PaperPresentations = useMemo(() => reportActivities.filter(a => a.isStep && (a.category === "research" && ((a.activityName || "").toLowerCase().includes("present") || (a.activityType || "").toLowerCase().includes("present")))), [reportActivities]);
  const partA_Publications = useMemo(() => reportActivities.filter(a => a.isStep && (a.category === "research" && ((a.activityName || "").toLowerCase().includes("publ") || (a.activityType || "").toLowerCase().includes("publ")))), [reportActivities]);
  const partA_Conferences = useMemo(() => reportActivities.filter(a => a.isStep && a.category === "technical"), [reportActivities]);
  const partA_ExtraCurricular = useMemo(() => reportActivities.filter(a => a.isStep && (a.category === "sports" || a.category === "social")), [reportActivities]);
  const partA_Placements = useMemo(() => reportActivities.filter(a => a.isStep && a.category === "placement"), [reportActivities]);

  const partB_Meetings = useMemo(() => reportActivities.filter(a => a.activityCode === "B1"), [reportActivities]);
  const partB_Advisory = useMemo(() => reportActivities.filter(a => a.activityCode === "B2"), [reportActivities]);
  const partB_Purchases = useMemo(() => reportActivities.filter(a => a.activityCode === "B3"), [reportActivities]);
  const partB_Mous = useMemo(() => reportActivities.filter(a => a.activityCode === "B4"), [reportActivities]);
  const partB_Parents = useMemo(() => reportActivities.filter(a => a.activityCode === "B5"), [reportActivities]);
  const partB_Audits = useMemo(() => reportActivities.filter(a => a.activityCode === "B7"), [reportActivities]);
  const partB_Newsletters = useMemo(() => reportActivities.filter(a => a.activityCode === "B8"), [reportActivities]);

  const partC_Phd = useMemo(() => reportActivities.filter(a => a.activityCode === "C1"), [reportActivities]);
  const partC_Publications = useMemo(() => reportActivities.filter(a => a.activityCode === "C2"), [reportActivities]);
  const partC_Attended = useMemo(() => reportActivities.filter(a => a.activityCode === "C3"), [reportActivities]);
  const partC_Organized = useMemo(() => reportActivities.filter(a => a.activityCode === "C4"), [reportActivities]);
  const partC_Online = useMemo(() => reportActivities.filter(a => a.activityCode === "C5"), [reportActivities]);
  const partC_Funding = useMemo(() => reportActivities.filter(a => a.activityCode === "C6"), [reportActivities]);
  const partC_Patents = useMemo(() => reportActivities.filter(a => a.activityCode === "C7"), [reportActivities]);
  const partC_Contributions = useMemo(() => reportActivities.filter(a => a.activityCode === "C8"), [reportActivities]);
  const partC_Achievements = useMemo(() => reportActivities.filter(a => a.activityCode === "C9"), [reportActivities]);

  // All extracted report images
  const allReportImages = useMemo(() => {
    const imagesList = [];
    reportActivities.forEach(act => {
      const imgs = getImages(act);
      imgs.forEach(i => imagesList.push(i));
    });
    return imagesList;
  }, [reportActivities]);

  return (
    <Layout title="Activity Reports">
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

      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Toggle between standard view and Monthly Report Document Preview */}
        {!previewMode ? (
          <>
            {/* Standard Header */}
            <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 rounded-2xl p-6 text-white flex justify-between items-center">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <BarChart3 size={24} />
                  <h1 className="text-xl font-black">Activity Reports</h1>
                </div>
                <p className="text-sm text-blue-200">Monthly & criterion-wise activity report generation</p>
              </div>
              {selectedMonth && selectedDept && (
                <button
                  onClick={() => setPreviewMode(true)}
                  className="px-5 py-2.5 bg-white text-[#120c7a] rounded-xl text-xs font-black shadow-lg hover:bg-zinc-50 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} /> Document Preview
                </button>
              )}
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-2 border-b border-zinc-200 pb-px no-print">
              <button
                onClick={() => {
                  setActiveTab("monthly");
                  setPreviewMode(false);
                }}
                className={`pb-2.5 px-4 text-xs font-black border-b-2 transition-all cursor-pointer ${
                  activeTab === "monthly"
                    ? "border-[#120c7a] text-[#120c7a]"
                    : "border-transparent text-zinc-400 hover:text-zinc-600"
                }`}
              >
                Approved Monthly Reports
              </button>
              <button
                onClick={() => {
                  setActiveTab("individual");
                  setPreviewMode(false);
                }}
                className={`pb-2.5 px-4 text-xs font-black border-b-2 transition-all cursor-pointer ${
                  activeTab === "individual"
                    ? "border-[#120c7a] text-[#120c7a]"
                    : "border-transparent text-zinc-400 hover:text-zinc-600"
                }`}
              >
                Individual Activity Submissions
              </button>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl p-4 border border-zinc-200 flex flex-wrap gap-3 items-end no-print">
              {activeTab === "individual" && (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Category</label>
                    <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
                      className="border border-zinc-300 rounded-lg px-3 py-2 text-xs font-semibold bg-white">
                      <option value="all">All Categories</option>
                      {Object.entries(ACTIVITY_CATEGORIES).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Status</label>
                    <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
                      className="border border-zinc-300 rounded-lg px-3 py-2 text-xs font-semibold bg-white">
                      <option value="all">All Status</option>
                      <option value="Pending">Pending</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Returned">Returned</option>
                      <option value="Draft">Draft</option>
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Department</label>
                <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}
                  disabled={currentUserData?.role === "HOD" && selectedDept}
                  className="border border-zinc-300 rounded-lg px-3 py-2 text-xs font-semibold bg-white">
                  <option value="">All Departments</option>
                  {deptOptions.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Month</label>
                <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                  className="border border-zinc-300 rounded-lg px-3 py-2 text-xs font-semibold bg-white">
                  <option value="">All Months</option>
                  {months.map((m, i) => (
                    <option key={i} value={i+1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Year</label>
                <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
                  className="border border-zinc-300 rounded-lg px-3 py-2 text-xs font-semibold bg-white">
                  {[2024, 2025, 2026, 2027, 2028].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              {activeTab === "individual" && (
                <button onClick={handleCSVExport}
                  className="bg-[#120c7a] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#120c7a]/90 flex items-center gap-2 cursor-pointer">
                  <Download size={14} /> Export CSV
                </button>
              )}
            </div>

            {activeTab === "monthly" ? (
              /* Approved Monthly Reports List View */
              <div className="bg-white rounded-2xl border border-zinc-200 overflow-x-auto">
                <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-zinc-800">Approved Institution Monthly Reports</h3>
                    <p className="text-[11px] text-zinc-400 font-medium">Select a monthly report document below to open the finalized preview & print view.</p>
                  </div>
                </div>
                
                {reportsLoading ? (
                  <div className="p-16 text-center">
                    <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={32} />
                    <p className="text-xs font-semibold text-zinc-600">Loading approved monthly reports repository...</p>
                  </div>
                ) : filteredReports.length === 0 ? (
                  <div className="p-16 text-center text-zinc-400">
                    <FileText size={36} className="mx-auto text-zinc-300 mb-3" />
                    <p className="text-xs font-semibold text-zinc-500">No approved monthly report documents found.</p>
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-left">
                        <th className="p-3 font-bold text-zinc-600">S.No</th>
                        <th className="p-3 font-bold text-zinc-600">Department</th>
                        <th className="p-3 font-bold text-zinc-600">Report Month / Year</th>
                        <th className="p-3 font-bold text-zinc-600">Status</th>
                        <th className="p-3 font-bold text-zinc-600">Forwarded By</th>
                        <th className="p-3 font-bold text-zinc-600 text-center">Approved At</th>
                        <th className="p-3 font-bold text-zinc-600 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReports.map((rep, idx) => (
                        <tr key={rep.id} className="border-b border-zinc-100 hover:bg-zinc-50 font-medium">
                          <td className="p-3 font-mono text-zinc-400">{idx + 1}</td>
                          <td className="p-3 font-bold text-zinc-800">Department of {rep.department}</td>
                          <td className="p-3 font-semibold text-zinc-700">{rep.monthName} {rep.year}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-100 text-emerald-800">
                              Approved
                            </span>
                          </td>
                          <td className="p-3 text-zinc-500">{rep.submittedByName || "HOD"}</td>
                          <td className="p-3 text-center text-zinc-500">{rep.approvedAt ? new Date(rep.approvedAt).toLocaleDateString() : "-"}</td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => {
                                setSelectedMonth(rep.month);
                                setSelectedYear(rep.year);
                                setSelectedDept(rep.department);
                                setPreviewMode(true);
                              }}
                              className="px-3.5 py-1.5 bg-[#120c7a] text-white rounded-lg text-[10px] font-extrabold transition-all cursor-pointer hover:bg-blue-900 inline-flex items-center gap-1"
                            >
                              <Eye size={11} /> Open Document
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Total Activities", value: stats.total, icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
                    { label: "Approved", value: stats.approved, icon: Award, color: "text-emerald-600", bg: "bg-emerald-50" },
                    { label: "Pending Review", value: stats.pending, icon: Loader2, color: "text-amber-600", bg: "bg-amber-50" },
                    { label: "Rejected", value: stats.rejected, icon: FileText, color: "text-rose-600", bg: "bg-rose-50" },
                  ].map((s, i) => (
                    <div key={i} className={`${s.bg} rounded-xl p-4 border border-zinc-100`}>
                      <div className="flex items-center gap-2 mb-1">
                        {s.label === "Pending Review" ? (
                          <s.icon size={16} className={`${s.color} ${s.value > 0 ? "animate-spin" : ""}`} />
                        ) : (
                          <s.icon size={16} className={s.color} />
                        )}
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${s.color}`}>{s.label}</span>
                      </div>
                      <span className="text-2xl font-black text-zinc-800">{s.value}</span>
                    </div>
                  ))}
                </div>

                {/* List Table */}
                <div className="bg-white rounded-2xl border border-zinc-200 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200">
                        <th className="text-left p-3 font-bold text-zinc-600">S.No</th>
                        <th className="text-left p-3 font-bold text-zinc-600">Activity Code</th>
                        <th className="text-left p-3 font-bold text-zinc-600">Activity Name</th>
                        <th className="text-left p-3 font-bold text-zinc-600">Category</th>
                        <th className="text-left p-3 font-bold text-zinc-600">Status</th>
                        <th className="text-left p-3 font-bold text-zinc-600">Submitted By</th>
                        <th className="text-left p-3 font-bold text-zinc-600">Department</th>
                        <th className="text-left p-3 font-bold text-zinc-600">Date</th>
                        <th className="text-center p-3 font-bold text-zinc-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredActivities.length === 0 ? (
                        <tr><td colSpan={9} className="p-6 text-center text-zinc-400 font-semibold">No activities found for selected filters.</td></tr>
                      ) : filteredActivities.map((a, i) => (
                        <tr key={a.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td className="p-3 font-mono text-zinc-400">{i+1}</td>
                          <td className="p-3 font-bold text-[#120c7a]">{a.activityCode}</td>
                          <td className="p-3 font-semibold text-zinc-800">{a.activityName || a.title || "-"}</td>
                          <td className="p-3">{ACTIVITY_CATEGORIES[getCategoryFromCode(a.activityCode || "")]?.label || "-"}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              a.status === "Approved" ? "bg-emerald-100 text-emerald-700" :
                              a.status === "Pending" || a.status === "HOD_Pending" ? "bg-amber-100 text-amber-700" :
                              a.status === "Rejected" ? "bg-rose-100 text-rose-700" :
                              a.status === "Returned" ? "bg-orange-100 text-orange-700" :
                              "bg-zinc-100 text-zinc-600"
                            }`}>{a.status || "Draft"}</span>
                          </td>
                          <td className="p-3">{a.facultyName || a.studentName || "-"}</td>
                          <td className="p-3">{a.department || "-"}</td>
                          <td className="p-3 text-zinc-500">{a.date || a.fromDate || "-"}</td>
                          <td className="p-3 text-center flex justify-center gap-1.5 font-bold">
                            <button
                              onClick={() => setDetailActivity(a)}
                              className="px-2 py-1 bg-zinc-100 text-zinc-700 rounded text-[10px] font-bold hover:bg-zinc-200 transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={12} /> View
                            </button>
                            {a.status === "Draft" && (
                              <button onClick={() => {
                                if (a.isStep) {
                                  navigate(`/step-activities/edit/${a.id}`);
                                } else {
                                  navigate(`/activities/${a.activityCode}/edit/${a.id}`);
                                }
                              }}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold hover:bg-indigo-100 transition-all cursor-pointer">
                                <Pencil size={12} /> Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        ) : (
          /* Document Report Preview Mode */
          <div className="space-y-6">
            
            {/* Action Bar */}
            <div className="bg-white p-4 border border-zinc-200 rounded-2xl flex justify-between items-center no-print">
              <button
                onClick={() => setPreviewMode(false)}
                className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <X size={14} /> Back to List
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 bg-[#120c7a] text-white rounded-xl text-xs font-black shadow-md hover:bg-[#0f0a66] transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Printer size={15} /> Download PDF
              </button>
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

                {/* B.2 Department Advisory Board Meetings */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">2. Department Advisory Board Meetings</h3>
                  {partB_Advisory.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Meeting No</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">External Members</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Agenda</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Suggestions / Decisions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partB_Advisory.map((act) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 text-center font-mono">{act.meetingNo || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.date || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.externalMembers || act.members || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.agenda || "-"}</td>
                            <td className="border border-zinc-400 p-2 font-semibold text-indigo-700">{act.suggestions || act.decisions || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* B.3 Laboratory Equipment Purchased / Maintenance */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">3. Equipment Purchased / Service & Maintenance</h3>
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
                            <td className="border border-zinc-400 p-2">{act.vendorName || act.vendor || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center uppercase font-black">{act.status || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* B.4 Parents Teacher Meet Conducted */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">4. Parent-Teacher Meetings</h3>
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

                {/* B.5 MoUs Signed */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">5. MoUs / Collaborations Signed</h3>
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
                            <td className="border border-zinc-400 p-2 font-bold">{act.organisationName || act.orgName || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center font-bold text-blue-700">{act.type || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.level || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.dateSigned || act.date || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.keyActivities || act.activitiesPlan || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* B.6 Academic Audits Conducted */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">6. Academic Audits Conducted</h3>
                  {partB_Audits.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Audit Type</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">External Auditor</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Observations/Action Taken</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partB_Audits.map((act) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 font-bold">{act.auditType || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.date || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.auditorName || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.observations || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* B.7 Newsletters Published */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">7. Newsletters Published</h3>
                  {partB_Newsletters.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Newsletter Title</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Volume / Issue</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date of Release</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partB_Newsletters.map((act) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 font-bold">{act.title || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.volumeIssue || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.date || "-"}</td>
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

                {/* C.6 Patents Filed / Published / Granted by Faculty */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">6. Patents Filed / Published / Granted by Faculty</h3>
                  {partC_Patents.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">S.No</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Inventors</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Patent Title</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Application No</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Filing Date</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Type</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partC_Patents.map((act, index) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 text-center">{index + 1}</td>
                            <td className="border border-zinc-400 p-2 font-bold">{act.inventors || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.patentTitle || act.title || "-"}</td>
                            <td className="border border-zinc-400 p-2 font-mono">{act.applicationNo || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.filingDate || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.type || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center font-bold uppercase">{act.status || "Published"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* C.7 Faculty External Contributions */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">7. Faculty External Contributions (Guest Lectures, BoS, Examiner, etc.)</h3>
                  {partC_Contributions.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">S.No</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Faculty Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Role / Title</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Host Institution</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partC_Contributions.map((act, index) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 text-center">{index + 1}</td>
                            <td className="border border-zinc-400 p-2 font-bold">{act.facultyName || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.title || act.role || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.hostInstitution || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.date || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.duration || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* C.8 Faculty Achievements / Awards / Recognitions */}
                <div>
                  <h3 className="text-xs font-bold mb-2 uppercase">8. Faculty Achievements / Awards / Recognitions</h3>
                  {partC_Achievements.length === 0 ? (
                    <p className="text-xs italic text-zinc-500 pl-4">Nil</p>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse border border-zinc-400">
                      <thead>
                        <tr className="bg-zinc-50 border border-zinc-400">
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">S.No</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Faculty Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Award / Recognition Name</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Awarding Body</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Date</th>
                          <th className="border border-zinc-400 p-2 text-[10px] font-bold">Level</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partC_Achievements.map((act, index) => (
                          <tr key={act.id}>
                            <td className="border border-zinc-400 p-2 text-center">{index + 1}</td>
                            <td className="border border-zinc-400 p-2 font-bold">{act.facultyName || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.awardName || act.title || "-"}</td>
                            <td className="border border-zinc-400 p-2">{act.awardingBody || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center">{act.date || "-"}</td>
                            <td className="border border-zinc-400 p-2 text-center font-bold uppercase">{act.level || "National"}</td>
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

      {/* Detail Viewer Modal */}
      {detailActivity && (
        <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-zinc-100 animate-in zoom-in-95 duration-200 text-zinc-800">
            <div className="bg-[#120c7a] p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Award className="text-yellow-400" size={24} />
                <div>
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-blue-200">
                    Activity Details Log
                  </h4>
                  <p className="text-base font-bold truncate mt-0.5">
                    {detailActivity.studentName || detailActivity.facultyName} 
                    ({detailActivity.regNo || detailActivity.facultyId || "N/A"})
                  </p>
                </div>
              </div>
              <button onClick={() => setDetailActivity(null)} className="p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Fields */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Activity Code</span>
                  <span className="text-sm font-extrabold text-zinc-800">{detailActivity.activityCode || "STEP"}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Activity Name</span>
                  <span className="text-sm font-extrabold text-zinc-800">{detailActivity.activityName || detailActivity.title}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Date</span>
                  <span className="text-sm font-bold text-zinc-700">{detailActivity.date || detailActivity.fromDate}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Points Claimed</span>
                  <span className="text-sm font-extrabold text-[#120c7a]">{detailActivity.points || detailActivity.totalPoints || "-"} Pts</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Department / Batch / Section</span>
                  <span className="text-sm font-bold text-zinc-800">{detailActivity.department} / {detailActivity.batch} / {detailActivity.section || "Sec-A"}</span>
                </div>
                <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 col-span-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">NBA / NAAC Mapping</span>
                  <span className="text-xs font-semibold text-zinc-700">
                    {detailActivity.nbaCriterion ? `NBA: ${detailActivity.nbaCriterion}` : ""} 
                    {detailActivity.naacCriterion ? ` | NAAC: ${detailActivity.naacCriterion}` : ""}
                  </span>
                </div>
              </div>

              {/* Additional fields */}
              <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-100 space-y-4 text-xs">
                {Object.entries(detailActivity).filter(([k, v]) => 
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
              {detailActivity.evidenceUrl && (
                <div>
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Uploaded Evidence</span>
                  <div className="border border-zinc-200 bg-zinc-50 rounded-2xl p-2 flex items-center justify-center min-h-60 overflow-hidden shadow-inner">
                    {detailActivity.evidenceUrl.endsWith('.pdf') ? (
                      <iframe src={detailActivity.evidenceUrl} className="w-full h-96 rounded-xl" title="Evidence PDF" />
                    ) : (
                      <img src={detailActivity.evidenceUrl} alt="Evidence" className="max-w-full max-h-96 object-contain rounded-xl shadow-md" referrerPolicy="no-referrer" />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex justify-end">
              <button onClick={() => setDetailActivity(null)} className="px-5 py-2 bg-[#120c7a] text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
