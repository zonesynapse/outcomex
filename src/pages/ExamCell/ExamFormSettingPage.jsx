import { useState, useEffect } from "react";
import { onSnapshot, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../../firebase";
import Layout from "../../components/Layout";
import {
  Copy, RefreshCw, FileSearch, GraduationCap,
  Save, Loader2, CheckCircle2, AlertCircle,
  CalendarDays, IndianRupee, Power, FileText
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
      </div>
    </Layout>
  );
}
