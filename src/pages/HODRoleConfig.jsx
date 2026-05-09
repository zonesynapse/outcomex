import { useState, useEffect, useMemo } from "react";
import { rtdb, auth } from "../firebase";
import { ref, onValue, update, get, set } from "firebase/database";
import { 
  Users, 
  BookOpen, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  ChevronDown, 
  Plus, 
  Trash2,
  Search,
  Check,
  User
} from "lucide-react";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { useBatches } from "../hooks/useBatches";
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, formatProgDisplay } from "../lib/utils";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

export default function HODRoleConfig() {
  const { departments: deptMap, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);

  const [currentUserData, setCurrentUserData] = useState(null);
  const [facultyList, setFacultyList] = useState([]);
  const [syllabusData, setSyllabusData] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [allAssignments, setAllAssignments] = useState({}); // Global assignments for department
  
  // Filter States
  const [programme, setProgramme] = useState("");
  const [syllabusDept, setSyllabusDept] = useState("");
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [searchTerm, setSearchTerm] = useState("");

  const defaultAdminEmail = import.meta.env.VITE_DEFAULT_ADMIN_EMAIL;
  const masterAdminEmail = import.meta.env.VITE_MASTER_ADMIN_EMAIL;

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  // 1. Fetch Current User Data
  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      const userRef = ref(rtdb, `users/${user.uid}`);
      onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          setCurrentUserData(data);
          if (data.department) {
            setSyllabusDept(data.department);
          }
          if (data.programme) {
            setProgramme(data.programme);
          }
        }
        setLoading(false);
      });
    }
  }, []);

  // 2. Fetch Faculty List (Same Department)
  useEffect(() => {
    if (currentUserData?.department) {
      const usersRef = ref(rtdb, "users");
      onValue(usersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const filtered = Object.values(data).filter(
            u => u.department === currentUserData.department && u.isApproved && u.email !== masterAdminEmail
          );
          setFacultyList(filtered);
        }
      });
    }
  }, [currentUserData]);

  // 3. Derived Filters
  const batches = useMemo(() => {
    if (!programme) return [];
    const progKey = formatProgrammeKey(programme);
    return getActiveBatches(progKey);
  }, [programme, getActiveBatches]);

  const academicYears = useMemo(() => {
    return batch ? getAcademicYears(batch) : [];
  }, [batch]);

  const regulation = useMemo(() => {
    if (batch && programme) {
      const progKey = formatProgrammeKey(programme);
      return getRegulationForBatch(progKey, batch) || "";
    }
    return "";
  }, [batch, programme, getRegulationForBatch]);

  const semesters = useMemo(() => {
    if (!batch || !academicYear) return [];
    const [batchStart] = batch.split("-").map(Number);
    const [yearStart] = academicYear.split("-").map(Number);
    const yearIndex = yearStart - batchStart;
    
    if (yearIndex < 0) return [];
    
    // Each year has 2 semesters
    const sem1 = (yearIndex * 2) + 1;
    const sem2 = (yearIndex * 2) + 2;
    
    return [String(sem1), String(sem2)];
  }, [batch, academicYear]);

  // 4. Fetch Syllabus Data
  useEffect(() => {
    if (programme && syllabusDept && regulation) {
      const progKey = formatProgrammeKey(programme);
      const syllabusKey = `${progKey}_${sanitizeKey(syllabusDept)}_${sanitizeKey(regulation)}`;
      const syllabusRef = ref(rtdb, `syllabus_data/${syllabusKey}`);
      
      onValue(syllabusRef, (snapshot) => {
        setSyllabusData(snapshot.val());
      });
    } else {
      setSyllabusData(null);
    }
  }, [programme, syllabusDept, regulation]);

  // 5. Fetch Existing Assignments
  useEffect(() => {
    if (programme && syllabusDept && batch && academicYear && semester) {
      const progKey = formatProgrammeKey(programme);
      const assignmentPath = `subject_assignments/${progKey}/${sanitizeKey(syllabusDept)}/${sanitizeKey(batch)}/${sanitizeKey(academicYear)}/${semester}`;
      const assignmentRef = ref(rtdb, assignmentPath);
      
      onValue(assignmentRef, (snapshot) => {
        setAssignments(snapshot.val() || {});
      });
    } else {
      setAssignments({});
    }
  }, [programme, syllabusDept, batch, academicYear, semester]);
  
  // 5.1 Fetch All Assignments Globally (All Departments)
  useEffect(() => {
    const assignmentsRef = ref(rtdb, "subject_assignments");
    const unsubscribe = onValue(assignmentsRef, (snapshot) => {
      const data = snapshot.val() || {};
      const globalAssignments = {}; // facultyUid -> Array of assignment objects

      Object.entries(data).forEach(([progKey, depts]) => {
        Object.entries(depts).forEach(([deptKey, batches]) => {
          Object.entries(batches).forEach(([b, ays]) => {
            Object.entries(ays).forEach(([ay, sems]) => {
              Object.entries(sems).forEach(([sem, facultyAssignments]) => {
                Object.entries(facultyAssignments).forEach(([facultyUid, codes]) => {
                  if (Array.isArray(codes)) {
                    if (!globalAssignments[facultyUid]) globalAssignments[facultyUid] = [];
                    codes.forEach(code => {
                      globalAssignments[facultyUid].push({
                        code,
                        progKey,
                        dept: deptKey,
                        batch: b,
                        academicYear: ay,
                        semester: sem,
                        key: `${progKey}_${deptKey}_${b}_${ay}_${sem}_${code}`
                      });
                    });
                  }
                });
              });
            });
          });
        });
      });
      setAllAssignments(globalAssignments);
    });
    return () => unsubscribe();
  }, []);

  // 6. Available Subjects for current semester
  const availableSubjects = useMemo(() => {
    if (!syllabusData || !semester) return [];
    return (syllabusData.semesters?.[semester] || []).filter(sub => sub != null && sub.isActive !== false);
  }, [syllabusData, semester]);

  const handleAssignSubject = (facultyUid, subjectCode) => {
    if (!subjectCode) return;
    
    // Check if subject is already assigned to ANYONE
    const assignedTo = Object.entries(assignments).find(([ , subs]) => subs.includes(subjectCode));
    
    if (assignedTo) {
      const [uid] = assignedTo;
      if (uid === facultyUid) {
        showToast("Subject already assigned to this faculty", "error");
      } else {
        const otherFaculty = facultyList.find(f => f.uid === uid);
        showToast(`Subject already assigned to ${otherFaculty?.facultyName || 'another faculty'}`, "error");
      }
      return;
    }

    const currentFacultyAssignments = assignments[facultyUid] || [];
    const newAssignments = {
      ...assignments,
      [facultyUid]: [...currentFacultyAssignments, subjectCode]
    };
    setAssignments(newAssignments);
  };

  const handleRemoveSubject = (facultyUid, subjectCode) => {
    const currentFacultyAssignments = assignments[facultyUid] || [];
    const newAssignments = {
      ...assignments,
      [facultyUid]: currentFacultyAssignments.filter(code => code !== subjectCode)
    };
    setAssignments(newAssignments);
  };

  const handleSaveAssignments = async () => {
    if (!programme || !batch || !academicYear || !semester || !syllabusDept) {
      showToast("Please select all filters before saving", "error");
      return;
    }

    setSaving(true);
    try {
      const progKey = formatProgrammeKey(programme);
      const assignmentPath = `subject_assignments/${progKey}/${sanitizeKey(syllabusDept)}/${sanitizeKey(batch)}/${sanitizeKey(academicYear)}/${semester}`;
      const assignmentRef = ref(rtdb, assignmentPath);
      
      const updates = {};
      const allAssignedSubjects = new Set();

      facultyList.forEach(f => {
        updates[f.uid] = assignments[f.uid] || null;
        if (assignments[f.uid]) {
          assignments[f.uid].forEach(code => allAssignedSubjects.add(code));
        }
      });

      // Process newly assigned subjects' COs
      for (const subjectCode of allAssignedSubjects) {
        let courseRef = ref(rtdb, `courses/${progKey}/${sanitizeKey(syllabusDept)}/${sanitizeKey(regulation)}/${sanitizeKey(subjectCode)}`);
        let snap = await get(courseRef);
        let isOverall = false;

        if (!snap.exists()) {
          courseRef = ref(rtdb, `courses/${progKey}/Overall/${sanitizeKey(regulation)}/${sanitizeKey(subjectCode)}`);
          snap = await get(courseRef);
          isOverall = true;
        }

        if (snap.exists()) {
          const courseData = snap.val();
          if (courseData.co && Array.isArray(courseData.co)) {
            const coDict = {};
            const newCoursesCO = [];
            let needsOutcomeCopy = false;
            let hasExtraFieldsInCourseNode = false;

            courseData.co.forEach((c) => {
              if (c.description || c.domain || c.level) {
                coDict[c.id] = {
                  description: c.description || "",
                  domain: c.domain || "",
                  level: c.level || ""
                };
                needsOutcomeCopy = true;
              }
              newCoursesCO.push({
                id: c.id,
                content: c.content || ""
              });
              if (c.description !== undefined || c.domain !== undefined || c.level !== undefined) {
                hasExtraFieldsInCourseNode = true;
              }
            });

            if (needsOutcomeCopy) {
              const coKey = `${sanitizeKey(syllabusDept)}_${sanitizeKey(regulation)}_${sanitizeKey(subjectCode)}_${sanitizeKey(academicYear)}`;
              const coOutcomesRef = ref(rtdb, `course_outcomes/${coKey}`);
              
              // Only save if it doesn't already exist or overwrite it? The requirement implies moving it over explicitly.
              await set(coOutcomesRef, coDict);

              // If it's not overall, we remove description/domain/level from courses node
              if (!isOverall && hasExtraFieldsInCourseNode) {
                await update(courseRef, { co: newCoursesCO });
              }
            }
          }
        }
      }
      
      await update(assignmentRef, updates);
      showToast("Assignments saved successfully!");
    } catch (error) {
      console.error("Save Error:", error);
      showToast("Failed to save assignments", "error");
    } finally {
      setSaving(false);
    }
  };

  const isFiltersSelected = programme && batch && academicYear && semester;

  const filteredFaculty = facultyList.filter(f => 
    f.facultyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.facultyId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Layout title="Faculty Course Allocation">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Faculty Course Allocation">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {toast.show && (
          <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="font-bold">{toast.message}</span>
          </div>
        )}

        {/* Header Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-[#120c7a] rounded-xl text-white shadow-lg">
                <Users size={28} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-zinc-800">Faculty Course Allocation</h1>
                <p className="text-zinc-500 text-sm">Assign subjects to faculty members in {currentUserData?.department}</p>
              </div>
            </div>
            <button
              onClick={handleSaveAssignments}
              disabled={saving}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-900/20 transition-all disabled:opacity-50"
            >
              {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={20} />}
              Allocate
            </button>
          </div>
        </div>

        {/* Filters Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-600">Batch</label>
              <div className="relative">
                <select 
                  disabled={!programme}
                  value={batch} 
                  onChange={(e) => { setBatch(e.target.value); setAcademicYear(""); setSemester(""); }}
                  className="w-full appearance-none bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium disabled:opacity-50"
                >
                  <option value="">Select Batch</option>
                  {batches.map(b => (
                    <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-600">Academic Year</label>
              <div className="relative">
                <select 
                  disabled={!batch}
                  value={academicYear} 
                  onChange={(e) => { setAcademicYear(e.target.value); setSemester(""); }}
                  className="w-full appearance-none bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium disabled:opacity-50"
                >
                  <option value="">Select Year</option>
                  {academicYears.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-600">Semester</label>
              <div className="relative">
                <select 
                  disabled={!academicYear}
                  value={semester} 
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full appearance-none bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 pr-10 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium disabled:opacity-50"
                >
                  <option value="">Select Semester</option>
                  {semesters.map(s => (
                    <option key={s} value={s}>{s}{s === '1' ? 'st' : s === '2' ? 'nd' : s === '3' ? 'rd' : 'th'} Sem</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
              </div>
            </div>
          </div>
          
          {regulation && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2 text-blue-700 text-sm font-medium">
              <BookOpen size={16} />
              Mapped Regulation: {regulation}
            </div>
          )}
        </div>

        {/* Faculty Assignment Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Faculty List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-800 flex items-center gap-2">
                <Users size={20} className="text-[#120c7a]" />
                Faculty Members
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Search faculty..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 transition-all w-64"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredFaculty.map(faculty => (
                <div key={faculty.uid} className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 space-y-4 hover:border-[#120c7a]/30 transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-zinc-800">{faculty.displayName || faculty.facultyName}</h3>
                      <p className="text-xs text-zinc-500 font-medium">{faculty.facultyId} • {faculty.designation}</p>
                    </div>
                    {faculty.uid === auth.currentUser?.uid && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full uppercase">You</span>
                    )}
                  </div>

                  <div className="space-y-3">
                    {/* Editable Current Selection */}
                    {isFiltersSelected && (
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-[#120c7a] uppercase tracking-wider bg-blue-50 px-1.5 py-0.5 rounded">Current Selection</label>
                        <div className="flex flex-wrap gap-2">
                          {(assignments[faculty.uid] || []).map(code => {
                            const sub = availableSubjects.find(s => s.code === code);
                            return (
                              <div key={code} className="group flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs font-medium text-blue-900">
                                <span className="font-bold">{code}</span>
                                <span className="truncate max-w-[100px] text-blue-700">{sub?.name || 'Unknown'}</span>
                                <button 
                                  onClick={() => handleRemoveSubject(faculty.uid, code)}
                                  className="text-blue-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            );
                          })}
                          {(assignments[faculty.uid] || []).length === 0 && (
                            <p className="text-[10px] text-zinc-400 italic pl-1">No subjects assigned for this semester</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Other Global Assignments */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider px-1.5 py-0.5">
                        {isFiltersSelected ? 'Other Assignments' : 'Total Assignments'}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {(allAssignments[faculty.uid] || []).filter(a => {
                          if (!isFiltersSelected) return true;
                          const progKey = formatProgrammeKey(programme);
                          const isCurrentContext = 
                            a.progKey === progKey && 
                            a.dept === sanitizeKey(syllabusDept) && 
                            a.batch === batch && 
                            a.academicYear === academicYear && 
                            String(a.semester) === String(semester);
                          return !isCurrentContext;
                        }).map((assignment) => (
                          <div key={assignment.key} className="flex flex-col p-2 bg-zinc-50 border border-zinc-100 rounded-lg text-[9px] space-y-1 min-w-[100px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-zinc-700">{assignment.code}</span>
                              <span className="text-[8px] font-bold px-1.5 bg-zinc-200 text-zinc-600 rounded">
                                {assignment.dept}
                              </span>
                            </div>
                            <div className="text-zinc-400 font-medium">
                              {assignment.batch} • S{assignment.semester}
                            </div>
                          </div>
                        ))}
                        {(allAssignments[faculty.uid] || []).length === 0 && (
                          <p className="text-[10px] text-zinc-400 italic pl-1">No other assignments found</p>
                        )}
                        {isFiltersSelected && (allAssignments[faculty.uid] || []).filter(a => {
                          const progKey = formatProgrammeKey(programme);
                          return !(a.progKey === progKey && a.dept === sanitizeKey(syllabusDept) && a.batch === batch && a.academicYear === academicYear && String(a.semester) === String(semester));
                        }).length === 0 && (allAssignments[faculty.uid] || []).length > 0 && (
                          <p className="text-[10px] text-zinc-400 italic pl-1">No assignments in other contexts</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-50">
                    <div className="relative">
                      <select 
                        disabled={!semester || availableSubjects.length === 0}
                        onChange={(e) => {
                          handleAssignSubject(faculty.uid, e.target.value);
                          e.target.value = "";
                        }}
                        className="w-full appearance-none bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 pr-8 outline-none focus:ring-2 focus:ring-blue-100 transition-all text-xs font-bold text-zinc-600 disabled:opacity-50"
                      >
                        <option value="">+ Assign Subject</option>
                        {availableSubjects.map(sub => {
                          const isAssigned = Object.values(assignments).some(subs => subs.includes(sub.code));
                          return (
                            <option key={sub.code} value={sub.code} disabled={isAssigned}>
                              {sub.code} - {sub.name} {isAssigned ? '(Assigned)' : ''}
                            </option>
                          );
                        })}
                      </select>
                      <Plus className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Syllabus Info */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-zinc-800 flex items-center gap-2">
              <BookOpen size={20} className="text-[#120c7a]" />
              Syllabus Overview
            </h2>
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6 space-y-6">
              {!semester ? (
                <div className="text-center py-10 space-y-3">
                  <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center mx-auto text-zinc-300">
                    <Search size={24} />
                  </div>
                  <p className="text-sm text-zinc-500">Select filters to view available subjects</p>
                </div>
              ) : !syllabusData ? (
                <div className="text-center py-10 space-y-3">
                  <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-300">
                    <AlertCircle size={24} />
                  </div>
                  <p className="text-sm text-amber-600 font-medium">No syllabus found for this regulation</p>
                  <p className="text-xs text-zinc-400">Please upload syllabus in the Upload page first.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
                    <span className="text-sm font-bold text-zinc-700">Semester {semester}</span>
                    <span className="px-2 py-1 bg-zinc-100 rounded text-[10px] font-bold text-zinc-500 uppercase">
                      {availableSubjects.length} Subjects
                    </span>
                  </div>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {availableSubjects.map(sub => {
                      const allocatedFacultyUid = Object.keys(assignments).find(uid => assignments[uid].includes(sub.code));
                      const allocatedFaculty = facultyList.find(f => f.uid === allocatedFacultyUid);
                      const isAllocated = !!allocatedFaculty;

                      return (
                        <div 
                          key={sub.code} 
                          className={`p-3 border rounded-xl space-y-1 transition-all ${
                            isAllocated 
                              ? "bg-emerald-50 border-emerald-200 shadow-sm" 
                              : "bg-zinc-50 border-zinc-100"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${isAllocated ? "text-emerald-700" : "text-[#120c7a]"}`}>
                                {sub.code}
                              </span>
                              {isAllocated ? (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[8px] font-bold uppercase tracking-tight">
                                  <Check size={8} /> Allocated
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-zinc-200 text-zinc-500 rounded text-[8px] font-bold uppercase tracking-tight">
                                  Pending
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-zinc-400">{sub.credits} Credits</span>
                          </div>
                          <p className={`text-xs font-medium leading-relaxed ${isAllocated ? "text-emerald-900" : "text-zinc-700"}`}>
                            {sub.name}
                          </p>
                          {isAllocated && (
                            <div className="pt-1.5 flex items-center gap-1.5 border-t border-emerald-100/50 mt-1.5">
                              <User size={10} className="text-emerald-500" />
                              <span className="text-[10px] font-bold text-emerald-600 truncate">
                                {allocatedFaculty.facultyName}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
