import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { FileText, Download, Filter, Loader2, Calendar, BarChart3, Users, Award } from "lucide-react";
import Layout from "../components/Layout";
import { ACTIVITY_REGISTRY, ACTIVITY_CATEGORIES } from "../data/activityRegistry";

const getCategoryFromCode = (code) => {
  if (code.startsWith("A")) return "student";
  if (code.startsWith("B")) return "department";
  if (code.startsWith("C")) return "faculty";
  return "student";
};

export default function ActivityReports() {
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedStatus, setSelectedStatus] = useState("all");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { setLoading(false); return; }
      setLoading(false);
    });
    return () => unsub();
  }, []);

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
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  const filteredActivities = useMemo(() => {
    return activities.filter(a => {
      if (selectedCategory !== "all" && getCategoryFromCode(a.activityCode || "") !== selectedCategory) return false;
      if (selectedStatus !== "all" && a.status !== selectedStatus) return false;
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
  }, [activities, selectedCategory, selectedMonth, selectedYear, selectedStatus]);

  const stats = useMemo(() => {
    const total = filteredActivities.length;
    const approved = filteredActivities.filter(a => a.status === "Approved").length;
    const pending = filteredActivities.filter(a => a.status === "Pending").length;
    const rejected = filteredActivities.filter(a => a.status === "Rejected").length;
    return { total, approved, pending, rejected };
  }, [filteredActivities]);

  const handleCSVExport = () => {
    const headers = ["ID","Activity Code","Activity Name","Category","Status","Submitted By","Department","Date","NBA Criterion","NAAC Criterion"];
    const rows = filteredActivities.map(a => {
      const reg = ACTIVITY_REGISTRY.find(r => r.code === a.activityCode);
      return [
        a.id, a.activityCode, a.activityName || "",
        ACTIVITY_CATEGORIES[getCategoryFromCode(a.activityCode || "")]?.label || "",
        a.status, a.facultyName || a.studentName || "", a.department || "",
        a.date || a.fromDate || "", reg?.nbaCriterion || "", reg?.naacCriterion || ""
      ];
    });
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Activity_Report_${selectedYear}${selectedMonth ? "_"+selectedMonth : ""}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Layout title="Activity Reports">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 size={24} />
            <h1 className="text-xl font-black">Activity Reports</h1>
          </div>
          <p className="text-sm text-blue-200">Monthly & criterion-wise activity report generation</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-4 border border-zinc-200 flex flex-wrap gap-3 items-end">
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
              {[2024,2025,2026,2027,2028].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button onClick={handleCSVExport}
            className="bg-[#120c7a] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#120c7a]/90 flex items-center gap-2">
            <Download size={14} /> Export CSV
          </button>
        </div>

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
                <s.icon size={16} className={s.color} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${s.color}`}>{s.label}</span>
              </div>
              <span className="text-2xl font-black text-zinc-800">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Table */}
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
              </tr>
            </thead>
            <tbody>
              {filteredActivities.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-zinc-400 font-semibold">No activities found for selected filters.</td></tr>
              ) : filteredActivities.map((a, i) => (
                <tr key={a.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="p-3 font-mono text-zinc-400">{i+1}</td>
                  <td className="p-3 font-bold text-[#120c7a]">{a.activityCode}</td>
                  <td className="p-3 font-semibold text-zinc-800">{a.activityName || a.title || "-"}</td>
                  <td className="p-3">{ACTIVITY_CATEGORIES[getCategoryFromCode(a.activityCode || "")]?.label || "-"}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      a.status === "Approved" ? "bg-emerald-100 text-emerald-700" :
                      a.status === "Pending" ? "bg-amber-100 text-amber-700" :
                      a.status === "Rejected" ? "bg-rose-100 text-rose-700" :
                      a.status === "Returned" ? "bg-orange-100 text-orange-700" :
                      "bg-zinc-100 text-zinc-600"
                    }`}>{a.status || "Draft"}</span>
                  </td>
                  <td className="p-3">{a.facultyName || a.studentName || "-"}</td>
                  <td className="p-3">{a.department || "-"}</td>
                  <td className="p-3 text-zinc-500">{a.date || a.fromDate || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
