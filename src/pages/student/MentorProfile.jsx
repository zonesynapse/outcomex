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
  Shield, X
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
          // Get student doc ID from _student_data or profile
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
    // For students, the user doc might have student-specific fields
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
        // Find this student's mentor
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

  const getRiskColor = (level) => {
    if (level === 'red') return 'bg-red-100 text-red-700 border-red-200';
    if (level === 'yellow') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-green-100 text-green-700 border-green-200';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#120c7a]/30 border-t-[#120c7a]" />
      </div>
    );
  }

  if (!studentInfo?.regNo) {
    return (
      <div className="text-center py-12">
        <User className="h-12 w-12 text-zinc-300 mx-auto mb-3" />
        <p className="text-zinc-500 font-medium">Student profile not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mentor Card */}
      <div className="bg-gradient-to-r from-[#120c7a] to-[#15108a] rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
            <User className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Your Mentor</h2>
            <p className="text-blue-200 text-sm mt-1">
              {mentor ? mentor.name : 'No mentor assigned yet'}
            </p>
            {mentor && (
              <p className="text-blue-300 text-xs mt-0.5">
                {formatProgDisplay(studentInfo.programme)} — {studentInfo.department}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Risk & SGI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Risk Index */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-zinc-400" /> Risk Status
          </h3>
          {riskIndex ? (
            <div className="text-center py-4">
              <span className={`px-6 py-2 rounded-full text-lg font-bold border ${getRiskColor(riskIndex.riskLevel)}`}>
                {riskIndex.riskLevel?.toUpperCase()}
              </span>
              {riskIndex.factors && (
                <div className="mt-4 text-left space-y-1">
                  {Object.entries(riskIndex.factors).map(([factor, detail]) => (
                    <div key={factor} className="text-xs text-zinc-600">
                      <span className="font-medium">{factor}:</span> {detail}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-zinc-400 text-sm">Not assessed yet</div>
          )}
        </div>

        {/* SGI */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-zinc-400" /> Growth Index
          </h3>
          {sgiData ? (
            <div>
              <div className="text-center mb-4">
                <p className="text-4xl font-bold text-[#120c7a]">{sgiData.totalSGI}</p>
                <p className="text-xs text-zinc-500">SGI Score</p>
              </div>
              <div className="space-y-2">
                {Object.entries(SGI_WEIGHTS).map(([key, cfg]) => {
                  const val = sgiData[key] || 0;
                  const Icon = cfg.icon;
                  return (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <Icon className="h-3 w-3 text-zinc-400 shrink-0" />
                      <span className="text-zinc-500 truncate">{cfg.label}</span>
                      <div className="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-[#120c7a] rounded-full" style={{ width: `${Math.min(val, 100)}%` }} />
                      </div>
                      <span className="font-bold w-8 text-right">{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-zinc-400 text-sm">SGI not calculated yet</div>
          )}
        </div>
      </div>

      {/* Meetings */}
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-zinc-400" /> Recent Meetings
        </h3>
        {meetings.length > 0 ? (
          <div className="space-y-3">
            {meetings.slice(0, 10).map(m => (
              <div key={m.id} className="flex items-start gap-3 p-3 bg-zinc-50 rounded-lg">
                <div className={`p-1.5 rounded-lg ${m.status === 'completed' ? 'bg-green-100' : m.status === 'cancelled' ? 'bg-red-100' : 'bg-blue-100'}`}>
                  {m.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
                   m.status === 'cancelled' ? <X className="h-4 w-4 text-red-600" /> :
                   <Clock className="h-4 w-4 text-blue-600" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{m.topic || m.type}</span>
                    <span className="text-xs text-zinc-400">{m.date}</span>
                  </div>
                  {m.notes && <p className="text-xs text-zinc-600 mt-1">{m.notes}</p>}
                  {m.actionItems && <p className="text-xs text-blue-600 mt-1">Action: {m.actionItems}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-400 text-sm text-center py-4">No meetings recorded yet</p>
        )}
      </div>

      {/* Observations */}
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-zinc-400" /> Mentor Observations
        </h3>
        {observations.length > 0 ? (
          <div className="space-y-3">
            {observations.slice(0, 10).map(o => (
              <div key={o.id} className="flex items-start gap-3 p-3 bg-zinc-50 rounded-lg">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getRiskColor(o.severity)}`}>
                  {o.severity?.toUpperCase()}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold capitalize">{o.category}</span>
                    <span className="text-xs text-zinc-400">{o.date}</span>
                  </div>
                  {o.notes && <p className="text-xs text-zinc-600 mt-1">{o.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-400 text-sm text-center py-4">No observations recorded yet</p>
        )}
      </div>
    </div>
  );
}
