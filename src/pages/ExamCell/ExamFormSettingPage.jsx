import { useState, useEffect } from "react";
import { onSnapshot, doc, setDoc, updateDoc, collection, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../../firebase";
import Layout from "../../components/Layout";
import AnnaUniversityPhotocopyModal from "../../components/AnnaUniversityPhotocopyModal";
import {
  Copy, RefreshCw, FileSearch, GraduationCap,
  Save, Loader2, CheckCircle2, AlertCircle,
  CalendarDays, IndianRupee, Power, FileText,
  Eye, UserCheck, Clock, CheckCircle, XCircle, ShieldCheck
} from "lucide-react";

const FORM_TABS = [
  {
    id: "photocopy",
    label: "Photocopy",
    icon: Copy,
    desc: "Answer script photocopy applications (student end page hide / view control)",
    defaultFee: 300,
  },
  {
    id: "revaluation",
    label: "Revaluation",
    icon: RefreshCw,
    desc: "Answer script revaluation applications with marks re-check",
    defaultFee: 400,
  },
  {
    id: "review",
    label: "Review",
    icon: FileSearch,
    desc: "Answer script review / challenge applications",
    defaultFee: 400,
  },
  {
    id: "ese_registration",
    label: "ESE Registration",
    icon: GraduationCap,
    desc: "End Semester Examination registration window for students",
    defaultFee: 0,
  },
];

const emptyForm = (tab) => ({
  isOpen: true,
  fromDate: "",
  toDate: "",
  feePerSubject: tab.defaultFee,
  instructions: "",
});

export default function ExamFormSettingPage() {
  const [activeTab, setActiveTab] = useState("photocopy");
  const [forms, setForms] = useState(() => {
    const init = {};
    FORM_TABS.forEach(t => { init[t.id] = emptyForm(t); });
    return init;
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Submitted Photocopy Applications state
  const [photocopyApps, setPhotocopyApps] = useState([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [selectedApp, setSelectedApp] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  // Realtime sync of all four form windows
  useEffect(() => {
    const unsubs = FORM_TABS.map((tab) =>
      onSnapshot(doc(db, "exam_cell_settings", tab.id), (snap) => {
        if (snap.exists()) {
          const d = snap.data() || {};
          setForms((prev) => ({
            ...prev,
            [tab.id]: {
              isOpen: d.isOpen !== false,
              fromDate: d.fromDate || "",
              toDate: d.toDate || "",
              feePerSubject: d.feePerSubject ?? tab.defaultFee,
              instructions: d.instructions || "",
            },
          }));
        }
        setLoading(false);
      })
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  // Realtime sync of submitted photocopy applications
  useEffect(() => {
    const q = query(collection(db, "photocopy_applications"), orderBy("appliedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPhotocopyApps(list);
      setLoadingApps(false);
    }, (err) => {
      console.error("Error fetching photocopy applications:", err);
      setLoadingApps(false);
    });
    return () => unsub();
  }, []);

  const setField = (field, value) => {
    setForms((prev) => ({ ...prev, [activeTab]: { ...prev[activeTab], [field]: value } }));
  };

  const handleSave = async () => {
    const tab = FORM_TABS.find((t) => t.id === activeTab);
    const form = forms[activeTab];
    if (form.fromDate && form.toDate && form.toDate < form.fromDate) {
      showToast("To Date cannot be earlier than From Date.", "error");
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, "exam_cell_settings", activeTab), {
        ...form,
        feePerSubject: Number(form.feePerSubject) || 0,
        updatedBy: auth.currentUser?.email || "",
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast(`${tab.label} window saved successfully!`, "success");
    } catch (err) {
      console.error("Save exam form setting error:", err);
      showToast("Failed to save. " + err.message, "error");
    }
    setSaving(false);
  };

  const handleUpdatePhotocopyStatus = async (appId, newStatus) => {
    setUpdatingStatusId(appId);
    try {
      await updateDoc(doc(db, "photocopy_applications", appId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || "Exam Cell",
      });
      showToast(`Application status updated to "${newStatus}"`, "success");
    } catch (err) {
      console.error("Error updating photocopy application status:", err);
      showToast("Failed to update status: " + err.message, "error");
    }
    setUpdatingStatusId(null);
  };

  const windowStatus = (form) => {
    if (!form.isOpen) return { label: "Closed", cls: "bg-rose-100 text-rose-700 border-rose-200" };
    const today = new Date().toISOString().slice(0, 10);
    if (form.fromDate && today < form.fromDate)
      return { label: `Opens ${form.fromDate}`, cls: "bg-amber-100 text-amber-800 border-amber-200" };
    if (form.toDate && today > form.toDate)
      return { label: "Window Expired", cls: "bg-zinc-100 text-zinc-500 border-zinc-200" };
    if (form.fromDate || form.toDate)
      return { label: "Open (Scheduled)", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    return { label: "Open", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  };

  const activeForm = forms[activeTab];
  const activeTabMeta = FORM_TABS.find((t) => t.id === activeTab);

  return (
    <Layout title="Exam Form Setting">
      {toast.show && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold shadow-xl ${toast.type === "error" ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"}`}>
          {toast.type === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="p-4 md:p-8 w-full space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl rounded-3xl">
          <h1 className="text-xl md:text-2xl font-black flex items-center gap-2">
            <CalendarDays size={22} className="text-amber-300" /> Exam Form Setting
          </h1>
          <p className="text-blue-200 text-xs md:text-sm mt-1 font-medium">
            Control student-end exam form windows — Photocopy, Revaluation, Review & ESE Registration — with date ranges, fees and instructions.
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-2 flex flex-wrap gap-2">
          {FORM_TABS.map((tab) => {
            const Icon = tab.icon;
            const st = windowStatus(forms[tab.id]);
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${isActive ? "bg-[#120c7a] text-white shadow-md" : "text-zinc-600 hover:bg-slate-100"}`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${isActive ? "bg-white/15 text-white border-white/20" : st.cls}`}>
                  {forms[tab.id].isOpen ? (st.label.startsWith("Open") || st.label.startsWith("Opens") ? "●" : "○") : "○"} {st.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Form card */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-12 text-center">
            <Loader2 size={32} className="mx-auto text-[#120c7a] animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="bg-slate-50/70 border-b border-zinc-200 px-6 py-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  {activeTabMeta && <activeTabMeta.icon size={16} className="text-[#120c7a]" />}
                  {activeTabMeta?.label} Window
                </h3>
                <p className="text-[11px] text-zinc-500 font-medium mt-0.5">{activeTabMeta?.desc}</p>
              </div>
              {/* Open / Close toggle */}
              <button
                onClick={() => setField("isOpen", !activeForm.isOpen)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${activeForm.isOpen ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-zinc-100 border-zinc-200 text-zinc-500"}`}
              >
                <Power size={14} />
                {activeForm.isOpen ? "OPEN" : "CLOSED"}
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Date window */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">From Date</label>
                  <input
                    type="date"
                    value={activeForm.fromDate}
                    onChange={(e) => setField("fromDate", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">To Date</label>
                  <input
                    type="date"
                    value={activeForm.toDate}
                    min={activeForm.fromDate || undefined}
                    onChange={(e) => setField("toDate", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 font-medium -mt-3">
                Student end la indha form {activeForm.fromDate || activeForm.toDate
                  ? <><b>{activeForm.fromDate || '...'}</b> muthal <b>{activeForm.toDate || '...'}</b> varai mattum theriyum</>
                  : 'eppovum theriyum (date fix pannala-na)'}.
                Date veliya student ku page hide aayidum.
              </p>

              {/* Fee */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">
                    <span className="inline-flex items-center gap-1"><IndianRupee size={12} /> Fee per Subject (₹)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={activeForm.feePerSubject}
                    onChange={(e) => setField("feePerSubject", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Instructions */}
              <div>
                <label className="text-[11px] font-extrabold uppercase text-zinc-500 block mb-1">
                  <span className="inline-flex items-center gap-1"><FileText size={12} /> Student Instructions</span>
                </label>
                <textarea
                  rows={3}
                  value={activeForm.instructions}
                  onChange={(e) => setField("instructions", e.target.value)}
                  placeholder="e.g. Apply before the last date. Pay the fee at the Exam Cell counter..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-[#120c7a] hover:opacity-90 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  {saving ? "Saving..." : `Save ${activeTabMeta?.label} Setting`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Submitted Applications Section (Photocopy Tab) ═══ */}
        {activeTab === "photocopy" && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-lg overflow-hidden space-y-0">
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-white">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Copy size={18} className="text-amber-300" /> Submitted Photocopy Applications
                </h3>
                <p className="text-xs text-blue-200 font-medium">
                  Review student photocopy forms with attached payment bills and HOD recommendations.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-white/15 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
                  Total Applications: {photocopyApps.length}
                </span>
              </div>
            </div>

            <div className="p-6">
              {loadingApps ? (
                <div className="py-12 text-center text-zinc-400">
                  <Loader2 size={24} className="mx-auto animate-spin mb-2 text-[#120c7a]" />
                  <p className="text-xs font-medium">Loading submitted applications...</p>
                </div>
              ) : photocopyApps.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 bg-slate-50 rounded-xl border border-dashed border-zinc-200">
                  <FileText size={32} className="mx-auto mb-2 opacity-40 text-zinc-400" />
                  <p className="text-sm font-bold text-zinc-600">No Submitted Applications Yet</p>
                  <p className="text-xs text-zinc-400 mt-0.5">When students submit photocopy requests and HOD recommends them, they will appear here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-zinc-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-zinc-600 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200">
                      <tr>
                        <th className="p-3">Candidate / Reg No</th>
                        <th className="p-3">Department</th>
                        <th className="p-3">Subjects</th>
                        <th className="p-3">Payment Bill</th>
                        <th className="p-3">HOD Recommendation</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 text-zinc-700 font-medium">
                      {photocopyApps.map((app) => {
                        const isHodRecommended = app.status === "Recommended by HOD" || !!app.hodSignature;
                        return (
                          <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3">
                              <div className="font-bold text-zinc-900">{app.studentName || 'Student'}</div>
                              <div className="text-[11px] font-mono text-indigo-700 font-semibold">{app.regNo || '—'}</div>
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-zinc-800">{app.department || app.dept || '—'}</div>
                              <div className="text-[10px] text-zinc-400">{app.batch ? `Batch ${app.batch}` : ''}</div>
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-zinc-900">{app.subjectCount || app.subjects?.length || 1} Subject(s)</div>
                              <div className="text-[10px] text-zinc-500 line-clamp-1">
                                {app.subjects?.map(s => s.code).join(", ")}
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle size={11} /> PAID (₹{app.feeAmount || 400})
                              </span>
                              {app.transactionId && (
                                <div className="text-[9px] font-mono text-zinc-400 mt-0.5">{app.transactionId}</div>
                              )}
                            </td>
                            <td className="p-3">
                              {isHodRecommended ? (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                                    <UserCheck size={11} /> Recommended
                                  </span>
                                  {app.hodSignature && (
                                    <div className="text-[9px] text-emerald-700 font-semibold italic flex items-center gap-1">
                                      <span>Signature attached</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                                  <Clock size={11} /> Pending HOD
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                                app.status === "Copy Issued"
                                  ? "bg-purple-100 text-purple-800 border-purple-200"
                                  : app.status === "Closed"
                                  ? "bg-zinc-200 text-zinc-700 border-zinc-300"
                                  : app.status === "Recommended by HOD"
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                  : "bg-blue-100 text-blue-800 border-blue-200"
                              }`}>
                                {app.status || "Applied"}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setSelectedApp(app);
                                    setShowModal(true);
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all flex items-center gap-1 border border-indigo-200"
                                >
                                  <Eye size={13} /> View Form
                                </button>

                                {app.status !== "Copy Issued" && (
                                  <button
                                    onClick={() => handleUpdatePhotocopyStatus(app.id, "Copy Issued")}
                                    disabled={updatingStatusId === app.id}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1 shadow-sm disabled:opacity-50"
                                  >
                                    {updatingStatusId === app.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                    Issue Copy
                                  </button>
                                )}

                                {app.status !== "Closed" && (
                                  <button
                                    onClick={() => handleUpdatePhotocopyStatus(app.id, "Closed")}
                                    disabled={updatingStatusId === app.id}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1 border border-zinc-300 disabled:opacity-50"
                                  >
                                    <XCircle size={13} /> Close
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dedicated Exam Cell HDFC Gateway Credentials Card */}
        <ExamCellGatewayCard showToast={showToast} />
      </div>

      {/* Official Anna University Form View Modal for Exam Cell */}
      {showModal && selectedApp && (
        <AnnaUniversityPhotocopyModal
          app={selectedApp}
          onClose={() => {
            setShowModal(false);
            setSelectedApp(null);
          }}
          isExamCell={true}
        />
      )}
    </Layout>
  );
}

function ExamCellGatewayCard() {
  return (
    <div className="bg-white rounded-2xl border border-indigo-100 shadow-lg p-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <IndianRupee size={17} className="text-emerald-600" /> Exam Cell HDFC Payment Gateway
          </h3>
          <p className="text-[11px] font-medium text-slate-500 mt-0.5">
            Dedicated HDFC Merchant Gateway hardcoded in Cloud Environment for Exam Cell payments (Photocopy, Revaluation, Review & ESE Registration). Isolated from tuition fee account.
          </p>
        </div>
        <span className="px-3.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
          <ShieldCheck size={13} /> Cloud Env Active (Merchant ID: 76983)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs font-mono font-bold text-slate-700">
        <div>
          <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Merchant ID</span>
          <span className="text-slate-900">76983</span>
        </div>
        <div>
          <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Gateway Endpoint</span>
          <span className="text-emerald-700">https://smartgateway.hdfc.bank.in</span>
        </div>
        <div>
          <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Environment</span>
          <span className="text-indigo-700 font-sans">Production (Live Gateway)</span>
        </div>
      </div>
    </div>
  );
}
