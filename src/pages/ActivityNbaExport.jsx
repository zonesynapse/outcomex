import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query } from "firebase/firestore";
import { Download, Filter, Loader2, Globe, FileText, Award } from "lucide-react";
import Layout from "../components/Layout";
import { ACTIVITY_REGISTRY, ACTIVITY_CATEGORIES } from "../data/activityRegistry";

const getCategoryFromCode = (code) => {
  if (code.startsWith("A")) return "student";
  if (code.startsWith("B")) return "department";
  if (code.startsWith("C")) return "faculty";
  return "student";
};

export default function ActivityNbaExport() {
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

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

    const getMillis = (dateObj) => {
      if (!dateObj) return 0;
      if (typeof dateObj.toMillis === 'function') return dateObj.toMillis();
      if (typeof dateObj.toDate === 'function') return dateObj.toDate().getTime();
      if (dateObj.seconds) return dateObj.seconds * 1000;
      const parsed = Date.parse(dateObj);
      return isNaN(parsed) ? 0 : parsed;
    };

    const q1 = query(
      collection(db, "activity_entries")
    );
    const unsub1 = onSnapshot(q1, (snapshot) => {
      list1 = [];
      snapshot.forEach((d) => {
        list1.push({ id: d.id, ...d.data() });
      });
      const combined = [...list1, ...list2].sort((a, b) => {
        return getMillis(b.createdAt) - getMillis(a.createdAt);
      });
      setActivities(combined);
    }, (err) => console.error("Error loading activity_entries:", err));

    const q2 = query(
      collection(db, "step_activities")
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
        return getMillis(b.createdAt) - getMillis(a.createdAt);
      });
      setActivities(combined);
    }, (err) => console.error("Error loading step_activities:", err));

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  // Group activities by NBA criterion
  const criteriaData = useMemo(() => {
    const map = {};
    activities.forEach(a => {
      if (a.status !== "Approved") return;
      if (selectedCategory !== "all" && getCategoryFromCode(a.activityCode || "") !== selectedCategory) return;
      const year = (a.date || a.fromDate || "").split("-")[0];
      if (year && year !== selectedYear) return;

      const reg = ACTIVITY_REGISTRY.find(r => r.code === a.activityCode);
      const criteria = reg?.nbaCriterion || "Uncategorized";
      if (!map[criteria]) map[criteria] = [];
      map[criteria].push(a);
    });
    return map;
  }, [activities, selectedCategory, selectedYear]);

  const handleExport = () => {
    const headers = ["NBA Criterion","Category","Activity Code","Activity Name","Department","Date","Submitted By"];
    const rows = [];
    Object.entries(criteriaData).forEach(([criterion, items]) => {
      items.forEach(a => {
        rows.push([criterion, ACTIVITY_CATEGORIES[getCategoryFromCode(a.activityCode || "")]?.label || "", a.activityCode, a.activityName || "", a.department || "", a.date || a.fromDate || "", a.facultyName || a.studentName || ""]);
      });
    });
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `NBA_Export_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <Layout title="Activity NBA Export"><div className="flex items-center justify-center p-12"><Loader2 className="animate-spin" size={32} /></div></Layout>;
  }

  return (
    <Layout title="Activity NBA Export">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-emerald-900 to-teal-950 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <Globe size={24} />
            <h1 className="text-xl font-black">Activity NBA Export</h1>
          </div>
          <p className="text-sm text-emerald-200">Criterion-wise approved activity data for NBA/NAAC compliance</p>
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
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Year</label>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
              className="border border-zinc-300 rounded-lg px-3 py-2 text-xs font-semibold bg-white">
              {[2024,2025,2026,2027,2028].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={handleExport}
            className="bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-800 flex items-center gap-2">
            <Download size={14} /> Export CSV
          </button>
        </div>

        {/* Criterion Cards */}
        {Object.entries(criteriaData).length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center">
            <FileText size={40} className="mx-auto text-zinc-300 mb-3" />
            <p className="text-sm font-semibold text-zinc-400">No approved activities found for the selected filters.</p>
          </div>
        ) : (
          Object.entries(criteriaData).sort().map(([criterion, items]) => (
            <div key={criterion} className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
              <div className="bg-emerald-50 px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award size={16} className="text-emerald-700" />
                  <h3 className="font-bold text-sm text-zinc-800">{criterion}</h3>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">{items.length} activities</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="text-left p-3 font-bold text-zinc-600">S.No</th>
                      <th className="text-left p-3 font-bold text-zinc-600">Activity Code</th>
                      <th className="text-left p-3 font-bold text-zinc-600">Activity Name</th>
                      <th className="text-left p-3 font-bold text-zinc-600">Category</th>
                      <th className="text-left p-3 font-bold text-zinc-600">Department</th>
                      <th className="text-left p-3 font-bold text-zinc-600">Date</th>
                      <th className="text-left p-3 font-bold text-zinc-600">Submitted By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((a, i) => (
                      <tr key={a.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="p-3 font-mono text-zinc-400">{i+1}</td>
                        <td className="p-3 font-bold text-emerald-700">{a.activityCode}</td>
                        <td className="p-3 font-semibold text-zinc-800">{a.activityName || a.title || "-"}</td>
                        <td className="p-3">{ACTIVITY_CATEGORIES[getCategoryFromCode(a.activityCode || "")]?.label || "-"}</td>
                        <td className="p-3">{a.department || "-"}</td>
                        <td className="p-3 text-zinc-500">{a.date || a.fromDate || "-"}</td>
                        <td className="p-3">{a.facultyName || a.studentName || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
}
