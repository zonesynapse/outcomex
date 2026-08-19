import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, getDoc, onSnapshot, setDoc, addDoc, serverTimestamp } from "firebase/firestore";
import {
  PenLine, ArrowLeft, Loader2, Save, Users2, Layers, CalendarRange,
  CheckCircle2, AlertTriangle, Search, X, Landmark, UserCheck, BookOpen, RefreshCw
} from "lucide-react";
import Layout from "../../components/Layout";
import { auth, db } from "../../firebase";
import { useDepartments } from "../../hooks/useDepartments";
import { useRegulations } from "../../hooks/useRegulations";
import { useBatches } from "../../hooks/useBatches";
import { formatBatchDisplay, formatDepartmentDisplay, getAcademicYears, formatProgrammeKey } from "../../lib/utils";
import { sanitizeKey } from "../../lib/utils";

const normClean = (s) => String(s || "").replace(/[._\s\-/]/g, "").toLowerCase();

const parseSyllabusDocId = (id) => {
  const parts = id.split('_');
  if (parts.length < 3) return { progKey: "", deptKey: "", regKey: "" };
  let progKey = parts[0];
  let deptStartIdx = 1;
  if (['B', 'M'].includes(parts[0]) && ['E', 'Tech', 'Sc', 'Com'].includes(parts[1])) {
    progKey = `${parts[0]}_${parts[1]}`;
    deptStartIdx = 2;
  }
  const regKey = parts[parts.length - 1];
  const deptKey = parts.slice(deptStartIdx, parts.length - 1).join('_');
  return { progKey, deptKey, regKey };
};

export default function QPSetterAssignment() {
  const navigate = useNavigate();
  const { departments: deptMap, durations } = useDepartments();
  const { getRegulationForBatch } = useRegulations();
  const { getActiveBatches } = useBatches(durations);

  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid || null);
  const [coeName, setCoeName] = useState("");
  const [usersMap, setUsersMap] = useState({});
  const [allSyllabus, setAllSyllabus] = useState([]);
  const [allAssignments, setAllAssignments] = useState([]);

  const [batch, setBatch] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 5000);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUid(user?.uid || null);
      if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const ud = snap.data();
          setCoeName(ud.facultyName || ud.displayName || ud.email || "Exam Cell");
        }
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const map = {};
      snap.forEach(d => {
        map[d.id] = d.data();
      });
      setUsersMap(map);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "syllabus_data"), (snap) => {
      const docs = [];
      snap.forEach(d => {
        const parsed = parseSyllabusDocId(d.id);
        docs.push({ id: d.id, ...parsed, data: d.data() });
      });
      setAllSyllabus(docs);
      setLoading(false);
    }, () => { setAllSyllabus([]); setLoading(false); });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "subject_assignments"), (snap) => {
      const entries = [];
      snap.forEach((doc) => {
        const idParts = doc.id.split('_');
        if (idParts.length < 5) return;
        let sectionExtracted = '';
        let semKey = idParts.pop();
        if (!/^\d+$/.test(semKey) && idParts.length >= 5) {
          sectionExtracted = semKey;
          semKey = idParts.pop();
        }
        const ayKey = idParts.pop();
        const batchKey = idParts.pop();
        let progKeyExtracted = idParts[0];
        let deptStartIdx = 1;
        if (['B', 'M'].includes(idParts[0]) && ['E', 'Tech', 'Sc', 'Com'].includes(idParts[1])) {
          progKeyExtracted = `${idParts[0]}_${idParts[1]}`;
          deptStartIdx = 2;
        }
        let deptKey = idParts.slice(deptStartIdx).join('_');
        if (deptKey.startsWith('_')) deptKey = deptKey.slice(1);

        Object.entries(doc.data() || {}).forEach(([uid, codes]) => {
          if (uid === '_meta' || uid.startsWith('_')) return;
          if (!Array.isArray(codes)) return;
          codes.forEach(code => {
            entries.push({
              code, uid,
              progKey: progKeyExtracted,
              dept: deptKey,
              batch: batchKey,
              academicYear: ayKey,
              semester: semKey,
              section: sectionExtracted
            });
          });
        });
      });
      setAllAssignments(entries);
    }, () => setAllAssignments([]));
    return () => unsub();
  }, []);

  const programmes = useMemo(() => Object.keys(deptMap || {}), [deptMap]);

  const availableBatches = useMemo(() => {
    const set = new Set();
    programmes.forEach(p => {
      getActiveBatches(p).forEach(b => set.add(b));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [programmes, getActiveBatches]);

  const academicYears = useMemo(() => getAcademicYears(batch), [batch]);

  const semesters = useMemo(() => {
    if (!batch || !academicYear) return [];
    const [batchStart] = batch.split("-").map(Number);
    const [yearStart] = academicYear.split("-").map(Number);
    const yearIndex = yearStart - batchStart;
    if (yearIndex < 0) return [];
    return [String((yearIndex * 2) + 1), String((yearIndex * 2) + 2)];
  }, [batch, academicYear]);

  useEffect(() => {
    setSemester("");
  }, [batch, academicYear]);

  const activeProgrammes = useMemo(() => {
    if (!batch) return [];
    return programmes.filter(p => getActiveBatches(p).includes(batch));
  }, [programmes, batch, getActiveBatches]);

  const syllabusSubjects = useMemo(() => {
    if (!batch || !semester) return [];
    const byCode = {};
    activeProgrammes.forEach(prog => {
      const progKey = formatProgrammeKey(prog);
      const regulation = getRegulationForBatch(progKey, batch);
      if (!regulation) return;
      const regNorm = normClean(regulation);
      const matching = allSyllabus.filter(s => s.progKey === progKey && normClean(s.regKey) === regNorm);
      matching.forEach(sDoc => {
        const subs = sDoc.data?.semesters?.[semester] || [];
        if (!Array.isArray(subs)) return;
        subs.forEach(sub => {
          if (!sub || sub.isNonOBE === true) return;
          const code = String(sub.code || sub.subjectCode || sub.courseCode || "").trim();
          const name = String(sub.name || sub.subjectName || sub.courseName || sub.title || "").trim();
          if (!code) return;
          if (!byCode[code]) byCode[code] = { code, name, departments: [] };
          if (name && !byCode[code].name) byCode[code].name = name;
          const key = `${progKey}|||${sDoc.deptKey}`;
          if (!byCode[code].departments.some(d => d.key === key)) {
            byCode[code].departments.push({ progKey, prog, dept: sDoc.deptKey, key });
          }
        });
      });
    });
    return Object.values(byCode)
      .map(s => ({ ...s, departments: s.departments.sort((a, b) => a.dept.localeCompare(b.dept)) }))
      .sort((a, b) => {
        const commonA = a.departments.length > 1 ? 0 : 1;
        const commonB = b.departments.length > 1 ? 0 : 1;
        if (commonA !== commonB) return commonA - commonB;
        if (a.departments[0]?.dept !== b.departments[0]?.dept) return (a.departments[0]?.dept || "").localeCompare(b.departments[0]?.dept || "");
        return a.code.localeCompare(b.code);
      });
  }, [allSyllabus, activeProgrammes, batch, semester, getRegulationForBatch]);

  const getFacultyName = (uid) => {
    const u = usersMap[uid];
    return u?.facultyName || u?.displayName || u?.name || u?.email || "Unknown Faculty";
  };

  const codeHandlers = useMemo(() => {
    if (!batch || !academicYear || !semester) return {};
    const map = {};
    allAssignments.forEach(a => {
      if (a.batch !== batch) return;
      if (a.academicYear !== academicYear) return;
      if (String(a.semester) !== String(semester)) return;
      if (!map[a.code]) map[a.code] = [];
      const exists = map[a.code].find(h => h.uid === a.uid && h.dept === a.dept && h.progKey === a.progKey);
      if (!exists) {
        map[a.code].push({ uid: a.uid, dept: a.dept, progKey: a.progKey, prog: a.progKey });
      }
    });
    Object.keys(map).forEach(code => {
      map[code].sort((x, y) => (getFacultyName(x.uid) || '').localeCompare(getFacultyName(y.uid) || ''));
    });
    return map;
  }, [allAssignments, batch, academicYear, semester, usersMap]);

  const rows = useMemo(() => {
    if (!syllabusSubjects.length) return [];
    return syllabusSubjects.map(s => {
      const handlers = (codeHandlers[s.code] || []).map(h => ({
        uid: h.uid,
        label: `${getFacultyName(h.uid)}${s.departments.length > 1 || h.dept ? ` (${formatDepartmentDisplay(h.dept, h.progKey)})` : ""}`
      }));
      return { ...s, handlers };
    });
  }, [syllabusSubjects, codeHandlers, usersMap]);

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.trim().toLowerCase();
    return rows.filter(r =>
      r.code.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.departments.some(d => d.dept.toLowerCase().includes(q)) ||
      r.handlers.some(h => h.label.toLowerCase().includes(q))
    );
  }, [rows, searchQuery]);

  const saveDocKey = useMemo(() => {
    if (!batch || !academicYear || !semester) return "";
    return `${sanitizeKey(batch)}_${sanitizeKey(academicYear)}_${semester}`;
  }, [batch, academicYear, semester]);

  useEffect(() => {
    if (!saveDocKey || saveDocKey === loadedKey) return;
    setLoadedKey(saveDocKey);
    const ref = doc(db, "qp_setter_assignments", saveDocKey);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAssignments(data.assignments || {});
      } else {
        setAssignments({});
      }
    }, () => setAssignments({}));
    return () => unsub();
  }, [saveDocKey]);

  useEffect(() => {
    if (!rows.length) return;
    setAssignments(prev => {
      const next = { ...prev };
      let changed = false;
      rows.forEach(r => {
        if (next[r.code]) return;
        if (r.handlers.length === 1) {
          next[r.code] = { setterUid: r.handlers[0].uid, numSets: next[r.code]?.numSets || 1, fromDate: "", toDate: "" };
          changed = true;
        } else {
          next[r.code] = { setterUid: "", numSets: next[r.code]?.numSets || 1, fromDate: "", toDate: "" };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [rows]);

  const updateAssignment = (code, field, value) => {
    setAssignments(prev => ({
      ...prev,
      [code]: { ...(prev[code] || {}), [field]: value }
    }));
  };

  const autoFillSetter = (code) => {
    const r = rows.find(x => x.code === code);
    if (!r || r.handlers.length !== 1) return;
    updateAssignment(code, "setterUid", r.handlers[0].uid);
  };

  const setterOptions = (r) => {
    if (r.handlers.length > 1) return r.handlers;
    if (r.handlers.length === 1) {
      return [{ uid: "", label: "Auto (single faculty)" }, ...r.handlers];
    }
    return [{ uid: "", label: "No faculty assigned yet" }];
  };

  const handleSave = async () => {
    if (!saveDocKey) return showToast("Please select Batch, Academic Year and Semester.", "error");

    const invalid = filteredRows.filter(r => {
      const row = assignments[r.code];
      if (!row || !row.setterUid) return true;
      return false;
    });
    const dateInvalid = filteredRows.filter(r => {
      const row = assignments[r.code];
      if (!row?.fromDate || !row?.toDate) return false;
      return new Date(row.toDate) < new Date(row.fromDate);
    });

    if (invalid.length) {
      return showToast(`Please assign a QP setter for ${invalid.length} subject(s) before saving.`, "error");
    }
    if (dateInvalid.length) {
      return showToast("Some submission date ranges are invalid (To before From).", "error");
    }

    setSaving(true);
    try {
      const payloadAssignments = {};
      const notifications = [];
      rows.forEach(r => {
        const row = assignments[r.code];
        if (!row) return;
        const setter = usersMap[row.setterUid];
        const setterName = setter?.facultyName || setter?.displayName || setter?.name || setter?.email || "Unassigned";
        payloadAssignments[r.code] = {
          code: r.code,
          name: r.name,
          departments: r.departments.map(d => ({ prog: d.prog, progKey: d.progKey, dept: d.dept })),
          setterUid: row.setterUid || "",
          setterName: row.setterUid ? setterName : "",
          numSets: parseInt(row.numSets, 10) || 1,
          fromDate: row.fromDate || "",
          toDate: row.toDate || ""
        };
        notifications.push({ code: r.code, uid: row.setterUid });
      });

      await setDoc(doc(db, "qp_setter_assignments", saveDocKey), {
        batch,
        academicYear,
        semester,
        programmeKey: null,
        updatedBy: coeName || auth.currentUser?.email || "Exam Cell",
        updatedById: currentUid,
        updatedAt: new Date().toISOString(),
        assignments: payloadAssignments
      });

      const uniqueSetters = {};
      notifications.forEach(n => {
        if (n.uid && !uniqueSetters[n.uid]) uniqueSetters[n.uid] = [];
        if (n.uid) uniqueSetters[n.uid].push(n.code);
      });

      await Promise.all(Object.entries(uniqueSetters).map(([uid, codes]) => {
        const setterName = usersMap[uid]?.facultyName || usersMap[uid]?.displayName || "";
        return addDoc(collection(db, "notifications"), {
          type: "qp_setter_assigned",
          targetUid: uid,
          targetName: setterName,
          batch,
          academicYear,
          semester,
          subjectCodes: codes,
          assignedBy: coeName || auth.currentUser?.email || "Exam Cell",
          assignedById: currentUid,
          createdAt: serverTimestamp(),
          read: false
        });
      }));

      showToast("QP setter assignments saved successfully.", "success");
    } catch (err) {
      console.error("Error saving QP setter assignments:", err);
      showToast("Failed to save assignments.", "error");
    } finally {
      setSaving(false);
    }
  };

  const setterCount = useMemo(() => {
    const set = new Set();
    rows.forEach(r => {
      const s = assignments[r.code]?.setterUid;
      if (s) set.add(s);
    });
    return set.size;
  }, [rows, assignments]);

  const unsavedCount = useMemo(() => {
    let c = 0;
    rows.forEach(r => {
      const row = assignments[r.code];
      if (row?.setterUid) c++;
    });
    return c;
  }, [rows, assignments]);

  const commonRows = filteredRows.filter(r => r.departments.length > 1);
  const deptRows = filteredRows.filter(r => r.departments.length === 1);

  const renderRow = (r) => {
    const row = assignments[r.code] || {};
    const isCommon = r.departments.length > 1;
    return (
      <tr key={r.code} className="align-top hover:bg-blue-50/30 transition-colors">
        <td className="py-3 px-3">
          {isCommon ? (
            <div className="flex flex-col gap-1">
              <span className="inline-flex w-fit items-center gap-1 rounded-md bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wide">
                <Layers size={9} /> Common
              </span>
              <span className="text-[10px] font-semibold text-zinc-500 leading-snug pt-0.5">
                {r.departments.map(d => formatDepartmentDisplay(d.dept, d.progKey)).join(", ")}
              </span>
            </div>
          ) : (
            <span className="text-xs font-bold text-zinc-700">
              {formatDepartmentDisplay(r.departments[0].dept, r.departments[0].progKey)}
            </span>
          )}
        </td>
        <td className="py-3 px-3">
          <span className="text-xs font-black text-[#120c7a] whitespace-nowrap">{r.code}</span>
          {isCommon && (
            <div className="mt-0.5 flex flex-wrap gap-0.5">
              {r.departments.map(d => (
                <span key={d.key} className="text-[9px] text-zinc-400 font-semibold bg-zinc-100 rounded px-1 py-px">{d.progKey}</span>
              ))}
            </div>
          )}
        </td>
        <td className="py-3 px-3">
          <span className="text-xs font-semibold text-zinc-800 leading-snug">{r.name || "-"}</span>
        </td>
        <td className="py-3 px-3">
          {r.handlers.length === 0 ? (
            <span className="text-[10px] text-amber-600 font-bold inline-flex items-center gap-1">
              <AlertTriangle size={11} /> No faculty allocated
            </span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {r.handlers.map(h => (
                <span key={h.uid} className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-100 text-blue-700 px-1.5 py-0.5 text-[9px] font-bold">
                  <UserCheck size={9} /> {h.label}
                </span>
              ))}
            </div>
          )}
        </td>
        <td className="py-3 px-3">
          <select
            value={row.setterUid || ""}
            onChange={(e) => updateAssignment(r.code, "setterUid", e.target.value)}
            onFocus={() => autoFillSetter(r.code)}
            className={`w-full min-w-[140px] px-2 py-2 rounded-lg border text-[11px] font-semibold outline-none transition-all cursor-pointer ${
              row.setterUid ? "border-[#120c7a]/30 bg-indigo-50/60 text-zinc-800 focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10"
              : "border-zinc-200 bg-white text-zinc-500 focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10"
            }`}>
            <option value="">— Assign Setter —</option>
            {setterOptions(r).map(opt => (
              <option key={opt.uid || `x${opt.label}`} value={opt.uid}>{opt.label}</option>
            ))}
          </select>
        </td>
        <td className="py-3 px-3">
          <select
            value={row.numSets || 1}
            onChange={(e) => updateAssignment(r.code, "numSets", e.target.value)}
            className="w-full min-w-[70px] px-2 py-2 rounded-lg border border-zinc-200 bg-white text-[11px] font-semibold text-zinc-700 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 transition-all cursor-pointer">
            {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} Set{n > 1 ? "s" : ""}</option>)}
          </select>
        </td>
        <td className="py-3 px-3">
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={row.fromDate || ""}
              onChange={(e) => updateAssignment(r.code, "fromDate", e.target.value)}
              className="px-2 py-2 rounded-lg border border-zinc-200 bg-white text-[10px] font-semibold text-zinc-700 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 transition-all w-[135px]"
            />
            <span className="text-[10px] text-zinc-400 font-black">→</span>
            <input
              type="date"
              value={row.toDate || ""}
              onChange={(e) => updateAssignment(r.code, "toDate", e.target.value)}
              className="px-2 py-2 rounded-lg border border-zinc-200 bg-white text-[10px] font-semibold text-zinc-700 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 transition-all w-[135px]"
            />
          </div>
        </td>
        <td className="py-3 px-3">
          {row.setterUid ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-600">
              <CheckCircle2 size={12} /> Assigned
            </span>
          ) : (
            <span className="text-[10px] font-bold text-zinc-400 inline-flex items-center gap-1">
              <X size={11} /> Pending
            </span>
          )}
        </td>
      </tr>
    );
  };

  const selectCls = "px-3 py-2.5 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 transition-all cursor-pointer";

  return (
    <Layout title="Exam Cell — QP Setter Assignment">
      {toast.show && (
        <div className={`fixed top-5 right-5 z-[300] px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-bold animate-in slide-in-from-right ${toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"}`}>
          {toast.message}
        </div>
      )}

      <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB] p-4 md:p-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl mb-6">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="absolute -bottom-16 -left-10 w-56 h-56 rounded-full bg-white/5 blur-2xl"></div>
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate("/exam-cell")}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all cursor-pointer">
                <ArrowLeft size={18} />
              </button>
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
                <PenLine size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black leading-tight">QP Setter Assignment</h1>
                <p className="text-sm text-blue-100/90 font-medium">Exam Cell — assign question paper setters, set counts and submission windows</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-black/20 border border-white/10 rounded-2xl px-4 py-2">
              <ShieldBadgeSO />
              <div>
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Signed in as</p>
                <p className="text-sm font-extrabold">{coeName}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-4 md:p-5 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1.5 block">Batch</label>
              <select value={batch} onChange={(e) => { setBatch(e.target.value); setAcademicYear(""); }}
                className={`${selectCls} w-full`}>
                <option value="">Select Batch</option>
                {availableBatches.map(b => <option key={b} value={b}>{formatBatchDisplay(b)}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1.5 block">Academic Year</label>
              <select value={academicYear} onChange={(e) => { setAcademicYear(e.target.value); setSemester(""); }} disabled={!batch}
                className={`${selectCls} w-full ${!batch ? "opacity-50 cursor-not-allowed" : ""}`}>
                <option value="">Select Academic Year</option>
                {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1.5 block">Semester</label>
              <select value={semester} onChange={(e) => setSemester(e.target.value)} disabled={!academicYear}
                className={`${selectCls} w-full ${!academicYear ? "opacity-50 cursor-not-allowed" : ""}`}>
                <option value="">Select Semester</option>
                {semesters.map(s => <option key={s} value={s}>Semester {s}</option>)}
              </select>
            </div>
            <div className="flex-[1.5]">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1.5 block">Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search subject code, name, department or faculty..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold bg-zinc-50 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 transition-all" />
              </div>
            </div>
            {(batch || academicYear || semester || searchQuery) && (
              <button onClick={() => { setBatch(""); setAcademicYear(""); setSemester(""); setSearchQuery(""); }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-100 text-zinc-600 text-xs font-bold hover:bg-zinc-200 transition-all cursor-pointer lg:mb-0">
                <RefreshCw size={13} /> Reset
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {semester && !loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><BookOpen size={15} /></div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Subjects</p>
              </div>
              <p className="text-2xl font-black text-zinc-900 mt-2">{rows.length}</p>
              <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                {commonRows.length} common · {deptRows.length} department-specific
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Users2 size={15} /></div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Setters Assigned</p>
              </div>
              <p className="text-2xl font-black text-zinc-900 mt-2">{setterCount}</p>
              <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">distinct faculty chosen</p>
            </div>
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><CheckCircle2 size={15} /></div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Subjects Ready</p>
              </div>
              <p className="text-2xl font-black text-zinc-900 mt-2">{unsavedCount}</p>
              <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">with a chosen setter</p>
            </div>
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><CalendarRange size={15} /></div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">Submission Window</p>
              </div>
              <p className="text-2xl font-black text-zinc-900 mt-2">Sem {semester}</p>
              <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">Batch {batch} · {academicYear}</p>
            </div>
          </div>
        )}

        {/* Table */}
        {semester && !loading ? (
          filteredRows.length === 0 ? (
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-4">
                <BookOpen size={28} />
              </div>
              <h3 className="text-sm font-black text-zinc-800">
                {searchQuery ? "No matching subjects" : "No subjects found for this semester"}
              </h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                {searchQuery
                  ? "Try adjusting your search query."
                  : "Upload curriculum (syllabus_data) for the programme / regulation mapped to this batch, or check the semester selection."}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden mb-6">
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[1100px]">
                  <thead>
                    <tr className="bg-gradient-to-r from-[#120c7a] to-indigo-800 text-white text-[10px] font-black uppercase tracking-wider">
                      <th className="py-3 px-3">Department</th>
                      <th className="py-3 px-3">Course Code</th>
                      <th className="py-3 px-3">Course Name</th>
                      <th className="py-3 px-3">Subject Handling Faculty</th>
                      <th className="py-3 px-3">QP Setter (Assign)</th>
                      <th className="py-3 px-3">Sets</th>
                      <th className="py-3 px-3">Submission Window</th>
                      <th className="py-3 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 bg-white font-medium text-zinc-700">
                    {filteredRows.map(renderRow)}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          !loading && (
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-[#120c7a] flex items-center justify-center mx-auto mb-4">
                <Landmark size={28} />
              </div>
              <h3 className="text-sm font-black text-zinc-800">Select batch, academic year and semester</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                Subjects from every department in the chosen semester will appear here, grouped by course code —
                shared codes are merged into a single Common row.
              </p>
            </div>
          )
        )}

        {/* Save Bar */}
        {semester && !loading && filteredRows.length > 0 && (
          <div className="sticky bottom-4 bg-white/90 backdrop-blur rounded-3xl border border-zinc-200 shadow-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <p className="text-xs font-black text-zinc-800">
                {unsavedCount}/{rows.length} subjects have a chosen setter
              </p>
              <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                Saving writes to <code className="bg-zinc-100 px-1 py-0.5 rounded">qp_setter_assignments/{saveDocKey}</code> and notifies each assigned faculty.
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-6 py-3 rounded-xl text-sm font-black shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
              {saving ? "Saving..." : "Save QP Setter Assignments"}
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}

const ShieldBadgeSO = () => (
  <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
    <Landmark size={18} className="text-amber-300" />
  </div>
);