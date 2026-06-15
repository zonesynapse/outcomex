import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, onSnapshot, getDoc, getDocs } from "firebase/firestore";
import { Bell, AlertCircle, Loader2, CalendarDays } from "lucide-react";

const sampleNotices = [
  {
    id: "sample_1",
    title: "End Semester Exam Schedule Released",
    description: "The timetable for end semester examinations has been published. Check the exam section for details.",
    date: new Date().toISOString(),
  },
  {
    id: "sample_2",
    title: "Library Holiday Notice",
    description: "The library will remain closed on public holidays. Kindly plan your visits accordingly.",
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "sample_3",
    title: "Scholarship Application Deadline Extended",
    description: "The last date for submitting scholarship applications has been extended to next month.",
    date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "sample_4",
    title: "Cultural Fest Registrations Open",
    description: "Registrations for the annual cultural fest are now open. Sign up at the student affairs office.",
    date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

function isNew(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff < 7 * 24 * 60 * 60 * 1000;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Notices() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState([]);

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
    const fetchNotices = async () => {
      try {
        const snapshot = await getDocs(collection(db, "notices"));
        if (!snapshot.empty) {
          const fetched = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            fetched.push({ id: docSnap.id, ...data });
          });
          fetched.sort((a, b) => new Date(b.date) - new Date(a.date));
          setNotices(fetched);
        } else {
          const configSnap = await getDoc(doc(db, "info_configuration", "notices"));
          if (configSnap.exists()) {
            const data = configSnap.data();
            const items = data.items || data.notices || [];
            const parsed = items.map((item, i) => ({
              id: `config_${i}`,
              title: item.title || item.heading || "",
              description: item.description || item.content || "",
              date: item.date || item.createdAt || new Date().toISOString(),
            }));
            parsed.sort((a, b) => new Date(b.date) - new Date(a.date));
            setNotices(parsed);
          } else {
            sampleNotices.sort((a, b) => new Date(b.date) - new Date(a.date));
            setNotices(sampleNotices);
          }
        }
      } catch (err) {
        console.error(err);
        sampleNotices.sort((a, b) => new Date(b.date) - new Date(a.date));
        setNotices(sampleNotices);
      }
      setLoading(false);
    };

    if (studentData) fetchNotices();
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

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-[#120c7a]/10 rounded-2xl">
          <Bell size={28} className="text-[#120c7a]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Notices</h1>
          <p className="text-sm text-slate-500">{studentData.studentName} &middot; {studentData.regNo}</p>
        </div>
      </div>

      {notices.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-20 text-center border border-slate-100">
          <Bell size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-lg font-bold text-slate-400">No notices available.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 transition-all hover:shadow-xl hover:border-slate-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-slate-800 truncate">{notice.title}</h3>
                    {isNew(notice.date) && (
                      <span className="shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
                        New
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">{notice.description}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-slate-400">
                  <CalendarDays size={14} />
                  {formatDate(notice.date)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
