import { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { BarChart3, BookOpen, User, Search, Clock, Calendar, IndianRupee, AlertTriangle, CheckCircle2 } from "lucide-react";
import Layout from "../components/Layout";

export default function LibraryReports() {
  const [tab, setTab] = useState("overdue");
  const [issues, setIssues] = useState([]);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberHistory, setMemberHistory] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "book_issues"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), id: d.id }));
      setIssues(list);
      setLoading(false);
    });
    const unsubBooks = onSnapshot(collection(db, "books"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), id: d.id }));
      setBooks(list);
    });
    return () => { unsub(); unsubBooks(); };
  }, []);

  const bookMap = useMemo(() => {
    const m = {}; books.forEach(b => { m[b.id] = b; }); return m;
  }, [books]);

  const now = new Date();

  // Overdue issues: not returned and past due date
  const overdueIssues = useMemo(() => {
    return issues.filter(i => i.status === "issued" || i.status === "overdue").filter(i => {
      const due = i.dueDate?.toDate ? i.dueDate.toDate() : new Date(i.dueDate);
      return now > due;
    }).sort((a, b) => {
      const da = a.dueDate?.toDate ? a.dueDate.toDate() : new Date(a.dueDate);
      const db = b.dueDate?.toDate ? b.dueDate.toDate() : new Date(b.dueDate);
      return da - db;
    });
  }, [issues, now]);

  // Currently issued (all active)
  const activeIssues = useMemo(() => {
    return issues.filter(i => i.status === "issued" || i.status === "overdue")
      .sort((a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0));
  }, [issues]);

  // Handle member history search
  const handleSearchMember = async (searchTerm) => {
    if (!searchTerm.trim()) { setMemberHistory(null); return; }
    const s = searchTerm.toLowerCase();
    const memberIssues = issues.filter(i =>
      (i.memberName || "").toLowerCase().includes(s) ||
      (i.memberEmail || "").toLowerCase().includes(s)
    ).sort((a, b) => (b.issueDate?.seconds || 0) - (a.issueDate?.seconds || 0));

    if (memberIssues.length === 0) {
      setMemberHistory({ empty: true, search: searchTerm });
    } else {
      setMemberHistory({ data: memberIssues, search: searchTerm, memberName: memberIssues[0].memberName, memberEmail: memberIssues[0].memberEmail });
    }
  };

  const formatDate = (d) => {
    if (!d) return "—";
    const date = d.toDate ? d.toDate() : new Date(d);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const daysOverdue = (dueDate) => {
    const due = dueDate?.toDate ? dueDate.toDate() : new Date(dueDate);
    return Math.max(0, Math.ceil((now - due) / (1000 * 60 * 60 * 24)));
  };

  if (loading) {
    return (
      <Layout title="Library - Reports">
        <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]"></div></div>
      </Layout>
    );
  }

  return (
    <Layout title="Library - Overdue & Reports">
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
          <div className="bg-[#120c7a] px-6 py-4 flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-lg"><BarChart3 size={22} className="text-white" /></div>
            <div>
              <h4 className="text-white font-bold text-lg">Reports & Analytics</h4>
              <p className="text-blue-100 text-xs opacity-80">Overdue books, active issues, and member history</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-zinc-50 border-b border-zinc-200">
            <button onClick={() => setTab("overdue")} className={`flex-1 px-4 py-3 text-[11px] font-bold text-center transition-all ${tab === "overdue" ? "bg-white text-[#120c7a] border-b-2 border-[#120c7a]" : "text-zinc-500 hover:text-zinc-700"}`}>
              <AlertTriangle size={14} className="inline mr-1.5" />Overdue
            </button>
            <button onClick={() => setTab("active")} className={`flex-1 px-4 py-3 text-[11px] font-bold text-center transition-all ${tab === "active" ? "bg-white text-[#120c7a] border-b-2 border-[#120c7a]" : "text-zinc-500 hover:text-zinc-700"}`}>
              <BookOpen size={14} className="inline mr-1.5" />Currently Issued
            </button>
            <button onClick={() => setTab("history")} className={`flex-1 px-4 py-3 text-[11px] font-bold text-center transition-all ${tab === "history" ? "bg-white text-[#120c7a] border-b-2 border-[#120c7a]" : "text-zinc-500 hover:text-zinc-700"}`}>
              <User size={14} className="inline mr-1.5" />Member History
            </button>
          </div>

          {tab === "overdue" && (
            <div className="p-6">
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3">
                <AlertTriangle size={18} className="text-red-600 shrink-0" />
                <p className="text-sm font-medium text-red-800">
                  {overdueIssues.length} book{overdueIssues.length !== 1 ? "s are" : " is"} overdue. Total estimated fine: <strong>₹{overdueIssues.reduce((sum, i) => {
                    const days = daysOverdue(i.dueDate);
                    const book = bookMap[i.bookId];
                    const finePerDay = 5;
                    return sum + (days * finePerDay);
                  }, 0)}</strong>
                </p>
              </div>

              {overdueIssues.length === 0 ? (
                <div className="p-10 text-center">
                  <CheckCircle2 size={40} className="mx-auto mb-3 text-emerald-300" />
                  <p className="text-zinc-500 font-medium">No overdue books</p>
                  <p className="text-zinc-400 text-sm">All books have been returned on time.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200">
                        <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Member</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Book</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Issue Date</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Due Date</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Days Overdue</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Fine (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {overdueIssues.map(issue => {
                        const days = daysOverdue(issue.dueDate);
                        const book = bookMap[issue.bookId];
                        const finePerDay = 5;
                        const fine = days * finePerDay;
                        return (
                          <tr key={issue.id} className="hover:bg-red-50/30 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-bold text-sm text-zinc-800">{issue.memberName}</p>
                              <p className="text-[10px] text-zinc-400">{issue.memberEmail}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-sm text-zinc-700">{issue.bookTitle}</p>
                              {issue.isbn && <p className="text-[10px] text-zinc-400">ISBN: {issue.isbn}</p>}
                            </td>
                            <td className="px-4 py-3 text-sm text-zinc-600">{formatDate(issue.issueDate)}</td>
                            <td className="px-4 py-3 text-sm text-zinc-600">{formatDate(issue.dueDate)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-[11px] font-bold">{days}d</span>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-red-600">₹{fine}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "active" && (
            <div className="p-6">
              <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-blue-50 rounded-xl text-center">
                  <p className="text-2xl font-black text-blue-700">{activeIssues.length}</p>
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Active Issues</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl text-center">
                  <p className="text-2xl font-black text-emerald-700">{activeIssues.filter(i => i.status === "issued").length}</p>
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">On Time</p>
                </div>
                <div className="p-3 bg-red-50 rounded-xl text-center">
                  <p className="text-2xl font-black text-red-700">{activeIssues.filter(i => i.status === "overdue").length}</p>
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Overdue</p>
                </div>
              </div>

              {activeIssues.length === 0 ? (
                <div className="p-10 text-center">
                  <BookOpen size={40} className="mx-auto mb-3 text-zinc-300" />
                  <p className="text-zinc-500 font-medium">No books currently issued</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200">
                        <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Member</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Book</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Issued</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Due</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {activeIssues.map(issue => {
                        const due = issue.dueDate?.toDate ? issue.dueDate.toDate() : new Date(issue.dueDate);
                        const isOverdue = now > due;
                        return (
                          <tr key={issue.id} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-bold text-sm text-zinc-800">{issue.memberName}</p>
                              <p className="text-[10px] text-zinc-400">{issue.memberEmail}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-sm text-zinc-700">{issue.bookTitle}</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-zinc-600">{formatDate(issue.issueDate)}</td>
                            <td className="px-4 py-3 text-sm text-zinc-600">{formatDate(issue.dueDate)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isOverdue ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                                {isOverdue ? "Overdue" : "Active"}
                              </span>
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

          {tab === "history" && (
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                  <Search size={14} /> Search Member
                </label>
                <div className="flex gap-2">
                  <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearchMember(memberSearch)} placeholder="Search by member name or email..." className="flex-1 max-w-md px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm" />
                  <button onClick={() => handleSearchMember(memberSearch)} className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-800 transition-all">Search</button>
                </div>
              </div>

              {memberHistory === null ? (
                <div className="p-10 text-center text-zinc-400">
                  <User size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Search a member to see their borrowing history</p>
                </div>
              ) : memberHistory.empty ? (
                <div className="p-10 text-center text-zinc-400">
                  <Search size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No records found for "{memberHistory.search}"</p>
                </div>
              ) : (
                <div>
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl mb-4">
                    <p className="font-bold text-blue-900">{memberHistory.memberName}</p>
                    <p className="text-sm text-blue-600">{memberHistory.memberEmail}</p>
                    <p className="text-[10px] text-blue-500 mt-1">{memberHistory.data.length} total transaction(s)</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200">
                          <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Book</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Issue Date</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Return Date</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Status</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Fine (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {memberHistory.data.map(issue => (
                          <tr key={issue.id} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium text-sm text-zinc-700">{issue.bookTitle}</p>
                              {issue.isbn && <p className="text-[10px] text-zinc-400">ISBN: {issue.isbn}</p>}
                            </td>
                            <td className="px-4 py-3 text-sm text-zinc-600">{formatDate(issue.issueDate)}</td>
                            <td className="px-4 py-3 text-sm text-zinc-600">{issue.returnDate ? formatDate(issue.returnDate) : <span className="text-amber-600 font-medium">Not returned</span>}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                issue.status === "returned" ? 'bg-emerald-50 text-emerald-700' :
                                issue.status === "overdue" ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'
                              }`}>
                                {issue.status === "returned" ? "Returned" : issue.status === "overdue" ? "Overdue" : "Issued"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-zinc-700">{issue.fine ? `₹${issue.fine}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
