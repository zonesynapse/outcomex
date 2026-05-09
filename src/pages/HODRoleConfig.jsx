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
  Send,
  Inbox,
  ExternalLink,
  X,
  ArrowRight,
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
  const [usersMap, setUsersMap] = useState({});
  const [syllabusData, setSyllabusData] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [allAssignments, setAllAssignments] = useState({}); // Global assignments for department

  // Request States
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [fulfilledRequests, setFulfilledRequests] = useState([]);
  const [requestModal, setRequestModal] = useState({ open: false, subject: null });
  const [targetDept, setTargetDept] = useState("");
  
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
  const [activeTab, setActiveTab] = useState("allocation"); // "allocation" or "requests"
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
          setUsersMap(data);
          const filtered = Object.values(data).filter(
            u => u.department === currentUserData.department && u.isApproved && u.email !== masterAdminEmail
          );
          setFacultyList(filtered);
        }
      });
    }
  }, [currentUserData]);

  // 2.1 Fetch Inter-Dept Requests
  useEffect(() => {
    if (currentUserData?.department) {
      const deptKey = sanitizeKey(currentUserData.department);
      
      // Fetch Incoming
      const incomingRef = ref(rtdb, `inter_dept_requests/incoming/${deptKey}`);
      const unsubIncoming = onValue(incomingRef, (snapshot) => {
        const data = snapshot.val();
        setIncomingRequests(data ? Object.values(data).filter(r => r.status === 'pending') : []);
      });

      // Fetch Sent
      const outgoingRef = ref(rtdb, `inter_dept_requests/outgoing/${deptKey}`);
      const unsubOutgoing = onValue(outgoingRef, (snapshot) => {
        const data = snapshot.val();
        setSentRequests(data ? Object.values(data) : []);
      });

      // Fetch Fulfilled (Requests I handled)
      const fulfilledRef = ref(rtdb, `inter_dept_requests/fulfilled/${deptKey}`);
      const unsubFulfilled = onValue(fulfilledRef, (snapshot) => {
        const data = snapshot.val();
        setFulfilledRequests(data ? Object.values(data) : []);
      });

      return () => {
        unsubIncoming();
        unsubOutgoing();
        unsubFulfilled();
      };
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

  const handleSendRequest = async () => {
    if (!targetDept || !requestModal.subject) return;
    
    setSaving(true);
    try {
      const reqId = Date.now().toString();
      const payload = {
        id: reqId,
        fromDept: currentUserData.department,
        toDept: targetDept,
        subjectCode: requestModal.subject.code,
        subjectName: requestModal.subject.name,
        programme,
        batch,
        academicYear,
        semester,
        status: 'pending',
        requestedAt: Date.now()
      };

      await set(ref(rtdb, `inter_dept_requests/incoming/${sanitizeKey(targetDept)}/${reqId}`), payload);
      await set(ref(rtdb, `inter_dept_requests/outgoing/${sanitizeKey(currentUserData.department)}/${reqId}`), payload);
      
      showToast("Request sent to other HOD successfully!");
      setRequestModal({ open: false, subject: null });
      setTargetDept("");
    } catch (err) {
      showToast("Failed to send request", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleProcessRequest = async (request, facultyUid, action) => {
    setSaving(true);
    try {
      const updates = {};
      const status = action === 'accept' ? 'accepted' : 'rejected';
      const fromKey = sanitizeKey(request.fromDept);
      const toKey = sanitizeKey(request.toDept);

      if (action === 'accept') {
        const progKey = formatProgrammeKey(request.programme);
        const assignPath = `subject_assignments/${progKey}/${fromKey}/${sanitizeKey(request.batch)}/${sanitizeKey(request.academicYear)}/${request.semester}/${facultyUid}`;
        
        // Add subject to faculty assignments
        const snap = await get(ref(rtdb, assignPath));
        const current = snap.val() || [];
        updates[assignPath] = [...new Set([...current, request.subjectCode])];
      }

      const statusUpdate = { 
        ...request, 
        status, 
        allocatedFacultyUid: facultyUid || null,
        processedAt: Date.now() 
      };

      updates[`inter_dept_requests/incoming/${toKey}/${request.id}`] = null; // Remove from active inbox
      updates[`inter_dept_requests/outgoing/${fromKey}/${request.id}`] = statusUpdate;
      
      // Log in a history node for the fulfiller
      updates[`inter_dept_requests/fulfilled/${toKey}/${request.id}`] = statusUpdate;

      await update(ref(rtdb), updates);
      showToast(`Request ${status} successfully!`);
    } catch (err) {
      showToast("Error processing request", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateFulfilledRequest = async (request, newFacultyUid) => {
    if (!newFacultyUid || newFacultyUid === request.allocatedFacultyUid) return;

    setSaving(true);
    try {
      const updates = {};
      const fromKey = sanitizeKey(request.fromDept);
      const toKey = sanitizeKey(request.toDept);
      const progKey = formatProgrammeKey(request.programme);
      const batchKey = sanitizeKey(request.batch);
      const ayKey = sanitizeKey(request.academicYear);
      const sem = request.semester;

      // 1. Remove subject from old faculty's assignments
      if (request.allocatedFacultyUid) {
        const oldAssignPath = `subject_assignments/${progKey}/${fromKey}/${batchKey}/${ayKey}/${sem}/${request.allocatedFacultyUid}`;
        const oldSnap = await get(ref(rtdb, oldAssignPath));
        const oldSubs = Array.isArray(oldSnap.val()) ? oldSnap.val() : [];
        updates[oldAssignPath] = oldSubs.filter(code => code !== request.subjectCode);
      }

      // 2. Add subject to new faculty's assignments
      const newAssignPath = `subject_assignments/${progKey}/${fromKey}/${batchKey}/${ayKey}/${sem}/${newFacultyUid}`;
      const newSnap = await get(ref(rtdb, newAssignPath));
      const newSubs = Array.isArray(newSnap.val()) ? newSnap.val() : [];
      updates[newAssignPath] = [...new Set([...newSubs, request.subjectCode])];

      const statusUpdate = { 
        ...request, 
        allocatedFacultyUid: newFacultyUid,
        processedAt: Date.now() 
      };

      updates[`inter_dept_requests/outgoing/${fromKey}/${request.id}`] = statusUpdate;
      updates[`inter_dept_requests/fulfilled/${toKey}/${request.id}`] = statusUpdate;

      await update(ref(rtdb), updates);
      showToast("Assigned faculty updated successfully!");
    } catch (err) {
      showToast("Error updating faculty", "error");
    } finally {
      setSaving(false);
    }
  };

  const allOtherDepts = useMemo(() => {
    const depts = [];
    Object.values(deptMap).forEach(list => depts.push(...list));
    return [...new Set(depts)].filter(d => d !== currentUserData?.department);
  }, [deptMap, currentUserData]);

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
              <div className="space-y-1">
                <h1 className="text-2xl font-black text-zinc-800 tracking-tight">Faculty Course Allocation</h1>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded uppercase tracking-widest border border-blue-100">{currentUserData?.department}</span>
                  <p className="text-zinc-400 text-xs font-medium">Internal & Inter-Departmental Management</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200 self-center">
                <button 
                  onClick={() => setActiveTab("allocation")}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === "allocation" ? "bg-white text-[#120c7a] shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                >
                  <Users size={14} /> Allocation
                </button>
                <button 
                  onClick={() => setActiveTab("requests")}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === "requests" ? "bg-white text-[#120c7a] shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                >
                  <Inbox size={14} /> Requests 
                  {incomingRequests.length > 0 && <span className="bg-red-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse">{incomingRequests.length}</span>}
                </button>
              </div>
              {activeTab === "allocation" && (
                <button
                  onClick={handleSaveAssignments}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-900/20 transition-all disabled:opacity-50"
                >
                  {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={20} />}
                  Save Changes
                </button>
              )}
            </div>
          </div>
        </div>

        {activeTab === "requests" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Incoming Section */}
            <div className="space-y-8">
              <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Inbox className="text-blue-600" size={20} />
                <h2 className="text-lg font-bold text-zinc-800">Incoming Faculty Requests</h2>
              </div>
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden min-h-[200px]">
                {incomingRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[200px] text-zinc-400">
                    <CheckCircle2 size={40} className="mb-2 opacity-20" />
                    <p className="text-sm font-medium">No pending requests.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {incomingRequests.map(req => (
                      <div key={req.id} className="p-5 hover:bg-zinc-50/50 transition-colors space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">{req.fromDept} is requesting</p>
                            <h3 className="font-bold text-zinc-800">{req.subjectCode} - {req.subjectName}</h3>
                            <p className="text-xs text-zinc-500 font-medium mt-1">{req.programme} • {req.batch} • Sem {req.semester}</p>
                          </div>
                          <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-1 rounded">Pending</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase w-full">Select Faculty to Fulfill:</label>
                          <div className="flex w-full gap-2">
                            <select className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-700 outline-none" id={`fulfill-${req.id}`}>
                              <option value="">Choose Faculty...</option>
                              {facultyList.map(f => <option key={f.uid} value={f.uid}>{f.facultyName} ({f.facultyId})</option>)}
                            </select>
                            <button 
                              onClick={() => {
                                const uid = document.getElementById(`fulfill-${req.id}`).value;
                                if (uid) handleProcessRequest(req, uid, 'accept');
                                else showToast("Please select a faculty member", "error");
                              }}
                              className="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition-all shadow-md shadow-green-900/10"
                            >
                              Assign
                            </button>
                            <button 
                              onClick={() => handleProcessRequest(req, null, 'reject')}
                              className="px-4 py-2 bg-zinc-100 text-zinc-600 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-all"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>

              {/* Fulfilled Section (History & Management) */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="text-emerald-600" size={20} />
                  <h2 className="text-lg font-bold text-zinc-800">Fulfilled & Allocated</h2>
                </div>
                <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                  {fulfilledRequests.length === 0 ? (
                    <div className="p-10 text-center text-zinc-400 text-sm font-medium italic">
                      No fulfilled requests yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {fulfilledRequests.map(req => (
                        <div key={req.id} className="p-5 hover:bg-zinc-50/50 transition-colors space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Provided to {req.fromDept}</p>
                              <h3 className="font-bold text-zinc-800 text-sm">{req.subjectCode} - {req.subjectName}</h3>
                              <p className="text-[10px] text-zinc-400 font-medium">{req.batch} • Sem {req.semester}</p>
                            </div>
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${req.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{req.status}</span>
                          </div>
                          
                          {req.status === 'accepted' && (
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <select 
                                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-[11px] font-bold text-zinc-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
                                  value={req.allocatedFacultyUid || ""}
                                  onChange={(e) => handleUpdateFulfilledRequest(req, e.target.value)}
                                  disabled={saving}
                                >
                                  {facultyList.map(f => <option key={f.uid} value={f.uid}>{f.facultyName} ({f.facultyId})</option>)}
                                </select>
                              </div>
                              <span className="text-[9px] font-black text-zinc-400 uppercase whitespace-nowrap">Change Faculty</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sent Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <ExternalLink className="text-[#120c7a]" size={18} />
                <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">My Sent Requests</h2>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[300px]">
                {sentRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[300px] text-zinc-400">
                    <Send size={40} className="mb-2 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-tighter opacity-40">No outgoing requests</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {sentRequests.map(req => (
                      <div key={req.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                        <div className="space-y-1">
                          <h3 className="font-bold text-slate-800 text-sm leading-tight">{req.subjectCode}</h3>
                          <p className="text-[10px] font-black text-blue-600 uppercase tracking-tight">Requested to: {req.toDept}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{req.batch} • Sem {req.semester}</p>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                            req.status === 'accepted' ? 'bg-emerald-50 text-emerald-600' : 
                            req.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                          }`}>
                            {req.status}
                          </span>
                          {req.status === 'accepted' && <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Assigned: <span className="text-emerald-600 font-black">{usersMap[req.allocatedFacultyUid]?.facultyName || 'Done'}</span></p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
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
                      const allocatedFacultyUid = Object.keys(assignments).find(uid => assignments[uid]?.includes(sub.code));
                      const allocatedFaculty = allocatedFacultyUid ? usersMap[allocatedFacultyUid] : null;
                      const isAllocated = !!allocatedFacultyUid;

                      // Check if a request for this subject has been sent and is pending
                      const pendingSentRequest = sentRequests.find(req => 
                        req.subjectCode === sub.code && 
                        req.programme === programme && // Ensure it's for the current context
                        req.batch === batch &&
                        req.academicYear === academicYear &&
                        req.semester === semester &&
                        req.status === 'pending'
                      );
                      const hasPendingSentRequest = !!pendingSentRequest;

                      return (
                        <div 
                          key={sub.code} 
                          className={`p-3 border rounded-xl space-y-1 transition-all ${
                            isAllocated 
                              ? "bg-emerald-50 border-emerald-200 shadow-sm" 
                              : (hasPendingSentRequest ? "bg-amber-50 border-amber-100 shadow-sm" : "bg-zinc-50 border-zinc-100")
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
                              ) : hasPendingSentRequest ? (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[8px] font-bold uppercase tracking-tight">
                                  <Send size={8} /> Request Sent
                                </span>
                              ) : ( // Default "Pending" state
                                <div className="flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 bg-zinc-200 text-zinc-500 rounded text-[8px] font-bold uppercase tracking-tight">
                                    Pending
                                  </span>
                                  <button 
                                    onClick={() => setRequestModal({ open: true, subject: sub })}
                                    className="px-1.5 py-0.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-[8px] font-black uppercase tracking-tight transition-colors border border-blue-100"
                                  >
                                    Request External
                                  </button>
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-zinc-400">{sub.credits} Credits</span>
                          </div>
                          <p className={`text-xs font-medium leading-relaxed ${isAllocated ? "text-emerald-900" : (hasPendingSentRequest ? "text-amber-900" : "text-zinc-700")}`}>
                            {sub.name}
                          </p>
                          {isAllocated && (
                            <div className="pt-1.5 flex items-center gap-1.5 border-t border-emerald-100/50 mt-1.5">
                              <User size={10} className="text-emerald-500" />
                              <span className="text-[10px] font-bold text-emerald-600 truncate">
                                {allocatedFaculty?.facultyName || allocatedFaculty?.displayName || 'Assigned'}
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
        </>
        )}

        {/* Request Modal */}
        {requestModal.open && (
          <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 transition-all duration-300">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-zinc-100">
              <div className="bg-[#120c7a] p-6 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold">External Faculty Request</h3>
                  <p className="text-blue-100 text-xs mt-1 opacity-80">Request support for {requestModal.subject?.code}</p>
                </div>
                <button onClick={() => setRequestModal({ open: false, subject: null })} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Subject to Allocate</p>
                   <h4 className="font-bold text-zinc-800">{requestModal.subject?.name}</h4>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Target Department HOD</label>
                  <div className="relative">
                    <select 
                      value={targetDept}
                      onChange={(e) => setTargetDept(e.target.value)}
                      className="w-full appearance-none bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-zinc-700"
                    >
                      <option value="">Choose Department...</option>
                      {allOtherDepts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  </div>
                  <p className="text-[10px] text-zinc-400 italic pl-1">The request will be sent to the HOD of this department.</p>
                </div>

                <button 
                  onClick={handleSendRequest}
                  disabled={!targetDept || saving}
                  className="w-full py-4 bg-[#120c7a] hover:bg-[#0e0960] text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
                >
                  {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={18} />}
                  Send Request
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
