import { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDoc, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Briefcase, AlertCircle, Loader2, CalendarDays, Building2, GraduationCap, Award, Clock } from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDate(ts) {
  if (!ts) return "-";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "-";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const STATUS_STYLES = {
  applied: "bg-blue-50 text-blue-600 border-blue-200",
  shortlisted: "bg-indigo-50 text-indigo-600 border-indigo-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
  selected: "bg-emerald-50 text-emerald-600 border-emerald-200",
  accepted: "bg-emerald-50 text-emerald-600 border-emerald-200",
  pending: "bg-amber-50 text-amber-600 border-amber-200",
  upcoming: "bg-slate-50 text-slate-600 border-slate-200",
  ongoing: "bg-blue-50 text-blue-600 border-blue-200",
  completed: "bg-zinc-50 text-zinc-600 border-zinc-200",
};

export default function Placement() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drives, setDrives] = useState([]);
  const [applications, setApplications] = useState([]);
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setStudentData(snap.data());
      } catch (err) { console.error(err); }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!studentData) return;
    const { regNo } = studentData;
    if (!regNo) { setLoading(false); return; }

    const fetchData = async () => {
      try {
        const [drivesSnap, appsSnap, offersSnap] = await Promise.all([
          getDocs(collection(db, "placement_drives")),
          getDocs(collection(db, "placement_applications")),
          getDocs(collection(db, "placement_offers")),
        ]);

        const allDrives = [];
        drivesSnap.forEach((d) => allDrives.push({ id: d.id, ...d.data() }));
        allDrives.sort((a, b) => {
          const da = a.driveDate?.toDate?.() || new Date(0);
          const dbv = b.driveDate?.toDate?.() || new Date(0);
          return da - dbv;
        });
        setDrives(allDrives);

        const myApps = [];
        appsSnap.forEach((d) => {
          const data = d.data();
          if (
            data.studentRegNo === regNo ||
            data.studentId === regNo ||
            data.examNumber === regNo
          ) {
            myApps.push({ id: d.id, ...data });
          }
        });
        setApplications(myApps);

        const myOffers = [];
        offersSnap.forEach((d) => {
          const data = d.data();
          if (
            data.studentRegNo === regNo ||
            data.studentId === regNo ||
            data.examNumber === regNo
          ) {
            myOffers.push({ id: d.id, ...data });
          }
        });
        setOffers(myOffers);
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchData();
  }, [studentData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-[#120c7a]" size={40} />
      </div>
    );
  }

  if (!studentData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-red-400" />
        <p className="text-lg font-bold text-slate-500">Unable to load student data</p>
      </div>
    );
  }

  const hasNoData = drives.length === 0 && applications.length === 0 && offers.length === 0;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-[#120c7a]/10 rounded-2xl">
          <Briefcase size={28} className="text-[#120c7a]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Placements</h1>
          <p className="text-sm text-slate-500">{studentData.studentName} &middot; {studentData.regNo}</p>
        </div>
      </div>

      {hasNoData ? (
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-20 text-center border border-slate-100">
          <Briefcase size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-lg font-bold text-slate-400">No placement data available.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
              <div className="bg-[#120c7a] px-8 py-5 flex items-center gap-3">
                <Briefcase size={20} className="text-white" />
                <h2 className="text-white font-bold text-xl">Upcoming Drives</h2>
              </div>
              {drives.length === 0 ? (
                <div className="py-12 text-center">
                  <Building2 size={36} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-sm font-medium text-slate-400">No drives currently scheduled.</p>
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  {drives
                    .filter((d) => d.status !== "completed")
                    .map((drive) => (
                      <div key={drive.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-[#120c7a]/20 transition-all">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Building2 size={16} className="text-slate-400 shrink-0" />
                              <p className="font-bold text-slate-800 truncate">{drive.companyName}</p>
                            </div>
                            <p className="text-sm text-slate-600 mt-1 ml-6">{drive.jobTitle || "Recruitment Drive"}</p>
                            <div className="flex flex-wrap items-center gap-4 mt-3 ml-6">
                              {drive.driveDate && (
                                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                                  <CalendarDays size={12} /> {formatDate(drive.driveDate)}
                                </span>
                              )}
                              {drive.ctc > 0 && (
                                <span className="text-xs font-bold text-emerald-600">₹{drive.ctc} LPA</span>
                              )}
                              {drive.minCgpa > 0 && (
                                <span className="text-xs text-slate-500">Min CGPA: {drive.minCgpa}</span>
                              )}
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                                STATUS_STYLES[drive.status] || STATUS_STYLES.upcoming
                              }`}>
                                {drive.status || "Upcoming"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
              <div className="bg-indigo-600 px-8 py-5 flex items-center gap-3">
                <GraduationCap size={20} className="text-white" />
                <h2 className="text-white font-bold text-xl">My Applications</h2>
              </div>
              {applications.length === 0 ? (
                <div className="py-12 text-center">
                  <GraduationCap size={36} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-sm font-medium text-slate-400">No applications submitted yet.</p>
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  {applications.map((app) => (
                    <div key={app.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div>
                        <p className="font-bold text-slate-800">{app.companyName || "Company"}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{app.jobTitle || "Position"}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full border ${
                        STATUS_STYLES[app.status] || STATUS_STYLES.applied
                      }`}>
                        {app.status || "Applied"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {offers.length > 0 && (
              <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
                <div className="bg-emerald-600 px-8 py-5 flex items-center gap-3">
                  <Award size={20} className="text-white" />
                  <h2 className="text-white font-bold text-lg">My Offers</h2>
                </div>
                <div className="p-4 space-y-4">
                  {offers.map((offer) => (
                    <div key={offer.id} className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                      <div className="flex items-center gap-2">
                        <Award size={16} className="text-emerald-600 shrink-0" />
                        <p className="font-bold text-slate-800">{offer.companyName || "Company"}</p>
                      </div>
                      <p className="text-sm font-medium text-slate-600 mt-1 ml-6">{offer.jobTitle || "Position"}</p>
                      <div className="mt-3 ml-6 space-y-1.5">
                        {offer.ctc > 0 && (
                          <p className="text-xs font-bold text-emerald-600">₹{offer.ctc} LPA</p>
                        )}
                        {offer.offerDate && (
                          <p className="text-xs text-slate-500 flex items-center gap-1.5">
                            <CalendarDays size={12} /> Offer: {formatDate(offer.offerDate)}
                          </p>
                        )}
                        {offer.deadline && (
                          <p className="text-xs text-slate-500 flex items-center gap-1.5">
                            <Clock size={12} /> Deadline: {formatDate(offer.deadline)}
                          </p>
                        )}
                      </div>
                      <div className="mt-3 ml-6">
                        <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full border ${
                          STATUS_STYLES[offer.status] || STATUS_STYLES.pending
                        }`}>
                          {offer.status || "Pending"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-gradient-to-br from-[#120c7a] to-blue-800 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-blue-900/40 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16" />
              <h4 className="text-sm font-bold mb-4">Placement Summary</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                  <p className="text-[10px] font-bold text-blue-200 uppercase opacity-70">Applied</p>
                  <p className="text-lg font-black">{applications.length}</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                  <p className="text-[10px] font-bold text-blue-200 uppercase opacity-70">Offers</p>
                  <p className="text-lg font-black">{offers.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
