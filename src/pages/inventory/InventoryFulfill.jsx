import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, onSnapshot, getDoc, runTransaction } from "firebase/firestore";
import { ShieldAlert, Search, PackageCheck, CheckCircle2, AlertCircle, User, Package } from "lucide-react";
import Layout from "../../components/Layout";
import { isMasterOrAdmin } from "../../lib/utils";

export default function InventoryFulfill() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [itemsMap, setItemsMap] = useState({});
  const [search, setSearch] = useState("");

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
    const unsub = onSnapshot(collection(db, "inventory_items"), (snap) => {
      const map = {};
      snap.forEach((d) => { map[d.id] = d.data(); });
      setItemsMap(map);
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

  const handleFulfill = async (req) => {
    if (!confirm(`Mark "${req.itemName}" (Qty: ${req.quantity}) as issued?\n\nStock will be deducted from inventory.`)) return;
    try {
      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, "inventory_items", req.itemId);
        const itemSnap = await transaction.get(itemRef);
        if (!itemSnap.exists()) throw new Error("Item not found.");
        const currentQty = itemSnap.data().quantity ?? 0;
        if (currentQty < req.quantity) throw new Error(`Insufficient stock! Only ${currentQty} available.`);
        transaction.update(itemRef, { quantity: currentQty - req.quantity });
        transaction.update(doc(db, "inventory_requests", req.id), {
          status: "fulfilled", fulfilledBy: currentUser.uid,
          fulfilledByName: currentUserData?.facultyName || currentUserData?.displayName || currentUser.email,
          fulfilledAt: new Date().toISOString()
        });
      });
    } catch (err) { alert(err.message || "Error."); }
  };

  const approvedRequests = useMemo(() => requests.filter((r) => r.status === "approved"), [requests]);

  const filtered = useMemo(() => {
    if (!search.trim()) return approvedRequests;
    const q = search.toLowerCase();
    return approvedRequests.filter((r) => r.itemName?.toLowerCase().includes(q) || r.requestedByName?.toLowerCase().includes(q));
  }, [approvedRequests, search]);

  const formatDate = (ts) => ts?.toDate?.() ? new Date(ts.toDate()).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  if (loading) return <Layout title="Issue Items"><div className="flex items-center justify-center min-h-[60vh]"><div className="w-14 h-14 rounded-full border-4 border-zinc-100 border-t-[#120c7a] animate-spin" /></div></Layout>;

  if (!isAuthorized) {
    return (
      <Layout title="Issue Items">
        <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-zinc-100 p-8 shadow-sm text-center">
          <ShieldAlert className="text-amber-500 mx-auto mb-4" size={48} />
          <h2 className="text-lg font-black text-zinc-800">Access Restricted</h2>
          <p className="text-xs text-zinc-400 font-medium mt-2">Only Admin and Principal can issue items.</p>
        </div>
      </Layout>
    );
  }

  const fulfilledCount = requests.filter((r) => r.status === "fulfilled").length;

  return (
    <Layout title="Issue Items">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-lg">
          <div className="flex items-center gap-2 text-xs text-blue-200 font-bold uppercase tracking-wider mb-2">
            <PackageCheck size={16} />
            <span>Inventory / Issue Items</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Issue Items</h1>
          <p className="text-sm text-blue-200 font-medium mt-1">
            {approvedRequests.length} approved request{approvedRequests.length !== 1 ? "s" : ""} waiting to be issued &middot; {fulfilledCount} already fulfilled.
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><CheckCircle2 size={20} className="text-emerald-600" /></div>
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Approved</p>
                <p className="text-xl font-black text-emerald-600">{approvedRequests.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><PackageCheck size={20} className="text-blue-600" /></div>
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Fulfilled</p>
                <p className="text-xl font-black text-blue-600">{fulfilledCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><Package size={20} className="text-amber-600" /></div>
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pending Issue</p>
                <p className="text-xl font-black text-amber-500">{approvedRequests.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center"><User size={20} className="text-zinc-600" /></div>
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Requesters</p>
                <p className="text-xl font-black text-zinc-700">{new Set(approvedRequests.map((r) => r.requestedBy)).size}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input className="w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 py-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent transition-all placeholder:text-zinc-300" placeholder="Search by item or requester..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* Requests List */}
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="text-center py-16 bg-white rounded-3xl border border-zinc-100">
              <PackageCheck size={48} className="mx-auto mb-3 text-zinc-200" />
              <p className="text-sm font-bold text-zinc-400">No items to issue</p>
              <p className="text-xs text-zinc-300 mt-1">Approved requests will appear here.</p>
            </div>
          )}
          {filtered.map((r) => {
            const itemData = itemsMap[r.itemId];
            const hasStock = itemData && itemData.quantity >= r.quantity;
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm hover:shadow-md transition-all duration-200">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                        <PackageCheck size={16} className="text-purple-600" />
                      </div>
                      <h3 className="text-sm font-black text-zinc-800">{r.itemName}</h3>
                      {!hasStock && (
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                          <AlertCircle size={10} /> Out of Stock
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500 font-medium">
                      <span>Requester: <strong className="text-zinc-700">{r.requestedByName}</strong></span>
                      <span>Qty: <strong className="text-zinc-700">{r.quantity}</strong></span>
                      {itemData && <span>In Stock: <strong className={itemData.quantity >= r.quantity ? "text-emerald-600" : "text-rose-600"}>{itemData.quantity} {itemData.unit}</strong></span>}
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Reason: {r.reason}
                      {r.approvedByName && <> &middot; Approved by: <strong className="text-emerald-600">{r.approvedByName}</strong></>}
                      {formatDate(r.createdAt) && <> &middot; {formatDate(r.createdAt)}</>}
                    </p>
                  </div>
                  <button
                    onClick={() => handleFulfill(r)}
                    disabled={!hasStock}
                    className="px-6 py-3 bg-[#120c7a] hover:bg-[#120c7a]/90 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md transition-all cursor-pointer shrink-0"
                  >
                    <CheckCircle2 size={14} /> Issue Item
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
