import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, onSnapshot, getDoc, setDoc, deleteDoc, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  Package, Send, ClipboardCheck, PackageCheck, ClipboardList,
  ArrowRight, AlertTriangle, TrendingUp, Users, CheckCircle2,
  RefreshCw, Layers, ShoppingCart, X, Plus, Trash2, ChevronDown
} from "lucide-react";
import Layout from "../../components/Layout";
import { isMasterOrAdmin } from "../../lib/utils";
import { sanitizeKey } from "../../lib/utils";

const SEED_ITEMS = [
  { name: "A4 Laser Sheets (500)", category: "Stationery", quantity: 50, unit: "Packs", minStock: 5 },
  { name: "Printer Toner Cartridge", category: "Printing", quantity: 12, unit: "Nos", minStock: 3 },
  { name: "Whiteboard Markers (Box)", category: "Stationery", quantity: 20, unit: "Boxes", minStock: 5 },
  { name: "Stapler Pin (Box)", category: "Stationery", quantity: 30, unit: "Boxes", minStock: 5 },
  { name: "Exam Answer Sheets (100)", category: "Stationery", quantity: 200, unit: "Packs", minStock: 20 },
  { name: "Blue Ballpoint Pens (Box)", category: "Stationery", quantity: 15, unit: "Boxes", minStock: 5 },
  { name: "Register Note Book", category: "Stationery", quantity: 40, unit: "Nos", minStock: 10 },
  { name: "Paper Clip (Box)", category: "Stationery", quantity: 25, unit: "Boxes", minStock: 5 },
  { name: "File Folder (Box)", category: "Stationery", quantity: 18, unit: "Boxes", minStock: 5 },
  { name: "USB Drive 32GB", category: "Electronics", quantity: 8, unit: "Nos", minStock: 2 },
  { name: "Extension Cord 5M", category: "Electronics", quantity: 6, unit: "Nos", minStock: 2 },
  { name: "Ceiling Fan", category: "Electronics", quantity: 4, unit: "Nos", minStock: 1 },
  { name: "Dustbin Plastic Large", category: "Cleaning", quantity: 10, unit: "Nos", minStock: 3 },
  { name: "Hand Sanitizer 500ml", category: "Cleaning", quantity: 15, unit: "Nos", minStock: 5 },
  { name: "Broom Stick", category: "Cleaning", quantity: 8, unit: "Nos", minStock: 3 },
];

export default function InventoryDashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [seedBtn, setSeedBtn] = useState("");
  const [showSeed, setShowSeed] = useState(false);
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
    const unsub = onSnapshot(collection(db, "inventory_requests"), (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRequests(list);
    });
    return () => unsub();
  }, []);

  const handleSeedData = async () => {
    setSeedBtn("seeding");
    try {
      // Seed inventory items
      for (const item of SEED_ITEMS) {
        const id = sanitizeKey(item.name);
        await setDoc(doc(db, "inventory_items", id), {
          ...item,
          updatedAt: new Date().toISOString()
        });
      }

      // Seed sample requests for demo workflow
      const name = currentUserData?.facultyName || currentUserData?.displayName || currentUser?.email || "Faculty User";
      const uid = currentUser?.uid || "demo_user";
      const now = new Date();
      const daysAgo = (d) => new Date(now.getTime() - d * 86400000);

      const sampleRequests = [
        {
          itemId: "A4_Laser_Sheets_500", itemName: "A4 Laser Sheets (500)", itemCategory: "Stationery",
          quantity: 3, reason: "For printing exam question papers", status: "pending",
          requestedBy: uid, requestedByName: name, requestedByEmail: currentUser?.email || "",
          createdAt: serverTimestamp()
        },
        {
          itemId: "Whiteboard_Markers_Box", itemName: "Whiteboard Markers (Box)", itemCategory: "Stationery",
          quantity: 2, reason: "Department meeting room requirement", status: "pending",
          requestedBy: uid, requestedByName: name, requestedByEmail: currentUser?.email || "",
          createdAt: serverTimestamp()
        },
        {
          itemId: "Register_Note_Book", itemName: "Register Note Book", itemCategory: "Stationery",
          quantity: 5, reason: "For student council records maintenance", status: "approved",
          requestedBy: uid, requestedByName: name, requestedByEmail: currentUser?.email || "",
          approvedBy: uid, approvedByName: name, approvedAt: daysAgo(2).toISOString(),
          createdAt: serverTimestamp()
        },
        {
          itemId: "USB_Drive_32GB", itemName: "USB Drive 32GB", itemCategory: "Electronics",
          quantity: 1, reason: "Exam section data backup", status: "approved",
          requestedBy: uid, requestedByName: name, requestedByEmail: currentUser?.email || "",
          approvedBy: uid, approvedByName: name, approvedAt: daysAgo(1).toISOString(),
          createdAt: serverTimestamp()
        },
        {
          itemId: "Stapler_Pin_Box", itemName: "Stapler Pin (Box)", itemCategory: "Stationery",
          quantity: 3, reason: "Administrative office regular usage", status: "fulfilled",
          requestedBy: uid, requestedByName: name, requestedByEmail: currentUser?.email || "",
          approvedBy: uid, approvedByName: name, approvedAt: daysAgo(5).toISOString(),
          fulfilledBy: uid, fulfilledByName: name, fulfilledAt: daysAgo(4).toISOString(),
          createdAt: serverTimestamp()
        },
        {
          itemId: "Hand_Sanitizer_500ml", itemName: "Hand Sanitizer 500ml", itemCategory: "Cleaning",
          quantity: 5, reason: "Lab usage and safety compliance", status: "fulfilled",
          requestedBy: uid, requestedByName: name, requestedByEmail: currentUser?.email || "",
          approvedBy: uid, approvedByName: name, approvedAt: daysAgo(7).toISOString(),
          fulfilledBy: uid, fulfilledByName: name, fulfilledAt: daysAgo(6).toISOString(),
          createdAt: serverTimestamp()
        },
        {
          itemId: "Ceiling_Fan", itemName: "Ceiling Fan", itemCategory: "Electronics",
          quantity: 1, reason: "Need to replace broken fan in staff room", status: "rejected",
          requestedBy: uid, requestedByName: name, requestedByEmail: currentUser?.email || "",
          rejectedBy: uid, rejectedByName: name, rejectedReason: "Budget constraint — will be considered next quarter",
          rejectedAt: daysAgo(3).toISOString(),
          createdAt: serverTimestamp()
        }
      ];

      for (const req of sampleRequests) {
        await addDoc(collection(db, "inventory_requests"), req);
      }

      setSeedBtn("done");
      setTimeout(() => setSeedBtn(""), 2500);
    } catch {
      setSeedBtn("error");
      setTimeout(() => setSeedBtn(""), 3000);
    }
  };

  const handleClearData = async () => {
    if (!confirm("Delete ALL inventory items and requests?")) return;
    try {
      const itemSnap = await getDocs(collection(db, "inventory_items"));
      itemSnap.forEach((d) => deleteDoc(doc(db, "inventory_items", d.id)));
      const reqSnap = await getDocs(collection(db, "inventory_requests"));
      reqSnap.forEach((d) => deleteDoc(doc(db, "inventory_requests", d.id)));
    } catch {}
  };

  const isAdmin = isMasterOrAdmin(currentUserData?.role, auth.currentUser?.email) || currentUserData?.role === "Principal";

  const lowStockItems = useMemo(() => items.filter((i) => i.quantity <= i.minStock), [items]);
  const pendingReqs = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);
  const approvedReqs = useMemo(() => requests.filter((r) => r.status === "approved"), [requests]);
  const fulfilledReqs = useMemo(() => requests.filter((r) => r.status === "fulfilled"), [requests]);
  const myPendingReqs = useMemo(() => (currentUser ? requests.filter((r) => r.requestedBy === currentUser.uid && r.status === "pending") : []), [requests, currentUser]);

  const workflowSteps = [
    { label: "Stock Items", icon: Package, count: items.length, color: "from-blue-500 to-blue-600", bg: "bg-blue-50", text: "text-blue-600", path: "/inventory/items", desc: "Manage inventory" },
    { label: "Request Item", icon: Send, count: requests.length, color: "from-amber-500 to-orange-600", bg: "bg-amber-50", text: "text-amber-600", path: "/inventory/request", desc: "Faculty requests" },
    { label: "Approve", icon: ClipboardCheck, count: pendingReqs.length, color: "from-emerald-500 to-teal-600", bg: "bg-emerald-50", text: "text-emerald-600", path: "/inventory/approvals", desc: "Principal approval" },
    { label: "Issue Items", icon: PackageCheck, count: approvedReqs.length, color: "from-purple-500 to-violet-600", bg: "bg-purple-50", text: "text-purple-600", path: "/inventory/fulfill", desc: "Admin issues" },
  ];

  if (loading) {
    return (
      <Layout title="Inventory Dashboard">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-14 h-14 rounded-full border-4 border-zinc-100 border-t-[#120c7a] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Inventory Dashboard">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-lg">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-blue-200 font-bold uppercase tracking-wider mb-2">
                <Package size={16} />
                <span>Inventory Management System</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Inventory Dashboard</h1>
              <p className="text-sm text-blue-200 font-medium mt-1">Track stock, manage requests, approve & fulfill — all in one place.</p>
            </div>
            {isAdmin && items.length === 0 && (
              <button
                onClick={handleSeedData}
                disabled={seedBtn === "seeding"}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {seedBtn === "seeding" ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : seedBtn === "done" ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <Layers size={14} />
                )}
                {seedBtn === "done" ? "Sample Data Added!" : "Load Sample Data"}
              </button>
            )}
          </div>
        </div>

        {/* Workflow Flow */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-[#120c7a]" />
            <h2 className="text-sm font-black text-zinc-700 uppercase tracking-wider">Workflow Overview</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {workflowSteps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <button
                  key={step.label}
                  onClick={() => navigate(step.path)}
                  className="group relative bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 text-left cursor-pointer"
                >
                  <div className={`w-11 h-11 ${step.bg} ${step.text} rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                    <Icon size={22} />
                  </div>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{step.label}</p>
                  <p className={`text-3xl font-black bg-gradient-to-r ${step.color} bg-clip-text text-transparent mt-0.5`}>
                    {step.count}
                  </p>
                  <p className="text-[10px] text-zinc-400 font-medium mt-0.5">{step.desc}</p>
                  <ArrowRight size={14} className="absolute right-4 bottom-4 text-zinc-200 group-hover:text-zinc-400 transition-colors" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Stats + Alerts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Low Stock Alert */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-rose-500" />
              <h3 className="text-xs font-black text-zinc-700 uppercase tracking-wider">Low Stock Alerts</h3>
            </div>
            {lowStockItems.length === 0 ? (
              <p className="text-xs text-zinc-400 font-medium py-3">All items sufficiently stocked.</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {lowStockItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-2.5 bg-rose-50 rounded-xl border border-rose-100">
                    <div>
                      <p className="text-xs font-bold text-zinc-700">{item.name}</p>
                      <p className="text-[10px] text-rose-600 font-bold">{item.quantity} {item.unit} left</p>
                    </div>
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">Min: {item.minStock}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Requests */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList size={16} className="text-amber-500" />
              <h3 className="text-xs font-black text-zinc-700 uppercase tracking-wider">Pending Approvals</h3>
            </div>
            {pendingReqs.length === 0 ? (
              <p className="text-xs text-zinc-400 font-medium py-3">No pending requests.</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {pendingReqs.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                    <div>
                      <p className="text-xs font-bold text-zinc-700">{r.itemName}</p>
                      <p className="text-[10px] text-zinc-400 font-medium">{r.requestedByName} &middot; Qty: {r.quantity}</p>
                    </div>
                    <button onClick={() => navigate("/inventory/approvals")} className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg hover:bg-amber-200 transition-colors cursor-pointer">
                      Review
                    </button>
                  </div>
                ))}
                {pendingReqs.length > 5 && <p className="text-[10px] text-zinc-400 text-center pt-1">+{pendingReqs.length - 5} more</p>}
              </div>
            )}
          </div>

          {/* My Activity */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Users size={16} className="text-blue-500" />
              <h3 className="text-xs font-black text-zinc-700 uppercase tracking-wider">My Requests</h3>
            </div>
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 font-medium">Total Requests</span>
                <span className="text-sm font-black text-zinc-800">{requests.filter((r) => r.requestedBy === currentUser?.uid).length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 font-medium">Pending</span>
                <span className="text-sm font-black text-amber-500">{myPendingReqs.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 font-medium">Approved</span>
                <span className="text-sm font-black text-emerald-600">{requests.filter((r) => r.requestedBy === currentUser?.uid && r.status === "approved").length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 font-medium">Fulfilled</span>
                <span className="text-sm font-black text-blue-600">{requests.filter((r) => r.requestedBy === currentUser?.uid && r.status === "fulfilled").length}</span>
              </div>
            </div>
            <button onClick={() => navigate("/inventory/my-requests")} className="w-full mt-2 py-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 text-xs font-bold rounded-xl transition-colors cursor-pointer">
              View All My Requests
            </button>
          </div>
        </div>

        {/* Summary Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl border border-blue-100 p-5">
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Total Items</p>
            <p className="text-2xl font-black text-blue-700 mt-1">{items.length}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-white rounded-2xl border border-amber-100 p-5">
            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Pending Req.</p>
            <p className="text-2xl font-black text-amber-600 mt-1">{pendingReqs.length}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border border-emerald-100 p-5">
            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Approved</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{approvedReqs.length}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-white rounded-2xl border border-purple-100 p-5">
            <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Fulfilled</p>
            <p className="text-2xl font-black text-purple-600 mt-1">{fulfilledReqs.length}</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-sm font-black text-zinc-700 uppercase tracking-wider mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={() => navigate("/inventory/items")} className="p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left cursor-pointer">
              <Package size={20} className="text-[#120c7a] mb-2" />
              <p className="text-xs font-bold text-zinc-700">Stock Management</p>
              <p className="text-[10px] text-zinc-400 font-medium mt-0.5">Add / edit items</p>
            </button>
            <button onClick={() => navigate("/inventory/request")} className="p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left cursor-pointer">
              <Send size={20} className="text-amber-500 mb-2" />
              <p className="text-xs font-bold text-zinc-700">Request Item</p>
              <p className="text-[10px] text-zinc-400 font-medium mt-0.5">Place new request</p>
            </button>
            <button onClick={() => navigate("/inventory/approvals")} className="p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left cursor-pointer">
              <ClipboardCheck size={20} className="text-emerald-500 mb-2" />
              <p className="text-xs font-bold text-zinc-700">Approve Requests</p>
              <p className="text-[10px] text-zinc-400 font-medium mt-0.5">{pendingReqs.length} pending</p>
            </button>
            <button onClick={() => navigate("/inventory/fulfill")} className="p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left cursor-pointer">
              <PackageCheck size={20} className="text-purple-500 mb-2" />
              <p className="text-xs font-bold text-zinc-700">Issue Items</p>
              <p className="text-[10px] text-zinc-400 font-medium mt-0.5">{approvedReqs.length} to issue</p>
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
