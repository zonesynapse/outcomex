import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, setDoc, onSnapshot, getDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { Package, Send, CheckCircle, ChevronDown, AlertCircle, Clock, CheckCircle2, XCircle, PackageCheck, ArrowRight } from "lucide-react";
import Layout from "../../components/Layout";
import { useNavigate } from "react-router-dom";

export default function InventoryRequest() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);

  const [selectedItem, setSelectedItem] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

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
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => a.name?.localeCompare(b.name));
      setItems(list);
    });
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

  const selectedItemData = items.find((i) => i.id === selectedItem);
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedItem || quantity < 1 || !reason.trim()) {
      setMessage("Please select an item, enter quantity, and provide a reason.");
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "inventory_requests"), {
        itemId: selectedItem, itemName: selectedItemData?.name || "", itemCategory: selectedItemData?.category || "",
        quantity: Number(quantity), reason: reason.trim(),
        requestedBy: currentUser.uid, requestedByName: currentUserData?.facultyName || currentUserData?.displayName || currentUser.email || "Unknown",
        requestedByEmail: currentUser.email || "", status: "pending", createdAt: serverTimestamp()
      });
      setMessage("Request submitted! Waiting for Principal approval.");
      setSelectedItem(""); setQuantity(1); setReason("");
    } catch { setMessage("Error submitting request."); }
    setSaving(false);
    setTimeout(() => setMessage(""), 4000);
  };

  const statusIcon = (s) => {
    switch (s) {
      case "pending": return <Clock size={14} className="text-amber-500" />;
      case "approved": return <CheckCircle2 size={14} className="text-emerald-500" />;
      case "rejected": return <XCircle size={14} className="text-rose-500" />;
      case "fulfilled": return <PackageCheck size={14} className="text-blue-500" />;
      default: return null;
    }
  };

  const statusColor = (s) => {
    switch (s) {
      case "pending": return "bg-amber-50 text-amber-700 border-amber-200";
      case "approved": return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "rejected": return "bg-rose-50 text-rose-700 border-rose-200";
      case "fulfilled": return "bg-blue-50 text-blue-700 border-blue-200";
      default: return "bg-zinc-100 text-zinc-500";
    }
  };

  if (loading) return <Layout title="Request Item"><div className="flex items-center justify-center min-h-[60vh]"><div className="w-14 h-14 rounded-full border-4 border-zinc-100 border-t-[#120c7a] animate-spin" /></div></Layout>;

  return (
    <Layout title="Request Item">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Premium Header */}
        <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-lg">
          <div className="flex items-center gap-2 text-xs text-blue-200 font-bold uppercase tracking-wider mb-2">
            <Send size={16} />
            <span>Inventory / Request</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Request Inventory Item</h1>
          <p className="text-sm text-blue-200 font-medium mt-1">Submit a request for stationary, electronics, or other inventory items.</p>
        </div>

        {message && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-700 flex items-center gap-2 animate-in fade-in-50">
            <CheckCircle size={16} /> {message}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-zinc-100 p-6 md:p-8 shadow-sm space-y-6">
              <h2 className="text-xs font-black text-zinc-700 uppercase tracking-wider">Request Details</h2>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Select Item <span className="text-rose-400">*</span></label>
                <div className="relative">
                  <select className="w-full appearance-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 pr-8 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all" value={selectedItem} onChange={(e) => setSelectedItem(e.target.value)}>
                    <option value="">-- Choose an item --</option>
                    {items.filter((i) => i.quantity > 0).map((item) => (
                      <option key={item.id} value={item.id}>{item.name} ({item.quantity} {item.unit} in stock)</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
                </div>
                {selectedItemData && selectedItemData.quantity <= selectedItemData.minStock && (
                  <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
                    <AlertCircle size={12} className="text-amber-600" />
                    <span className="text-[10px] font-bold text-amber-700">Low stock — approval may be delayed.</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Quantity <span className="text-rose-400">*</span></label>
                  <input type="number" min={1} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-bold text-[#120c7a] focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Available Stock</label>
                  <div className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-bold text-zinc-500">{selectedItemData ? `${selectedItemData.quantity} ${selectedItemData.unit}` : "—"}</div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Reason / Purpose <span className="text-rose-400">*</span></label>
                <textarea className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all min-h-[100px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Need A4 sheets for exam printing" rows={4} />
              </div>

              <div className="flex justify-end pt-2 border-t border-zinc-50">
                <button type="submit" disabled={saving} className="px-6 py-3 bg-[#120c7a] hover:bg-[#120c7a]/90 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50">
                  {saving ? "Submitting..." : <><Send size={14} /> Submit Request</>}
                </button>
              </div>
            </form>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Quick Stats */}
            <div className="bg-white rounded-3xl border border-zinc-100 p-5 shadow-sm">
              <h3 className="text-xs font-black text-zinc-700 uppercase tracking-wider mb-4">My Activity</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <span className="text-xs font-bold text-amber-700">Pending</span>
                  <span className="text-sm font-black text-amber-600">{pendingCount}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <span className="text-xs font-bold text-emerald-700">Approved</span>
                  <span className="text-sm font-black text-emerald-600">{requests.filter((r) => r.status === "approved").length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <span className="text-xs font-bold text-blue-700">Fulfilled</span>
                  <span className="text-sm font-black text-blue-600">{requests.filter((r) => r.status === "fulfilled").length}</span>
                </div>
              </div>
            </div>

            {/* Recent Requests */}
            <div className="bg-white rounded-3xl border border-zinc-100 p-5 shadow-sm">
              <h3 className="text-xs font-black text-zinc-700 uppercase tracking-wider mb-4">Recent Requests</h3>
              {requests.length === 0 ? (
                <p className="text-xs text-zinc-400 font-medium text-center py-6">No requests yet.</p>
              ) : (
                <div className="space-y-2">
                  {requests.slice(0, 5).map((r) => (
                    <div key={r.id} className="p-3 rounded-xl border border-zinc-50 bg-zinc-50 hover:bg-white transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-zinc-700 truncate">{r.itemName}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0 ${statusColor(r.status)}`}>
                          {statusIcon(r.status)} {r.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-1 font-medium">Qty: {r.quantity}</p>
                    </div>
                  ))}
                </div>
              )}
              {requests.length > 0 && (
                <button onClick={() => navigate("/inventory/my-requests")} className="w-full mt-3 py-2.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-500 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
                  View All <ArrowRight size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
