import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDoc, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { FileText, AlertCircle, Loader2, Award } from "lucide-react";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]/ ]/g, '_');
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
  const [expandedExam, setExpandedExam] = useState(null);

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
        const normPrefix = prefix.replace(/\s+/g, '_').replace(/_{2,}/g, '_');

        let canonicalId = null;
        try {
          const idxRef = doc(db, 'student_index', sanitizeKey(regNo));
          const idxSnap = await getDoc(idxRef);
          if (idxSnap.exists()) {
            canonicalId = idxSnap.data().canonicalId || idxSnap.data().admissionNo || null;
          }
        } catch (_) {}
        const lookupKeys = [regNo, canonicalId].filter(Boolean);

        const snapshot = await getDocs(collection(db, "marks"));
        const results = [];

        for (const docSnap of snapshot.docs) {
          const id = docSnap.id;
          const normId = id.replace(/\s+/g, '_').replace(/_{2,}/g, '_');
          if (!normId.startsWith(normPrefix)) continue;

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

        setMarksList(results);
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchMarks();
  }, [studentData]);

  const subjectGroups = useMemo(() => {
    const map = {};
    marksList.forEach((r) => {
      const key = r.subject;
      if (!map[key]) map[key] = { subject: key, exams: [], academicYear: r.academicYear, semester: r.semester };
      map[key].exams.push(r);
    });
    Object.values(map).forEach(g => {
      g.exams.sort((a, b) => (a.exam || '').localeCompare(b.exam || ''));
    });
    return Object.values(map).sort((a, b) => a.subject.localeCompare(b.subject));
  }, [marksList]);

  const getExamDetail = (exam) => {
    const { marks, markType, isAbsent } = exam;
    if (isAbsent) return "Absent";

    if (markType === "CO Wise" || markType === "CO wise") {
      const cos = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].filter(co => marks[co] !== undefined && marks[co] !== "");
      const total = cos.reduce((s, co) => s + (Number(marks[co]) || 0), 0);
      return total;
    }

    if (markType === "Overall") {
      return marks.overall || marks.total || 0;
    }

    if (markType === "Assignment") {
      const qMarks = Object.values(marks.assignment || {}).filter(m => m !== "").map(Number);
      return qMarks.reduce((s, m) => s + (isNaN(m) ? 0 : m), 0);
    }

    const partATotal = Object.values(marks.partA || {}).reduce((s, m) => s + (Number(m) || 0), 0);
    const partBTotal = Object.values(marks.partB || {}).reduce((s, m) => s + (Number(m.mark) || 0), 0);
    const partCTotal = Object.values(marks.partC || {}).reduce((s, m) => s + (Number(m.mark) || 0), 0);
    return Math.min(partATotal + partBTotal + partCTotal, 100);
  };

  const getDetailBreakdown = (exam) => {
    const { marks, markType, isAbsent } = exam;
    if (isAbsent) return null;

    if (markType === "CO Wise" || markType === "CO wise") {
      return ['CO1', 'CO2', 'CO3', 'CO4', 'CO5']
        .filter(co => marks[co] !== undefined && marks[co] !== "")
        .map(co => ({ label: co, value: Number(marks[co]) || 0 }));
    }

    if (markType === "Overall") {
      const rows = [];
      if (marks.overall !== undefined) rows.push({ label: "Overall", value: marks.overall });
      if (marks.grade) rows.push({ label: "Grade", value: marks.grade });
      if (marks.gradePoint) rows.push({ label: "GP", value: marks.gradePoint });
      return rows.length > 0 ? rows : null;
    }

    if (markType === "Assignment") {
      return Object.entries(marks.assignment || {})
        .filter(([, m]) => m !== "")
        .map(([qKey, mark]) => ({ label: qKey, value: mark }));
    }

    const rows = [];
    if (Object.keys(marks.partA || {}).length > 0) {
      rows.push({ label: "Part A", value: Object.values(marks.partA).reduce((s, m) => s + (Number(m) || 0), 0) });
    }
    if (Object.keys(marks.partB || {}).length > 0) {
      rows.push({ label: "Part B", value: Object.values(marks.partB).reduce((s, m) => s + (Number(m.mark) || 0), 0) });
    }
    if (Object.keys(marks.partC || {}).length > 0) {
      rows.push({ label: "Part C", value: Object.values(marks.partC).reduce((s, m) => s + (Number(m.mark) || 0), 0) });
    }
    return rows.length > 0 ? rows : null;
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

      {subjectGroups.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-20 text-center border border-slate-100">
          <FileText size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-lg font-bold text-slate-400">No marks records found.</p>
        </div>
      ) : (
        subjectGroups.map((group, gi) => (
          <div key={gi} className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-[#120c7a] px-4 md:px-8 py-4">
              <h2 className="text-white font-bold text-lg">{group.subject}</h2>
              <p className="text-blue-200 text-[11px] mt-0.5">{group.academicYear}{group.semester ? ` • ${group.semester}` : ''}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-4 md:px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Exam</th>
                    <th className="px-4 md:px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                    <th className="px-4 md:px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Score</th>
                    <th className="px-4 md:px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest hidden md:table-cell">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.exams.map((exam, ei) => {
                    const score = getExamDetail(exam);
                    const breakdown = getDetailBreakdown(exam);
                    const examKey = `${gi}-${ei}`;
                    const isExpanded = expandedExam === examKey;
                    return (
                      <>
                        <tr
                          key={ei}
                          className={`transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}
                          onClick={() => setExpandedExam(isExpanded ? null : examKey)}
                        >
                          <td className="px-4 md:px-6 py-3">
                            <span className="text-sm font-bold text-slate-700">{exam.exam || '—'}</span>
                          </td>
                          <td className="px-4 md:px-6 py-3 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                              exam.markType === 'Assignment' ? 'bg-purple-50 text-purple-600 border-purple-200'
                              : exam.markType === 'CO Wise' || exam.markType === 'CO wise' ? 'bg-cyan-50 text-cyan-600 border-cyan-200'
                              : exam.markType === 'Overall' ? 'bg-amber-50 text-amber-600 border-amber-200'
                              : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            }`}>
                              {exam.markType || 'Internal'}
                            </span>
                          </td>
                          <td className="px-4 md:px-6 py-3 text-center">
                            {exam.isAbsent ? (
                              <span className="text-xs font-bold text-red-500">ABSENT</span>
                            ) : (
                              <span className="text-sm font-black text-[#120c7a]">{score}</span>
                            )}
                          </td>
                          <td className="px-4 md:px-6 py-3 text-center hidden md:table-cell">
                            {breakdown && !exam.isAbsent && (
                              <span className="text-[10px] font-bold text-slate-400">
                                {breakdown.map(b => `${b.label}: ${b.value}`).join(' | ')}
                              </span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && breakdown && !exam.isAbsent && (
                          <tr key={`${ei}-detail`}>
                            <td colSpan={4} className="px-4 md:px-6 py-3 bg-slate-50/60">
                              <div className="flex flex-wrap gap-3">
                                {breakdown.map((b, bi) => (
                                  <div key={bi} className="bg-white rounded-xl border border-slate-200 px-4 py-2 flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{b.label}</span>
                                    <span className="text-sm font-black text-slate-700">{b.value}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                        {isExpanded && exam.isAbsent && (
                          <tr key={`${ei}-absent`}>
                            <td colSpan={4} className="px-4 md:px-6 py-3 bg-red-50/60 text-center">
                              <span className="text-xs font-bold text-red-400">Student was absent for this exam</span>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
