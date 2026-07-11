import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, onSnapshot, getDoc, deleteDoc } from "firebase/firestore";
import { ClipboardList, Search, Trash2, Clock, CheckCircle2, XCircle, PackageCheck } from "lucide-react";
import Layout from "../../components/Layout";

const STATUS_META = {
  pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: Clock },
  approved: { label: "Approved", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CheckCircle2 },
  rejected: { label: "Rejected", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", icon: XCircle },
  fulfilled: { label: "Fulfilled", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: PackageCheck },
};

export default function InventoryMyRequests() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => { setCurrentUser(user); setLoading(false); });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(collection(db, "inventory_requests"), (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRequests(list.filter((r) => r.requestedBy === currentUser.uid).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
    });
    return () => unsub();
  }, [currentUser]);

  const handleCancel = async (id) => {
    if (!confirm("Cancel this pending request?")) return;
    try { await deleteDoc(doc(db, "inventory_requests", id)); } catch {}
  };

  const filtered = useMemo(() => {
    let result = requests;
    if (statusFilter !== "all") result = result.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) => r.itemName?.toLowerCase().includes(q) || r.reason?.toLowerCase().includes(q));
    }
    return result;
  }, [requests, statusFilter, search]);

  const counts = { all: requests.length };
  Object.keys(STATUS_META).forEach((s) => { counts[s] = requests.filter((r) => r.status === s).length; });

  if (loading) return <Layout title="My Requests"><div className="flex items-center justify-center min-h-[60vh]"><div className="w-14 h-14 rounded-full border-4 border-zinc-100 border-t-[#120c7a] animate-spin" /></div></Layout>;

  const formatDate = (ts) => ts?.toDate?.() ? new Date(ts.toDate()).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <Layout title="My Requests">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-lg">
          <div className="flex items-center gap-2 text-xs text-blue-200 font-bold uppercase tracking-wider mb-2">
            <ClipboardList size={16} />
            <span>Inventory / My Requests</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">My Requests</h1>
          <p className="text-sm text-blue-200 font-medium mt-1">Track all your item requests and their current status.</p>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ id: "all", label: "All" }, ...Object.entries(STATUS_META).map(([id, m]) => ({ id, label: m.label }))].map(({ id, label }) => (
            <button key={id} onClick={() => setStatusFilter(id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === id ? "bg-[#120c7a] text-white border-[#120c7a] shadow-sm" : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-700"
              }`}
            >
              {label} ({counts[id] || 0})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input className="w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 py-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent transition-all placeholder:text-zinc-300" placeholder="Search by item or reason..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* Requests List */}
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="text-center py-16 bg-white rounded-3xl border border-zinc-100">
              <ClipboardList size={48} className="mx-auto mb-3 text-zinc-200" />
              <p className="text-sm font-bold text-zinc-400">No requests found</p>
            </div>
          )}
          {filtered.map((r) => {
            const meta = STATUS_META[r.status] || STATUS_META.pending;
            const Icon = meta.icon;
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm hover:shadow-md transition-all duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-black text-zinc-800">{r.itemName}</h3>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${meta.bg} ${meta.text} ${meta.border}`}>
                        <Icon size={12} /> {meta.label}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 font-medium">
                      <span>Qty: <strong className="text-zinc-700">{r.quantity}</strong></span>
                      <span>Reason: {r.reason}</span>
                    </div>
                    <div className="mt-1.5 text-[10px] text-zinc-400">
                      {formatDate(r.createdAt)}
                      {r.approvedByName && <span> &middot; Approved by: <strong>{r.approvedByName}</strong></span>}
                      {r.rejectedReason && <span> &middot; Reason: <strong>{r.rejectedReason}</strong></span>}
                      {r.fulfilledByName && <span> &middot; Issued by: <strong>{r.fulfilledByName}</strong></span>}
                    </div>
                  </div>
                  {r.status === "pending" && (
                    <button onClick={() => handleCancel(r.id)} className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border border-rose-200">
                      <Trash2 size={12} /> Cancel Request
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
