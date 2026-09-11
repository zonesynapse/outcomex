import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDoc, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { FileText, AlertCircle, Loader2, Award } from "lucide-react";

const extractMarksDocMeta = (d) => {
  if (!d) return {};
  const data = typeof d.data === 'function' ? d.data() : (d || {});
  const m = data._meta || {};
  const qm = data.qpaper_meta || {};

  return {
    programme: data.programme || m.programme || qm.programme || '',
    department: data.department || m.department || qm.department || '',
    batch: data.batch || m.batch || qm.batch || '',
    academicYear: data.academic_year || m.academic_year || qm.academic_year || data.academicYear || '',
    semesterLabel: data.semester_label || qm.semester_label || m.semester_label || data.semester || m.semester || qm.semester || '',
    section: data.section || qm.section || m.section || '',
    subject: data.subject || qm.subject || m.subject || '',
    exam: data.exam || m.exam || qm.exam || qm.qpaper_name || '',
    examName: data.exam_name || m.exam_name || qm.exam_name || '',
    markType: data.mark_type || m.mark_type || m.entry_mode || data.entry_mode || '',
    isUniversity: Boolean(data.is_university || m.is_university),
    students: data.students || m.students || {}
  };
};

const extractStudentMarkTotal = (s) => {
  if (s == null) return { total: 0, absent: false };
  if (typeof s === 'number') return { total: s, absent: false };
  if (typeof s === 'string') {
    const trimmed = s.trim();
    if (trimmed.toUpperCase() === 'A' || trimmed.toLowerCase() === 'absent') return { total: 0, absent: true };
    const num = Number(trimmed);
    return { total: isNaN(num) ? 0 : num, absent: false };
  }
  const isAbsent = Boolean(
    s.absent === true ||
    s.absent === 'true' ||
    s.isAbsent === true ||
    s.status === 'absent' ||
    String(s.total || '').toUpperCase() === 'A' ||
    String(s.total || '').toLowerCase() === 'absent'
  );

  let total = 0;
  if (s.total !== undefined && s.total !== null && s.total !== '' && String(s.total).toUpperCase() !== 'A') {
    total = Number(s.total) || 0;
  } else if (s.overall !== undefined && s.overall !== null && s.overall !== '') {
    total = Number(s.overall) || 0;
  } else if (s.mark !== undefined && s.mark !== null && s.mark !== '') {
    total = Number(s.mark) || 0;
  } else if (s.marks !== undefined && s.marks !== null && s.marks !== '') {
    total = Number(s.marks) || 0;
  } else if (s.score !== undefined && s.score !== null && s.score !== '') {
    total = Number(s.score) || 0;
  }

  if (total <= 0 && !isAbsent) {
    const coKeys = Object.keys(s).filter(k => /^CO\d+/i.test(k));
    if (coKeys.length > 0) {
      total = coKeys.reduce((acc, k) => acc + (Number(s[k]) || 0), 0);
    }
  }

  if (total <= 0 && !isAbsent) {
    ['partA', 'partB', 'partC'].forEach(partKey => {
      if (s[partKey] && typeof s[partKey] === 'object') {
        Object.values(s[partKey]).forEach(item => {
          if (typeof item === 'number') total += item;
          else if (item && typeof item === 'object') {
            if (typeof item.mark === 'number') total += item.mark;
            else if (typeof item.mark === 'string' && !isNaN(Number(item.mark))) total += Number(item.mark);
          }
        });
      }
    });
  }

  if (total <= 0 && !isAbsent && s.assignment && typeof s.assignment === 'object') {
    Object.values(s.assignment).forEach(mark => {
      const num = Number(mark);
      if (!isNaN(num)) total += num;
    });
  }

  return { total, absent: isAbsent };
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
    if (!regNo && !studentData.reg && !studentData.admNo && !studentData.admissionNo) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    const fetchMarks = async () => {
      try {
        let canonicalId = null;
        if (regNo || studentData.reg) {
          try {
            const idxRef = doc(db, 'student_index', sanitizeKey(regNo || studentData.reg));
            const idxSnap = await getDoc(idxRef);
            if (idxSnap.exists()) {
              canonicalId = idxSnap.data().canonicalId || idxSnap.data().admissionNo || null;
            }
          } catch (_) {}
        }

        const candidateKeys = new Set([
          regNo,
          studentData.reg,
          studentData.admNo,
          studentData.admissionNo,
          studentData.rollNo,
          studentData.uid,
          canonicalId
        ].filter(Boolean).map(k => String(k).trim().toUpperCase()));

        const normPunct = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetProgNorm = normPunct(programme);
        const targetDeptNorm = normPunct(department);
        const targetBatchNorm = normPunct(batch);

        const snapshot = await getDocs(collection(db, "marks"));
        const results = [];

        for (const docSnap of snapshot.docs) {
          const id = docSnap.id;
          const data = docSnap.data() || {};
          const meta = extractMarksDocMeta(docSnap);

          const studentsMap = data.students || meta.students || {};
          let studentMarks = null;

          for (const k of Object.keys(studentsMap)) {
            const cleanK = String(k).trim().toUpperCase();
            if (candidateKeys.has(cleanK)) {
              studentMarks = studentsMap[k];
              break;
            }
          }

          if (!studentMarks) continue;

          // Scope check against programme/department/batch if meta is populated
          if (meta.programme && targetProgNorm && normPunct(meta.programme) !== targetProgNorm) continue;
          if (meta.department && targetDeptNorm && normPunct(meta.department) !== targetDeptNorm) continue;
          if (meta.batch && targetBatchNorm && normPunct(meta.batch) !== targetBatchNorm) continue;

          const { total, absent } = extractStudentMarkTotal(studentMarks);

          results.push({
            docId: id,
            subject: meta.subject || id.split('_').slice(3, 5).join('_') || 'Subject',
            exam: meta.examName || meta.exam || 'Internal Exam',
            markType: meta.markType || 'Internal',
            academicYear: meta.academicYear || '',
            semester: meta.semesterLabel || '',
            isUniversity: !!meta.isUniversity,
            marks: studentMarks,
            totalScored: total,
            isAbsent: absent,
          });
        }

        setMarksList(results);
      } catch (err) { console.error("Fetch student marks error:", err); }
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
    const { marks, isAbsent, totalScored } = exam;
    if (isAbsent) return "Absent";

    const extracted = extractStudentMarkTotal(marks);
    if (extracted.absent) return "Absent";

    if (extracted.total > 0) return extracted.total;
    if (totalScored > 0) return totalScored;

    const cos = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO6'].filter(co => marks[co] !== undefined && marks[co] !== "");
    if (cos.length > 0) {
      return cos.reduce((s, co) => s + (Number(marks[co]) || 0), 0);
    }

    if (marks.overall !== undefined) return marks.overall;
    if (marks.total !== undefined) return marks.total;

    const partATotal = Object.values(marks.partA || {}).reduce((s, m) => s + (Number(m) || 0), 0);
    const partBTotal = Object.values(marks.partB || {}).reduce((s, m) => s + (Number(m.mark) || 0), 0);
    const partCTotal = Object.values(marks.partC || {}).reduce((s, m) => s + (Number(m.mark) || 0), 0);
    const partsSum = partATotal + partBTotal + partCTotal;
    if (partsSum > 0) return Math.min(partsSum, 100);

    return 0;
  };

  const getDetailBreakdown = (exam) => {
    const { marks, markType, isAbsent } = exam;
    if (isAbsent) return null;

    const coBreakdown = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO6']
      .filter(co => marks[co] !== undefined && marks[co] !== "" && marks[co] !== null)
      .map(co => ({ label: co, value: Number(marks[co]) || 0 }));
    if (coBreakdown.length > 0) return coBreakdown;

    if (marks.assignment && typeof marks.assignment === 'object') {
      const assBreakdown = Object.entries(marks.assignment)
        .filter(([, m]) => m !== "" && m !== null && m !== undefined)
        .map(([qKey, mark]) => ({ label: qKey, value: mark }));
      if (assBreakdown.length > 0) return assBreakdown;
    }

    if (markType === "Overall" || marks.overall !== undefined) {
      const rows = [];
      if (marks.overall !== undefined) rows.push({ label: "Overall", value: marks.overall });
      if (marks.grade) rows.push({ label: "Grade", value: marks.grade });
      if (marks.gradePoint) rows.push({ label: "GP", value: marks.gradePoint });
      if (rows.length > 0) return rows;
    }

    const rows = [];
    if (marks.partA && Object.keys(marks.partA).length > 0) {
      rows.push({ label: "Part A", value: Object.values(marks.partA).reduce((s, m) => s + (Number(m) || 0), 0) });
    }
    if (marks.partB && Object.keys(marks.partB).length > 0) {
      rows.push({ label: "Part B", value: Object.values(marks.partB).reduce((s, m) => s + (Number(m.mark) || 0), 0) });
    }
    if (marks.partC && Object.keys(marks.partC).length > 0) {
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
