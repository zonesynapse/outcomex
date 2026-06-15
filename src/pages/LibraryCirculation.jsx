import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../firebase";
import { collection, onSnapshot, addDoc, updateDoc, doc, getDoc, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { ArrowRightLeft, BookOpen, User, CheckCircle2, AlertCircle, Search, X, Calendar, Clock, Bookmark, Hash, IndianRupee } from "lucide-react";
import Layout from "../components/Layout";

export default function LibraryCirculation() {
  const [tab, setTab] = useState("issue");
  const [users, setUsers] = useState([]);
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Issue
  const [memberSearch, setMemberSearch] = useState("");
  const [bookSearch, setBookSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedBook, setSelectedBook] = useState(null);
  const [memberResults, setMemberResults] = useState([]);
  const [bookResults, setBookResults] = useState([]);

  // Return
  const [returnSearch, setReturnSearch] = useState("");
  const [returnMember, setReturnMember] = useState(null);
  const [activeIssues, setActiveIssues] = useState([]);

  const [saving, setSaving] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list = [];
      snap.forEach(d => { const data = d.data(); if (data.isApproved) list.push({ ...data, uid: d.id }); });
      setUsers(list);
    });
    const unsubBooks = onSnapshot(collection(db, "books"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), id: d.id }));
      setBooks(list);
    });
    const unsubCats = onSnapshot(collection(db, "book_categories"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), id: d.id }));
      setCategories(list);
    });
    setLoading(false);
    return () => { unsubUsers(); unsubBooks(); unsubCats(); };
  }, []);

  const catMap = useMemo(() => {
    const m = {}; categories.forEach(c => { m[c.id] = c; }); return m;
  }, [categories]);

  // Search members
  useEffect(() => {
    if (!memberSearch.trim()) { setMemberResults([]); return; }
    const s = memberSearch.toLowerCase();
    const results = users.filter(u =>
      (u.facultyName || u.displayName || "").toLowerCase().includes(s) ||
      (u.email || "").toLowerCase().includes(s) ||
      (u.facultyId || "").toLowerCase().includes(s)
    ).slice(0, 10);
    setMemberResults(results);
  }, [memberSearch, users]);

  // Search books for issue
  useEffect(() => {
    if (!bookSearch.trim()) { setBookResults([]); return; }
    const s = bookSearch.toLowerCase();
    const results = books.filter(b =>
      (b.title || "").toLowerCase().includes(s) ||
      (b.isbn || "").toLowerCase().includes(s) ||
      (b.author || "").toLowerCase().includes(s)
    ).filter(b => (b.availableCopies ?? 0) > 0).slice(0, 10);
    setBookResults(results);
  }, [bookSearch, books]);

  // Load active issues for return member
  useEffect(() => {
    if (!returnMember) { setActiveIssues([]); return; }
    const loadIssues = async () => {
      const q = query(collection(db, "book_issues"), where("memberId", "==", returnMember.uid), where("status", "in", ["issued", "overdue"]));
      const snap = await getDocs(q);
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), id: d.id }));
      list.sort((a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0));
      setActiveIssues(list);
    };
    loadIssues();
  }, [returnMember]);

  // Search member for return
  const returnMemberResults = useMemo(() => {
    if (!returnSearch.trim()) return [];
    const s = returnSearch.toLowerCase();
    return users.filter(u =>
      (u.facultyName || u.displayName || "").toLowerCase().includes(s) ||
      (u.email || "").toLowerCase().includes(s) ||
      (u.facultyId || "").toLowerCase().includes(s)
    ).slice(0, 10);
  }, [returnSearch, users]);

  const handleIssue = async () => {
    if (!selectedMember || !selectedBook) { showToast("Select a member and a book", "error"); return; }
    setSaving(true);
    try {
      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 15);

      await addDoc(collection(db, "book_issues"), {
        bookId: selectedBook.id,
        isbn: selectedBook.isbn || "",
        bookTitle: selectedBook.title || "",
        memberId: selectedMember.uid,
        memberName: selectedMember.facultyName || selectedMember.displayName || "",
        memberEmail: selectedMember.email || "",
        issueDate: now,
        dueDate,
        returnDate: null,
        status: "issued",
        fine: 0,
        issuedBy: auth.currentUser?.uid || "",
      });

      await updateDoc(doc(db, "books", selectedBook.id), {
        availableCopies: Math.max(0, (selectedBook.availableCopies ?? selectedBook.totalCopies ?? 1) - 1)
      });

      showToast(`Issued "${selectedBook.title}" to ${selectedMember.facultyName || selectedMember.displayName}`);
      setSelectedBook(null);
      setSelectedMember(null);
      setMemberSearch("");
      setBookSearch("");
    } catch (err) {
      console.error("Error issuing book:", err);
      showToast("Failed to issue book", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async (issue) => {
    setSaving(true);
    try {
      const now = new Date();
      const due = issue.dueDate?.toDate ? issue.dueDate.toDate() : new Date(issue.dueDate);
      const diffDays = Math.max(0, Math.ceil((now - due) / (1000 * 60 * 60 * 24)));
      const finePerDay = catMap[selectedBook?.category]?.finePerDay ?? 5;
      const fine = diffDays * finePerDay;

      await updateDoc(doc(db, "book_issues", issue.id), {
        returnDate: now,
        status: diffDays > 0 ? "overdue" : "returned",
        fine,
      });

      const bookRef = doc(db, "books", issue.bookId);
      const bookSnap = await getDoc(bookRef);
      if (bookSnap.exists()) {
        const bookData = bookSnap.data();
        await updateDoc(bookRef, {
          availableCopies: (bookData.availableCopies ?? 0) + 1
        });
      }

      showToast(`Returned "${issue.bookTitle}"${diffDays > 0 ? ` — Fine: ₹${fine}` : ""}`);
      setReturnMember(null);
      setReturnSearch("");
    } catch (err) {
      console.error("Error returning book:", err);
      showToast("Failed to return book", "error");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return "—";
    const date = d.toDate ? d.toDate() : new Date(d);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  if (loading) {
    return (
      <Layout title="Library - Circulation">
        <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]"></div></div>
      </Layout>
    );
  }

  return (
    <Layout title="Library - Issue / Return">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {toast.show && (
          <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="font-bold">{toast.message}</span>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-4 flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-lg"><ArrowRightLeft size={22} className="text-white" /></div>
            <div>
              <h4 className="text-white font-bold text-lg">Book Circulation</h4>
              <p className="text-blue-100 text-xs opacity-80">Issue and return books</p>
            </div>
          </div>

          <div className="flex bg-zinc-50 border-b border-zinc-200">
            <button onClick={() => setTab("issue")} className={`flex-1 px-6 py-3 text-sm font-bold text-center transition-all ${tab === "issue" ? "bg-white text-[#120c7a] border-b-2 border-[#120c7a]" : "text-zinc-500 hover:text-zinc-700"}`}>
              <BookOpen size={16} className="inline mr-2" />Issue
            </button>
            <button onClick={() => setTab("return")} className={`flex-1 px-6 py-3 text-sm font-bold text-center transition-all ${tab === "return" ? "bg-white text-[#120c7a] border-b-2 border-[#120c7a]" : "text-zinc-500 hover:text-zinc-700"}`}>
              <ArrowRightLeft size={16} className="inline mr-2" />Return
            </button>
          </div>

          {tab === "issue" ? (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Member Selection */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                    <User size={14} /> Search Member
                  </label>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search by name, email, or ID..." className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm" />
                  </div>
                  {memberResults.length > 0 && !selectedMember && (
                    <div className="bg-white border border-zinc-200 rounded-xl shadow-sm max-h-48 overflow-y-auto divide-y divide-zinc-100">
                      {memberResults.map(u => (
                        <button key={u.uid} onClick={() => { setSelectedMember(u); setMemberSearch(u.facultyName || u.displayName || ""); setMemberResults([]); }} className="w-full px-4 py-2.5 text-left hover:bg-blue-50 transition-colors flex items-center justify-between">
                          <div><span className="font-medium text-sm text-zinc-800">{u.facultyName || u.displayName}</span><p className="text-[10px] text-zinc-400">{u.email} • {u.facultyId || ""}</p></div>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-zinc-100 rounded text-zinc-500">{u.role}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedMember && (
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm text-blue-900">{selectedMember.facultyName || selectedMember.displayName}</p>
                        <p className="text-[10px] text-blue-600">{selectedMember.email} • {selectedMember.department || ""}</p>
                      </div>
                      <button onClick={() => { setSelectedMember(null); setMemberSearch(""); }} className="p-1 hover:bg-blue-200 rounded-lg transition-colors"><X size={14} className="text-blue-600" /></button>
                    </div>
                  )}
                </div>

                {/* Book Selection */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                    <BookOpen size={14} /> Search Book
                  </label>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input value={bookSearch} onChange={e => setBookSearch(e.target.value)} placeholder="Search by ISBN, title, or author..." className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm" />
                  </div>
                  {bookResults.length > 0 && !selectedBook && (
                    <div className="bg-white border border-zinc-200 rounded-xl shadow-sm max-h-48 overflow-y-auto divide-y divide-zinc-100">
                      {bookResults.map(b => (
                        <button key={b.id} onClick={() => { setSelectedBook(b); setBookSearch(b.title || ""); setBookResults([]); }} className="w-full px-4 py-2.5 text-left hover:bg-blue-50 transition-colors flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm text-zinc-800">{b.title}</p>
                            <p className="text-[10px] text-zinc-400">{b.isbn ? `ISBN: ${b.isbn}` : ""} • {b.author || ""} • Avail: {b.availableCopies ?? 0}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${(b.availableCopies ?? 0) > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{b.availableCopies ?? 0} left</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedBook && (
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm text-emerald-900">{selectedBook.title}</p>
                        <p className="text-[10px] text-emerald-600">{selectedBook.isbn ? `ISBN: ${selectedBook.isbn}` : ""} • {selectedBook.author || ""}</p>
                      </div>
                      <button onClick={() => { setSelectedBook(null); setBookSearch(""); }} className="p-1 hover:bg-emerald-200 rounded-lg transition-colors"><X size={14} className="text-emerald-600" /></button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-zinc-100">
                <button onClick={handleIssue} disabled={!selectedMember || !selectedBook || saving} className="px-8 py-3 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-emerald-900/20">
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <BookOpen size={18} />}
                  Issue Book
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                  <User size={14} /> Search Member
                </label>
                <div className="relative max-w-md">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input value={returnSearch} onChange={e => setReturnSearch(e.target.value)} placeholder="Search member by name, email, or ID..." className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm" />
                </div>
                {returnMemberResults.length > 0 && !returnMember && (
                  <div className="bg-white border border-zinc-200 rounded-xl shadow-sm max-h-48 overflow-y-auto divide-y divide-zinc-100 max-w-md">
                    {returnMemberResults.map(u => (
                      <button key={u.uid} onClick={() => { setReturnMember(u); setReturnSearch(u.facultyName || u.displayName || ""); }} className="w-full px-4 py-2.5 text-left hover:bg-blue-50 transition-colors flex items-center justify-between">
                        <div><span className="font-medium text-sm text-zinc-800">{u.facultyName || u.displayName}</span><p className="text-[10px] text-zinc-400">{u.email}</p></div>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-zinc-100 rounded text-zinc-500">{u.role}</span>
                      </button>
                    ))}
                  </div>
                )}
                {returnMember && (
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between max-w-md">
                    <div>
                      <p className="font-bold text-sm text-blue-900">{returnMember.facultyName || returnMember.displayName}</p>
                      <p className="text-[10px] text-blue-600">{returnMember.email} • {returnMember.department || ""}</p>
                    </div>
                    <button onClick={() => { setReturnMember(null); setReturnSearch(""); setActiveIssues([]); }} className="p-1 hover:bg-blue-200 rounded-lg transition-colors"><X size={14} className="text-blue-600" /></button>
                  </div>
                )}
              </div>

              {returnMember && (
                <div>
                  {activeIssues.length === 0 ? (
                    <div className="p-10 text-center text-zinc-400">
                      <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-medium">No active issues for this member</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-zinc-50 border-b border-zinc-200">
                            <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Book</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Issue Date</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Due Date</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Status</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {activeIssues.map(issue => {
                            const due = issue.dueDate?.toDate ? issue.dueDate.toDate() : new Date(issue.dueDate);
                            const now = new Date();
                            const overdue = now > due;
                            return (
                              <tr key={issue.id} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="px-4 py-3">
                                  <p className="font-bold text-sm text-zinc-800">{issue.bookTitle}</p>
                                  {issue.isbn && <p className="text-[10px] text-zinc-400">ISBN: {issue.isbn}</p>}
                                </td>
                                <td className="px-4 py-3 text-sm text-zinc-600">{formatDate(issue.issueDate)}</td>
                                <td className="px-4 py-3 text-sm text-zinc-600">{formatDate(issue.dueDate)}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${overdue ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                                    {overdue ? "Overdue" : "Active"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button onClick={() => handleReturn(issue)} disabled={saving} className="px-4 py-1.5 bg-blue-600 text-white text-[11px] font-bold rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50">
                                    Return
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
