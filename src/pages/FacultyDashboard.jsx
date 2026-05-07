import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { onValue, ref } from "firebase/database";
import { BookOpen, Clock, Eye, Loader2, AlertCircle, Edit2 } from "lucide-react";

import Layout from "../components/Layout";
import { auth, rtdb } from "../firebase";
import { formatProgDisplay } from "../lib/utils";

export default function FacultyDashboard() {
  const navigate = useNavigate();
  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid || null);

  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignedGroups, setAssignedGroups] = useState([]);

  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingQps, setPendingQps] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUid) {
      setAssignedGroups([]);
      setAssignmentsLoading(false);
      return;
    }

    setAssignmentsLoading(true);
    const assignmentsRef = ref(rtdb, "subject_assignments");
    const unsub = onValue(
      assignmentsRef,
      (snapshot) => {
        const data = snapshot.val() || {};
        const groups = {};

        Object.entries(data).forEach(([progKey, depts]) => {
          Object.entries(depts || {}).forEach(([deptKey, batches]) => {
            Object.entries(batches || {}).forEach(([batchKey, ays]) => {
              Object.entries(ays || {}).forEach(([ayKey, sems]) => {
                Object.entries(sems || {}).forEach(([semKey, facultyAssignments]) => {
                  const codes = facultyAssignments?.[currentUid];
                  if (!Array.isArray(codes) || codes.length === 0) return;

                  const groupKey = `${progKey}|||${deptKey}|||${batchKey}|||${ayKey}|||${semKey}`;
                  if (!groups[groupKey]) {
                    groups[groupKey] = {
                      progKey,
                      department: deptKey,
                      batch: batchKey,
                      academicYear: ayKey,
                      semester: semKey,
                      codes: []
                    };
                  }

                  codes.forEach((code) => {
                    if (!groups[groupKey].codes.includes(code)) groups[groupKey].codes.push(code);
                  });
                });
              });
            });
          });
        });

        const grouped = Object.values(groups)
          .map((g) => ({
            ...g,
            codes: (g.codes || []).slice().sort((a, b) => String(a).localeCompare(String(b)))
          }))
          .sort((a, b) => {
            const ap = String(a.progKey || "");
            const bp = String(b.progKey || "");
            if (ap !== bp) return ap.localeCompare(bp);
            const ad = String(a.department || "");
            const bd = String(b.department || "");
            if (ad !== bd) return ad.localeCompare(bd);
            const aa = String(a.academicYear || "");
            const ba = String(b.academicYear || "");
            if (aa !== ba) return aa.localeCompare(ba);
            const as = parseInt(a.semester, 10) || 0;
            const bs = parseInt(b.semester, 10) || 0;
            return as - bs;
          });

        setAssignedGroups(grouped);
        setAssignmentsLoading(false);
      },
      () => {
        setAssignedGroups([]);
        setAssignmentsLoading(false);
      }
    );

    return () => unsub();
  }, [currentUid]);

  useEffect(() => {
    if (!currentUid) {
      setPendingQps([]);
      setPendingLoading(false);
      return;
    }

    setPendingLoading(true);
    const qpRef = ref(rtdb, "generated_qps");
    const unsub = onValue(
      qpRef,
      (snapshot) => {
        const data = snapshot.val() || {};
        const all = [];
        Object.entries(data).forEach(([compositeKey, versions]) => {
          Object.entries(versions || {}).forEach(([id, qp]) => {
            all.push({ ...(qp || {}), id, compositeKey });
          });
        });

        const norm = (v) => String(v || "").trim().toLowerCase();
        const semNum = (v) => {
          const m = String(v || "").match(/(\d+)/);
          return m ? m[1] : "";
        };

        const isInAssignedContext = (qp) => {
          return (assignedGroups || []).some((g) => {
            const sameProgramme =
              norm(g.progKey) === norm(qp.programme) ||
              norm(formatProgDisplay(g.progKey)) === norm(formatProgDisplay(qp.programme));
            const sameDepartment = norm(g.department) === norm(qp.department);
            const sameBatch = norm(g.batch) === norm(qp.batch);
            const sameAcademicYear = norm(g.academicYear) === norm(qp.academic_year);
            const sameSemester = semNum(g.semester) === semNum(qp.semester);
            const sameSubject = (g.codes || []).map(norm).includes(norm(qp.subject));

            return sameProgramme && sameDepartment && sameBatch && sameAcademicYear && sameSemester && sameSubject;
          });
        };

        const pending = all
          .filter((qp) => {
            const status = String(qp?.status || "draft").toLowerCase();
            const isReworkFromHod = (status === "forwarded" || status === "recorrected") && qp?.forwarded_to === currentUid;
            const isForwardedByFaculty = status === "forwarded" && qp?.forwarded_by === currentUid;
            const isSavedDraftOwned = status === "draft" && qp?.created_by === currentUid;
            const isSavedDraftLegacy = status === "draft" && !qp?.created_by && isInAssignedContext(qp);
            const isSavedDraft = isSavedDraftOwned || isSavedDraftLegacy;
            return isReworkFromHod || isForwardedByFaculty || isSavedDraft;
          })
          .sort((a, b) => {
            const at = new Date(a.updated_at || a.forwarded_at || a.saved_at || 0).getTime();
            const bt = new Date(b.updated_at || b.forwarded_at || b.saved_at || 0).getTime();
            return bt - at;
          });

        setPendingQps(pending);
        setPendingLoading(false);
      },
      () => {
        setPendingQps([]);
        setPendingLoading(false);
      }
    );

    return () => unsub();
  }, [currentUid, assignedGroups]);

  const assignedCount = useMemo(() => {
    return (assignedGroups || []).reduce((sum, g) => sum + (g.codes?.length || 0), 0);
  }, [assignedGroups]);

  return (
    <Layout title="Faculty Dashboard">
      <div className="container mx-auto p-6 max-w-7xl space-y-8">
        {/* Assigned subjects */}
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold text-[#120c7a] flex items-center gap-3">
              <div className="w-2 h-8 bg-[#120c7a] rounded-full"></div>
              Assigned Subjects
            </h2>
            <div className="text-xs font-black bg-blue-100 text-[#120c7a] px-3 py-1 rounded-full uppercase tracking-widest">
              {assignedCount} Total
            </div>
          </div>

          {assignmentsLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-500 gap-3">
              <Loader2 className="animate-spin" size={18} />
              Loading assignments...
            </div>
          ) : assignedGroups.length === 0 ? (
            <div className="py-10 text-center text-slate-400 font-medium">
              No subjects assigned yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Programme</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Department</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Batch</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Academic Year</th>
                    <th className="text-center p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Semester</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Subjects</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedGroups.map((g) => (
                    <tr
                      key={`${g.progKey}-${g.department}-${g.batch}-${g.academicYear}-${g.semester}`}
                      className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-slate-800 font-semibold">
                          <BookOpen size={16} className="text-blue-600" />
                          {formatProgDisplay(g.progKey)}
                        </div>
                      </td>
                      <td className="p-4 text-slate-700 font-medium">{g.department}</td>
                      <td className="p-4 text-slate-700 font-medium">{g.batch}</td>
                      <td className="p-4 text-slate-600">{g.academicYear}</td>
                      <td className="p-4 text-center">
                        <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-bold">
                          {g.semester}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1.5">
                          {(g.codes || []).map((code) => (
                            <span
                              key={code}
                              className="inline-flex items-center px-2 py-1 bg-slate-50 text-slate-700 rounded-lg text-[10px] font-bold border border-slate-200"
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pending approvals */}
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold text-[#120c7a] flex items-center gap-3">
              <div className="w-2 h-8 bg-purple-600 rounded-full"></div>
              My Question Papers
            </h2>
            <div className="text-xs font-black bg-purple-100 text-purple-700 px-3 py-1 rounded-full uppercase tracking-widest">
              {pendingQps.length} Papers
            </div>
          </div>

          {pendingLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-500 gap-3">
              <Loader2 className="animate-spin" size={18} />
              Loading question papers...
            </div>
          ) : pendingQps.length === 0 ? (
            <div className="py-10 text-center text-slate-400 font-medium">
              No saved or forwarded papers found for your assigned subjects.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Subject</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Exam</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Batch</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Academic Year</th>
                    <th className="text-center p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Semester</th>
                    <th className="text-center p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Status</th>
                    <th className="text-center p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingQps.map((qp) => (
                    <tr
                      key={`${qp.compositeKey}-${qp.id}`}
                      className="border-b border-slate-50 hover:bg-purple-50/30 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-800">{qp.subject}</span>
                          <span className="text-xs text-slate-500 truncate max-w-[260px]">{qp.subject_name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-700 font-medium">{qp.exam_name || qp.qpaper_name}</td>
                      <td className="p-4 text-slate-700 font-medium">{qp.batch}</td>
                      <td className="p-4 text-slate-600">{qp.academic_year}</td>
                      <td className="p-4 text-center">
                        <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-bold">{qp.semester}</span>
                      </td>
                      <td className="p-4 text-center">
                        {qp.status === 'draft' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider">
                            <Clock size={12} /> Saved
                          </span>
                        )}
                        {qp.status === 'forwarded' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-wider">
                            <Clock size={12} /> Forwarded
                          </span>
                        )}
                        {qp.status === 'recorrected' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-wider">
                            <AlertCircle size={12} /> Recorrect
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => navigate(`/question-paper-generator?id=${qp.id}&compositeKey=${qp.compositeKey}`)}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#120c7a] text-white rounded-xl text-xs font-bold hover:bg-[#0e0960] transition-all"
                          title={qp.status === 'recorrected' ? 'Open for Recorrection' : 'Open in Question Paper Generator'}
                        >
                          {qp.status === 'recorrected' ? (
                            <>
                              <Edit2 size={16} />
                              Edit
                            </>
                          ) : (
                            <>
                              <Eye size={16} />
                              Open
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* HOD Comments Modal (for recorrected papers) */}
          {pendingQps.some(qp => qp.status === 'recorrected' && qp.hod_comments) && (
            <div className="mt-8 p-6 bg-amber-50 border border-amber-100 rounded-2xl">
              <h3 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2">
                <AlertCircle size={20} /> HOD Comments for Recorrection
              </h3>
              <div className="space-y-4">
                {pendingQps.filter(qp => qp.status === 'recorrected' && qp.hod_comments).map(qp => (
                  <div key={qp.id} className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-amber-700 text-sm">
                        {qp.subject} - {qp.exam_name || qp.qpaper_name}
                      </p>
                      <button
                        onClick={() => navigate(`/question-paper-generator?id=${qp.id}&compositeKey=${qp.compositeKey}`)}
                        className="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-bold rounded-lg transition-all"
                      >
                        Go to Editor
                      </button>
                    </div>
                    <p className="text-sm text-amber-900 leading-relaxed">
                      {qp.hod_comments}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
