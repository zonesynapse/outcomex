import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs } from "firebase/firestore";
import { Bookmark, Plus, X, Save, Trash2, Edit2, CheckCircle2, AlertCircle, IndianRupee } from "lucide-react";
import Layout from "../components/Layout";

export default function LibraryCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formFine, setFormFine] = useState("5");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "book_categories"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), id: d.id }));
      setCategories(list.sort((a, b) => (a.name || "").localeCompare(b.name)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const openAdd = () => {
    setEditItem(null);
    setFormName("");
    setFormDesc("");
    setFormFine("5");
    setModalOpen(true);
  };

  const openEdit = (cat) => {
    setEditItem(cat);
    setFormName(cat.name || "");
    setFormDesc(cat.description || "");
    setFormFine(String(cat.finePerDay ?? 5));
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { showToast("Category name is required", "error"); return; }
    const fine = Number(formFine);
    if (isNaN(fine) || fine < 0) { showToast("Fine amount must be a valid number", "error"); return; }

    setSaving(true);
    try {
      if (editItem) {
        await updateDoc(doc(db, "book_categories", editItem.id), { name: formName.trim(), description: formDesc.trim(), finePerDay: fine });
      } else {
        await addDoc(collection(db, "book_categories"), { name: formName.trim(), description: formDesc.trim(), finePerDay: fine });
      }
      setModalOpen(false);
      showToast(editItem ? "Category updated" : "Category added");
    } catch (err) {
      console.error("Error saving category:", err);
      showToast("Failed to save category", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat) => {
    try {
      const booksSnap = await getDocs(query(collection(db, "books"), where("category", "==", cat.id)));
      if (!booksSnap.empty) {
        showToast(`Cannot delete — ${booksSnap.size} book(s) use this category`, "error");
        setDeleteConfirm(null);
        return;
      }
      await deleteDoc(doc(db, "book_categories", cat.id));
      showToast("Category deleted");
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Error deleting category:", err);
      showToast("Failed to delete category", "error");
    }
  };

  if (loading) {
    return (
      <Layout title="Library - Categories">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Library - Book Categories">
      <div className="p-4 md:p-8 w-full space-y-6">
        {toast.show && (
          <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="font-bold">{toast.message}</span>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/15 rounded-lg">
                <Bookmark size={22} className="text-white" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg">Book Categories</h4>
                <p className="text-blue-100 text-xs opacity-80">{categories.length} categories</p>
              </div>
            </div>
            <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-bold transition-all">
              <Plus size={16} /> Add Category
            </button>
          </div>

          {categories.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bookmark size={28} className="text-zinc-300" />
              </div>
              <p className="text-zinc-500 font-medium">No categories yet</p>
              <p className="text-zinc-400 text-sm mt-1">Create your first category to organize books.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Description</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-center">Fine / Day</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {categories.map(cat => (
                    <tr key={cat.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-bold text-zinc-800">{cat.name || "Unnamed"}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-500 max-w-[250px] truncate">{cat.description || "—"}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-sm font-bold">
                          <IndianRupee size={12} />{cat.finePerDay ?? 5}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openEdit(cat)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit">
                            <Edit2 size={15} />
                          </button>
                          {deleteConfirm === cat.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleDelete(cat)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Confirm">
                                <Trash2 size={15} />
                              </button>
                              <button onClick={() => setDeleteConfirm(null)} className="p-2 text-zinc-400 hover:bg-zinc-100 rounded-lg transition-all" title="Cancel">
                                <X size={15} />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirm(cat.id)} className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {modalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-[#120c7a] px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Bookmark size={20} className="text-white" />
                  <h3 className="text-white font-bold">{editItem ? "Edit Category" : "Add Category"}</h3>
                </div>
                <button onClick={() => setModalOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                  <X size={18} className="text-white" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Category Name</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Textbooks, Reference, Fiction" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm font-medium" autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Description (optional)</label>
                  <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Brief description..." rows={3} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Fine per Day (₹)</label>
                  <div className="relative">
                    <IndianRupee size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input value={formFine} onChange={e => setFormFine(e.target.value)} type="number" min="0" className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm font-medium" />
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1">Applied when a book is returned past the due date.</p>
                </div>
              </div>
              <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex justify-end gap-3">
                <button onClick={() => setModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-200 rounded-xl transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-800 transition-all flex items-center gap-2 disabled:opacity-50">
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
                  {editItem ? "Update" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
