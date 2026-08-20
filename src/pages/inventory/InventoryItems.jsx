import { useState, useEffect, useMemo } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, setDoc, deleteDoc, onSnapshot, getDoc } from "firebase/firestore";
import { Package, Plus, Trash2, Save, Edit3, Search, AlertTriangle, X, ChevronDown, RefreshCw, PackagePlus } from "lucide-react";
import Layout from "../../components/Layout";
import { sanitizeKey, isMasterOrAdmin } from "../../lib/utils";

const CATEGORIES = ["Stationery", "Electronics", "Furniture", "Cleaning", "Sports", "Lab Equipment", "Printing", "Catering", "Gardening", "General"];
const UNITS = ["Nos", "Packs", "Kg", "Litres", "Metres", "Boxes", "Sets", "Pairs"];

export default function InventoryItems() {
  const [currentUserData, setCurrentUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [quantity, setQuantity] = useState(0);
  const [unit, setUnit] = useState(UNITS[0]);
  const [minStock, setMinStock] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [restockItem, setRestockItem] = useState(null);
  const [restockQty, setRestockQty] = useState(1);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
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

  const isAuthorized = isMasterOrAdmin(currentUserData?.role, auth.currentUser?.email) || currentUserData?.role === "Principal";
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q));
  }, [items, search]);

  const lowStockCount = useMemo(() => items.filter((i) => i.quantity <= i.minStock).length, [items]);

  const resetForm = () => { setEditId(null); setName(""); setCategory(CATEGORIES[0]); setQuantity(0); setUnit(UNITS[0]); setMinStock(0); setShowForm(false); };

  const handleEdit = (item) => {
    setEditId(item.id); setName(item.name); setCategory(item.category || CATEGORIES[0]);
    setQuantity(item.quantity ?? 0); setUnit(item.unit || UNITS[0]); setMinStock(item.minStock ?? 0); setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setMessage("Enter item name."); return; }
    setSaving(true);
    try {
      const id = editId || sanitizeKey(name.trim());
      await setDoc(doc(db, "inventory_items", id), {
        name: name.trim(), category, quantity: Number(quantity), unit, minStock: Number(minStock), updatedAt: new Date().toISOString()
      });
      setMessage(editId ? "Item updated successfully!" : "Item added successfully!");
      resetForm();
    } catch { setMessage("Error saving item."); }
    setSaving(false);
    setTimeout(() => setMessage(""), 3000);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this item permanently?")) return;
    try { await deleteDoc(doc(db, "inventory_items", id)); setMessage("Item deleted."); } catch { setMessage("Error deleting item."); }
    setTimeout(() => setMessage(""), 3000);
  };

  const handleRestock = async () => {
    if (!restockItem || restockQty < 1) return;
    setSaving(true);
    try {
      const ref = doc(db, "inventory_items", restockItem.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) { setMessage("Item not found."); setSaving(false); setTimeout(() => setMessage(""), 3000); return; }
      const current = snap.data().quantity || 0;
      await setDoc(ref, { ...snap.data(), quantity: current + restockQty, updatedAt: new Date().toISOString() });
      setMessage(`Restocked ${restockItem.name} — ${current} → ${current + restockQty} ${snap.data().unit || "Nos"}`);
      setRestockItem(null);
      setRestockQty(1);
    } catch { setMessage("Error restocking item."); }
    setSaving(false);
    setTimeout(() => setMessage(""), 3000);
  };

  if (loading) return <Layout title="Stock Management"><div className="flex items-center justify-center min-h-[60vh]"><div className="w-14 h-14 rounded-full border-4 border-zinc-100 border-t-[#120c7a] animate-spin" /></div></Layout>;

  return (
    <Layout title="Stock Management">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Premium Header */}
        <div className="bg-gradient-to-r from-blue-800 via-blue-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-lg">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-blue-200 font-bold uppercase tracking-wider mb-2">
                <Package size={16} />
                <span>Inventory / Stock Management</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Stock Management</h1>
              <p className="text-sm text-blue-200 font-medium mt-1">Manage inventory items, stock levels, and reorder thresholds.</p>
            </div>
            {isAuthorized && (
              <button onClick={() => { resetForm(); setShowForm(true); }} className="px-5 py-2.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer">
                <Plus size={16} /> Add New Item
              </button>
            )}
          </div>
        </div>

        {message && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-700 flex items-center gap-2 animate-in fade-in-50">
            <RefreshCw size={14} /> {message}
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Items</p>
            <p className="text-2xl font-black text-[#120c7a] mt-1">{items.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Categories</p>
            <p className="text-2xl font-black text-blue-600 mt-1">{new Set(items.map(i => i.category)).size}</p>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Stock</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{items.reduce((s, i) => s + (i.quantity || 0), 0)}</p>
          </div>
          <div className={`rounded-2xl border p-5 shadow-sm ${lowStockCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-zinc-100'}`}>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Low Stock Alerts</p>
            <p className={`text-2xl font-black mt-1 ${lowStockCount > 0 ? 'text-rose-600' : 'text-zinc-400'}`}>{lowStockCount}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input className="w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 py-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent transition-all placeholder:text-zinc-300" placeholder="Search items by name or category..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* Items Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.length === 0 && (
            <div className="col-span-full text-center py-16">
              <Package size={48} className="mx-auto mb-4 text-zinc-200" />
              <p className="text-sm font-bold text-zinc-400">No items found</p>
              <p className="text-xs text-zinc-300 mt-1">Add your first inventory item to get started.</p>
            </div>
          )}
          {filteredItems.map((item) => {
            const lowStock = item.quantity <= item.minStock;
            return (
              <div key={item.id} className="group bg-white rounded-2xl border border-zinc-100 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${lowStock ? 'bg-rose-100' : 'bg-blue-100'}`}>
                    <Package size={20} className={lowStock ? 'text-rose-600' : 'text-[#120c7a]'} />
                  </div>
                  {isAuthorized && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setRestockItem(item); setRestockQty(1); }} className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer" title="Restock"><PackagePlus size={14} className="text-emerald-500" /></button>
                      <button onClick={() => handleEdit(item)} className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"><Edit3 size={14} className="text-blue-400" /></button>
                      <button onClick={() => handleDelete(item.id)} className="p-1.5 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"><Trash2 size={14} className="text-rose-400" /></button>
                    </div>
                  )}
                </div>
                <h3 className="text-sm font-black text-zinc-800 truncate">{item.name}</h3>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="px-2 py-0.5 bg-zinc-100 text-zinc-500 text-[10px] font-bold rounded-full">{item.category}</span>
                  <span className="text-[10px] text-zinc-300 font-medium">{item.unit}</span>
                </div>
                <div className="mt-4 pt-4 border-t border-zinc-50 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Current Stock</p>
                    <p className={`text-2xl font-black mt-0.5 ${lowStock ? 'text-rose-600' : 'text-[#120c7a]'}`}>
                      {item.quantity}
                    </p>
                  </div>
                  {lowStock ? (
                    <div className="px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-1.5">
                      <AlertTriangle size={12} className="text-rose-500" />
                      <span className="text-[10px] font-bold text-rose-600">Reorder!</span>
                    </div>
                  ) : item.minStock > 0 && (
                    <span className="text-[10px] text-zinc-400 font-medium">Min: {item.minStock}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Premium Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in-50 duration-150" onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
            <div className="bg-white rounded-3xl shadow-2xl border border-zinc-100 p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-black text-zinc-800 flex items-center gap-2">
                  <div className="w-8 h-8 bg-[#120c7a]/10 rounded-lg flex items-center justify-center">
                    <Package size={16} className="text-[#120c7a]" />
                  </div>
                  {editId ? "Edit Inventory Item" : "Add New Item"}
                </h2>
                <button onClick={resetForm} className="p-2 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"><X size={18} className="text-zinc-400" /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-5">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Item Name</label>
                  <input className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. A4 Sheet Bundle" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Category</label>
                    <div className="relative">
                      <select className="w-full appearance-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 pr-8 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all" value={category} onChange={(e) => setCategory(e.target.value)}>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Unit</label>
                    <div className="relative">
                      <select className="w-full appearance-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 pr-8 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all" value={unit} onChange={(e) => setUnit(e.target.value)}>
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Current Stock</label>
                    <input type="number" min={0} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-bold text-[#120c7a] focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Min Stock Alert</label>
                    <input type="number" min={0} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:bg-white transition-all" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="0" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2 border-t border-zinc-50">
                  <button type="button" onClick={resetForm} className="px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-bold rounded-xl transition-all cursor-pointer">Cancel</button>
                  <button type="submit" disabled={saving} className="px-5 py-2.5 bg-[#120c7a] hover:bg-[#120c7a]/90 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50">
                    <Save size={14} /> {saving ? "Saving..." : editId ? "Update Item" : "Add Item"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Restock Modal */}
        {restockItem && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in-50 duration-150" onClick={(e) => { if (e.target === e.currentTarget) { setRestockItem(null); setRestockQty(1); } }}>
            <div className="bg-white rounded-3xl shadow-2xl border border-zinc-100 p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-black text-zinc-800 flex items-center gap-2">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <PackagePlus size={16} className="text-emerald-600" />
                  </div>
                  Restock: {restockItem.name}
                </h2>
                <button onClick={() => { setRestockItem(null); setRestockQty(1); }} className="p-2 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"><X size={18} className="text-zinc-400" /></button>
              </div>
              <p className="text-xs text-zinc-500 mb-4">
                Current stock: <span className="font-black text-[#120c7a]">{restockItem.quantity} {restockItem.unit || "Nos"}</span>
              </p>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">Add Quantity</label>
              <input type="number" min={1} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-bold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all" value={restockQty} onChange={(e) => setRestockQty(Math.max(1, Number(e.target.value)))} autoFocus />
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-50">
                <button onClick={() => { setRestockItem(null); setRestockQty(1); }} className="px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-bold rounded-xl transition-all cursor-pointer">Cancel</button>
                <button onClick={handleRestock} disabled={saving} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50">
                  <PackagePlus size={14} /> {saving ? "Restocking..." : "Add to Stock"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
