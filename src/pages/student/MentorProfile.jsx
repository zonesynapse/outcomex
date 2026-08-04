import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { formatProgDisplay } from "../../lib/utils";
import {
  listenMentorAllocation, listenMentorMeetings, listenMentorObservations,
  listenStudentRiskIndex, listenStudentGrowthIndex
} from "../../services/mentorService";
import {
  User, Calendar, AlertTriangle, TrendingUp, Phone, MessageSquare,
  CheckCircle2, Clock, Award, Activity, Target, Briefcase, GraduationCap, BrainCircuit, Star,
  Shield, X, Mail, ChevronRight, ShieldCheck, HeartPulse, Loader2
} from "lucide-react";

const SGI_WEIGHTS = {
  academicPerformance: { label: "Academic Performance", weight: 20, icon: GraduationCap },
  attendance: { label: "Attendance", weight: 15, icon: User },
  feeRegularity: { label: "Fee Regularity", weight: 10, icon: Target },
  cocurricular: { label: "Co-curricular Activities", weight: 15, icon: Activity },
  extracurricular: { label: "Extra-curricular Activities", weight: 10, icon: Award },
  placementReadiness: { label: "Placement Readiness", weight: 15, icon: Briefcase },
  mentorAssessment: { label: "Mentor Assessment", weight: 5, icon: Star },
  certifications: { label: "Certifications & Internships", weight: 10, icon: BrainCircuit },
};

export default function MentorProfile() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [mentor, setMentor] = useState(null);
  const [mentorDetails, setMentorDetails] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [observations, setObservations] = useState([]);
  const [riskIndex, setRiskIndex] = useState(null);
  const [sgiData, setSgiData] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserData(data);
          const profile = data._profile_data || {};
          setStudentData(profile);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Derive student identifiers
  const studentInfo = useMemo(() => {
    if (!userData) return null;
    const regNo = userData.regNo || userData.studentId || '';
    const batch = userData.batch || '';
    const programme = userData.programme || '';
    const department = userData.department || '';
    return { regNo, batch, programme, department };
  }, [userData]);

  // Listen to allocation for this student
  useEffect(() => {
    if (!studentInfo?.programme || !studentInfo?.department || !studentInfo?.batch) return;
    const unsub = listenMentorAllocation(
      studentInfo.programme, studentInfo.department, studentInfo.batch,
      '', '', '',
      (data) => {
        const myMentor = data.students?.[studentInfo.regNo];
        if (myMentor) {
          const mentorInfo = data.mentors?.[myMentor.mentorUid];
          setMentor({ uid: myMentor.mentorUid, name: mentorInfo?.name || myMentor.mentorName || 'Not assigned' });
        } else {
          setMentor(null);
        }
      }
    );
    return () => unsub();
  }, [studentInfo]);

  // Listen to mentor details (email, mobile, etc.) in real-time
  useEffect(() => {
    if (!mentor?.uid) { setMentorDetails(null); return; }
    const unsub = onSnapshot(doc(db, "users", mentor.uid), (snap) => {
      if (snap.exists()) {
        setMentorDetails(snap.data());
      }
    });
    return () => unsub();
  }, [mentor]);

  // Listen to meetings for this student
  useEffect(() => {
    if (!studentInfo?.regNo || !studentInfo?.programme || !studentInfo?.batch) return;
    const filters = { studentReg: studentInfo.regNo, programme: studentInfo.programme, batch: studentInfo.batch };
    const unsub = listenMentorMeetings(filters, setMeetings);
    return () => unsub();
  }, [studentInfo]);

  // Listen to observations for this student
  useEffect(() => {
    if (!studentInfo?.regNo || !studentInfo?.programme || !studentInfo?.batch) return;
    const filters = { studentReg: studentInfo.regNo, programme: studentInfo.programme, batch: studentInfo.batch };
    const unsub = listenMentorObservations(filters, setObservations);
    return () => unsub();
  }, [studentInfo]);

  // Listen to risk index
  useEffect(() => {
    if (!studentInfo?.regNo || !studentInfo?.programme || !studentInfo?.department || !studentInfo?.batch) return;
    const unsub = listenStudentRiskIndex(
      studentInfo.programme, studentInfo.department, studentInfo.batch, '', '',
      (data) => {
        const myRisk = data.find(d => d.id?.endsWith(`_${studentInfo.regNo}`));
        setRiskIndex(myRisk || null);
      }
    );
    return () => unsub();
  }, [studentInfo]);

  // Listen to SGI
  useEffect(() => {
    if (!studentInfo?.regNo || !studentInfo?.programme || !studentInfo?.department || !studentInfo?.batch) return;
    const unsub = listenStudentGrowthIndex(
      studentInfo.programme, studentInfo.department, studentInfo.batch, '', '',
      (data) => {
        const mySGI = data.find(d => d.id?.endsWith(`_${studentInfo.regNo}`));
        setSgiData(mySGI || null);
      }
    );
    return () => unsub();
  }, [studentInfo]);

  const getRiskDetails = (level) => {
    const lvl = (level || 'green').toLowerCase();
    if (lvl === 'red') {
      return { 
        label: 'High Risk Alert', 
        bg: 'bg-rose-50 border-rose-100 text-rose-700', 
        badge: 'bg-rose-500 text-white', 
        bar: 'bg-rose-500', 
        desc: 'Requires immediate academic/personal attention and counseling support.', 
        icon: AlertTriangle 
      };
    }
    if (lvl === 'yellow') {
      return { 
        label: 'Moderate Risk Warning', 
        bg: 'bg-amber-50 border-amber-100 text-amber-700', 
        badge: 'bg-amber-500 text-white', 
        bar: 'bg-amber-500', 
        desc: 'Identified minor concerns. Action plan advised to maintain optimal progress.', 
        icon: Shield 
      };
    }
    return { 
      label: 'Safe (Low Risk)', 
      bg: 'bg-emerald-50 border-emerald-100 text-emerald-700', 
      badge: 'bg-emerald-500 text-white', 
      bar: 'bg-emerald-500', 
      desc: 'Performing consistently and keeping pace with expectations. Good job!', 
      icon: ShieldCheck 
    };
  };

  const getSeverityBadge = (level) => {
    const lvl = (level || 'green').toLowerCase();
    if (lvl === 'red') return 'bg-red-50 text-red-600 border border-red-100';
    if (lvl === 'yellow') return 'bg-amber-50 text-amber-600 border border-amber-100';
    return 'bg-emerald-50 text-emerald-600 border border-emerald-100';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-[#120c7a]" size={40} />
      </div>
    );
  }

  if (!studentInfo?.regNo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <User className="h-16 w-16 text-zinc-300 animate-pulse" />
        <p className="text-zinc-500 font-bold text-lg">Student profile not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-8 font-sans">
      
      {/* ═══ Mentor Info Banner Card ═══ */}
      <div className="relative overflow-hidden bg-gradient-to-tr from-[#120c7a] via-[#1a10a0] to-indigo-900 rounded-3xl p-6 md:p-8 text-white shadow-xl shadow-[#120c7a]/15 border border-[#120c7a]/20">
        {/* Glow effect */}
        <div className="absolute right-0 top-0 h-48 w-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-5 text-center md:text-left">
            <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20 shrink-0 shadow-lg backdrop-blur-sm">
              <User className="h-10 w-10 text-white" />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-300">Your Allocated Mentor</span>
              <h2 className="text-xl md:text-2xl font-black">{mentor ? mentor.name : 'No Mentor Assigned'}</h2>
              
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1">
                {mentorDetails?.email && (
                  <span className="inline-flex items-center gap-1 text-xs text-indigo-200 bg-white/5 px-2.5 py-1 rounded-lg">
                    <Mail size={12} /> {mentorDetails.email}
                  </span>
                )}
                {mentorDetails?.mobile && (
                  <span className="inline-flex items-center gap-1 text-xs text-indigo-200 bg-white/5 px-2.5 py-1 rounded-lg">
                    <Phone size={12} /> {mentorDetails.mobile}
                  </span>
                )}
                {!mentorDetails?.email && !mentorDetails?.mobile && mentor && (
                  <span className="text-xs text-indigo-300">Contact information not updated by mentor</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Connect Action Buttons */}
          {mentor && (mentorDetails?.email || mentorDetails?.mobile) && (
            <div className="flex items-center gap-3 w-full md:w-auto">
              {mentorDetails?.email && (
                <a 
                  href={`mailto:${mentorDetails.email}`}
                  className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-[#120c7a] font-bold text-xs rounded-xl shadow-lg hover:bg-slate-50 transition-all"
                >
                  <MessageSquare size={14} />
                  <span>Email Mentor</span>
                </a>
              )}
              {mentorDetails?.mobile && (
                <a 
                  href={`tel:${mentorDetails.mobile}`}
                  className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 bg-white/10 text-white font-bold text-xs rounded-xl hover:bg-white/15 transition-all border border-white/10"
                >
                  <Phone size={14} />
                  <span>Call Mentor</span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Risk & Growth Index Dashboard Grid ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Risk Status Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-extrabold text-sm text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
              <HeartPulse className="h-4 w-4 text-[#120c7a]" /> Risk Assessment Status
            </h3>
            
            {riskIndex ? (
              (() => {
                const detail = getRiskDetails(riskIndex.riskLevel);
                const Icon = detail.icon;
                return (
                  <div className="space-y-6">
                    <div className={`p-5 rounded-2xl border ${detail.bg} flex items-start gap-4`}>
                      <div className={`p-3 rounded-xl ${detail.badge} shrink-0`}>
                        <Icon size={24} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-black text-sm uppercase tracking-wider">{detail.label}</h4>
                        <p className="text-xs text-slate-500 leading-relaxed">{detail.desc}</p>
                      </div>
                    </div>

                    {riskIndex.factors && Object.keys(riskIndex.factors).length > 0 && (
                      <div className="space-y-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assessed Risk Factors</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {Object.entries(riskIndex.factors).map(([factor, text]) => (
                            <div key={factor} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs">
                              <span className="font-extrabold text-slate-700 block capitalize">{factor}</span>
                              <span className="text-slate-500 mt-0.5 block line-clamp-2">{text || '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-500">
                  <ShieldCheck size={28} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-700">All Metrics Safe</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                    Your academic performance, attendance, and fee status are fully clear. No risk flags set.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Growth Index Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8">
          <h3 className="font-extrabold text-sm text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-[#120c7a]" /> Student Growth Index (SGI)
          </h3>
          
          {sgiData ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4 bg-indigo-50/50 border border-indigo-100/50 rounded-2xl p-4">
                <div className="text-center shrink-0">
                  <p className="text-3xl font-black text-[#120c7a]">{sgiData.totalSGI}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">SGI Score</p>
                </div>
                <div className="border-l border-indigo-100 h-10 w-1" />
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Calculated growth metric tracks performance index, placements preparation and skills achievements.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {Object.entries(SGI_WEIGHTS).map(([key, cfg]) => {
                  const val = sgiData[key] || 0;
                  const Icon = cfg.icon;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-500 truncate flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                          <span>{cfg.label}</span>
                        </span>
                        <span className="font-bold text-slate-800">{val} / 100</span>
                      </div>
                      <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#120c7a] to-violet-500 rounded-full" 
                          style={{ width: `${Math.min(val, 100)}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-500">
                <TrendingUp size={28} />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-700">SGI Assessment Pending</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                  SGI tracks holistic progress metrics. Once your mentor publishes assessments, scores will display here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Meetings & Observations Timeline Row ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Recent Meetings */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8">
          <h3 className="font-extrabold text-sm text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6">
            <Calendar className="h-4 w-4 text-[#120c7a]" /> Recent Mentoring Sessions
          </h3>
          
          {meetings.length > 0 ? (
            <div className="relative border-l-2 border-indigo-50 ml-3.5 pl-5 space-y-6">
              {meetings.slice(0, 5).map((m) => {
                const isCompleted = m.status === 'completed';
                const isCancelled = m.status === 'cancelled';
                
                return (
                  <div key={m.id} className="relative space-y-1.5">
                    {/* Bullet marker */}
                    <div className={`absolute -left-[29px] top-1 h-4.5 w-4.5 rounded-full border-2 border-white flex items-center justify-center shadow-sm ${
                      isCompleted ? 'bg-emerald-500' : isCancelled ? 'bg-red-500' : 'bg-blue-500'
                    }`}>
                      {isCompleted ? <CheckCircle2 className="h-2.5 w-2.5 text-white" /> :
                       isCancelled ? <X className="h-2.5 w-2.5 text-white" /> :
                       <Clock className="h-2.5 w-2.5 text-white" />}
                    </div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <h4 className="font-bold text-sm text-slate-800">{m.topic || m.type || 'General Discussion'}</h4>
                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full w-fit">
                        {m.date}
                      </span>
                    </div>

                    {m.notes && (
                      <p className="text-xs text-slate-500 leading-relaxed font-medium bg-slate-50/50 border border-slate-100/50 p-2.5 rounded-xl">
                        {m.notes}
                      </p>
                    )}

                    {m.actionItems && (
                      <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-bold bg-indigo-50/55 px-2.5 py-1.5 rounded-xl border border-indigo-100/40 w-fit">
                        <Target size={12} className="shrink-0" />
                        <span>Action: {m.actionItems}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <div className="p-3 bg-slate-50 rounded-2xl text-slate-300">
                <Calendar size={24} />
              </div>
              <p className="text-xs font-bold text-slate-400">No mentoring sessions recorded yet</p>
            </div>
          )}
        </div>

        {/* Mentor Observations */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8">
          <h3 className="font-extrabold text-sm text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6">
            <AlertTriangle className="h-4 w-4 text-[#120c7a]" /> Mentor Observations Log
          </h3>
          
          {observations.length > 0 ? (
            <div className="relative border-l-2 border-indigo-50 ml-3 pl-5 space-y-6">
              {observations.slice(0, 5).map((o) => (
                <div key={o.id} className="relative space-y-2">
                  {/* Bullet marker */}
                  <div className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white shadow-sm ${
                    o.severity === 'red' ? 'bg-red-500' : o.severity === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} />
                  
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 capitalize">{o.category || 'Observation'}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border ${getSeverityBadge(o.severity)}`}>
                        {o.severity || 'Green'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {o.date}
                    </span>
                  </div>

                  {o.notes && (
                    <p className="text-xs text-slate-500 leading-relaxed font-medium bg-slate-50/50 border border-slate-100/50 p-2.5 rounded-xl">
                      {o.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <div className="p-3 bg-slate-50 rounded-2xl text-slate-300">
                <AlertTriangle size={24} />
              </div>
              <p className="text-xs font-bold text-slate-400">No observations logged yet</p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
