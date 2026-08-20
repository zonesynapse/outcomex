import { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2, Clock, FileText, Loader2, ShieldCheck, Calendar
} from "lucide-react";
import { db, auth } from "../firebase";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { formatDepartmentDisplay, formatBatchDisplay } from "../lib/utils";

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

const formatDate = (value) => {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "-";
  }
};

const format12Hour = (time24) => {
  if (!time24) return '';
  if (time24.includes('AM') || time24.includes('PM')) return time24;
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return time24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const formattedH = String(h).padStart(2, '0');
  return `${formattedH}:${mStr || '00'} ${ampm}`;
};

export default function PrincipalIAScheduleView({ showApproveButton = true, hideApproveButton = false }) {
  const [scheduleDocs, setScheduleDocs] = useState([]);
  const [allSyllabus, setAllSyllabus] = useState([]);
  const [approvingKey, setApprovingKey] = useState("");
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  // 1. Read all saved QP Setter Assignments / IA Schedules (all batches)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "qp_setter_assignments"), (snap) => {
      const docs = [];
      snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
      docs.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      setScheduleDocs(docs);
    }, (err) => {
      console.warn("qp_setter_assignments listener error:", err);
      setScheduleDocs([]);
    });
    return () => unsub();
  }, []);

  // 2. Read all syllabus docs to resolve department per course code
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "syllabus_data"), (snap) => {
      const docs = [];
      snap.forEach(d => {
        const parsed = parseSyllabusDocId(d.id);
        docs.push({ id: d.id, ...parsed, data: d.data() });
      });
      setAllSyllabus(docs);
    }, (err) => {
      console.warn("syllabus_data listener error:", err);
      setAllSyllabus([]);
    });
    return () => unsub();
  }, []);

  const normCodeKey = (s) => String(s || "").toUpperCase().replace(/\s+/g, "");

  const toArray = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === "object" && v !== null) {
      const vals = Object.values(v);
      if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
      return vals;
    }
    return [];
  };

  // Global code → departments map (across all programmes/semesters)
  const codeDeptMap = useMemo(() => {
    const map = {};
    allSyllabus.forEach(sDoc => {
      const subsBySem = sDoc.data?.semesters || {};
      Object.entries(subsBySem).forEach(([semKey, rawSubs]) => {
        const subs = toArray(rawSubs);
        subs.forEach(sub => {
          if (!sub || sub.isNonOBE === true || sub.isActive === false) return;
          const code = String(sub.code || sub.subjectCode || sub.courseCode || "").trim();
          if (!code) return;
          const normKey = normCodeKey(code);
          if (!map[normKey]) map[normKey] = [];
          const key = `${sDoc.progKey}|||${sDoc.deptKey}`;
          if (!map[normKey].some(d => d.key === key)) {
            map[normKey].push({ progKey: sDoc.progKey, dept: sDoc.deptKey, sem: String(semKey).trim(), key });
          }
        });
      });
    });
    return map;
  }, [allSyllabus]);

  const [courseBankNameMap, setCourseBankNameMap] = useState({});
  const [batchRegulations, setBatchRegulations] = useState({});

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "batch_regulations"), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setBatchRegulations(data);
    }, () => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "courses"), (snap) => {
      const nameMap = {};
      snap.forEach(d => {
        const data = d.data() || {};
        const rawCode = String(data.code || data.subjectCode || data.courseCode || "").trim();
        const name = String(data.name || data.courseName || data.subjectName || "").trim();
        if (rawCode && name) {
          const normName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
          nameMap[normName] = rawCode;
          if (data.department) {
            const cleanD = String(data.department).replace(/[.#$[\]/ ]/g, '_');
            nameMap[`${cleanD}_${normName}`] = rawCode;
          }
        }
      });
      setCourseBankNameMap(nameMap);
    }, () => {});
    return () => unsub();
  }, []);

  const resolveBatchRegulation = (batch, progKey) => {
    if (!batch) return "";
    const cleanB = String(batch).trim();

    if (progKey && batchRegulations?.[progKey]?.[cleanB]) {
      return batchRegulations[progKey][cleanB];
    }
    if (progKey) {
      const cleanP = String(progKey).replace(/[.#$[\]/ ]/g, '_');
      if (batchRegulations?.[cleanP]?.[cleanB]) {
        return batchRegulations[cleanP][cleanB];
      }
    }

    for (const pKey of Object.keys(batchRegulations || {})) {
      if (batchRegulations[pKey]?.[cleanB]) {
        return batchRegulations[pKey][cleanB];
      }
    }

    const match = allSyllabus.find(s => s.data?.batch === cleanB || s.id?.includes(cleanB));
    if (match && match.regKey) {
      return match.regKey.replace(/_/g, ' ').replace(/([A-Z]+)(R\d+)/i, '$1 - $2').trim();
    }

    return "";
  };

  const formatExamNameWithRegulation = (rawExamName, batch, progKey) => {
    if (!rawExamName) return "-";

    const resolvedReg = resolveBatchRegulation(batch, progKey);
    if (!resolvedReg) return rawExamName;

    let cleanReg = resolvedReg.trim();
    const rMatch = cleanReg.match(/R\d{4}/i);
    if (rMatch) {
      const rCode = rMatch[0].toUpperCase();
      cleanReg = `AU - ${rCode}`;
    }

    const regParenRegex = /\((?:AU\s*-\s*)?R\d{4}\)/i;
    if (regParenRegex.test(rawExamName)) {
      return rawExamName.replace(regParenRegex, `(${cleanReg})`);
    }

    return `${rawExamName} (${cleanReg})`;
  };

  const getCanonicalCode = (code, name, deptKey) => {
    if (!name) return code || "";
    const normName = String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (deptKey) {
      const cleanD = String(deptKey).replace(/[.#$[\]/ ]/g, '_');
      if (courseBankNameMap[`${cleanD}_${normName}`]) {
        return courseBankNameMap[`${cleanD}_${normName}`];
      }
    }
    if (courseBankNameMap[normName]) {
      return courseBankNameMap[normName];
    }
    return code || "";
  };

  // Flatten only subjects that have an assigned exam date, grouped by department
  const rows = useMemo(() => {
    const out = [];
    scheduleDocs.forEach(sDoc => {
      const assignments = sDoc.assignments || {};
      Object.entries(assignments).forEach(([assignKey, as]) => {
        if (!as?.examDate) return; // only subjects with assigned dates
        const rawCode = String(as.code || assignKey || "").trim();
        const normKey = normCodeKey(rawCode);

        // Priority 1: Use explicit departments saved on the assignment
        const explicitDepts = Array.isArray(as.departments) && as.departments.length > 0 ? as.departments : [];

        // Priority 2: Fallback to mapped departments matching current semester
        let depts = explicitDepts;
        if (depts.length === 0) {
          const allMapped = codeDeptMap[normKey] || [];
          const semMapped = allMapped.filter(d => !d.sem || String(d.sem) === String(sDoc.semester));
          depts = semMapped.length > 0 ? semMapped : allMapped;
        }

        const displayCode = getCanonicalCode(as.code || assignKey, as.name, depts[0]?.dept);

        const sTime = as.startTime || "";
        const eTime = as.endTime || "";
        const slot = as.slot || as.session || (sTime ? (parseInt(sTime.split(':')[0], 10) < 12 ? 'FN' : 'AN') : "");

        const formattedExam = formatExamNameWithRegulation(
          sDoc.examName || sDoc.examId || "",
          sDoc.batch,
          depts[0]?.progKey
        );

        const row = {
          docId: sDoc.id,
          rawKey: assignKey,
          rawCode: as.code || assignKey || "",
          code: displayCode || as.code || assignKey || "",
          name: as.name || "",
          examDate: as.examDate || "",
          startTime: sTime,
          endTime: eTime,
          slot,
          timeSlot: as.timeSlot || "",
          setterName: as.setterName || "-",
          numSets: as.numSets || 1,
          fromDate: as.fromDate || "",
          toDate: as.toDate || "",
          batch: sDoc.batch || "",
          academicYear: sDoc.academicYear || "",
          semester: sDoc.semester || "",
          examName: formattedExam || sDoc.examName || "-",
          approved: as.approved === true,
          departments: depts.length ? depts : [{ progKey: "", dept: "_unmapped", key: "_unmapped" }]
        };
        out.push(row);
      });
    });

    const grouped = {};
    out.forEach(r => {
      r.departments.forEach(d => {
        const label = d.dept === "_unmapped"
          ? "Unknown Department"
          : formatDepartmentDisplay(d.dept, d.progKey);
        if (!grouped[label]) grouped[label] = [];
        grouped[label].push({ ...r, deptLabel: label });
      });
    });

    return Object.entries(grouped)
      .map(([dept, items]) => {
        const sortedItems = items.sort((a, b) =>
          String(a.examDate).localeCompare(String(b.examDate)) || a.code.localeCompare(b.code)
        );

        const batchMap = {};
        sortedItems.forEach(item => {
          const bKey = `${item.batch || "Unknown"}___${item.semester || ""}`;
          if (!batchMap[bKey]) {
            batchMap[bKey] = {
              batch: item.batch,
              semester: item.semester,
              academicYear: item.academicYear,
              items: []
            };
          }
          batchMap[bKey].items.push(item);
        });

        const batchGroups = Object.values(batchMap).sort((a, b) =>
          String(b.batch).localeCompare(String(a.batch)) || String(a.semester).localeCompare(String(b.semester))
        );

        return {
          dept,
          items: sortedItems,
          batchGroups
        };
      })
      .sort((a, b) => a.dept.localeCompare(b.dept));
  }, [scheduleDocs, codeDeptMap]);

  const [selectedBatchFilter, setSelectedBatchFilter] = useState("ALL");

  const availableBatches = useMemo(() => {
    const set = new Set();
    rows.forEach(g => {
      g.items.forEach(i => { if (i.batch) set.add(i.batch); });
    });
    return Array.from(set).sort((a, b) => String(b).localeCompare(String(a)));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (selectedBatchFilter === "ALL") return rows;
    return rows.map(g => {
      const filteredItems = g.items.filter(i => String(i.batch) === String(selectedBatchFilter));
      if (!filteredItems.length) return null;

      const batchMap = {};
      filteredItems.forEach(item => {
        const bKey = `${item.batch || "Unknown"}___${item.semester || ""}`;
        if (!batchMap[bKey]) {
          batchMap[bKey] = {
            batch: item.batch,
            semester: item.semester,
            academicYear: item.academicYear,
            items: []
          };
        }
        batchMap[bKey].items.push(item);
      });

      const batchGroups = Object.values(batchMap).sort((a, b) =>
        String(b.batch).localeCompare(String(a.batch)) || String(a.semester).localeCompare(String(b.semester))
      );

      return {
        ...g,
        items: filteredItems,
        batchGroups
      };
    }).filter(Boolean);
  }, [rows, selectedBatchFilter]);

  const totalScheduled = useMemo(() => rows.reduce((sum, g) => sum + g.items.length, 0), [rows]);
  const approvedCount = useMemo(() => {
    return rows.reduce((sum, g) => sum + g.items.filter(i => i.approved).length, 0);
  }, [rows]);

  const handleApproveDept = async (items) => {
    if (!items || items.length === 0) return;
    const uid = auth.currentUser?.uid || "";
    const approvedAt = new Date().toISOString();

    const itemsByDoc = {};
    items.forEach(it => {
      if (!itemsByDoc[it.docId]) itemsByDoc[it.docId] = [];
      itemsByDoc[it.docId].push(it);
    });

    const key = Object.keys(itemsByDoc).sort().join("|||");
    setApprovingKey(key);

    try {
      await Promise.all(Object.entries(itemsByDoc).map(([docId, docItems]) => {
        const sDoc = scheduleDocs.find(d => d.id === docId);
        const existingAssignments = sDoc?.assignments || {};
        const updates = {};

        docItems.forEach(it => {
          const targetKeys = new Set();
          if (it.rawKey) targetKeys.add(it.rawKey);
          if (it.rawCode) targetKeys.add(it.rawCode);
          if (it.code) targetKeys.add(it.code);

          const itNormCode = normCodeKey(it.code || it.rawCode || it.rawKey);
          Object.keys(existingAssignments).forEach(existingKey => {
            if (normCodeKey(existingKey) === itNormCode) {
              targetKeys.add(existingKey);
            }
          });

          targetKeys.forEach(k => {
            updates[`assignments.${k}.approved`] = true;
            updates[`assignments.${k}.principalApprovedBy`] = uid;
            updates[`assignments.${k}.principalApprovedByName`] = "Principal";
            updates[`assignments.${k}.principalApprovedAt`] = approvedAt;
          });
        });

        updates["status"] = "Approved";
        updates["principalApproved"] = true;
        updates["updatedBy"] = "Principal";
        updates["updatedAt"] = approvedAt;

        return updateDoc(doc(db, "qp_setter_assignments", docId), updates);
      }));

      showToast("IA Schedule approved successfully!", "success");
    } catch (err) {
      console.error("Error approving IA schedule:", err);
      showToast("Failed to approve IA schedule", "error");
    } finally {
      setApprovingKey("");
    }
  };

  return (
    <div className="w-full">
      {toast?.show && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
          {toast.message}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-gradient-to-br from-blue-700 to-indigo-900 rounded-xl p-4 text-white">
          <p className="text-2xl font-bold">{totalScheduled}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Subjects Scheduled</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-600 to-teal-800 rounded-xl p-4 text-white">
          <p className="text-2xl font-bold">{approvedCount}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Approved Subjects</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-orange-700 rounded-xl p-4 text-white">
          <p className="text-2xl font-bold">{totalScheduled - approvedCount}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Pending Approval</p>
        </div>
      </div>

      {/* Batch Filter Bar */}
      {availableBatches.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5 p-2 bg-zinc-100/80 rounded-xl border border-zinc-200">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider px-2">Filter Batch:</span>
          <button
            onClick={() => setSelectedBatchFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedBatchFilter === "ALL"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-zinc-600 hover:bg-zinc-200/70 border border-zinc-200"
            }`}
          >
            All Batches ({totalScheduled})
          </button>
          {availableBatches.map(b => {
            const count = rows.reduce((acc, g) => acc + g.items.filter(i => String(i.batch) === String(b)).length, 0);
            return (
              <button
                key={b}
                onClick={() => setSelectedBatchFilter(b)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedBatchFilter === b
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white text-zinc-600 hover:bg-zinc-200/70 border border-zinc-200"
                }`}
              >
                {formatBatchDisplay(b)} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Main Scheduled Items Grouped by Department & Batch */}
      {filteredRows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-zinc-400">
          <Calendar size={36} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm font-semibold">No IA exam schedules found.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredRows.map(group => {
            const allApproved = group.items.every(i => i.approved);
            const approvingKeyStr = [...new Set(group.items.map(i => i.docId))].sort().join("|||");
            return (
              <div key={group.dept} className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-zinc-50 border-b border-zinc-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck size={16} className="text-blue-600 shrink-0" />
                    <span className="font-bold text-zinc-900 text-sm truncate">{group.dept}</span>
                    <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 rounded-full px-2.5 py-0.5 shrink-0">
                      {group.items.length} {group.items.length === 1 ? 'subject' : 'subjects'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {allApproved ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-emerald-100 text-emerald-700">
                        <CheckCircle2 size={13} /> Approved
                      </span>
                    ) : (
                      <>
                        <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-amber-100 text-amber-700">
                          Pending
                        </span>
                        {showApproveButton && !hideApproveButton && (
                          <button
                            onClick={() => handleApproveDept(group.items)}
                            disabled={!!approvingKey}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 text-white text-[12px] font-bold shadow-sm hover:shadow-md hover:opacity-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {approvingKey === approvingKeyStr ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                            {approvingKey === approvingKeyStr ? "Approving..." : "Approve Department"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Batch-wise sub-sections inside Department Card */}
                <div className="divide-y divide-zinc-200">
                  {group.batchGroups.map((bg, bgIdx) => (
                    <div key={`${bg.batch}_${bg.semester}_${bgIdx}`} className="p-4 sm:p-5">
                      {/* Sub-Header Banner for Batch & Semester */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-zinc-100">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            {formatBatchDisplay(bg.batch)}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-zinc-100 text-zinc-700">
                            Semester {bg.semester}
                          </span>
                          {bg.academicYear && (
                            <span className="text-xs text-zinc-500 font-medium hidden sm:inline">
                              ({bg.academicYear})
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-zinc-500">
                          {bg.items.length} {bg.items.length === 1 ? 'subject' : 'subjects'}
                        </span>
                      </div>

                      {/* Batch Table */}
                      <div className="overflow-x-auto rounded-lg border border-zinc-200 shadow-sm">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-zinc-50/80 text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
                              <th className="px-4 py-2.5">Course Code</th>
                              <th className="px-4 py-2.5">Course Name</th>
                              <th className="px-4 py-2.5">Exam</th>
                              <th className="px-4 py-2.5">Exam Date</th>
                              <th className="px-4 py-2.5">QP Setter</th>
                              <th className="px-4 py-2.5">Submission Window</th>
                              <th className="px-4 py-2.5 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 bg-white">
                            {bg.items.map((r, idx) => {
                              const approved = r.approved;
                              return (
                                <tr key={`${r.docId}_${r.code}_${idx}`} className="hover:bg-blue-50/40 transition-colors">
                                  <td className="px-4 py-2.5">
                                    <span className="text-sm font-bold text-blue-700">{r.code}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-sm text-zinc-800 max-w-[240px] font-medium">{r.name}</td>
                                  <td className="px-4 py-2.5 text-sm text-zinc-600">{r.examName || "-"}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="space-y-0.5">
                                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-800">
                                        <Clock size={13} className="text-emerald-600 shrink-0" />
                                        {formatDate(r.examDate)}
                                      </span>
                                      {r.slot ? (
                                        <div className="flex items-center gap-1">
                                          <span className={`inline-flex items-center text-[9px] font-black px-1.5 py-0.5 rounded uppercase border ${
                                            r.slot === "FN" ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-amber-100 text-amber-800 border-amber-200"
                                          }`}>
                                            {r.slot}
                                          </span>
                                          {r.startTime && (
                                            <span className="text-[10px] font-bold text-zinc-600">
                                              {format12Hour(r.startTime)}{r.endTime ? ` - ${format12Hour(r.endTime)}` : ''}
                                            </span>
                                          )}
                                        </div>
                                      ) : r.startTime ? (
                                        <div className="text-[10px] font-bold text-zinc-600">
                                          {format12Hour(r.startTime)}{r.endTime ? ` - ${format12Hour(r.endTime)}` : ''}
                                        </div>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-sm text-zinc-700">{r.setterName}</td>
                                  <td className="px-4 py-2.5 text-sm text-zinc-600">
                                    {r.fromDate ? `${formatDate(r.fromDate)} → ${formatDate(r.toDate)}` : "-"}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    {approved ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2.5 py-1">
                                        <CheckCircle2 size={12} /> Approved
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 rounded-full px-2.5 py-1">
                                        <Clock size={12} /> Pending
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
