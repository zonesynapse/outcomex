import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../firebase";
import { doc, collection, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { 
  Calendar, Loader2, Save, Send, CheckCircle2, AlertTriangle, 
  ChevronRight, ClipboardList, Info, HelpCircle
} from "lucide-react";
import Layout from "../components/Layout";
import { useBatches } from "../hooks/useBatches";
import { useRegulations } from "../hooks/useRegulations";
import { formatBatchDisplay, getAcademicYears, formatProgrammeKey, formatProgDisplay } from "../lib/utils";

const sanitizeKey = (key) => {
  if (!key) return "";
  return key.replace(/[^a-zA-Z0-9-]/g, "_");
};

export default function IAScheduleCreation() {
  const { getActiveBatches } = useBatches();
  const { getRegulationForBatch } = useRegulations();

  // --- Profile / Auth States ---
  const [currentUserData, setCurrentUserData] = useState(null);
  const [userProgramme, setUserProgramme] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);

  // --- Selection States ---
  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");

  // --- Loaded Configuration Data ---
  const [examEvents, setExamEvents] = useState([]);
  const [syllabusData, setSyllabusData] = useState(null);
  const [timetable, setTimetable] = useState({}); // maps subjectCode -> { date, timeSlot }
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. Authenticate and read user department & programme
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setCurrentUserData(data);
            setUserProgramme(data.programme || "");
            setUserDepartment(data.department || "");
          }
        } catch (err) {
          console.error("Error loading user profile info:", err);
        }
      }
      setLoadingUser(false);
    });
    return unsubscribeAuth;
  }, []);

  // 2. Fetch Academic Calendar events of type 'Exam'
  useEffect(() => {
    const eventsRef = collection(db, "academic_calendar_events");
    const unsub = onSnapshot(eventsRef, (snap) => {
      const exams = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.type === "Exam") {
          exams.push({ id: d.id, ...data });
        }
      });
      // Sort exams chronologically by fromDate
      exams.sort((a, b) => new Date(a.fromDate) - new Date(b.fromDate));
      setExamEvents(exams);
    }, (err) => {
      console.error("Error loading exam events:", err);
    });
    return unsub;
  }, []);

  // 3. Derived Academic Options
  const progKey = useMemo(() => formatProgrammeKey(userProgramme), [userProgramme]);
  const deptKey = useMemo(() => sanitizeKey(userDepartment), [userDepartment]);

  const batchOptions = useMemo(() => {
    if (!progKey) return [];
    return getActiveBatches(progKey);
  }, [progKey, getActiveBatches]);

  const academicYearOptions = useMemo(() => {
    return batch ? getAcademicYears(batch) : [];
  }, [batch]);

  const semesterOptions = useMemo(() => {
    if (!batch || !academicYear) return [];
    const [batchStart] = batch.split("-").map(Number);
    const [yearStart] = academicYear.split("-").map(Number);
    const yearIndex = yearStart - batchStart;
    return [String(yearIndex * 2 + 1), String(yearIndex * 2 + 2)];
  }, [batch, academicYear]);

  const regulation = useMemo(() => {
    if (batch && userProgramme) {
      return getRegulationForBatch(progKey, batch) || "";
    }
    return "";
  }, [batch, userProgramme, progKey, getRegulationForBatch]);

  // 4. Fetch Syllabus Data based on selection & regulation
  useEffect(() => {
    if (progKey && deptKey && regulation) {
      const syllabusDocId = `${progKey}_${deptKey}_${sanitizeKey(regulation)}`;
      const syllabusRef = doc(db, "syllabus_data", syllabusDocId);
      const unsubscribe = onSnapshot(syllabusRef, (snapshot) => {
        if (snapshot.exists()) {
          setSyllabusData(snapshot.data());
        } else {
          setSyllabusData(null);
        }
      }, (err) => {
        console.error("Error reading syllabus configuration data:", err);
      });
      return unsubscribe;
    } else {
      setSyllabusData(null);
    }
  }, [progKey, deptKey, regulation]);

  // Reset timetable when selections update
  useEffect(() => {
    setTimetable({});
  }, [batch, academicYear, semester, selectedExamId]);

  // 5. Compute the dates range of the selected exam event
  const selectedExam = useMemo(() => {
    return examEvents.find(e => e.id === selectedExamId) || null;
  }, [selectedExamId, examEvents]);

  const availableDates = useMemo(() => {
    if (!selectedExam || !selectedExam.fromDate || !selectedExam.toDate) return [];
    const dates = [];
    const start = new Date(selectedExam.fromDate);
    const end = new Date(selectedExam.toDate);
    
    // Safety check to prevent infinite loops
    let count = 0;
    while (start <= end && count < 60) {
      dates.push(start.toISOString().split("T")[0]);
      start.setDate(start.getDate() + 1);
      count++;
    }
    return dates;
  }, [selectedExam]);

  // Extract subjects for the selected semester
  const semesterSubjects = useMemo(() => {
    if (!syllabusData || !semester) return [];
    return (syllabusData.semesters?.[semester] || []).filter(
      (sub) => sub != null && sub.isActive !== false
    );
  }, [syllabusData, semester]);

  const handleUpdateRow = (subjectCode, field, val) => {
    setTimetable(prev => ({
      ...prev,
      [subjectCode]: {
        ...(prev[subjectCode] || { date: "", timeSlot: "FN (10:00 AM - 1:00 PM)" }),
        [field]: val
      }
    }));
  };

  const handleForwardToHOD = async () => {
    if (!userProgramme || !userDepartment || !batch || !academicYear || !semester || !selectedExam) {
      showToast("Please make sure all filters and exam event are selected.", "error");
      return;
    }

    if (semesterSubjects.length === 0) {
      showToast("No subjects are configured for this semester in the syllabus.", "error");
      return;
    }

    // Check that at least one subject has been scheduled
    const scheduledSubjects = Object.keys(timetable).filter(
      (code) => timetable[code]?.date && timetable[code]?.timeSlot
    );

    if (scheduledSubjects.length === 0) {
      showToast("Please configure date and timeslot for at least one subject.", "error");
      return;
    }

    setSaving(true);
    try {
      const examNameSanitized = sanitizeKey(selectedExam.title);
      const compositeKey = `${progKey}_${deptKey}_${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semester}_${examNameSanitized}`;
      
      const timetableList = semesterSubjects
        .filter(sub => timetable[sub.code]?.date)
        .map(sub => ({
          subjectCode: sub.code,
          subjectName: sub.name,
          date: timetable[sub.code].date,
          timeSlot: timetable[sub.code].timeSlot
        }));

      const schedulePayload = {
        programme: userProgramme,
        department: userDepartment,
        batch,
        academicYear,
        semester,
        examName: selectedExam.title,
        status: "pending_hod",
        submittedBy: auth.currentUser?.email || "Faculty",
        submittedAt: new Date().toISOString(),
        timetable: timetableList
      };

      await setDoc(doc(db, "exam_schedules", compositeKey), schedulePayload);
      showToast("Exam schedule successfully forwarded to HOD for approval!", "success");
      setTimetable({});
    } catch (err) {
      console.error("Failed to forward exam schedule:", err);
      showToast("Failed to save and forward exam schedule.", "error");
    }
    setSaving(false);
  };

  if (loadingUser) {
    return (
      <Layout title="Exam Schedule Creator">
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-zinc-400">
          <Loader2 className="animate-spin text-indigo-700" size={32} />
          <span className="text-xs font-bold uppercase tracking-wider">Verifying user permissions...</span>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Exam Schedule Creator">
      {/* Toast alert */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-bounce">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border shadow-lg text-xs font-bold ${
            toast.type === "success" 
              ? "bg-emerald-50 border-emerald-250 text-emerald-800" 
              : "bg-red-50 border-red-250 text-red-800"
          }`}>
            {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        
        {/* Dynamic Selectors Card */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 mb-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-zinc-100">
            {/* Auto Selected Programme */}
            <div className="space-y-1.5 text-xs">
              <label className="block font-bold text-zinc-400 uppercase tracking-wider">Programme</label>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 font-semibold text-zinc-700">
                {userProgramme ? formatProgDisplay(userProgramme) : "Not Configured"}
              </div>
            </div>
            {/* Auto Selected Department */}
            <div className="space-y-1.5 text-xs">
              <label className="block font-bold text-zinc-400 uppercase tracking-wider">Department</label>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 font-semibold text-zinc-700">
                {userDepartment || "Not Configured"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="block font-bold text-zinc-500 uppercase tracking-wider">Batch</label>
              <select
                value={batch}
                onChange={(e) => { setBatch(e.target.value); setAcademicYear(""); setSemester(""); }}
                className="w-full rounded-xl border border-zinc-200 p-3 font-semibold text-zinc-700 focus:border-indigo-600 focus:outline-none bg-white"
              >
                <option value="">Select Batch</option>
                {batchOptions.map((b) => (
                  <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-zinc-500 uppercase tracking-wider">Academic Year</label>
              <select
                value={academicYear}
                disabled={!batch}
                onChange={(e) => { setAcademicYear(e.target.value); setSemester(""); }}
                className="w-full rounded-xl border border-zinc-200 p-3 font-semibold text-zinc-700 focus:border-indigo-600 focus:outline-none bg-white disabled:opacity-50"
              >
                <option value="">Select Academic Year</option>
                {academicYearOptions.map((ay) => (
                  <option key={ay} value={ay}>{ay}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-zinc-500 uppercase tracking-wider">Semester</label>
              <select
                value={semester}
                disabled={!academicYear}
                onChange={(e) => setSemester(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 p-3 font-semibold text-zinc-700 focus:border-indigo-600 focus:outline-none bg-white disabled:opacity-50"
              >
                <option value="">Select Semester</option>
                {semesterOptions.map((sem) => (
                  <option key={sem} value={sem}>Semester {sem}</option>
                ))}
              </select>
            </div>

            {/* Exam Dropdown from Academic Calendar */}
            <div className="space-y-1.5 sm:col-span-3 lg:col-span-1">
              <label className="block font-bold text-zinc-500 uppercase tracking-wider">Target Exam Event</label>
              <select
                value={selectedExamId}
                disabled={examEvents.length === 0}
                onChange={(e) => setSelectedExamId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 p-3 font-semibold text-zinc-700 focus:border-indigo-600 focus:outline-none bg-white disabled:opacity-50"
              >
                <option value="">Select Exam Event</option>
                {examEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({ev.fromDate} to {ev.toDate})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Timetable Configuration Block */}
        {!selectedExam ? (
          <div className="bg-zinc-50 rounded-3xl border border-zinc-200 border-dashed p-10 text-center text-zinc-400">
            <ClipboardList size={40} className="mx-auto mb-3 opacity-30 text-indigo-700" />
            <p className="text-xs font-bold uppercase tracking-wider">Select filters and exam event above to configure exam schedule.</p>
            {examEvents.length === 0 && (
              <p className="text-[11px] text-amber-600 font-semibold mt-2">
                * No exams found in the Academic Calendar. Please configure Exam dates there first.
              </p>
            )}
          </div>
        ) : semesterSubjects.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-center text-amber-800 text-xs font-medium flex items-center justify-center gap-2">
            <Info size={16} />
            <span>No syllabus data is configured for this Regulation ({regulation || "unknown"}), or no subjects are assigned to Semester {semester}.</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar size={16} className="text-indigo-600" /> Schedule Layout for {selectedExam.title}
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-medium mt-0.5">Select a date (within calendar bounds) and timeslot for each subject code below.</p>
                </div>
                <div className="px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-black text-[#120c7a] uppercase tracking-wider w-fit">
                  Regulation {regulation}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold">
                      <th className="p-4">Subject</th>
                      <th className="p-4 w-44">Exam Name</th>
                      <th className="p-4 w-52">Exam Date</th>
                      <th className="p-4 w-60">Time Slot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-150">
                    {semesterSubjects.map((sub) => {
                      const rowData = timetable[sub.code] || { date: "", timeSlot: "FN (10:00 AM - 1:00 PM)" };
                      return (
                        <tr key={sub.code} className="hover:bg-zinc-50/30 transition-colors">
                          <td className="p-4">
                            <span className="block font-bold text-slate-850">{sub.code}</span>
                            <span className="block text-[10px] text-zinc-400 font-medium mt-0.5">{sub.name}</span>
                          </td>
                          <td className="p-4 font-black text-indigo-700">
                            {selectedExam.title}
                          </td>
                          <td className="p-4">
                            <select
                              value={rowData.date}
                              onChange={(e) => handleUpdateRow(sub.code, "date", e.target.value)}
                              className="w-full rounded-xl border border-zinc-200 p-2 font-semibold text-zinc-700 bg-white"
                            >
                              <option value="">Select Date</option>
                              {availableDates.map(dateStr => (
                                <option key={dateStr} value={dateStr}>
                                  {new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-4">
                            <div className="flex gap-2">
                              <select
                                value={rowData.timeSlot.startsWith("Custom:") ? "Custom" : rowData.timeSlot}
                                onChange={(e) => {
                                  if (e.target.value === "Custom") {
                                    handleUpdateRow(sub.code, "timeSlot", "Custom: ");
                                  } else {
                                    handleUpdateRow(sub.code, "timeSlot", e.target.value);
                                  }
                                }}
                                className="rounded-xl border border-zinc-200 p-2 font-semibold text-zinc-700 bg-white flex-1"
                              >
                                <option value="FN (10:00 AM - 1:00 PM)">FN (10:00 AM - 1:00 PM)</option>
                                <option value="AN (2:00 PM - 5:00 PM)">AN (2:00 PM - 5:00 PM)</option>
                                <option value="Custom">Custom Entry</option>
                              </select>
                              
                              {rowData.timeSlot.startsWith("Custom:") && (
                                <input
                                  type="text"
                                  value={rowData.timeSlot.replace("Custom: ", "")}
                                  placeholder="e.g. 10:30 AM - 12:30 PM"
                                  onChange={(e) => handleUpdateRow(sub.code, "timeSlot", `Custom: ${e.target.value}`)}
                                  className="rounded-xl border border-zinc-200 p-2 font-semibold text-zinc-700 bg-white w-40 text-xs"
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Forward Row */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleForwardToHOD}
                disabled={saving}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-150 cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Saving timetable...
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Forward to HOD
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
