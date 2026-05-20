import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../firebase";
import { doc, collection, onSnapshot, updateDoc, getDoc, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
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
  const [allAssignments, setAllAssignments] = useState({});

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
  const [activeTab, setActiveTab] = useState("allocation");
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
      const userRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
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
      return () => unsubscribe();
    }
  }, []);

  // 2. Fetch Faculty List (Same Department)
  useEffect(() => {
    if (currentUserData?.department) {
      const usersRef = collection(db, "users");
      const unsubscribe = onSnapshot(usersRef, (snapshot) => {
        const data = {};
        snapshot.forEach(doc => { 
          data[doc.id] = doc.data(); 
        });
        setUsersMap(data);
        const filtered = Object.values(data).filter(
          u => u.department === currentUserData.department && u.isApproved && u.email !== masterAdminEmail && u.email !== defaultAdminEmail
        );
        setFacultyList(filtered);
      });
      return () => unsubscribe();
    }
  }, [currentUserData]);

  // 2.1 Fetch Inter-Dept Requests
  useEffect(() => {
    if (currentUserData?.department) {
      const deptKey = sanitizeKey(currentUserData.department);

      // Fetch Incoming
      const incomingRef = collection(db, 'inter_dept_requests', 'incoming', deptKey, 'requests');
      const unsubIncoming = onSnapshot(incomingRef, (snapshot) => {
        const requests = [];
        snapshot.forEach(doc => { 
          requests.push(doc.data()); 
        });
        setIncomingRequests(requests.filter(r => r.status === 'pending'));
      });

      // Fetch Sent
      const outgoingRef = collection(db, 'inter_dept_requests', 'outgoing', deptKey, 'requests');
      const unsubOutgoing = onSnapshot(outgoingRef, (snapshot) => {
        const requests = [];
        snapshot.forEach(doc => { 
          requests.push(doc.data()); 
        });
        setSentRequests(requests);
      });
      
      // Fetch Fulfilled (Requests I handled)
      const fulfilledRef = collection(db, 'inter_dept_requests', 'fulfilled', deptKey, 'requests');
      const unsubFulfilled = onSnapshot(fulfilledRef, (snapshot) => {
        const requests = [];
        snapshot.forEach(doc => { 
          requests.push(doc.data()); 
        });
        setFulfilledRequests(requests);
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
    
    const sem1 = (yearIndex * 2) + 1;
    const sem2 = (yearIndex * 2) + 2;
    
    return [String(sem1), String(sem2)];
  }, [batch, academicYear]);

  // 4. Fetch Syllabus Data
  useEffect(() => {
    if (programme && syllabusDept && regulation) {
      const progKey = formatProgrammeKey(programme);
      const syllabusDocId = `${progKey}_${sanitizeKey(syllabusDept)}_${sanitizeKey(regulation)}`;
      const syllabusRef = doc(db, 'syllabus_data', syllabusDocId);
      
      const unsubscribe = onSnapshot(syllabusRef, (snapshot) => {
        if (snapshot.exists()) {
          setSyllabusData(snapshot.data());
        } else {
          setSyllabusData(null);
        }
      });
      return () => unsubscribe();
    } else {
      setSyllabusData(null);
    }
  }, [programme, syllabusDept, regulation]);

  // 5. Fetch Existing Assignments
  useEffect(() => {
    if (programme && syllabusDept && batch && academicYear && semester) {
      const progKey = formatProgrammeKey(programme);
      const assignmentRef = doc(db, 'subject_assignments', progKey, sanitizeKey(syllabusDept), sanitizeKey(batch), sanitizeKey(academicYear), semester);
      
      const unsubscribe = onSnapshot(assignmentRef, (snapshot) => {
        if (snapshot.exists()) {
          setAssignments(snapshot.data());
        } else {
          setAssignments({});
        }
      });
      return () => unsubscribe();
    } else {
      setAssignments({});
    }
  }, [programme, syllabusDept, batch, academicYear, semester]);
  
  // 5.1 Fetch All Assignments Globally (All Departments)
  useEffect(() => {
    const assignmentsRef = collection(db, "subject_assignments");
    const unsubscribe = onSnapshot(assignmentsRef, (snapshot) => {
      const globalAssignments = {}; // facultyUid -> Array of assignment objects

      snapshot.forEach((doc) => {
        const progKey = doc.id;
        const deptsData = doc.data();
        
        Object.entries(deptsData).forEach(([deptKey, batchesData]) => {
          Object.entries(batchesData).forEach(([batchKey, ayData]) => {
            Object.entries(ayData).forEach(([ayKey, semData]) => {
              Object.entries(semData).forEach(([semKey, facultyData]) => {
                Object.entries(facultyData).forEach(([facultyUid, codes]) => {
                  if (Array.isArray(codes)) {
                    if (!globalAssignments[facultyUid]) globalAssignments[facultyUid] = [];
                    codes.forEach(code => {
                      globalAssignments[facultyUid].push({
                        code,
                        progKey,
                        dept: deptKey,
                        batch: batchKey,
                        academicYear: ayKey,
                        semester: semKey,
                        key: `${progKey}_${deptKey}_${batchKey}_${ayKey}_${semKey}_${code}`
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
    const assignedTo = Object.entries(assignments).find(([, subs]) => subs.includes(subjectCode));
    
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
      const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const payload = {
        id: requestId,
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

      await setDoc(doc(db, 'inter_dept_requests', 'incoming', sanitizeKey(targetDept), 'requests', requestId), payload);
      await setDoc(doc(db, 'inter_dept_requests', 'outgoing', sanitizeKey(currentUserData.department), 'requests', requestId), payload);
      
      showToast("Request sent to other HOD successfully!");
      setRequestModal({ open: false, subject: null });
      setTargetDept("");
    } catch (err) {
      console.error("Error sending request:", err);
      showToast("Failed to send request", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleProcessRequest = async (request, facultyUid, action) => {
    setSaving(true);
    try {
      const status = action === 'accept' ? 'accepted' : 'rejected';
      const fromKey = sanitizeKey(request.fromDept);
      const toKey = sanitizeKey(request.toDept);

      const batch = writeBatch(db);

      if (action === 'accept') {
        const progKey = formatProgrammeKey(request.programme);
        const assignRef = doc(db, 'subject_assignments', progKey, fromKey, sanitizeKey(request.batch), sanitizeKey(request.academicYear), request.semester);
        const snap = await getDoc(assignRef);
        const current = snap.exists() ? (snap.data()[facultyUid] || []) : [];
        batch.update(assignRef, { [facultyUid]: [...new Set([...current, request.subjectCode])] });
      }

      const statusUpdate = { 
        ...request, 
        status, 
        allocatedFacultyUid: facultyUid || null,
        processedAt: Date.now() 
      };

      batch.delete(doc(db, 'inter_dept_requests', 'incoming', toKey, 'requests', request.id));
      batch.set(doc(db, 'inter_dept_requests', 'outgoing', fromKey, 'requests', request.id), statusUpdate);
      batch.set(doc(db, 'inter_dept_requests', 'fulfilled', toKey, 'requests', request.id), statusUpdate);

      await batch.commit();
      showToast(`Request ${status} successfully!`);
    } catch (err) {
      console.error("Error processing request:", err);
      showToast("Error processing request", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateFulfilledRequest = async (request, newFacultyUid) => {
    if (!newFacultyUid || newFacultyUid === request.allocatedFacultyUid) return;

    setSaving(true);
    try {
      const fromKey = sanitizeKey(request.fromDept);
      const toKey = sanitizeKey(request.toDept);
      const progKey = formatProgrammeKey(request.programme);
      const batchKey = sanitizeKey(request.batch);
      const ayKey = sanitizeKey(request.academicYear);
      const sem = request.semester;

      const batch = writeBatch(db);

      // 1. Remove subject from old faculty's assignments
      if (request.allocatedFacultyUid) {
        const oldAssignRef = doc(db, 'subject_assignments', progKey, fromKey, batchKey, ayKey, sem);
        const oldSnap = await getDoc(oldAssignRef);
        const oldSubs = oldSnap.exists() ? (oldSnap.data()[request.allocatedFacultyUid] || []) : [];
        batch.update(oldAssignRef, { [request.allocatedFacultyUid]: oldSubs.filter(code => code !== request.subjectCode) });
      }

      // 2. Add subject to new faculty's assignments
      const newAssignRef = doc(db, 'subject_assignments', progKey, fromKey, batchKey, ayKey, sem);
      const newSnap = await getDoc(newAssignRef);
      const newSubs = newSnap.exists() ? (newSnap.data()[newFacultyUid] || []) : [];
      batch.update(newAssignRef, { [newFacultyUid]: [...new Set([...newSubs, request.subjectCode])] });
      
      const statusUpdate = { 
        ...request, 
        allocatedFacultyUid: newFacultyUid,
        processedAt: Date.now() 
      };

      batch.set(doc(db, 'inter_dept_requests', 'outgoing', fromKey, 'requests', request.id), statusUpdate);
      batch.set(doc(db, 'inter_dept_requests', 'fulfilled', toKey, 'requests', request.id), statusUpdate);
      
      await batch.commit();
      showToast("Assigned faculty updated successfully!");
    } catch (err) {
      console.error("Error updating faculty:", err);
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
      const assignmentRef = doc(db, 'subject_assignments', progKey, sanitizeKey(syllabusDept), sanitizeKey(batch), sanitizeKey(academicYear), semester);
      
      const updates = {};
      const allAssignedSubjects = new Set();

      facultyList.forEach(f => {
        updates[f.uid] = assignments[f.uid] || null;
        if (assignments[f.uid]) {
          assignments[f.uid].forEach(code => allAssignedSubjects.add(code));
        }
      });

      await setDoc(assignmentRef, updates, { merge: true });
      
      // Process newly assigned subjects' COs
      for (const subjectCode of allAssignedSubjects) {
        let courseRef = doc(db, 'courses', progKey, sanitizeKey(syllabusDept), sanitizeKey(regulation), sanitizeKey(subjectCode));
        let snap = await getDoc(courseRef);
        let isOverall = false;

        if (!snap.exists()) {
          courseRef = doc(db, 'courses', progKey, 'Overall', sanitizeKey(regulation), sanitizeKey(subjectCode));
          snap = await getDoc(courseRef);
          isOverall = true;
        }

        if (snap.exists()) {
          const courseData = snap.data();
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
              const coDocId = `${sanitizeKey(syllabusDept)}_${sanitizeKey(regulation)}_${sanitizeKey(subjectCode)}_${sanitizeKey(academicYear)}`;
              const coOutcomesRef = doc(db, 'course_outcomes', coDocId);
              
              await setDoc(coOutcomesRef, coDict);

              if (!isOverall && hasExtraFieldsInCourseNode) {
                await updateDoc(courseRef, { co: newCoursesCO });
              }
            }
          }
        }
      }
      
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
    f.facultyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.facultyId?.toLowerCase().includes(searchTerm.toLowerCase())
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
                <h4 className="text-2xl font-black text-zinc-800 tracking-tight">Faculty Course Allocation</h4>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Incoming Section */}
            <div className="space-y-6">
              <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Inbox className="text-[#120c7a]" size={18} />
                <h5 className="text-sm font-black text-slate-700 uppercase tracking-wider">Incoming Requests</h5>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[200px]">
                {incomingRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[200px] text-slate-400">
                    <CheckCircle2 size={40} className="mb-2 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-tighter opacity-40">No pending requests</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {incomingRequests.map(req => (
                      <div key={req.id} className="p-5 hover:bg-zinc-50/50 transition-colors space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[9px] font-black text-blue-600 uppercase tracking-[0.1em] mb-1">{req.fromDept}</p>
                            <h3 className="font-bold text-slate-800 text-sm">{req.subjectCode} - {req.subjectName}</h3>
                            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tight">{req.programme} • {req.batch} • Sem {req.semester}</p>
                          </div>
                          <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase">Pending</span>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-50">
                          <div className="flex w-full gap-2 items-center">
                            <select 
                              className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all" 
                              id={`fulfill-${req.id}`}
                            >
                              <option value="">Select Faculty to Fulfill...</option>
                              {facultyList.map(f => <option key={f.uid} value={f.uid}>{f.facultyName} ({f.facultyId})</option>)}
                            </select>
                            <button 
                              onClick={() => {
                                const selectElement = document.getElementById(`fulfill-${req.id}`);
                                const uid = selectElement?.value;
                                if (uid) handleProcessRequest(req, uid, 'accept');
                                else showToast("Please select a faculty member", "error");
                              }}
                              className="px-3 py-1.5 bg-[#120c7a] text-white rounded-lg text-[11px] font-black uppercase tracking-wider hover:bg-blue-800 transition-all"
                            >
                              Assign
                            </button>
                            <button 
                              onClick={() => handleProcessRequest(req, null, 'reject')}
                              className="px-3 py-1.5 bg-slate-50 text-slate-400 rounded-lg text-[11px] font-black uppercase tracking-wider hover:bg-red-50 hover:text-red-500 transition-all"
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
                  <CheckCircle2 className="text-emerald-600" size={18} />
                  <h5 className="text-sm font-black text-slate-700 uppercase tracking-wider">Fulfilled & Allocated</h5>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  {fulfilledRequests.length === 0 ? (
                    <div className="p-10 text-center text-slate-400 text-xs font-bold uppercase tracking-tighter opacity-40 italic">
                      No fulfilled requests
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {fulfilledRequests.map(req => (
                        <div key={req.id} className="p-4 hover:bg-slate-50/50 transition-colors space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.1em] mb-1">Fulfilled for {req.fromDept}</p>
                              <h6 className="font-bold text-slate-800 text-sm leading-tight">{req.subjectCode} - {req.subjectName}</h6>
                              <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tight">{req.batch} • Sem {req.semester}</p>
                            </div>
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${req.status === 'accepted' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{req.status}</span>
                          </div>
                          
                          {req.status === 'accepted' && (
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <select 
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-100 transition-all" 
                                  value={req.allocatedFacultyUid || ""}
                                  onChange={(e) => handleUpdateFulfilledRequest(req, e.target.value)}
                                  disabled={saving}
                                >
                                  <option value="">Select Faculty</option>
                                  {facultyList.map(f => <option key={f.uid} value={f.uid}>{f.facultyName} ({f.facultyId})</option>)}
                                </select>
                              </div>
                              <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest whitespace-nowrap">Change Faculty</span>
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
                <h5 className="text-sm font-black text-slate-700 uppercase tracking-wider">My Sent Requests</h5>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[200px]">
                {sentRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[200px] text-slate-400">
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
              <h3 className="text-lg font-bold text-zinc-800 flex items-center gap-2">
                <Users size={20} className="text-[#120c7a]" />
                Faculty Members
              </h3>
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
                      <h5 className="font-bold text-zinc-800">{faculty.displayName || faculty.facultyName}</h5>
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
            <h3 className="text-lg font-bold text-zinc-800 flex items-center gap-2">
              <BookOpen size={20} className="text-[#120c7a]" />
              Syllabus Overview
            </h3>
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

                      const pendingSentRequest = sentRequests.find(req => 
                        req.subjectCode === sub.code && 
                        req.programme === programme &&
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
                              ) : (
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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-zinc-100">
              <div className="bg-[#120c7a] p-5 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold">External Faculty Request</h3>
                  <p className="text-blue-100 text-[10px] mt-1 opacity-80">Request support for {requestModal.subject?.code}</p>
                </div>
                <button onClick={() => setRequestModal({ open: false, subject: null })} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-5">
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
                      className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-zinc-700"
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
                  className="w-full py-3 bg-[#120c7a] hover:bg-[#0e0960] text-white rounded-xl font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
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