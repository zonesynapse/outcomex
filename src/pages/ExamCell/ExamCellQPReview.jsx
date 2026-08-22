import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import {
  FileText, Eye, X, CheckCircle2, Edit2, Loader2, Search, Landmark,
  Clock, CalendarCheck2, ShieldCheck, Sparkles, ArrowLeft, BookOpen
} from "lucide-react";
import Layout from "../../components/Layout";
import { auth, db } from "../../firebase";
import { getQuestionPaperHTML } from "../../utils/questionPaperUtils";
import { useRegulations } from "../../hooks/useRegulations";
import { sanitizeKey, formatProgrammeKey, parseSubjectField, formatQPSetDisplay } from "../../lib/utils";
import { typesetMath } from "../../utils/mathJaxUtils";

const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const flattenQps = (data) => {
  const all = [];
  Object.entries(data || {}).forEach(([compositeKey, docData]) => {
    const isFlat = !!(docData && typeof docData === 'object' && (docData.subject || docData.subject_code || docData.parts || docData.assignment_config || docData.qpaper_name));
    if (isFlat) {
      all.push({ ...docData, id: compositeKey, compositeKey });
    } else {
      Object.entries(docData || {}).forEach(([id, qp]) => {
        all.push({ ...(qp || {}), id, compositeKey });
      });
    }
  });
  return all;
};

export default function ExamCellQPReview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getRegulationForBatch } = useRegulations();

  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid || null);
  const [coeName, setCoeName] = useState("");
  const [coeSignature, setCoeSignature] = useState("");
  const [usersMap, setUsersMap] = useState({});
  const [ciaConfigs, setCiaConfigs] = useState({});
  const [rawQps, setRawQps] = useState({});
  const [allQps, setAllQps] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "pending");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedQP, setSelectedQP] = useState(null);
  const [showQPModal, setShowQPModal] = useState(false);
  const [fullQPForModal, setFullQPForModal] = useState(null);
  const [modalCourseOutcomes, setModalCourseOutcomes] = useState([]);
  const [facultySignatureForQP, setFacultySignatureForQP] = useState("");
  const [selectedQPHodSignature, setSelectedQPHodSignature] = useState("");

  const [showRecorrectModal, setShowRecorrectModal] = useState(false);
  const [recorrectComments, setRecorrectComments] = useState("");

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUid(user?.uid || null);
      if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const ud = snap.data();
          setCoeSignature(ud.signatureUrl || "");
          setCoeName(ud.facultyName || ud.displayName || ud.email || "COE");
        }
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setUsersMap(data);
    }, () => setUsersMap({}));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "cia_configs"), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setCiaConfigs(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "generated_qps"), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setAllQps(flattenQps(data));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const pendingQps = useMemo(() =>
    allQps.filter(q => q?.status === "approved_by_hod")
      .sort((a, b) => new Date(b.forwarded_at || b.updated_at || b.saved_at || 0) - new Date(a.forwarded_at || a.updated_at || a.saved_at || 0)),
    [allQps]);

  const publishedQps = useMemo(() =>
    allQps.filter(q => q?.status === "approved_by_coe")
      .sort((a, b) => new Date(b.coe_approved_at || b.updated_at || 0) - new Date(a.coe_approved_at || a.updated_at || 0)),
    [allQps]);

  const resolveName = (uid) => {
    const u = usersMap?.[uid];
    return u?.facultyName || u?.displayName || u?.email || (uid ? uid.slice(0, 6) : "-");
  };

  const resolveExamDisplay = (qp) => {
    if (!qp) return "-";
    const examName = (qp.exam_name || "").toString().trim();
    const qpaperName = (qp.qpaper_name || "").toString().trim();
    const setLabel = formatQPSetDisplay(qp);
    let display = examName;
    if (!display) {
      if (qpaperName && ciaConfigs && ciaConfigs[qpaperName] && ciaConfigs[qpaperName].examName) {
        display = ciaConfigs[qpaperName].examName;
      } else {
        display = qpaperName;
      }
    }
    return `${display} (${setLabel})`;
  };

  const filteredPending = useMemo(() => {
    let result = pendingQps;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(p =>
        (p.subject || "").toLowerCase().includes(q) ||
        (p.subject_name || "").toLowerCase().includes(q) ||
        (resolveName(p.forwarded_by) || "").toLowerCase().includes(q) ||
        (resolveExamDisplay(p) || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [pendingQps, searchQuery]);

  const filteredPublished = useMemo(() => {
    let result = publishedQps;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(p =>
        (p.subject || "").toLowerCase().includes(q) ||
        (p.subject_name || "").toLowerCase().includes(q) ||
        (resolveName(p.forwarded_by) || "").toLowerCase().includes(q) ||
        (resolveExamDisplay(p) || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [publishedQps, searchQuery]);

  const renderQuestionPaper = useCallback((qp) => {
    if (!qp) return "";
    return getQuestionPaperHTML(qp, modalCourseOutcomes, facultySignatureForQP, selectedQP?.hod_signature_url || "", ciaConfigs, null, coeSignature);
  }, [modalCourseOutcomes, facultySignatureForQP, selectedQP, ciaConfigs, coeSignature]);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!selectedQP) {
        setModalCourseOutcomes([]);
        setFacultySignatureForQP('');
        setFullQPForModal(null);
        return;
      }
      setFullQPForModal({ ...selectedQP });

      const progKey = formatProgrammeKey(selectedQP.programme);
      const regulation = getRegulationForBatch(progKey, selectedQP.batch);
      if (regulation) {
        const coDocId = `${sanitizeKey(selectedQP.department)}_${sanitizeKey(regulation)}_${sanitizeKey(selectedQP.subject)}_${sanitizeKey(selectedQP.academic_year)}`;
        try {
          const coSnap = await getDoc(doc(db, 'course_outcomes', coDocId));
          if (coSnap.exists()) {
            const data = coSnap.data();
            const loadedCOs = Object.entries(data)
              .map(([code, val]) => ({ code, description: typeof val === 'object' && val !== null ? val.description : val }))
              .sort((a, b) => (parseInt(a.code.replace(/\D/g, ''), 10) || 0) - (parseInt(b.code.replace(/\D/g, ''), 10) || 0));
            setModalCourseOutcomes(loadedCOs);
          }
        } catch (e) { /* ignore */ }
      }
      if (selectedQP.forwarded_by) {
        try {
          const snap = await getDoc(doc(db, 'users', selectedQP.forwarded_by));
          if (snap.exists()) setFacultySignatureForQP(snap.data().signatureUrl || '');
        } catch (e) { /* ignore */ }
      }
    };
    fetchDetails();
  }, [selectedQP, getRegulationForBatch]);

  // Typeset MathJax whenever the QP review modal opens
  useEffect(() => {
    if (!showQPModal || !(fullQPForModal || selectedQP)) return;
    const container = document.querySelector('.qp-print-wrapper');
    typesetMath(container);
  }, [showQPModal, fullQPForModal, selectedQP]);

  const handleApproveByCOE = async () => {
    if (!selectedQP) return;
    if (!coeSignature) {
      showToast("Please upload your digital signature in your profile before approving.", "error");
      return;
    }
    try {
      const qpRef = doc(db, 'generated_qps', selectedQP.compositeKey);
      const now = new Date().toISOString();
      await setDoc(qpRef, {
        [selectedQP.id]: {
          status: 'approved_by_coe',
          coe_signature_url: coeSignature,
          coe_approved_by: coeName,
          coe_approved_at: now,
          coe_comments: null,
          forwarded_to: null,
          updated_at: now
        }
      }, { merge: true });
      showToast("Question paper approved and published by the Exam Cell.", "success");
      setShowQPModal(false);
      setSelectedQP(null);
    } catch (error) {
      console.error("Error approving paper:", error);
      showToast("Failed to approve question paper.", "error");
    }
  };

  const handleRecorrect = async () => {
    if (!selectedQP || !recorrectComments.trim()) {
      showToast("Please provide comments for recorrection.", "error");
      return;
    }
    try {
      const qpRef = doc(db, 'generated_qps', selectedQP.compositeKey);
      const now = new Date().toISOString();
      await setDoc(qpRef, {
        [selectedQP.id]: {
          status: 'recorrected',
          forwarded_to: selectedQP.forwarded_by,
          forwarded_by: null,
          coe_comments: recorrectComments.trim(),
          coe_signature_url: null,
          updated_at: now
        }
      }, { merge: true });
      showToast("Question paper sent back for recorrection.", "success");
      setShowRecorrectModal(false);
      setShowQPModal(false);
      setRecorrectComments('');
      setSelectedQP(null);
    } catch (error) {
      console.error("Error recorrecting paper:", error);
      showToast("Failed to send paper back for recorrection.", "error");
    }
  };

  const renderQpCard = (qp, published) => {
    const name = resolveName(published ? qp.coe_approved_by || qp.forwarded_by : qp.forwarded_by);
    const initial = (name || "?").charAt(0).toUpperCase();
    const colorIdx = Math.abs((qp.subject || "").length) % 6;
    const dotColors = ["bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500", "bg-indigo-500"];
    const dotColor = dotColors[colorIdx];
    const examDisplay = resolveExamDisplay(qp);

    const parsedSubj = parseSubjectField(qp.subject);
    const subjCode = parsedSubj.code || qp.subject;
    const subjName = parsedSubj.name || qp.subject_name;

    return (
      <div key={`${qp.compositeKey}-${qp.id}`}
        className="group bg-white/60 rounded-2xl border border-zinc-150 p-4 hover:shadow-md hover:bg-white transition-all duration-200">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className={`w-8 h-8 rounded-full ${dotColor} text-white flex items-center justify-center text-xs font-black shrink-0`}>
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-zinc-800 truncate">{name}</span>
                <span className="text-[10px] text-zinc-300">•</span>
                <span className="text-[10px] text-zinc-400">{timeAgo(qp.updated_at || qp.approved_at || qp.forwarded_at)}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-xs font-black text-zinc-800 truncate">{subjCode}</span>
                {subjName && (
                  <>
                    <span className="text-[10px] text-zinc-300">•</span>
                    <span className="text-[10px] text-zinc-600 truncate max-w-[200px] font-semibold">{subjName}</span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-50/50 text-blue-700 px-1.5 py-0.5 text-[9px] font-extrabold border border-blue-100/40">
                  {examDisplay}
                </span>
                <span className="inline-flex items-center rounded-md bg-zinc-100/60 text-zinc-600 px-1.5 py-0.5 text-[9px] font-extrabold border border-zinc-200/50">{qp.batch || "-"}</span>
                <span className="inline-flex items-center rounded-md bg-zinc-100/60 text-zinc-600 px-1.5 py-0.5 text-[9px] font-extrabold border border-zinc-200/50">Sem {qp.semester || "-"}</span>
                {published && (
                  <span className="inline-flex items-center rounded-md bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[9px] font-extrabold border border-emerald-100/40">
                    <ShieldCheck size={9} className="mr-0.5" /> COE APPROVED
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => { setSelectedQP(qp); setShowQPModal(true); }}
            className={`shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl text-white text-[11px] font-extrabold transition-all shadow-sm cursor-pointer ${published ? "bg-zinc-500 hover:bg-zinc-600" : "bg-[#120c7a] hover:bg-[#0f0a66]"}`}>
            <Eye size={12} /> {published ? "View" : "Review"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <Layout title="Exam Cell — QP Final Review">
      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-5 right-5 z-[300] px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-bold animate-in slide-in-from-right ${toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"}`}>
          {toast.message}
        </div>
      )}

      <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB] p-4 md:p-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl mb-6">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate("/exam-cell")}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all cursor-pointer">
                <ArrowLeft size={18} />
              </button>
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
                <Landmark size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black leading-tight">Question Paper Final Review</h1>
                <p className="text-sm text-blue-100/90 font-medium">Exam Cell — finalise HOD-approved papers or send back for corrections</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-black/20 border border-white/10 rounded-2xl px-4 py-2">
              <ShieldCheck size={16} className="text-amber-300" />
              <div>
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Signed in as</p>
                <p className="text-sm font-extrabold">{coeName}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs + Search */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-4 mb-6 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex bg-zinc-100 rounded-xl p-1 w-fit">
            <button
              onClick={() => setActiveTab("review")}
              className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${activeTab === "review" ? "bg-[#120c7a] text-white shadow" : "text-zinc-500 hover:text-zinc-800"}`}>
              Review Queue ({pendingQps.length})
            </button>
            <button
              onClick={() => setActiveTab("published")}
              className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${activeTab === "published" ? "bg-[#120c7a] text-white shadow" : "text-zinc-500 hover:text-zinc-800"}`}>
              Published ({publishedQps.length})
            </button>
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subject, faculty or exam..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold bg-zinc-50 outline-none focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10 transition-all"
            />
          </div>
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer">
              Clear search
            </button>
          )}
        </div>

        <div className="mb-4 flex items-center gap-2 px-1">
          <Sparkles size={14} className="text-amber-500" />
          <p className="text-xs font-bold text-zinc-600">
            {activeTab === "review"
              ? `${filteredPending.length} paper${filteredPending.length !== 1 ? "s" : ""} waiting for COE final review. Approve to publish, or send back to faculty for recorrection.`
              : `${filteredPublished.length} paper${filteredPublished.length !== 1 ? "s" : ""} published by the Exam Cell.`}
          </p>
        </div>

        {/* List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-zinc-100/50 rounded-2xl animate-pulse border border-zinc-200/50" />)}
          </div>
        ) : activeTab === "review" ? (
          filteredPending.length === 0 ? (
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={28} />
              </div>
              <h3 className="text-sm font-black text-zinc-800">
                {searchQuery ? "No matching papers" : "All caught up!"}
              </h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                {searchQuery
                  ? "Try adjusting your search query."
                  : "No question papers are waiting for your final review. Papers approved by HODs will appear here."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredPending.map(qp => renderQpCard(qp, false))}
            </div>
          )
        ) : (
          filteredPublished.length === 0 ? (
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-4">
                <BookOpen size={28} />
              </div>
              <h3 className="text-sm font-black text-zinc-800">No published papers yet</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                Papers you approve in the review queue will be listed here as published.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredPublished.map(qp => renderQpCard(qp, true))}
            </div>
          )
        )}
      </div>

      {/* QP Review Modal */}
      {showQPModal && selectedQP && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="bg-gradient-to-r from-[#120c7a] to-indigo-900 px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/15 p-2.5 rounded-xl text-white">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white leading-tight">{resolveExamDisplay(selectedQP)}</h3>
                  <p className="text-xs text-blue-200">
                    {(() => {
                      const p = parseSubjectField(selectedQP.subject);
                      const code = p.code || selectedQP.subject;
                      const name = p.name || selectedQP.subject_name;
                      return name ? `${code} · ${name}` : code;
                    })()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedQP.status === "approved_by_hod" && (
                  <>
                    <button onClick={handleApproveByCOE}
                      className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95 cursor-pointer">
                      <CheckCircle2 size={16} /> Approve &amp; Publish
                    </button>
                    <button onClick={() => setShowRecorrectModal(true)}
                      className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95 cursor-pointer">
                      <Edit2 size={16} /> Send Back
                    </button>
                  </>
                )}
                {selectedQP.status === "approved_by_coe" && (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-300/40 text-emerald-100 px-3 py-1.5 rounded-xl text-xs font-extrabold">
                    <ShieldCheck size={14} /> PUBLISHED BY COE
                  </span>
                )}
                <button onClick={() => { setShowQPModal(false); setSelectedQP(null); }}
                  className="p-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-50">
              <style>{`
                .qp-print-wrapper table { border-collapse: collapse; width: 100%; border-color: #000 !important; }
                .qp-print-wrapper td, .qp-print-wrapper th { border: 1px solid #000 !important; padding: 6px; font-family: 'Times New Roman', serif; }
                .qp-print-wrapper .logo-img { max-width: 100%; width: 754px !important; height: 60px !important; object-fit: contain; }
                .qp-print-wrapper p { margin: 0 0 5px 0; }
              `}</style>
              <div className="bg-white shadow-xl mx-auto qp-print-wrapper rounded-xl"
                style={{ width: '210mm', minHeight: '297mm', padding: '15mm', boxSizing: 'border-box' }}>
                <div dangerouslySetInnerHTML={{ __html: renderQuestionPaper(fullQPForModal || selectedQP) }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recorrect Modal */}
      {showRecorrectModal && (
        <div className="fixed inset-0 bg-black/60 z-[210] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600">
                  <Edit2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">Send for Recorrection</h3>
                  <p className="text-xs text-zinc-500">Provide feedback to the faculty</p>
                </div>
              </div>
              <button onClick={() => setShowRecorrectModal(false)}
                className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <textarea value={recorrectComments} onChange={(e) => setRecorrectComments(e.target.value)}
                className="w-full h-36 p-4 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all resize-none text-sm"
                placeholder="Enter your suggestions/corrections for the faculty..." />
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowRecorrectModal(false); setRecorrectComments(""); }}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-all cursor-pointer">
                  Cancel
                </button>
                <button onClick={handleRecorrect} disabled={!recorrectComments.trim()}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 cursor-pointer">
                  Send for Recorrection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}