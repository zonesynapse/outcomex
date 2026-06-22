import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDoc, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { FileText, AlertCircle, Loader2, Award } from "lucide-react";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

const formatExamName = (exam, markType) => {
  if (!exam) return markType || "Exam";
  const name = exam.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return markType ? `${name} (${markType})` : name;
};

export default function Marks() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marksList, setMarksList] = useState([]);

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
    if (!regNo || !programme || !department || !batch) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    const fetchMarks = async () => {
      try {
        const progKey = sanitizeKey(programme);
        const deptKey = sanitizeKey(department);
        const batchKey = sanitizeKey(batch);
        const prefix = `${batchKey}_${progKey}_${deptKey}`;
        console.log('Marks prefix:', prefix);

        // Attempt to resolve canonical ID (admission number) from student_index
        let canonicalId = null;
        try {
          const idxRef = doc(db, 'student_index', sanitizeKey(regNo));
          const idxSnap = await getDoc(idxRef);
          if (idxSnap.exists()) {
            canonicalId = idxSnap.data().canonicalId || idxSnap.data().admissionNo || null;
          }
        } catch (_) {}
        const lookupKeys = [regNo, canonicalId].filter(Boolean);
        console.log('Lookup keys:', lookupKeys);

        const snapshot = await getDocs(collection(db, "marks"));
        let matchedCount = 0;
        const results = [];

        for (const docSnap of snapshot.docs) {
          const id = docSnap.id;
          if (!id.startsWith(prefix)) continue;
          matchedCount++;

          const data = docSnap.data();
          const meta = data._meta || {};
          let studentMarks = null;
          for (const key of lookupKeys) {
            if (data.students?.[key]) {
              studentMarks = data.students[key];
              break;
            }
          }
          if (!studentMarks) continue;

          const totalScored = studentMarks.total || 0;
          const isAbsent = !!studentMarks.absent;

          results.push({
            docId: id,
            subject: meta.subject || id.split('_').slice(3, 5).join('_'),
            exam: meta.exam_name || meta.exam || '',
            markType: meta.mark_type || meta.entry_mode || '',
            academicYear: meta.academic_year || '',
            semester: meta.semester_label || '',
            isUniversity: !!meta.is_university,
            marks: studentMarks,
            totalScored,
            isAbsent,
          });
        }
        console.log('Marks docs matched:', matchedCount, 'results:', results.length);
        if (matchedCount > 0 && results.length === 0) {
          const sampleDoc = snapshot.docs.find(d => d.id.startsWith(prefix));
          if (sampleDoc) {
            const sampleKeys = Object.keys(sampleDoc.data().students || {}).slice(0, 5);
            console.log('Sample doc students keys:', sampleKeys, 'lookup keys:', lookupKeys);
          }
        }

        setMarksList(results);
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchMarks();
  }, [studentData]);

  const grouped = useMemo(() => {
    const map = {};
    marksList.forEach((r) => {
      const key = r.exam;
      if (!map[key]) map[key] = { exam: key, subjects: [] };
      map[key].subjects.push(r);
    });
    Object.values(map).forEach(g => {
      g.subjects.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
    });
    return Object.values(map);
  }, [marksList]);

  const getExamDetails = (exam) => {
    const { marks, markType, isAbsent } = exam;
    if (isAbsent) return { label: "Absent", value: "AB" };

    if (markType === "CO Wise" || markType === "CO wise") {
      const cos = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].filter(co => marks[co] !== undefined && marks[co] !== "");
      const total = cos.reduce((s, co) => s + (Number(marks[co]) || 0), 0);
      return { label: `CO Total (${cos.length} COs)`, value: total };
    }

    if (markType === "Overall") {
      return { label: "Mark", value: marks.overall || marks.total || 0, grade: marks.grade, gradePoint: marks.gradePoint };
    }

    if (markType === "Assignment") {
      const qMarks = Object.values(marks.assignment || {}).filter(m => m !== "").map(Number);
      const total = qMarks.reduce((s, m) => s + (isNaN(m) ? 0 : m), 0);
      return { label: `Total (${qMarks.length} Qs)`, value: total };
    }

    // Internal / default: Part A + B + C
    const partATotal = Object.values(marks.partA || {}).reduce((s, m) => s + (Number(m) || 0), 0);
    const partBTotal = Object.values(marks.partB || {}).reduce((s, m) => s + (Number(m.mark) || 0), 0);
    const partCTotal = Object.values(marks.partC || {}).reduce((s, m) => s + (Number(m.mark) || 0), 0);
    const total = Math.min(partATotal + partBTotal + partCTotal, 100);
    return { label: "Total", value: total };
  };

  const getCOScores = (exam) => {
    const { marks } = exam;
    return ['CO1', 'CO2', 'CO3', 'CO4', 'CO5']
      .filter(co => marks[co] !== undefined && marks[co] !== "")
      .map(co => ({ co, value: Number(marks[co]) || 0 }));
  };

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
            <div className="bg-[#120c7a] px-6 py-2.5">
              <h2 className="text-white font-bold text-base">{group.exam}</h2>
            </div>
            <div className="p-6 space-y-6">
              {group.subjects.map((exam, ei) => {
                const details = getExamDetails(exam);
                const coScores = getCOScores(exam);
                return (
                  <div key={ei} className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="font-bold text-slate-700">
                          {exam.subject} <span className="text-xs font-normal text-slate-400">({formatExamName(exam.exam, exam.markType)})</span>
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {exam.academicYear}{exam.semester ? ` • ${exam.semester}` : ''}
                        </p>
                      </div>
                      {!exam.isAbsent && (
                        <div className="text-right">
                          <span className="text-lg font-black text-[#120c7a]">{details.value}</span>
                          {details.grade && <span className="text-xs font-bold text-slate-400 ml-2">Grade: {details.grade}</span>}
                          {details.gradePoint && <span className="text-xs font-bold text-slate-400 ml-2">GP: {details.gradePoint}</span>}
                        </div>
                      )}
                      {exam.isAbsent && (
                        <span className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-bold">ABSENT</span>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-50/50">
                            {exam.markType === "CO Wise" || exam.markType === "CO wise" ? (
                              <>
                                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">CO</th>
                                <th className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Scored</th>
                                <th className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                              </>
                            ) : exam.markType === "Overall" ? (
                              <>
                                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Component</th>
                                <th className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Mark</th>
                                <th className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Grade</th>
                                <th className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Grade Point</th>
                              </>
                            ) : exam.markType === "Assignment" ? (
                              <>
                                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Question</th>
                                <th className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Mark</th>
                              </>
                            ) : (
                              <>
                                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Part</th>
                                <th className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Scored</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {exam.isAbsent ? (
                            <tr>
                              <td colSpan={4} className="px-6 py-6 text-center text-sm font-bold text-red-400">Student was absent for this exam</td>
                            </tr>
                          ) : exam.markType === "CO Wise" || exam.markType === "CO wise" ? (
                            coScores.length > 0 ? coScores.map((cs, ci) => (
                              <tr key={ci} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-3 text-sm font-bold text-slate-600">{cs.co}</td>
                                <td className="px-6 py-3 text-center text-sm font-black text-slate-700">{cs.value}</td>
                                <td className="px-6 py-3 text-center text-sm text-slate-400">—</td>
                              </tr>
                            )) : (
                              <tr>
                                <td colSpan={3} className="px-6 py-4 text-center text-sm text-slate-400">No CO data available</td>
                              </tr>
                            )
                          ) : exam.markType === "Overall" ? (
                            <tr className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-3 text-sm font-bold text-slate-600">Overall</td>
                              <td className="px-6 py-3 text-center text-sm font-black text-slate-700">{exam.marks.overall || exam.marks.total || '—'}</td>
                              <td className="px-6 py-3 text-center text-sm font-bold text-slate-700">{exam.marks.grade || '—'}</td>
                              <td className="px-6 py-3 text-center text-sm font-bold text-slate-700">{exam.marks.gradePoint || '—'}</td>
                            </tr>
                          ) : exam.markType === "Assignment" ? (
                            (exam.marks.assignment && Object.keys(exam.marks.assignment).length > 0) ? (
                              Object.entries(exam.marks.assignment).map(([qKey, mark], ai) => (
                                <tr key={ai} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-3 text-sm font-bold text-slate-600">{qKey}</td>
                                  <td className="px-6 py-3 text-center text-sm font-black text-slate-700">{mark}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={2} className="px-6 py-4 text-center text-sm text-slate-400">No assignment marks</td>
                              </tr>
                            )
                          ) : (
                            <>
                              {Object.keys(exam.marks.partA || {}).length > 0 && (
                                <tr className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-3 text-sm font-bold text-slate-600">Part A</td>
                                  <td className="px-6 py-3 text-center text-sm font-black text-slate-700">
                                    {Object.values(exam.marks.partA).reduce((s, m) => s + (Number(m) || 0), 0)}
                                  </td>
                                </tr>
                              )}
                              {Object.keys(exam.marks.partB || {}).length > 0 && (
                                <tr className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-3 text-sm font-bold text-slate-600">Part B</td>
                                  <td className="px-6 py-3 text-center text-sm font-black text-slate-700">
                                    {Object.values(exam.marks.partB).reduce((s, m) => s + (Number(m.mark) || 0), 0)}
                                  </td>
                                </tr>
                              )}
                              {Object.keys(exam.marks.partC || {}).length > 0 && (
                                <tr className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-3 text-sm font-bold text-slate-600">Part C</td>
                                  <td className="px-6 py-3 text-center text-sm font-black text-slate-700">
                                    {Object.values(exam.marks.partC).reduce((s, m) => s + (Number(m.mark) || 0), 0)}
                                  </td>
                                </tr>
                              )}
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
