import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, collection, getDoc, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Library, Search, AlertCircle, Loader2, BookOpen, Clock, IndianRupee } from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDate(ts) {
  if (!ts) return "-";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "-";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function daysBetween(d1, d2) {
  const diff = d2.getTime() - d1.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function LibraryPage() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState([]);
  const [issuedBooks, setIssuedBooks] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setStudentData(snap.data());
      } catch (err) { console.error(err); }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!studentData) return;
    const { regNo } = studentData;
    if (!regNo) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    const fetchData = async () => {
      try {
        const [booksSnap, issuesSnap] = await Promise.all([
          getDocs(collection(db, "books")),
          getDocs(collection(db, "book_issues")),
        ]);

        const bookList = [];
        booksSnap.forEach((d) => bookList.push({ id: d.id, ...d.data() }));
        setBooks(bookList);

        const issues = [];
        issuesSnap.forEach((d) => {
          const data = d.data();
          if (data.regNo === regNo || data.studentRegNo === regNo || data.studentId === regNo) {
            const dueDate = data.dueDate?.toDate ? data.dueDate.toDate() : data.dueDate ? new Date(data.dueDate) : null;
            const today = new Date();
            const overdue = dueDate ? daysBetween(dueDate, today) : 0;
            issues.push({
              id: d.id,
              ...data,
              bookTitle: data.bookTitle || data.title || "-",
              bookAuthor: data.bookAuthor || data.author || "-",
              issueDate: data.issueDate?.toDate ? data.issueDate.toDate() : data.issueDate,
              dueDate,
              overdue: overdue > 0 ? overdue : 0,
              fine: overdue > 0 ? overdue * (data.finePerDay || 1) : 0,
            });
          }
        });
        setIssuedBooks(issues);
      } catch (err) { console.error(err); }
      setLoading(false);
    };

    fetchData();
  }, [studentData]);

  const filteredBooks = useMemo(() => {
    if (!search.trim()) return [];
    const s = search.toLowerCase();
    return books.filter(
      (b) =>
        (b.title || "").toLowerCase().includes(s) ||
        (b.isbn || "").toLowerCase().includes(s) ||
        (b.author || "").toLowerCase().includes(s)
    ).slice(0, 20);
  }, [books, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-[#120c7a]" size={40} />
      </div>
    );
  }

  if (!studentData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-red-400" />
        <p className="text-lg font-bold text-slate-500">Unable to load student data</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-[#120c7a] px-4 md:px-8 py-5">
              <h2 className="text-white font-bold text-xl flex items-center gap-3">
                <Search size={20} /> Search Books
              </h2>
            </div>
            <div className="p-6">
              <div className="relative mb-6">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title, author, or ISBN..."
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#120c7a]/20"
                />
              </div>

              {search && filteredBooks.length === 0 && (
                <div className="py-8 text-center">
                  <BookOpen size={36} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-sm font-medium text-slate-400">No books found matching your search.</p>
                </div>
              )}

              {filteredBooks.length > 0 && (
                <div className="space-y-3">
                  {filteredBooks.map((book) => (
                    <div key={book.id} className="flex flex-wrap items-start justify-between gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-[#120c7a]/20 transition-all">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800">{book.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{book.author || "Unknown Author"}</p>
                        <div className="flex items-center gap-3 mt-2">
                          {book.isbn && <span className="text-[10px] font-mono font-bold text-slate-400">ISBN: {book.isbn}</span>}
                          {book.category && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">
                              {book.category}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-4 shrink-0">
                        {(book.availableCopies ?? book.totalCopies ?? 0) > 0 ? (
                          <span className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                            Available
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                            Issued
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!search && (
                <div className="py-8 text-center">
                  <Search size={36} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-sm font-medium text-slate-400">Type a keyword to search the catalog.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-[#120c7a] px-4 md:px-8 py-5 flex items-center gap-3">
              <BookOpen size={20} className="text-white" />
              <h2 className="text-white font-bold text-lg">My Issues</h2>
            </div>
            {issuedBooks.length === 0 ? (
              <div className="py-12 text-center">
                <BookOpen size={36} className="mx-auto text-slate-200 mb-2" />
                <p className="text-sm font-medium text-slate-400">No books issued.</p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {issuedBooks.map((issue) => (
                  <div key={issue.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="font-bold text-slate-800 text-sm">{issue.bookTitle}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{issue.bookAuthor}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Clock size={12} />
                        <span>Issued: {formatDate(issue.issueDate)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs font-bold text-slate-500">
                        Due: {formatDate(issue.dueDate)}
                      </span>
                      {issue.overdue > 0 ? (
                        <span className="text-xs font-bold flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                          <Clock size={12} /> {issue.overdue}d overdue
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                          On time
                        </span>
                      )}
                    </div>
                    {issue.fine > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">
                        <IndianRupee size={12} /> Fine: ₹{issue.fine}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
