import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { 
  Award, TrendingUp, Users, Target, Search, Filter, ShieldAlert, BarChart3, PieChart as PieIcon, Trophy, Star
} from "lucide-react";
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell 
} from "recharts";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { STEP_CATEGORIES } from "./student/StepPoints";

const COLORS = ["#120c7a", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f43f5e"];

export default function StepAnalytics() {
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [studentsIndex, setStudentsIndex] = useState({});

  // Filters State
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedProg, setSelectedProg] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [leaderboardSearch, setLeaderboardSearch] = useState("");

  // Dynamic STEP configuration states
  const [activeCategories, setActiveCategories] = useState(STEP_CATEGORIES);
  const [activeMilestones, setActiveMilestones] = useState({
    regularRequired: 100,
    lateralRequired: 80,
    semesterCap: 20
  });

  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getActiveBatches } = useBatches(durations);

  const activeBatchesList = useMemo(() => getActiveBatches(), [getActiveBatches]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            const data = snap.data();
            setCurrentUserData(data);
            
            // Prefill filters for HOD/Faculty
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

  // Sync settings
  useEffect(() => {
    const docRef = doc(db, "step_config", "step_configuration");
    const unsub = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.categories) setActiveCategories(data.categories);
        if (data.milestones) setActiveMilestones(data.milestones);
      }
    });
    return () => unsub();
  }, []);

  // Fetch activities
  useEffect(() => {
    const q = collection(db, "step_activities");
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setActivities(list);
    }, (err) => console.error("Error loading activities:", err));
    return () => unsub();
  }, []);

  // Fetch students bulk index
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

  const batchOptions = useMemo(() => {
    const b = new Set();
    activities.forEach(a => { if (a.batch) b.add(a.batch); });
    activeBatchesList.forEach(batch => b.add(batch));
    return Array.from(b).sort();
  }, [activities, activeBatchesList]);

  const deptOptions = useMemo(() => {
    const d = new Set();
    activities.forEach(a => { if (a.department) d.add(a.department); });
    Object.values(PROGRAMME_DEPARTMENTS).forEach(list => {
      list.forEach(dept => d.add(dept));
    });
    return Array.from(d).sort();
  }, [activities, PROGRAMME_DEPARTMENTS]);

  // Compute calculated cumulative metrics per student
  const processedStudents = useMemo(() => {
    const studentsMap = {};

    activities.forEach((act) => {
      // Filter activities based on the general page filters
      if (selectedBatch && act.batch !== selectedBatch) return;
      if (selectedDept && act.department !== selectedDept) return;
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
          uncappedPoints: 0,
          approvedCount: 0,
          totalCount: 0
        };
      }

      studentsMap[reg].totalCount++;
      if (act.status === "Approved") {
        studentsMap[reg].approvedCount++;
        const sem = act.semester || 2;
        const pts = Number(act.totalPoints || 0);
        const cat = act.category || "technical";
        
        studentsMap[reg].uncappedPoints += pts;

        if (studentsMap[reg].semCategories[sem]) {
          studentsMap[reg].semCategories[sem][cat] = (studentsMap[reg].semCategories[sem][cat] || 0) + pts;
        }
      }
    });

    const result = Object.values(studentsMap);
    result.forEach((st) => {
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
      st.complianceRate = Math.min(Math.round((st.totalEarned / st.target) * 100), 100);
    });

    return result;
  }, [activities, selectedBatch, selectedDept, selectedProg, selectedSection, studentsIndex, activeCategories, activeMilestones]);

  // Overall statistics
  const kpiStats = useMemo(() => {
    const totalClaims = activities.filter(a => {
      if (selectedBatch && a.batch !== selectedBatch) return false;
      if (selectedDept && a.department !== selectedDept) return false;
      if (selectedSection && a.section !== selectedSection) return false;
      return true;
    }).length;

    const approvedClaims = activities.filter(a => {
      if (selectedBatch && a.batch !== selectedBatch) return false;
      if (selectedDept && a.department !== selectedDept) return false;
      if (selectedSection && a.section !== selectedSection) return false;
      return a.status === "Approved";
    }).length;

    const totalStudents = processedStudents.length;
    const compliantStudents = processedStudents.filter(s => s.isCompliant).length;
    const compliancePercent = totalStudents > 0 ? Math.round((compliantStudents / totalStudents) * 100) : 0;

    let totalPointsDistributed = 0;
    processedStudents.forEach(s => {
      totalPointsDistributed += s.totalEarned;
    });

    const avgPointsPerStudent = totalStudents > 0 ? (totalPointsDistributed / totalStudents).toFixed(1) : "0.0";

    return {
      totalClaims,
      approvedClaims,
      totalStudents,
      compliantStudents,
      compliancePercent,
      totalPointsDistributed,
      avgPointsPerStudent
    };
  }, [activities, processedStudents, selectedBatch, selectedDept, selectedSection]);

  // Department-wise compliance stats for BarChart
  const deptComplianceChartData = useMemo(() => {
    const deptsMap = {};
    processedStudents.forEach(s => {
      const d = s.department || "Unknown";
      if (!deptsMap[d]) {
        deptsMap[d] = { department: d, total: 0, compliant: 0 };
      }
      deptsMap[d].total++;
      if (s.isCompliant) deptsMap[d].compliant++;
    });

    return Object.values(deptsMap).map(d => ({
      name: d.department,
      "Compliance %": Math.round((d.compliant / d.total) * 100),
      "Total Students": d.total,
      "Compliant": d.compliant
    })).sort((a, b) => b["Compliance %"] - a["Compliance %"]);
  }, [processedStudents]);

  // Category-wise points distributed for PieChart
  const categoryPointsChartData = useMemo(() => {
    const catPoints = {};
    Object.keys(activeCategories).forEach(c => {
      catPoints[c] = 0;
    });

    activities.forEach(act => {
      if (act.status === "Approved" && act.category) {
        if (selectedBatch && act.batch !== selectedBatch) return;
        if (selectedDept && act.department !== selectedDept) return;
        if (selectedSection && act.section !== selectedSection) return;

        catPoints[act.category] = (catPoints[act.category] || 0) + Number(act.totalPoints || 0);
      }
    });

    return Object.entries(catPoints).map(([key, value]) => ({
      name: activeCategories[key]?.label || key,
      value: value
    })).filter(item => item.value > 0);
  }, [activities, activeCategories, selectedBatch, selectedDept, selectedSection]);

  // Leaderboard data
  const leaderboardData = useMemo(() => {
    return processedStudents
      .filter(st => {
        if (!leaderboardSearch.trim()) return true;
        return st.name.toLowerCase().includes(leaderboardSearch.toLowerCase()) || 
               st.regNo.toLowerCase().includes(leaderboardSearch.toLowerCase());
      })
      .sort((a, b) => b.totalEarned - a.totalEarned || a.name.localeCompare(b.name));
  }, [processedStudents, leaderboardSearch]);

  return (
    <Layout title="STEP Insights & Leaderboard">
      <div className="max-w-7xl mx-auto px-4 py-8 text-left">

        {/* Filters Panel */}
        <div className="bg-white rounded-3xl border border-zinc-100 p-5 md:p-6 shadow-sm mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={16} className="text-[#120c7a]" />
            <h2 className="text-xs font-black text-zinc-700 uppercase tracking-wider">Configure Insight Filters</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Batch Filter */}
            <div>
              <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mb-1.5">Batch Year</label>
              <select
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
              >
                <option value="">All Batches</option>
                {batchOptions.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Department Filter */}
            <div>
              <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mb-1.5">Academic Department</label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                disabled={currentUserData?.role === "Faculty" || currentUserData?.role === "HOD"}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white disabled:opacity-60"
              >
                <option value="">All Departments</option>
                {deptOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Programme Filter */}
            <div>
              <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mb-1.5">Degree Programme</label>
              <select
                value={selectedProg}
                onChange={(e) => setSelectedProg(e.target.value)}
                disabled={currentUserData?.role === "Faculty" || currentUserData?.role === "HOD"}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white disabled:opacity-60"
              >
                <option value="">All Programmes</option>
                {Object.keys(PROGRAMME_DEPARTMENTS).map((prog) => (
                  <option key={prog} value={prog}>{prog}</option>
                ))}
              </select>
            </div>

            {/* Section Filter */}
            <div>
              <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider mb-1.5">Batch Section</label>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
              >
                <option value="">All Sections</option>
                <option value="Sec-A">Section A</option>
                <option value="Sec-B">Section B</option>
                <option value="Sec-C">Section C</option>
              </select>
            </div>
          </div>
        </div>

        {/* KPI Stats widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-3xl p-6 border border-zinc-100 shadow-sm flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total STEP Claims</p>
              <h3 className="text-2xl font-black text-[#120c7a] mt-1">{kpiStats.totalClaims}</h3>
              <p className="text-[10px] text-zinc-400 mt-0.5 font-medium">Submitted by students</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-[#120c7a]/5 text-[#120c7a] flex items-center justify-center shrink-0">
              <Users size={22} />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-zinc-100 shadow-sm flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Distributed Points</p>
              <h3 className="text-2xl font-black text-emerald-600 mt-1">{kpiStats.totalPointsDistributed}</h3>
              <p className="text-[10px] text-zinc-400 mt-0.5 font-medium">Approved capped points</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Award size={22} />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-zinc-100 shadow-sm flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Compliance Rate</p>
              <h3 className="text-2xl font-black text-amber-500 mt-1">{kpiStats.compliancePercent}%</h3>
              <p className="text-[10px] text-zinc-400 mt-0.5 font-medium">{kpiStats.compliantStudents} of {kpiStats.totalStudents} compliant</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
              <Target size={22} />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-zinc-100 shadow-sm flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Avg Student Points</p>
              <h3 className="text-2xl font-black text-purple-600 mt-1">{kpiStats.avgPointsPerStudent}</h3>
              <p className="text-[10px] text-zinc-400 mt-0.5 font-medium">Points per student</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <TrendingUp size={22} />
            </div>
          </div>
        </div>

        {/* Charts & Distributions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Bar Chart */}
          <div className="bg-white rounded-3xl border border-zinc-100 p-6 shadow-sm lg:col-span-2 text-left">
            <h3 className="text-sm font-black text-zinc-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-[#120c7a]" />
              Compliance Rate by Department (%)
            </h3>
            <div className="h-72 w-full text-xs">
              {deptComplianceChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-400 font-semibold">
                  No data available for compliance visualization.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptComplianceChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="#a1a1aa" fontSize={11} tickLine={false} />
                    <YAxis stroke="#a1a1aa" fontSize={11} domain={[0, 100]} tickLine={false} />
                    <Tooltip cursor={{ fill: "#f4f4f5" }} />
                    <Bar dataKey="Compliance %" fill="#120c7a" radius={[6, 6, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Pie Chart */}
          <div className="bg-white rounded-3xl border border-zinc-100 p-6 shadow-sm text-left">
            <h3 className="text-sm font-black text-zinc-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <PieIcon size={16} className="text-emerald-500" />
              Category Point Share (Approved)
            </h3>
            <div className="h-72 w-full text-xs flex flex-col justify-between">
              {categoryPointsChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-400 font-semibold">
                  No points distributed yet.
                </div>
              ) : (
                <>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryPointsChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {categoryPointsChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1 mt-2 max-h-24 overflow-y-auto">
                    {categoryPointsChartData.map((entry, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] font-semibold text-zinc-600">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="truncate max-w-[150px]">{entry.name}</span>
                        </div>
                        <span className="font-bold text-zinc-800">{entry.value} Pts</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Gamified Leaderboard */}
        <div className="bg-white rounded-3xl border border-zinc-100 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-zinc-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="text-left">
              <h3 className="text-base font-extrabold text-zinc-800 flex items-center gap-2 font-sans tracking-tight">
                <Trophy className="text-yellow-500" size={20} />
                STEP Elite Leaderboard
              </h3>
              <p className="text-xs text-zinc-400 font-medium mt-0.5">Showcase of top academic point achievers across all programs and batches.</p>
            </div>
            <div className="relative w-full md:w-80">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search leaderboard by name or reg no..."
                value={leaderboardSearch}
                onChange={(e) => setLeaderboardSearch(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-4 py-2.5 text-xs font-semibold placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-100 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  <th className="p-4 text-center w-16">Rank</th>
                  <th className="p-4">Student Details</th>
                  <th className="p-4">Department & Programme</th>
                  <th className="p-4">Batch / Section</th>
                  <th className="p-4 text-center">Approved Activities</th>
                  <th className="p-4 text-center">Capped Points</th>
                  <th className="p-4 text-center">Uncapped Points</th>
                  <th className="p-4 text-center">Milestone Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium">
                {leaderboardData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-zinc-400">
                      No students found matching current filters.
                    </td>
                  </tr>
                ) : (
                  leaderboardData.map((st, idx) => {
                    const rank = idx + 1;
                    return (
                      <tr key={st.regNo} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center">
                            {rank === 1 ? (
                              <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs border border-amber-200 relative">
                                <Star size={10} className="absolute -top-1 -right-1 text-amber-500 fill-amber-500" />
                                1
                              </div>
                            ) : rank === 2 ? (
                              <div className="w-7 h-7 rounded-full bg-zinc-100 text-zinc-700 flex items-center justify-center font-bold text-xs border border-zinc-200">
                                2
                              </div>
                            ) : rank === 3 ? (
                              <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xs border border-orange-200">
                                3
                              </div>
                            ) : (
                              <span className="text-zinc-500 font-bold">{rank}</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <div>
                            <p className="font-extrabold text-zinc-800">{st.name}</p>
                            <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{st.regNo}</p>
                          </div>
                        </td>
                        <td className="p-4">
                          <div>
                            <p className="text-zinc-700 font-bold">{st.department}</p>
                            <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">{st.programme}</p>
                          </div>
                        </td>
                        <td className="p-4">
                          <div>
                            <p className="text-zinc-700 font-bold">{st.batch}</p>
                            <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">{st.section}</p>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <span className="px-2 py-1 rounded-md bg-zinc-100 text-zinc-700 font-extrabold text-[10px]">
                            {st.approvedCount} / {st.totalCount} Approved
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className="text-sm font-black text-[#120c7a]">
                            {st.totalEarned} <span className="text-[10px] text-zinc-400 font-bold">/ {st.target}</span>
                          </span>
                        </td>
                        <td className="p-4 text-center text-zinc-500">
                          {st.uncappedPoints} Pts
                        </td>
                        <td className="p-4 text-center">
                          {st.isCompliant ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                              Compliant
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100">
                              Non-Compliant
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
