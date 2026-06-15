import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { BookOpen, Plus, X, Save, Trash2, Edit2, Search, Bookmark, Library, CheckCircle2, AlertCircle, Hash } from "lucide-react";
import Layout from "../components/Layout";

export default function LibraryCatalog() {
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const formInit = { isbn: "", title: "", author: "", publisher: "", year: "", category: "", rack: "", totalCopies: "1", description: "" };
  const [form, setForm] = useState(formInit);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  useEffect(() => {
    const unsubBooks = onSnapshot(collection(db, "books"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), id: d.id }));
      setBooks(list);
      setLoading(false);
    });
    const unsubCats = onSnapshot(collection(db, "book_categories"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), id: d.id }));
      setCategories(list);
    });
    return () => { unsubBooks(); unsubCats(); };
  }, []);

  const catMap = useMemo(() => {
    const m = {}; categories.forEach(c => { m[c.id] = c.name; }); return m;
  }, [categories]);

  const filteredBooks = useMemo(() => {
    let list = [...books];
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(b => (b.title || "").toLowerCase().includes(s) || (b.isbn || "").toLowerCase().includes(s) || (b.author || "").toLowerCase().includes(s));
    }
    if (catFilter) {
      list = list.filter(b => b.category === catFilter);
    }
    return list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  }, [books, search, catFilter]);

  const stats = useMemo(() => {
    const total = books.length;
    const available = books.reduce((s, b) => s + (b.availableCopies ?? b.totalCopies ?? 0), 0);
    const issued = books.reduce((s, b) => s + ((b.totalCopies ?? 0) - (b.availableCopies ?? b.totalCopies ?? 0)), 0);
    return { total, available, issued };
  }, [books]);

  const openAdd = () => {
    setEditItem(null); setForm(formInit); setModalOpen(true);
  };

  const openEdit = (book) => {
    setEditItem(book);
    setForm({ isbn: book.isbn || "", title: book.title || "", author: book.author || "", publisher: book.publisher || "", year: String(book.year || ""), category: book.category || "", rack: book.rack || "", totalCopies: String(book.totalCopies ?? 1), description: book.description || "" });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { showToast("Title is required", "error"); return; }
    const copies = Number(form.totalCopies);
    if (isNaN(copies) || copies < 1) { showToast("Total copies must be at least 1", "error"); return; }

    setSaving(true);
    try {
      const data = {
        isbn: form.isbn.trim(),
        title: form.title.trim(),
        author: form.author.trim(),
        publisher: form.publisher.trim(),
        year: form.year ? Number(form.year) : null,
        category: form.category || null,
        rack: form.rack.trim(),
        totalCopies: copies,
        description: form.description.trim(),
      };

      if (editItem) {
        data.availableCopies = editItem.availableCopies ?? copies;
        await updateDoc(doc(db, "books", editItem.id), data);
        showToast("Book updated");
      } else {
        data.availableCopies = copies;
        await addDoc(collection(db, "books"), data);
        showToast("Book added");
      }
      setModalOpen(false);
    } catch (err) {
      console.error("Error saving book:", err);
      showToast("Failed to save book", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (book) => {
    try {
      await deleteDoc(doc(db, "books", book.id));
      showToast("Book deleted");
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Error deleting book:", err);
      showToast("Failed to delete book", "error");
    }
  };

  if (loading) {
    return (
      <Layout title="Library - Book Catalog">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Library - Book Catalog">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {toast.show && (
          <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="font-bold">{toast.message}</span>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-xl"><BookOpen size={24} className="text-blue-600" /></div>
            <div><p className="text-2xl font-black text-zinc-800">{stats.total}</p><p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Books</p></div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-xl"><Bookmark size={24} className="text-emerald-600" /></div>
            <div><p className="text-2xl font-black text-zinc-800">{stats.available}</p><p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Available</p></div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 flex items-center gap-4">
            <div className="p-3 bg-amber-50 rounded-xl"><Library size={24} className="text-amber-600" /></div>
            <div><p className="text-2xl font-black text-zinc-800">{stats.issued}</p><p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Issued</p></div>
          </div>
        </div>

        {/* Catalog Header */}
        <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/15 rounded-lg">
                <BookOpen size={22} className="text-white" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg">Book Catalog</h4>
                <p className="text-blue-100 text-xs opacity-80">{books.length} books in inventory</p>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by ISBN, title, author..." className="w-full sm:w-64 pl-9 pr-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-white/30 text-sm" />
              </div>
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-white/30">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-bold transition-all whitespace-nowrap">
                <Plus size={16} /> Add Book
              </button>
            </div>
          </div>

          {filteredBooks.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen size={28} className="text-zinc-300" />
              </div>
              <p className="text-zinc-500 font-medium">{search || catFilter ? "No books match your filters" : "No books in the catalog"}</p>
              <p className="text-zinc-400 text-sm mt-1">Click "Add Book" to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">#</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">ISBN</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Title</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Author</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Rack</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Copies</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Available</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredBooks.map((book, idx) => (
                    <tr key={book.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-zinc-400 font-mono">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-mono text-zinc-600">{book.isbn || "—"}</td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-zinc-800 truncate max-w-[250px]">{book.title}</p>
                        {book.publisher && <p className="text-[10px] text-zinc-400">{book.publisher}{book.year ? ` • ${book.year}` : ""}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">{book.author || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold">{catMap[book.category] || "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-zinc-600">{book.rack || "—"}</td>
                      <td className="px-4 py-3 text-center font-bold text-zinc-700">{book.totalCopies ?? "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${(book.availableCopies ?? 0) > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                          {book.availableCopies ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(book)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit"><Edit2 size={14} /></button>
                          {deleteConfirm === book.id ? (
                            <>
                              <button onClick={() => handleDelete(book)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Confirm"><Trash2 size={14} /></button>
                              <button onClick={() => setDeleteConfirm(null)} className="p-1.5 text-zinc-400 hover:bg-zinc-100 rounded-lg transition-all" title="Cancel"><X size={14} /></button>
                            </>
                          ) : (
                            <button onClick={() => setDeleteConfirm(book.id)} className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete"><Trash2 size={14} /></button>
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

        {/* Add/Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-[#120c7a] px-6 py-4 flex justify-between items-center sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <BookOpen size={20} className="text-white" />
                  <h3 className="text-white font-bold">{editItem ? "Edit Book" : "Add New Book"}</h3>
                </div>
                <button onClick={() => setModalOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"><X size={18} className="text-white" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">ISBN</label>
                    <input value={form.isbn} onChange={e => setForm({ ...form, isbn: e.target.value })} placeholder="978-3-16-148410-0" className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Year</label>
                    <input value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} type="number" placeholder="2024" className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Title *</label>
                  <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Book title" className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-medium" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Author</label>
                    <input value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} placeholder="Author name" className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Publisher</label>
                    <input value={form.publisher} onChange={e => setForm({ ...form, publisher: e.target.value })} placeholder="Publisher" className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Category</label>
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm">
                      <option value="">Select category</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Rack / Shelf</label>
                    <input value={form.rack} onChange={e => setForm({ ...form, rack: e.target.value })} placeholder="A-1, B-2..." className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Total Copies *</label>
                    <input value={form.totalCopies} onChange={e => setForm({ ...form, totalCopies: e.target.value })} type="number" min="1" className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Description (optional)</label>
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm resize-none" />
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
