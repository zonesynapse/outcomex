import { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDoc, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { FileText, AlertCircle, Loader2, Award } from "lucide-react";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

export default function Marks() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [examResults, setExamResults] = useState([]);

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
    const { regNo, programme, department, batch } = studentData;
    if (!regNo || !programme || !department || !batch) { setLoading(false); return; }

    const fetchMarks = async () => {
      try {
        const progKey = sanitizeKey(programme);
        const deptKey = sanitizeKey(department);
        const batchKey = sanitizeKey(batch);
        const snapshot = await getDocs(collection(db, "co_attainment"));
        const results = [];

        for (const docSnap of snapshot.docs) {
          const id = docSnap.id;
          if (!id.startsWith(`${batchKey}_${progKey}_${deptKey}`)) continue;

          const data = docSnap.data();

          if (data.students && data.co_max_marks) {
            const studentMarks = data.students[regNo];
            if (studentMarks) {
              const coEntries = Object.entries(data.co_max_marks);
              const cos = coEntries.map(([co]) => co);
              const maxMarks = coEntries.reduce((acc, [co, max]) => ({ ...acc, [co]: max }), {});
              const scoredMarks = cos.reduce((acc, co) => ({ ...acc, [co]: studentMarks[co] || 0 }), {});
              const totalScored = cos.reduce((s, co) => s + (scoredMarks[co] || 0), 0);
              const totalMax = cos.reduce((s, co) => s + (maxMarks[co] || 0), 0);

              results.push({
                docId: id,
                meta: data._meta || {},
                cos,
                maxMarks,
                scoredMarks,
                totalScored,
                totalMax,
                subject: data._meta?.subject || id.split('_').slice(3).join('_'),
              });
            }
          }

          if (data.exams) {
            const examEntries = Object.entries(data.exams);
            for (const [examKey, examData] of examEntries) {
              if (examData.students && examData.co_max_marks) {
                const studentMarks = examData.students[regNo];
                if (studentMarks) {
                  const coEntries = Object.entries(examData.co_max_marks);
                  const cos = coEntries.map(([co]) => co);
                  const maxMarks = coEntries.reduce((acc, [co, max]) => ({ ...acc, [co]: max }), {});
                  const scoredMarks = cos.reduce((acc, co) => ({ ...acc, [co]: studentMarks[co] || 0 }), {});
                  const totalScored = cos.reduce((s, co) => s + (scoredMarks[co] || 0), 0);
                  const totalMax = cos.reduce((s, co) => s + (maxMarks[co] || 0), 0);

                  results.push({
                    docId: id,
                    examKey,
                    meta: examData._meta || {},
                    cos,
                    maxMarks,
                    scoredMarks,
                    totalScored,
                    totalMax,
                    subject: examData._meta?.subject || data._meta?.subject || id.split('_').slice(3).join('_'),
                    examName: examData._meta?.exam || examKey,
                  });
                }
              }
            }
          }
        }

        setExamResults(results);
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchMarks();
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

  const groupBySubject = (results) => {
    const map = {};
    results.forEach((r) => {
      const key = r.subject;
      if (!map[key]) map[key] = { subject: key, exams: [] };
      map[key].exams.push(r);
    });
    return Object.values(map);
  };

  const grouped = groupBySubject(examResults);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-[#120c7a]/10 rounded-2xl">
          <Award size={28} className="text-[#120c7a]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Marks & Results</h1>
          <p className="text-sm text-slate-500">{studentData.studentName} &middot; {studentData.regNo}</p>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-20 text-center border border-slate-100">
          <FileText size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-lg font-bold text-slate-400">No marks records found.</p>
        </div>
      ) : (
        grouped.map((group, gi) => (
          <div key={gi} className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-[#120c7a] px-8 py-5">
              <h2 className="text-white font-bold text-xl">{group.subject}</h2>
            </div>
            <div className="p-6 space-y-6">
              {group.exams.map((exam, ei) => (
                <div key={ei} className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
                    <h3 className="font-bold text-slate-700">
                      {exam.examName || exam.examKey || 'Internal Assessment'}
                      {exam.meta.academicYear && <span className="text-sm font-normal text-slate-400 ml-2">({exam.meta.academicYear})</span>}
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50">
                          <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">CO</th>
                          {exam.cos.map((co) => (
                            <th key={co} className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{co}</th>
                          ))}
                          <th className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-6 py-4 text-sm font-bold text-slate-500">Max Marks</td>
                          {exam.cos.map((co) => (
                            <td key={co} className="px-6 py-4 text-center text-sm font-bold text-slate-400">{exam.maxMarks[co]}</td>
                          ))}
                          <td className="px-6 py-4 text-center text-sm font-bold text-slate-400">{exam.totalMax}</td>
                        </tr>
                        <tr className="bg-blue-50/30">
                          <td className="px-6 py-4 text-sm font-bold text-slate-700">Scored</td>
                          {exam.cos.map((co) => (
                            <td key={co} className={`px-6 py-4 text-center text-sm font-black ${(exam.scoredMarks[co] || 0) >= (exam.maxMarks[co] || 1) * 0.4 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {exam.scoredMarks[co]}
                            </td>
                          ))}
                          <td className={`px-6 py-4 text-center text-sm font-black ${exam.totalScored >= exam.totalMax * 0.4 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {exam.totalScored}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
