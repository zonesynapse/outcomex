import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, addDoc, updateDoc, doc, getDoc, getDocs, query, where, Timestamp } from "firebase/firestore";
import { QrCode, ScanLine, User, LogIn, LogOut, Clock, CalendarDays, CheckCircle2, AlertCircle, Bookmark } from "lucide-react";
import Layout from "../components/Layout";

export default function LibraryEntryExit() {
  const [studentMap, setStudentMap] = useState({});
  const [loadingStudents, setLoadingStudents] = useState(true);

  const [scanInput, setScanInput] = useState("");
  const [scannedStudent, setScannedStudent] = useState(null);
  const [scanStatus, setScanStatus] = useState(null); // { type: "entry" | "exit", name: string, time: string }
  const [scanError, setScanError] = useState("");

  const [todayLogs, setTodayLogs] = useState([]);
  const [insideCount, setInsideCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const inputRef = useRef(null);

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  // Load all student documents into a lookup map
  useEffect(() => {
    const loadStudents = async () => {
      try {
        const snap = await getDocs(collection(db, "students"));
        const map = {};
        snap.forEach(doc => {
          const data = doc.data();
          const meta = data._meta || {};
          const batchLabel = meta.batch || "";
          const programmeLabel = meta.programme_name || "";
          const deptLabel = meta.department || "";

          Object.entries(data).forEach(([key, value]) => {
            if (key.startsWith("_")) return;
            const studentName = (value !== null && typeof value === 'object') ? (value.name || '') : String(value || '');
            map[key] = {
              name: studentName,
              batch: batchLabel,
              programme: programmeLabel,
              department: deptLabel,
            };
          });
        });
        setStudentMap(map);
      } catch (err) {
        console.error("Error loading students:", err);
      } finally {
        setLoadingStudents(false);
      }
    };
    loadStudents();
  }, []);

  // Listen for today's entry/exit logs
  useEffect(() => {
    const q = query(collection(db, "library_entry_logs"), where("date", "==", today));
    const unsub = onSnapshot(q, (snap) => {
      const logs = [];
      let inside = 0;
      snap.forEach(d => {
        const data = { ...d.data(), id: d.id };
        logs.push(data);
        if (!data.exitTime) inside++;
      });
      logs.sort((a, b) => {
        const ta = a.entryTime?.seconds || 0;
        const tb = b.entryTime?.seconds || 0;
        return tb - ta;
      });
      setTodayLogs(logs);
      setInsideCount(inside);
    });
    return () => unsub();
  }, [today]);

  const handleScan = async (examNumber) => {
    if (!examNumber.trim()) return;
    setScanError("");
    setScanStatus(null);
    setScannedStudent(null);

    const student = studentMap[examNumber.trim()];
    if (!student) {
      setScanError(`Student with exam number "${examNumber.trim()}" not found`);
      showToast("Student not found", "error");
      return;
    }

    setScannedStudent(student);
    setSaving(true);
    try {
      // Check for active entry (no exitTime)
      const q = query(
        collection(db, "library_entry_logs"),
        where("examNumber", "==", examNumber.trim()),
        where("date", "==", today),
        where("exitTime", "==", null)
      );
      const snap = await getDocs(q);

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

      if (snap.empty) {
        // No active entry → log entry
        await addDoc(collection(db, "library_entry_logs"), {
          examNumber: examNumber.trim(),
          studentName: student.name,
          department: student.department,
          batch: student.batch,
          programme: student.programme,
          entryTime: Timestamp.fromDate(now),
          exitTime: null,
          date: today,
        });
        setScanStatus({ type: "entry", name: student.name, time: timeStr });
        showToast(`${student.name} — Entry logged`);
      } else {
        // Has active entry → log exit
        const activeDoc = snap.docs[0];
        const entryTime = activeDoc.data().entryTime?.toDate?.() || new Date();
        const durationMs = now - entryTime;
        const durationMin = Math.round(durationMs / 60000);

        await updateDoc(doc(db, "library_entry_logs", activeDoc.id), {
          exitTime: Timestamp.fromDate(now),
          duration: durationMin,
        });
        setScanStatus({ type: "exit", name: student.name, time: timeStr, duration: durationMin });
        showToast(`${student.name} — Exit logged (${durationMin} min)`);
      }

      setScanInput("");
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      console.error("Error processing scan:", err);
      setScanError("Failed to process scan. Try again.");
      showToast("Error processing scan", "error");
    } finally {
      setSaving(false);
    }
  };

  // Auto-focus input on mount and after scan
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const formatTime = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDuration = (min) => {
    if (!min && min !== 0) return "—";
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  if (loadingStudents) {
    return (
      <Layout title="Library - Entry / Exit">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Library - Entry / Exit">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {toast.show && (
          <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="font-bold">{toast.message}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-xl"><CalendarDays size={24} className="text-blue-600" /></div>
            <div>
              <p className="text-2xl font-black text-zinc-800">{todayLogs.length}</p>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Today's Visitors</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-xl"><LogIn size={24} className="text-emerald-600" /></div>
            <div>
              <p className="text-2xl font-black text-emerald-700">{insideCount}</p>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Currently Inside</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 flex items-center gap-4">
            <div className="p-3 bg-amber-50 rounded-xl"><LogOut size={24} className="text-amber-600" /></div>
            <div>
              <p className="text-2xl font-black text-zinc-800">{todayLogs.filter(l => l.exitTime).length}</p>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Exited Today</p>
            </div>
          </div>
        </div>

        {/* Scan Area */}
        <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-4 flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-lg"><QrCode size={22} className="text-white" /></div>
            <div>
              <h4 className="text-white font-bold text-lg">Scan ID Card</h4>
              <p className="text-blue-100 text-xs opacity-80">Scan QR code at entry / exit gate</p>
            </div>
          </div>

          <div className="p-8 flex flex-col items-center space-y-6">
            {/* Scan Input */}
            <div className="w-full max-w-lg">
              <div className="relative">
                <ScanLine size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#120c7a]" />
                <input
                  ref={inputRef}
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      handleScan(scanInput);
                    }
                  }}
                  placeholder="Scan ID card or type exam number..."
                  className="w-full pl-12 pr-4 py-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] transition-all text-lg font-bold text-center tracking-wider"
                  autoFocus
                />
              </div>
              <p className="text-xs text-zinc-400 text-center mt-2">Scanner will auto-type the exam number and press Enter</p>
            </div>

            {/* Scan Status */}
            {scanError && (
              <div className="w-full max-w-lg p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                <AlertCircle size={20} className="text-red-500 shrink-0" />
                <p className="text-sm font-medium text-red-700">{scanError}</p>
              </div>
            )}

            {scanStatus && (
              <div className={`w-full max-w-lg p-5 rounded-2xl border-2 flex items-center gap-4 ${scanStatus.type === "entry" ? "bg-emerald-50 border-emerald-300" : "bg-blue-50 border-blue-300"}`}>
                <div className={`p-3 rounded-full ${scanStatus.type === "entry" ? "bg-emerald-100" : "bg-blue-100"}`}>
                  {scanStatus.type === "entry" ? <LogIn size={28} className="text-emerald-600" /> : <LogOut size={28} className="text-blue-600" />}
                </div>
                <div className="flex-1">
                  <p className="text-lg font-black text-zinc-800">{scanStatus.name}</p>
                  <p className="text-sm font-medium text-zinc-500">
                    {scanStatus.type === "entry" ? "Entry" : "Exit"} logged at {scanStatus.time}
                    {scanStatus.duration && <> • Duration: {formatDuration(scanStatus.duration)}</>}
                  </p>
                </div>
                <CheckCircle2 size={24} className={scanStatus.type === "entry" ? "text-emerald-500" : "text-blue-500"} />
              </div>
            )}

            {!scanStatus && !scanError && (
              <div className="w-full max-w-lg p-6 text-center">
                <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ScanLine size={36} className="text-zinc-300" />
                </div>
                <p className="text-zinc-400 font-medium">Waiting for scan...</p>
                <p className="text-xs text-zinc-300 mt-1">Scan your ID card at the gate</p>
              </div>
            )}

            {/* Student Info Card */}
            {scannedStudent && (
              <div className="w-full max-w-lg p-4 bg-white border border-zinc-200 rounded-xl">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Student Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-zinc-400">Name</p>
                    <p className="font-bold text-zinc-800">{scannedStudent.name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400">Batch</p>
                    <p className="font-bold text-zinc-800">{scannedStudent.batch || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400">Programme</p>
                    <p className="font-bold text-zinc-800">{scannedStudent.programme || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400">Department</p>
                    <p className="font-bold text-zinc-800">{scannedStudent.department || "—"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Today's Log */}
        <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
          <div className="bg-zinc-50 px-6 py-3 border-b border-zinc-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-zinc-500" />
              <h5 className="text-sm font-bold text-zinc-600">Today's Entry / Exit Log</h5>
            </div>
            <span className="text-[10px] font-bold text-zinc-400">{today}</span>
          </div>

          {todayLogs.length === 0 ? (
            <div className="p-10 text-center">
              <Bookmark size={32} className="mx-auto mb-2 text-zinc-300" />
              <p className="text-zinc-400 font-medium">No entries recorded today</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Student</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Dept / Batch</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Entry</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Exit</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Duration</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {todayLogs.map(log => (
                    <tr key={log.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-bold text-sm text-zinc-800">{log.studentName}</p>
                        <p className="text-[10px] text-zinc-400 font-mono">{log.examNumber}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-zinc-600">{log.department || "—"}</p>
                        <p className="text-[10px] text-zinc-400">{log.batch || ""}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-mono text-emerald-700 font-bold">{formatTime(log.entryTime)}</td>
                      <td className="px-4 py-3 text-center text-sm font-mono text-blue-700 font-bold">{log.exitTime ? formatTime(log.exitTime) : <span className="text-zinc-300">—</span>}</td>
                      <td className="px-4 py-3 text-center text-sm font-bold text-zinc-600">{log.duration ? formatDuration(log.duration) : "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.exitTime ? 'bg-zinc-100 text-zinc-500' : 'bg-emerald-50 text-emerald-700'}`}>
                          {log.exitTime ? "Exited" : "Inside"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
