import { useState, useEffect, useMemo } from "react";
import Layout from "../components/Layout";
import { Search, Filter } from "lucide-react";
import { rtdb } from "../firebase";
import { ref as dbRef, get, set } from "firebase/database";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatProgDisplay, formatBatchDisplay, formatProgrammeKey } from "../lib/utils";

const sanitizeKey = (k) => (k || '').toString().replace(/[.#$[\]]/g, '_');

export default function CourseEnrolment() {
  const [searchTerm, setSearchTerm] = useState("");
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);

  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState("");
  const [students, setStudents] = useState([]);
  const [enrolled, setEnrolled] = useState({});
  const [allQPs, setAllQPs] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });

  const availableBatches = useMemo(() => {
    if (programme) return getActiveBatches(formatProgrammeKey(programme));
    return [];
  }, [programme, getActiveBatches]);

  // Fetch all generated QPs to derive academic years and semesters
  useEffect(() => {
    const fetchAllQPs = async () => {
      try {
        const qpRef = dbRef(rtdb, 'generated_qps');
        const snapshot = await get(qpRef);
        const root = snapshot.val() || {};
        const list = [];
        for (const groupingKey in root) {
          const entries = root[groupingKey];
          if (typeof entries === 'object') {
            for (const recKey in entries) {
              list.push(entries[recKey]);
            }
          }
        }
        setAllQPs(list);
      } catch (err) {
        console.error('Error fetching QPs', err);
        setAllQPs([]);
      }
    };
    fetchAllQPs();
  }, []);

  const academicYears = useMemo(() => {
    if (!programme || !department || !batch || allQPs.length === 0) {
      return [];
    }
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/[–—]/g, '-');
    const needDept = norm(department);
    const needProg = norm(programme);
    const needBatch = norm(batch);

    const yrs = allQPs
      .filter(qp => norm(qp.department || qp.dept || '') === needDept && (!qp.programme || norm(qp.programme) === needProg) && norm(qp.batch || '') === needBatch)
      .map(qp => qp.academic_year || qp.academicYear)
      .filter(Boolean);

    return [...new Set(yrs)];
  }, [programme, department, batch, allQPs]);

  const semesters = useMemo(() => {
    if (!programme || !department || !batch || !academicYear || allQPs.length === 0) {
      return [];
    }
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/[–—]/g, '-');
    const needDept = norm(department);
    const needProg = norm(programme);
    const needBatch = norm(batch);
    const needAy = norm(academicYear);

    const sems = allQPs
      .filter(qp => norm(qp.department || qp.dept || '') === needDept && (!qp.programme || norm(qp.programme) === needProg) && norm(qp.batch || '') === needBatch && norm(qp.academic_year || qp.academicYear || '') === needAy)
      .map(qp => String(qp.semester || qp.sem || '').trim())
      .filter(Boolean);

    return [...new Set(sems)];
  }, [programme, department, batch, academicYear, allQPs]);

  useEffect(() => {
    // Load subjects (elective only) from syllabus_data for selected prog/dept/reg and semester
    const fetchSubjects = async () => {
      setSubjects([]);
      if (!programme || !department || !batch || !academicYear || !semester) return;
      try {
        const progKey = formatProgrammeKey(programme);
        const regulation = getRegulationForBatch(progKey, batch);
        const syllabusKey = `${progKey}_${sanitizeKey(department)}_${sanitizeKey(regulation)}`;
        const snap = await get(dbRef(rtdb, `syllabus_data/${syllabusKey}`));
        const needSem = String(semester).replace(/[^0-9]/g, '');
        const list = [];
        if (snap.exists()) {
          const data = snap.val();
          const semList = data.semesters?.[needSem] || [];
          semList.forEach(s => {
            if (s.isElective) list.push({ value: s.code, text: `${s.code} - ${s.name}` });
          });
        }
        setSubjects(list);
      } catch (err) {
        console.error(err);
        setSubjects([]);
      }
    };
    fetchSubjects();
  }, [programme, department, batch, academicYear, semester, getRegulationForBatch]);

  // Load students and enrolled set for selected subject
  useEffect(() => {
    const loadStudents = async () => {
      setStudents([]);
      setEnrolled({});
      if (!programme || !department || !batch) return;
      try {
        const progKey = formatProgrammeKey(programme);
        const compositeKey = `${sanitizeKey(batch)}_${progKey}_${sanitizeKey(department)}`;
        const snap = await get(dbRef(rtdb, `students/${compositeKey}`));
        const list = [];
        if (snap.exists()) {
          const data = snap.val();
          Object.entries(data).forEach(([k, v]) => {
            if (!k.startsWith('_')) list.push({ reg: k, name: v });
          });
        }
        setStudents(list);

        if (subject && semester && academicYear) {
          const progKey = formatProgrammeKey(programme);
          const path = `course_enrollments/${progKey}/${sanitizeKey(department)}/${sanitizeKey(batch)}/${sanitizeKey(academicYear)}/${semester}/${subject}`;
          const enrollSnap = await get(dbRef(rtdb, path));
          const e = {};
          if (enrollSnap.exists()) {
            const obj = enrollSnap.val();
            Object.keys(obj).forEach(k => { e[k] = true; });
          }
          setEnrolled(e);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadStudents();
  }, [programme, department, batch, subject, semester, academicYear]);

  const toggleEnroll = (reg, checked) => {
    setEnrolled(prev => ({ ...prev, [reg]: !!checked }));
  };

  const saveEnrollment = async () => {
    if (!programme || !department || !batch || !academicYear || !semester || !subject) {
      setMessage({ type: 'error', text: 'Please select programme/department/batch/academic year/semester and subject.' });
      return;
    }
    try {
      const progKey = formatProgrammeKey(programme);
      const path = `course_enrollments/${progKey}/${sanitizeKey(department)}/${sanitizeKey(batch)}/${sanitizeKey(academicYear)}/${semester}/${subject}`;
      const payload = {};
      Object.keys(enrolled).forEach(reg => { if (enrolled[reg]) payload[reg] = true; });
      await set(dbRef(rtdb, path), payload);
      setMessage({ type: 'success', text: 'Enrollment saved.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to save enrollment.' });
    }
  };

  return (
    <Layout title="Course Enrolment">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">

        {/* Filters/Search Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative col-span-2 md:col-span-3">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search by student name or register number..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-zinc-200 rounded-xl focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/20 outline-none transition-all shadow-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Filters and Enrollment UI */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
            <h2 className="text-xl font-bold text-zinc-800 flex items-center gap-2">
              <Filter className="text-[#120c7a]" />
              Course Enrollment Filters
            </h2>
          </div>
          
          <div className="p-6">
            {message.text && (
              <div className={`mb-6 p-4 rounded-xl font-bold flex flex-col gap-1 border-l-4 ${message.type === 'error' ? 'bg-red-50 text-red-600 border-red-500' : 'bg-green-50 text-green-700 border-green-500'}`}>
                {message.text}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">Programme</label>
                <select className="w-full appearance-none bg-slate-50/50 border border-zinc-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all font-medium" value={programme} onChange={e => { setProgramme(e.target.value); setDepartment(''); setBatch(''); setAcademicYear(''); setSemester(''); setSubject(''); }}>
                  <option value="">Select Programme</option>
                  {Object.keys(PROGRAMME_DEPARTMENTS).map(p => <option key={p} value={p}>{formatProgDisplay(p)}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">Department</label>
                <select className="w-full appearance-none bg-slate-50/50 border border-zinc-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all font-medium disabled:opacity-50" value={department} onChange={e => { setDepartment(e.target.value); setBatch(''); setAcademicYear(''); setSemester(''); setSubject(''); }} disabled={!programme}>
                  <option value="">Select Department</option>
                  {programme && PROGRAMME_DEPARTMENTS[formatProgrammeKey(programme)]?.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">Batch</label>
                <select className="w-full appearance-none bg-slate-50/50 border border-zinc-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all font-medium disabled:opacity-50" value={batch} onChange={e => { setBatch(e.target.value); setAcademicYear(''); setSemester(''); setSubject(''); }} disabled={!programme}>
                  <option value="">Select Batch</option>
                  {availableBatches.map(b => <option key={b} value={b}>{formatBatchDisplay(b)}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">Academic Year</label>
                <select className="w-full appearance-none bg-slate-50/50 border border-zinc-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all font-medium disabled:opacity-50" value={academicYear} onChange={e => { setAcademicYear(e.target.value); setSemester(''); setSubject(''); }}>
                  <option value="">Select Academic Year</option>
                  {academicYears.map(ay => <option key={ay} value={ay}>{ay}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">Semester</label>
                <select className="w-full appearance-none bg-slate-50/50 border border-zinc-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all font-medium disabled:opacity-50" value={semester} onChange={e => { setSemester(e.target.value); setSubject(''); }}>
                  <option value="">Select Semester</option>
                  {semesters.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">Subject</label>
                <select className="w-full appearance-none bg-slate-50/50 border border-zinc-200 rounded-xl px-4 py-2.5 pr-10 focus:ring-2 focus:ring-[#120c7a] outline-none transition-all font-medium disabled:opacity-50" value={subject} onChange={e => setSubject(e.target.value)}>
                  <option value="">Select Subject</option>
                  {subjects.map(s => <option key={s.value} value={s.value}>{s.text}</option>)}
                </select>
              </div>
            </div>

            {subject && (
              <div className="mt-8 rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                <div className="bg-[#120c7a] px-6 py-2 flex justify-between items-center">
                  <h2 className="text-white font-bold text-sm">Course Enrollment Table</h2>
                  <div className="flex gap-2">
                    <button 
                      onClick={saveEnrollment} 
                      className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      Save Enrollment
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto bg-white">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-[#f8fafc]">
                        <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-left w-48">Register Number</th>
                        <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-left">Student Name</th>
                        <th className="px-6 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-center w-24">Enroll</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map(s => {
                        const isSearchMatch = !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.reg.toLowerCase().includes(searchTerm.toLowerCase());
                        if (!isSearchMatch) return null;
                        
                        return (
                          <tr key={s.reg} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-3 text-sm font-mono text-slate-600 tabular-nums border-r border-slate-50">{s.reg}</td>
                            <td className="px-6 py-3 text-sm font-medium text-slate-800 border-r border-slate-50">{s.name}</td>
                            <td className="px-6 py-3 text-center border-r border-slate-50">
                              <input
                                type="checkbox"
                                checked={!!enrolled[s.reg]}
                                onChange={e => toggleEnroll(s.reg, e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-[#120c7a] focus:ring-[#120c7a] mx-auto block cursor-pointer"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
