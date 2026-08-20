import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, onSnapshot, getDoc, updateDoc } from "firebase/firestore";
import { ShieldAlert, CheckCircle2, XCircle, Search, ClipboardCheck, Clock, PackageCheck } from "lucide-react";
import Layout from "../../components/Layout";
import { isMasterOrAdmin } from "../../lib/utils";

export default function InventoryApprovals() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setCurrentUserData(snap.data());
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "inventory_requests"), (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRequests(list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
    });
    return () => unsub();
  }, []);

  const isAuthorized = isMasterOrAdmin(currentUserData?.role, auth.currentUser?.email) || currentUserData?.role === "Principal";

  const handleApprove = async (id) => {
    try {
      await updateDoc(doc(db, "inventory_requests", id), {
        status: "approved", approvedBy: currentUser.uid,
        approvedByName: currentUserData?.facultyName || currentUserData?.displayName || currentUser.email,
        approvedAt: new Date().toISOString()
      });
    } catch {}
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    try {
      await updateDoc(doc(db, "inventory_requests", rejectModal), {
        status: "rejected", rejectedBy: currentUser.uid,
        rejectedByName: currentUserData?.facultyName || currentUserData?.displayName || currentUser.email,
        rejectedReason: rejectReason.trim(), rejectedAt: new Date().toISOString()
      });
      setRejectModal(null); setRejectReason("");
    } catch {}
  };

  const filtered = useMemo(() => {
    let result = requests;
    if (statusFilter !== "all") result = result.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) => r.itemName?.toLowerCase().includes(q) || r.requestedByName?.toLowerCase().includes(q) || r.reason?.toLowerCase().includes(q));
    }
    return result;
  }, [requests, statusFilter, search]);

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const counts = { all: requests.length, pending: pendingCount, approved: requests.filter((r) => r.status === "approved").length, rejected: requests.filter((r) => r.status === "rejected").length };

  const formatDate = (ts) => ts?.toDate?.() ? new Date(ts.toDate()).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  if (loading) return <Layout title="Request Approvals"><div className="flex items-center justify-center min-h-[60vh]"><div className="w-14 h-14 rounded-full border-4 border-zinc-100 border-t-[#120c7a] animate-spin" /></div></Layout>;

  if (!isAuthorized) {
    return (
      <Layout title="Request Approvals">
        <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-zinc-100 p-8 shadow-sm text-center">
          <ShieldAlert className="text-amber-500 mx-auto mb-4" size={48} />
          <h2 className="text-lg font-black text-zinc-800">Access Restricted</h2>
          <p className="text-xs text-zinc-400 font-medium mt-2">Only Principal and Admin can approve or reject requests.</p>
        </div>
      </Layout>
    );
  }

  const StatusBadge = ({ status }) => {
    const map = {
      pending: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: Clock, label: "Pending" },
      approved: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CheckCircle2, label: "Approved" },
      rejected: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", icon: XCircle, label: "Rejected" },
      fulfilled: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: PackageCheck, label: "Fulfilled" },
    };
    const m = map[status] || map.pending;
    const Icon = m.icon;
    return <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 w-fit ${m.bg} ${m.text} ${m.border}`}><Icon size={12} />{m.label}</span>;
  };

  return (
    <Layout title="Request Approvals">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-lg">
          <div className="flex items-center gap-2 text-xs text-blue-200 font-bold uppercase tracking-wider mb-2">
            <ClipboardCheck size={16} />
            <span>Inventory / Approvals</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Approve Requests</h1>
          <p className="text-sm text-blue-200 font-medium mt-1">
            {pendingCount > 0 ? `${pendingCount} request${pendingCount > 1 ? "s" : ""} pending your approval.` : "All requests have been reviewed."}
          </p>
        </div>

        {/* Stats + Search Row */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[{ id: "pending", label: "Pending" }, { id: "approved", label: "Approved" }, { id: "rejected", label: "Rejected" }, { id: "all", label: "All" }].map(({ id, label }) => (
              <button key={id} onClick={() => setStatusFilter(id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === id ? "bg-[#120c7a] text-white border-[#120c7a] shadow-sm" : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300"
                }`}>
                {label} ({counts[id]})
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input className="w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#120c7a] transition-all placeholder:text-zinc-300" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Requests */}
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="text-center py-16 bg-white rounded-3xl border border-zinc-100">
              <ClipboardCheck size={48} className="mx-auto mb-3 text-zinc-200" />
              <p className="text-sm font-bold text-zinc-400">No requests found</p>
            </div>
          )}
          {filtered.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-black text-zinc-800">{r.itemName}</h3>
                    <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">{r.itemCategory}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 font-medium">
                    <span>Requester: <strong className="text-zinc-700">{r.requestedByName}</strong></span>
                    <span>Qty: <strong className="text-zinc-700">{r.quantity}</strong></span>
                    <span>Reason: {r.reason}</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    {formatDate(r.createdAt)}
                    {r.approvedByName && <> &middot; Approved by: <strong className="text-emerald-600">{r.approvedByName}</strong></>}
                    {r.rejectedReason && <> &middot; Reason: <strong className="text-rose-600">{r.rejectedReason}</strong></>}
                  </p>
                </div>
                {r.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleApprove(r.id)} className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer">
                      <CheckCircle2 size={14} /> Approve
                    </button>
                    <button onClick={() => setRejectModal(r.id)} className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer">
                      <XCircle size={14} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Reject Modal */}
        {rejectModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) { setRejectModal(null); setRejectReason(""); } }}>
            <div className="bg-white rounded-3xl shadow-2xl border border-zinc-100 p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
                  <XCircle size={20} className="text-rose-500" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-zinc-800">Reject Request</h2>
                  <p className="text-xs text-zinc-400 font-medium">Provide a reason for rejection</p>
                </div>
              </div>
              <textarea className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all min-h-[120px]" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Insufficient stock, please try later..." rows={4} autoFocus />
              <div className="flex justify-end gap-3 mt-5">
                <button onClick={() => { setRejectModal(null); setRejectReason(""); }} className="px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-bold rounded-xl transition-all cursor-pointer">Cancel</button>
                <button onClick={handleReject} disabled={!rejectReason.trim()} className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50">
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
