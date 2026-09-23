import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { db, auth } from "../firebase";
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from "firebase/firestore";
import { 
  FileText, CheckCircle2, Settings2, Award, Clock, 
  Users, ArrowUpRight, ShieldCheck, Sparkles, Building2, AlertCircle, GraduationCap 
} from "lucide-react";

export default function HRDashboard() {
  const [user, setUser] = useState(auth.currentUser);
  const [userProfile, setUserProfile] = useState(null);
  const [stats, setStats] = useState({
    facultyCount: 0,
    teacherCount: 0,
    nonTeachingCount: 0,
    hodCount: 0,
    pendingReviews: 0,
  });
  const [schedule, setSchedule] = useState(null);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      setUser(currentUser);
      getDoc(doc(db, "users", currentUser.uid)).then(snap => {
        if (snap.exists()) setUserProfile(snap.data());
      });
    }

    // Fetch Appraisal Schedule
    const unsubSched = onSnapshot(doc(db, "appraisal_config", "schedule"), (snap) => {
      if (snap.exists()) {
        setSchedule(snap.data());
      } else {
        setSchedule({
          academicYear: "",
          isActive: true,
          openTime: "",
          closeTime: ""
        });
      }
    });

    // Fetch Appraisals Counts
    const fetchCounts = async () => {
      try {
        const facSnap = await getDocs(collection(db, "faculty_appraisals"));
        const teacherSnap = await getDocs(collection(db, "teacher_appraisals"));
        const ntSnap = await getDocs(collection(db, "non_teaching_appraisals"));
        const hodSnap = await getDocs(collection(db, "hod_appraisals"));

        const facPending = facSnap.docs.filter(d => d.data().status === "Submitted").length;
        const teacherPending = teacherSnap.docs.filter(d => d.data().status === "Submitted").length;
        const ntPending = ntSnap.docs.filter(d => d.data().status === "Submitted").length;
        const hodPending = hodSnap.docs.filter(d => d.data().status === "Submitted").length;

        setStats({
          facultyCount: facSnap.size,
          teacherCount: teacherSnap.size,
          nonTeachingCount: ntSnap.size,
          hodCount: hodSnap.size,
          pendingReviews: facPending + teacherPending + ntPending + hodPending
        });
      } catch (e) {
        console.error("Error fetching stats:", e);
      }
    };

    fetchCounts();
    return () => unsubSched();
  }, []);

  const cards = [
    {
      title: "Faculty Appraisal Request",
      desc: "Submit or update official academic performance appraisal across teaching, research & publications.",
      path: "/appraisal",
      icon: FileText,
      count: stats.facultyCount,
      countLabel: "Submissions",
      color: "from-blue-600 to-indigo-600",
      accent: "text-blue-400"
    },
    {
      title: "Teacher Appraisal Request",
      desc: "Self-Appraisal Form for Teaching Staff (CKSPE) covering workload, quarterly results, IIY & growth.",
      path: "/teacher-appraisal",
      icon: GraduationCap,
      count: stats.teacherCount,
      countLabel: "Submissions",
      color: "from-cyan-600 to-blue-700",
      accent: "text-cyan-400"
    },
    {
      title: "Non-Teaching Appraisal Request",
      desc: "Comprehensive appraisal request form for administrative, technical, and support staff.",
      path: "/non-teaching-appraisal",
      icon: Users,
      count: stats.nonTeachingCount,
      countLabel: "Submissions",
      color: "from-purple-600 to-pink-600",
      accent: "text-purple-400"
    },
    {
      title: "HOD Appraisal Request",
      desc: "Department Heads performance appraisal covering AU pass %, student activities & KRAs (100 Marks).",
      path: "/hod-appraisal",
      icon: Award,
      count: stats.hodCount,
      countLabel: "Submissions",
      color: "from-emerald-600 to-teal-600",
      accent: "text-emerald-400"
    },
    {
      title: "Appraisal Reviews & Approvals",
      desc: "Review submitted faculty, teacher & non-teaching appraisal requests with live criteria score evaluation.",
      path: "/reviews",
      icon: CheckCircle2,
      count: stats.pendingReviews,
      countLabel: "Pending Reviews",
      color: "from-amber-600 to-orange-600",
      accent: "text-amber-400"
    }
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-r from-indigo-900/60 via-slate-900 to-purple-900/60 border border-slate-800 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Human Resources Management System
            </div>
            <h1 className="text-3xl font-bold font-heading text-white tracking-tight">
              Welcome back, {userProfile?.name || "Colleague"} 👋
            </h1>
            <p className="text-slate-700 text-sm mt-2 max-w-xl">
              Access staff appraisal submissions, review candidate scores, and configure active evaluation windows across CK Group of Institutions.
            </p>
          </div>

          {schedule && (
            <div className="glass-card p-4 rounded-2xl border border-slate-700/60 flex items-center gap-4 shrink-0">
              <div className="p-3 bg-indigo-600/30 rounded-xl text-indigo-300 border border-indigo-500/30">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs text-slate-700 font-medium">Active Session</div>
                <div className="text-base font-bold text-white">{schedule.academicYear || "Active Session"}</div>
                <div className="text-xs text-emerald-400 font-medium flex items-center gap-1 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Portal Open
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid of HR Modules */}
      <div>
        <h2 className="text-xl font-bold font-heading text-white mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-400" />
          HR Module Services
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <Link
                key={idx}
                to={card.path}
                className="group glass-panel p-6 rounded-3xl border border-slate-800/80 hover:border-slate-700 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/10 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3.5 rounded-2xl bg-gradient-to-br ${card.color} shadow-lg shadow-indigo-500/20 text-white`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex items-center gap-1 text-slate-700 group-hover:text-indigo-400 font-medium text-xs transition-colors">
                      Open Module
                      <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-sm text-slate-700 mt-2 line-clamp-2">
                    {card.desc}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-700">
                  <span>{card.countLabel}</span>
                  <span className={`font-bold text-sm ${card.accent}`}>{card.count}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Quick Settings Bar */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-800/80 rounded-2xl text-slate-800">
            <Settings2 className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-white text-base">Appraisal Schedule & Criteria Config</h4>
            <p className="text-xs text-slate-700">Configure open submission windows, academic year, and performance criteria.</p>
          </div>
        </div>

        <Link
          to="/settings"
          className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl border border-slate-700 transition-all shrink-0"
        >
          Manage Settings
        </Link>
      </div>
    </div>
  );
}
