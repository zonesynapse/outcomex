import { useState, useEffect, useMemo } from "react";
import Layout from "../components/Layout";
import { rtdb } from "../firebase";
import { ref, onValue, set, get } from "firebase/database";
import { 
  Users, 
  Search, 
  Filter, 
  Save, 
  ChevronDown, 
  X,
  BookOpen,
  CheckCircle2,
  FileText
} from "lucide-react";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, formatProgDisplay } from "../lib/utils";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

const deriveSemesterNumber = (label) => {
  if (!label) return '';
  const m = String(label).match(/(\d+)/);
  return m ? m[1] : '';
};

export default function CourseEnrolment() {
  const { departments: deptMap, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);

  // Selection States
  const [programme, setProgramme] = useState("");
  const [department, setDepartment] = useState("");
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [subject, setSubject] = useState("");

  // Data States
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [enrolments, setEnrolments] = useState({}); // { examNo: boolean }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  // Success Feedback State
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const batches = useMemo(() => {
    const progKey = formatProgrammeKey(programme);
    return getActiveBatches(progKey);
  }, [programme, getActiveBatches]);

  const academicYearsAvailable = useMemo(() => getAcademicYears(batch), [batch]);

  const semestersAvailable = useMemo(() => {
    if (!batch || !academicYear) return [];
    const index = academicYearsAvailable.indexOf(academicYear);
    if (index === -1) return [];
    
    const sem1 = (index * 2) + 1;
    const sem2 = (index * 2) + 2;
    const allSems = [sem1, sem2];
    
    const getOrdinal = (n) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    return allSems.map(semNum => `${getOrdinal(semNum)} Semester`);
  }, [batch, academicYear, academicYearsAvailable]);

  // Fetch Subjects from Syllabus
  useEffect(() => {
    const fetchSubjects = async () => {
      const progKey = formatProgrammeKey(programme);
      const regulation = getRegulationForBatch(progKey, batch);
      if (!programme || !department || !regulation || !semester) {
        setSubjects([]);
        return;
      }

      const deptKey = sanitizeKey(department);
      const regKey = sanitizeKey(regulation);
      const syllabusKey = `${progKey}_${deptKey}_${regKey}`;
      const semNum = deriveSemesterNumber(semester);

      if (!semNum) return;

      try {
        const syllabusRef = ref(rtdb, `syllabus_data/${syllabusKey}`);
        const snapshot = await get(syllabusRef);
        const data = snapshot.val();
        
        if (data && data.semesters && data.semesters[semNum]) {
          const fetchedSubjects = data.semesters[semNum]
            .filter(sub => sub != null && sub.isActive !== false && sub.isElective === true)
            .map(sub => ({
              id: sub.code,
              name: sub.name,
              isElective: true
            }));
          setSubjects(fetchedSubjects);
        } else {
          setSubjects([]);
        }
      } catch (error) {
        console.error("Error fetching subjects:", error);
        setSubjects([]);
      }
    };

    fetchSubjects();
  }, [programme, department, batch, semester, getRegulationForBatch]);

  // Fetch Students and Existing Enrolments
  useEffect(() => {
    const fetchData = () => {
      if (!programme || !department || !batch || !academicYear || !semester || !subject) {
        setStudents([]);
        setEnrolments({});
        return;
      }

      setLoading(true);
      const progKey = formatProgrammeKey(programme);
      const deptKey = sanitizeKey(department);
      const batchKey = sanitizeKey(batch);
      const yearKey = sanitizeKey(academicYear);
      const semNum = deriveSemesterNumber(semester);
      const subjectKey = sanitizeKey(subject);

      // Path for Student List
      const listKey = `${batchKey}_${progKey}_${deptKey}`;
      const studentsRef = ref(rtdb, `students/${listKey}`);

      // Path for Enrolments
      const enrolKey = `${progKey}_${deptKey}_${batchKey}_${yearKey}_${semNum}_${subjectKey}`;
      const enrolmentsRef = ref(rtdb, `course_enrolments/${enrolKey}`);

      // Sequential fetching
      get(studentsRef).then(studentSnap => {
        const studentData = studentSnap.val() || {};
        const studentsList = Object.entries(studentData)
          .filter(([key]) => key !== '_meta')
          .map(([examNo, name]) => ({ examNo, name }));
        
        setStudents(studentsList.sort((a,b) => a.examNo.localeCompare(b.examNo)));

        get(enrolmentsRef).then(enrolSnap => {
          setEnrolments(enrolSnap.val() || {});
          setLoading(false);
        });
      });
    };

    fetchData();
  }, [programme, department, batch, academicYear, semester, subject]);

  const toggleEnrolment = (examNo) => {
    setEnrolments(prev => ({
      ...prev,
      [examNo]: !prev[examNo]
    }));
  };

  const enrolAll = () => {
    const newEnrolments = {};
    students.forEach(s => {
      newEnrolments[s.examNo] = true;
    });
    setEnrolments(newEnrolments);
  };

  const clearAll = () => {
    setEnrolments({});
  };

  const saveEnrolments = async () => {
    if (!programme || !department || !batch || !academicYear || !semester || !subject) return;

    setSaving(true);
    const progKey = formatProgrammeKey(programme);
    const deptKey = sanitizeKey(department);
    const batchKey = sanitizeKey(batch);
    const yearKey = sanitizeKey(academicYear);
    const semNum = deriveSemesterNumber(semester);
    const subjectKey = sanitizeKey(subject);

    const enrolKey = `${progKey}_${deptKey}_${batchKey}_${yearKey}_${semNum}_${subjectKey}`;
    
    try {
      await set(ref(rtdb, `course_enrolments/${enrolKey}`), enrolments);
      setSuccessMessage("Enrolments saved successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Save error:", error);
      alert("Failed to save enrolments.");
    } finally {
      setSaving(false);
    }
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.examNo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const enrolledCount = Object.values(enrolments).filter(Boolean).length;

  return (
    <Layout title="Course Enrolment">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Users size={28} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-zinc-800">Course Enrolment</h3>
              <p className="text-zinc-500 text-sm">Assign students to specific subjects and electives</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${showFilters ? 'bg-zinc-100 text-zinc-600' : 'bg-blue-600 text-white shadow-lg shadow-blue-200'}`}
            >
              <Filter size={18} />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
          </div>
        </div>

        {/* Filters Card */}
        {showFilters && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
              {/* Programme */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Programme</label>
                <div className="relative">
                  <select 
                    value={programme}
                    onChange={(e) => {
                      setProgramme(e.target.value);
                      setDepartment("");
                      setBatch("");
                    }}
                    className="w-full pl-4 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-zinc-700 font-medium"
                  >
                    <option value="">Select</option>
                    {Object.keys(deptMap).map(p => (
                      <option key={p} value={p}>{formatProgDisplay(p)}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              {/* Department */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Department</label>
                <div className="relative">
                  <select 
                    value={department}
                    disabled={!programme}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full pl-4 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-zinc-700 font-medium disabled:opacity-50"
                  >
                    <option value="">Select</option>
                    {programme && deptMap[programme]?.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              {/* Batch */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Batch</label>
                <div className="relative">
                  <select 
                    value={batch}
                    disabled={!programme}
                    onChange={(e) => {
                      setBatch(e.target.value);
                      setAcademicYear("");
                      setSemester("");
                    }}
                    className="w-full pl-4 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-zinc-700 font-medium disabled:opacity-50"
                  >
                    <option value="">Select</option>
                    {batches.map(b => (
                      <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              {/* Academic Year */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Academic Year</label>
                <div className="relative">
                  <select 
                    value={academicYear}
                    disabled={!batch}
                    onChange={(e) => {
                      setAcademicYear(e.target.value);
                      setSemester("");
                    }}
                    className="w-full pl-4 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-zinc-700 font-medium disabled:opacity-50"
                  >
                    <option value="">Select</option>
                    {academicYearsAvailable.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              {/* Semester */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Semester</label>
                <div className="relative">
                  <select 
                    value={semester}
                    disabled={!academicYear}
                    onChange={(e) => setSemester(e.target.value)}
                    className="w-full pl-4 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-zinc-700 font-medium disabled:opacity-50"
                  >
                    <option value="">Select</option>
                    {semestersAvailable.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Subject</label>
                <div className="relative">
                  <select 
                    value={subject}
                    disabled={!semester}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full pl-4 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-zinc-700 font-medium disabled:opacity-50"
                  >
                    <option value="">Select Subject</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.id} - {s.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        {subject ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Student List */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
                <div className="p-4 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    <input 
                      type="text"
                      placeholder="Search students..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={enrolAll}
                      className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-all"
                    >
                      Enrol All
                    </button>
                    <button 
                      onClick={clearAll}
                      className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-all"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-zinc-50/50 text-zinc-500 text-[10px] uppercase tracking-wider font-bold">
                        <th className="px-6 py-3 w-16">No.</th>
                        <th className="px-6 py-3">Exam No.</th>
                        <th className="px-6 py-3">Student Name</th>
                        <th className="px-6 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {loading ? (
                        <tr>
                          <td colSpan="4" className="px-6 py-10 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                              <span className="text-zinc-500 text-sm">Fetching student list...</span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredStudents.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="px-6 py-10 text-center text-zinc-400 italic">
                            No students found matching your search.
                          </td>
                        </tr>
                      ) : (
                        filteredStudents.map((s, idx) => {
                          const isEnrolled = !!enrolments[s.examNo];
                          return (
                            <tr 
                              key={s.examNo} 
                              className={`group transition-colors ${isEnrolled ? 'bg-blue-50/30' : 'hover:bg-zinc-50'}`}
                            >
                              <td className="px-6 py-4 text-sm text-zinc-400 font-mono">{idx + 1}</td>
                              <td className="px-6 py-4 text-sm font-bold text-zinc-700">{s.examNo}</td>
                              <td className="px-6 py-4 text-sm text-zinc-600">{s.name}</td>
                              <td className="px-6 py-4 text-center">
                                <button 
                                  onClick={() => toggleEnrolment(s.examNo)}
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isEnrolled ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'}`}
                                >
                                  {isEnrolled ? <CheckCircle2 size={20} /> : <Users size={20} />}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Status & Save */}
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 space-y-6 sticky top-6">
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-zinc-800 flex items-center gap-2">
                    <Users size={20} className="text-blue-600" />
                    Enrolment Summary
                  </h2>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">Total Students</p>
                      <p className="text-2xl font-black text-zinc-800">{students.length}</p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-[10px] font-bold text-blue-400 uppercase">Enrolled</p>
                      <p className="text-2xl font-black text-blue-600">{enrolledCount}</p>
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-2">
                    <div className="flex items-center gap-2 text-zinc-600">
                      <BookOpen size={16} className="text-blue-500" />
                      <span className="text-xs font-bold uppercase">Current Subject</span>
                    </div>
                    <p className="text-sm font-bold text-zinc-800 line-clamp-2">
                      {subjects.find(s => s.id === subject)?.id} - {subjects.find(s => s.id === subject)?.name}
                    </p>
                    {subjects.find(s => s.id === subject)?.isElective && (
                      <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-lg border border-amber-200">ELECTIVE</span>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={saveEnrolments}
                    disabled={saving || loading}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 rounded-xl text-white font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all disabled:opacity-50"
                  >
                    {saving ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save size={18} />
                        Save Enrolments
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-zinc-400 text-center">
                    Enrolments are saved per subject within the context of the selected batch and academic year.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-zinc-200">
            <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-300 mb-4">
              <FileText size={32} />
            </div>
            <h3 className="text-lg font-bold text-zinc-600">No Subject Selected</h3>
            <p className="text-zinc-400 text-sm">Please use the filters above to select a subject and start enrolment.</p>
          </div>
        )}

        {/* Success Toast */}
        {showSuccess && (
          <div className="fixed bottom-6 right-6 flex items-center gap-3 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 z-[1000]">
            <div className="bg-green-500 p-1 rounded-full">
              <CheckCircle2 size={18} />
            </div>
            <span className="font-semibold">{successMessage}</span>
          </div>
        )}
      </div>
    </Layout>
  );
}
