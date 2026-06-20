import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDoc, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { FileText, AlertCircle, Loader2, ChevronDown } from "lucide-react";
import { formatProgDisplay, sanitizeKey } from "../../lib/utils";

export default function QuestionPapers() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qpList, setQpList] = useState([]);
  const [selectedSem, setSelectedSem] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");

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
    const { programme, department } = studentData;
    if (!programme || !department) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    const fetchQPs = async () => {
      try {
        const progKey = sanitizeKey(programme);
        const deptKey = sanitizeKey(department);
        const snapshot = await getDocs(collection(db, "generated_qps"));
        const papers = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (!data.versions) return;

          Object.values(data.versions).forEach((version) => {
            if (!version) return;
            const qp = version;
            if (
              qp.programme !== programme &&
              qp.programme !== progKey &&
              sanitizeKey(qp.programme) !== progKey
            ) return;
            if (
              qp.department !== department &&
              qp.department !== deptKey &&
              sanitizeKey(qp.department) !== deptKey
            ) return;
            papers.push({
              id: docSnap.id,
              subject: qp.subject || qp.subject_code || "-",
              subjectName: qp.subject_name || qp.subject || "-",
              examName: qp.exam_name || "Exam",
              semester: qp.semester || "1",
              academicYear: qp.academic_year || qp.academicYear || "-",
              fileUrl: qp.file_url || qp.url || qp.downloadURL || null,
              ...qp,
            });
          });
        });

        setQpList(papers);
        const semesters = [...new Set(papers.map((p) => p.semester))].sort((a, b) => Number(a) - Number(b));
        if (semesters.length > 0) setSelectedSem(semesters[0]);
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchQPs();
  }, [studentData]);

  const semesters = useMemo(() => {
    return [...new Set(qpList.map((p) => p.semester))].sort((a, b) => Number(a) - Number(b));
  }, [qpList]);

  const subjects = useMemo(() => {
    const filtered = selectedSem ? qpList.filter((p) => p.semester === selectedSem) : qpList;
    return [...new Set(filtered.map((p) => p.subject))].sort();
  }, [qpList, selectedSem]);

  const filteredQPs = useMemo(() => {
    let list = selectedSem ? qpList.filter((p) => p.semester === selectedSem) : qpList;
    if (selectedSubject) list = list.filter((p) => p.subject === selectedSubject);
    return list;
  }, [qpList, selectedSem, selectedSubject]);

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
          <FileText size={28} className="text-[#120c7a]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Question Papers</h1>
          <p className="text-sm text-slate-500">{studentData.studentName} &middot; {formatProgDisplay(studentData.programme)} &middot; {studentData.department}</p>
        </div>
      </div>

      {qpList.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-20 text-center border border-slate-100">
          <FileText size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-lg font-bold text-slate-400">No question papers available.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <select
                value={selectedSem}
                onChange={(e) => { setSelectedSem(e.target.value); setSelectedSubject(""); }}
                className="appearance-none w-full bg-white border border-slate-200 rounded-2xl px-5 py-3 pr-10 font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#120c7a]/20 cursor-pointer"
              >
                <option value="">All Semesters</option>
                {semesters.map((sem) => (
                  <option key={sem} value={sem}>Semester {sem}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            <div className="relative flex-1">
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="appearance-none w-full bg-white border border-slate-200 rounded-2xl px-5 py-3 pr-10 font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#120c7a]/20 cursor-pointer"
              >
                <option value="">All Subjects</option>
                {subjects.map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-[#120c7a] px-8 py-5">
              <h2 className="text-white font-bold text-xl">Available Question Papers ({filteredQPs.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">#</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject Code</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject Name</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Exam</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Semester</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Academic Year</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredQPs.map((qp, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-slate-300">{idx + 1}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-700 font-mono">{qp.subject}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-700">{qp.subjectName}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-600">{qp.examName}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm font-bold text-[#120c7a] bg-blue-50 px-3 py-1 rounded-lg">
                          {qp.semester}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm font-bold text-slate-600">{qp.academicYear}</td>
                      <td className="px-6 py-4 text-center">
                        {qp.fileUrl ? (
                          <a
                            href={qp.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-[#120c7a] text-white rounded-xl text-xs font-bold hover:bg-[#120c7a]/90 transition-all"
                          >
                            <FileText size={14} /> Download
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 italic">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
