import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import Layout from "../components/Layout";
import { isMasterOrAdmin } from "../lib/utils";
import {
  Plus, Megaphone, Building2, Globe, Clock, CheckCircle2,
  XCircle, AlertTriangle, Eye, X, Search, Filter,
  ChevronDown, ChevronUp, ArrowLeft, Loader2, RefreshCw,
  FileText, Send, User, Calendar
} from "lucide-react";

const STATUS_STYLES = {
  "Principal_Pending": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Principal Pending", icon: Clock },
  "HOD_Pending": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", label: "HOD Pending", icon: Clock },
  "Approved": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "Approved", icon: CheckCircle2 },
  "Returned": { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", label: "Returned", icon: XCircle },
};

const formatDate = (val) => {
  if (!val) return "-";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "-"; }
};

const formatDateTime = (val) => {
  if (!val) return "-";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "-"; }
};

export default function CircularList() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [circulars, setCirculars] = useState([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [viewCircular, setViewCircular] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) setUserData(snap.data());
        } catch (e) { console.error(e); }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "circulars"), (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const da = a.createdAt || "";
        const db = b.createdAt || "";
        return db.localeCompare(da);
      });
      setCirculars(list);
    });
    return () => unsub();
  }, []);

  const isAdmin = isMasterOrAdmin(userData?.role, auth.currentUser?.email);
  const isHod = userData?.role === "HOD";
  const userDepartment = userData?.department || userData?.assignedDepartment || "";

  const filtered = useMemo(() => {
    let result = circulars;

    // Role-based filter: HOD sees only their department's circulars + institution-level
    if (isHod && userDepartment) {
      result = result.filter(c =>
        c.type === "institution" ||
        (c.type === "department" && c.department === userDepartment)
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(c =>
        (c.title || "").toLowerCase().includes(q) ||
        (c.content || "").toLowerCase().includes(q) ||
        (c.createdByName || "").toLowerCase().includes(q)
      );
    }

    if (filterType !== "all") {
      result = result.filter(c => c.type === filterType);
    }

    if (filterStatus !== "all") {
      result = result.filter(c => c.status === filterStatus);
    }

    return result;
  }, [circulars, search, filterType, filterStatus, isHod, userDepartment]);

  const getStatusBadge = (status) => {
    const s = STATUS_STYLES[status] || STATUS_STYLES["Principal_Pending"];
    const Icon = s.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${s.bg} ${s.text} ${s.border}`}>
        <Icon size={12} /> {s.label}
      </span>
    );
  };

  const openView = (circ) => {
    setViewCircular(circ);
    setShowViewModal(true);
  };

  if (loading) {
    return (
      <Layout title="Circulars">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-2 border-[#120c7a] border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Circulars">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-6 md:px-6">

        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a12a8] to-[#0f0a66] p-6 md:p-8 mb-8 shadow-lg">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/10">
                <Megaphone size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Circulars</h1>
                <p className="text-blue-200 text-sm">{circulars.length} circulars • {circulars.filter(c => c.status === "Approved").length} approved</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => navigate("/circulars/create")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-all border border-white/10">
                <Plus size={16} /> New Circular
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search circulars..."
                className="w-full rounded-xl border border-zinc-200 pl-9 pr-4 py-2.5 text-sm font-semibold text-zinc-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold text-zinc-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="all">All Types</option>
              <option value="institution">Institution</option>
              <option value="department">Department</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold text-zinc-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="all">All Status</option>
              <option value="Principal_Pending">Principal Pending</option>
              <option value="HOD_Pending">HOD Pending</option>
              <option value="Approved">Approved</option>
              <option value="Returned">Returned</option>
            </select>
          </div>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
              <Megaphone size={28} />
            </div>
            <h3 className="text-lg font-bold text-zinc-900">No Circulars Found</h3>
            <p className="text-sm text-zinc-500 mt-1">
              {search ? "Try a different search term." : "Click 'New Circular' to create one."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((circ) => (
              <div
                key={circ.id}
                onClick={() => openView(circ)}
                className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      circ.type === "institution" ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600"
                    }`}>
                      {circ.type === "institution" ? <Globe size={20} /> : <Building2 size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-sm font-bold text-zinc-900 truncate">{circ.title}</h3>
                        {getStatusBadge(circ.status)}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-500">
                        <span className="flex items-center gap-1"><User size={11} /> {circ.createdByName || "Unknown"}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(circ.createdAt)}</span>
                        {circ.type === "department" && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Building2 size={11} /> {circ.department || "N/A"}</span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-zinc-600 mt-2 line-clamp-2">{circ.content}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); openView(circ); }}
                    className="p-2 rounded-lg border border-zinc-200 text-zinc-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors shrink-0"
                  >
                    <Eye size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View Modal */}
      {showViewModal && viewCircular && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-8 pb-8 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowViewModal(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#120c7a] to-[#0e095e] px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/20">
                    <Megaphone size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">{viewCircular.title}</h2>
                    <p className="text-blue-200 text-xs">
                      {viewCircular.type === "institution" ? "Institution Level" : `Department: ${viewCircular.department || "N/A"}`}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowViewModal(false)} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5 max-h-[65vh] overflow-y-auto space-y-5">
              {/* Status Timeline */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-3">Status Timeline</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-xs">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={12} />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-800">Created by {viewCircular.createdByName || "Unknown"}</p>
                      <p className="text-[10px] text-zinc-500">{formatDateTime(viewCircular.createdAt)}</p>
                    </div>
                  </div>
                  {viewCircular.hodApprovedBy && (
                    <div className="flex items-center gap-3 text-xs">
                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                        <CheckCircle2 size={12} />
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-800">Approved by HOD</p>
                        <p className="text-[10px] text-zinc-500">{formatDateTime(viewCircular.hodApprovedAt)}</p>
                      </div>
                    </div>
                  )}
                  {viewCircular.principalApprovedBy && (
                    <div className="flex items-center gap-3 text-xs">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <CheckCircle2 size={12} />
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-800">Approved by Principal</p>
                        <p className="text-[10px] text-zinc-500">{formatDateTime(viewCircular.principalApprovedAt)}</p>
                      </div>
                    </div>
                  )}
                  {viewCircular.status === "Returned" && viewCircular.returnComment && (
                    <div className="flex items-center gap-3 text-xs">
                      <div className="w-6 h-6 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                        <XCircle size={12} />
                      </div>
                      <div>
                        <p className="font-semibold text-rose-700">Returned for correction</p>
                        <p className="text-[10px] text-zinc-500">{formatDateTime(viewCircular.returnedAt)}</p>
                        <p className="text-[11px] text-rose-600 mt-1 italic">"{viewCircular.returnComment}"</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      viewCircular.status === "Approved" ? "bg-emerald-100 text-emerald-700" :
                      viewCircular.status === "Returned" ? "bg-rose-100 text-rose-700" :
                      "bg-amber-100 text-amber-700"
                    }`}>
                      {viewCircular.status === "Approved" ? <CheckCircle2 size={12} /> :
                       viewCircular.status === "Returned" ? <XCircle size={12} /> :
                       <Clock size={12} />}
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-800">
                        {viewCircular.status === "Approved" ? "Published to Students" :
                         viewCircular.status === "Returned" ? "Awaiting Re-submission" :
                         "Pending Approval"}
                      </p>
                      <p className="text-[10px] text-zinc-500">Current status</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Circular Content */}
              <div className="rounded-xl border border-zinc-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b border-zinc-200">
                  <FileText size={14} className="text-[#120c7a]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Circular Content</span>
                </div>
                <div className="p-5">
                  <div className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
                    {viewCircular.content}
                  </div>
                </div>
              </div>

              {/* Correction Comments (if returned) */}
              {viewCircular.status === "Returned" && viewCircular.returnComment && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} className="text-rose-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Correction Request</span>
                  </div>
                  <p className="text-sm text-rose-800">"{viewCircular.returnComment}"</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">
                {viewCircular.type === "institution" ? "Institution" : "Department"} circular • Created {formatDate(viewCircular.createdAt)}
              </span>
              <button onClick={() => setShowViewModal(false)}
                className="rounded-xl border border-zinc-200 px-5 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {toast.show && (
        <div className={`fixed top-20 left-1/2 z-[130] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-2xl ${
          toast.type === "success" ? "bg-emerald-700" : "bg-red-600"
        }`}>
          {toast.message}
        </div>
      )}
    </Layout>
  );
}
