import React, { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Calendar,
  Clock,
  Building2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  Search,
  Filter,
  FileText,
  MessageSquare
} from "lucide-react";
import Layout from "../../components/Layout";

export default function MyBookings() {
  const [user, setUser] = useState(null);
  const [myBookings, setMyBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) setLoading(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "resource_bookings"),
      where("requesterUid", "==", user.uid)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));
        // Sort newest first
        list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setMyBookings(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading my bookings:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user]);

  const handleCancelBooking = async (bookingId, resourceName) => {
    if (!window.confirm(`Are you sure you want to cancel your request for "${resourceName}"?`)) return;

    try {
      await updateDoc(doc(db, "resource_bookings", bookingId), {
        status: "Cancelled",
        cancelledAt: new Date().toISOString()
      });
      triggerToast("Booking request cancelled.");
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      alert("Error cancelling booking.");
    }
  };

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  };

  const filteredBookings = myBookings.filter((b) => {
    const matchesSearch =
      b.resourceName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.reason?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <Layout title="My Resource Bookings">
      <div className="p-4 md:p-8 w-full space-y-6">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-bounce">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span className="text-xs md:text-sm font-bold">{toastMessage}</span>
          </div>
        )}

        {/* Header Banner - Signature Royal Blue Theme matching all pages */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a10a0] to-[#0d095c] p-6 md:p-8 text-white shadow-2xl border border-blue-900/30">
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 opacity-10 pointer-events-none">
            <Building2 size={240} />
          </div>
          <div className="relative z-10 space-y-2">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">My Booking Requests</h1>
            <p className="text-blue-100/90 text-xs md:text-sm max-w-xl leading-relaxed font-medium">
              Track the approval status of your requested campus auditoriums, labs, and equipment. View revocation reasons if a booking was revoked.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search my bookings by resource or reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 shrink-0">
            <Filter size={14} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-500">Status:</span>
            {["All", "Pending", "Approved", "Rejected", "Revoked", "Cancelled"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  statusFilter === st
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Bookings List */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-[3px] border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-400">Loading your bookings...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 border border-slate-100 shadow-sm text-center flex flex-col items-center justify-center gap-3">
            <div className="p-4 rounded-2xl bg-indigo-50 text-indigo-500 mb-2">
              <Calendar size={36} />
            </div>
            <h3 className="text-base font-bold text-slate-800">No Bookings Found</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              You have not submitted any resource requests matching your filter criteria.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((b) => (
              <div
                key={b.id}
                className="bg-white rounded-3xl border border-slate-100 p-5 md:p-6 shadow-sm hover:shadow-md transition-all space-y-4"
              >
                {/* Header Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                        {b.category}
                      </span>
                      <span className="text-xs font-bold text-slate-400">
                        Submitted: {new Date(b.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-slate-900">{b.resourceName}</h3>
                  </div>

                  {/* Status Badge & Actions */}
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                        b.status === "Approved"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : b.status === "Pending"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : b.status === "Revoked" || b.status === "Rejected"
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {b.status === "Approved" ? (
                        <CheckCircle2 size={14} className="text-emerald-500" />
                      ) : b.status === "Pending" ? (
                        <AlertCircle size={14} className="text-amber-500" />
                      ) : b.status === "Revoked" || b.status === "Rejected" ? (
                        <XCircle size={14} className="text-rose-500" />
                      ) : (
                        <X size={14} className="text-slate-400" />
                      )}
                      {b.status}
                    </span>

                    {(b.status === "Pending" || b.status === "Approved") && (
                      <button
                        onClick={() => handleCancelBooking(b.id, b.resourceName)}
                        className="text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-full transition-all"
                      >
                        Cancel Request
                      </button>
                    )}
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-semibold">
                  <div className="flex items-center gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <Calendar size={16} className="text-indigo-600 shrink-0" />
                    <div>
                      <span className="block text-[9px] font-bold uppercase text-slate-400">Date</span>
                      <span className="text-slate-800 font-extrabold">{b.bookingDate}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <Clock size={16} className="text-indigo-600 shrink-0" />
                    <div>
                      <span className="block text-[9px] font-bold uppercase text-slate-400">Time Slot</span>
                      <span className="text-slate-800 font-extrabold">
                        {b.startTime} - {b.endTime}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <FileText size={16} className="text-indigo-600 shrink-0" />
                    <div>
                      <span className="block text-[9px] font-bold uppercase text-slate-400">Attendees</span>
                      <span className="text-slate-800 font-extrabold">
                        {b.attendeeCount > 0 ? `${b.attendeeCount} Persons` : "Not specified"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Purpose / Reason */}
                {b.reason && (
                  <div className="bg-slate-50/60 p-3.5 rounded-2xl border border-slate-100 text-xs">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Reason / Event Details:
                    </span>
                    <p className="text-slate-700 font-medium leading-relaxed">{b.reason}</p>
                  </div>
                )}

                {/* Equipment Badges */}
                {b.amenitiesRequested?.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Requested Equipment:</span>
                    {b.amenitiesRequested.map((am, i) => (
                      <span key={i} className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-100">
                        {am}
                      </span>
                    ))}
                  </div>
                )}

                {/* Prominent Revocation / Rejection Reason Box */}
                {(b.status === "Revoked" || b.status === "Rejected") && b.revocationReason && (
                  <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl space-y-1 text-xs">
                    <div className="flex items-center gap-2 text-rose-800 font-bold">
                      <MessageSquare size={14} className="text-rose-600" />
                      <span>{b.status === "Revoked" ? "Reason for Revocation:" : "Reason for Rejection:"}</span>
                    </div>
                    <p className="text-rose-900 font-semibold pl-6 leading-relaxed">
                      "{b.revocationReason}"
                    </p>
                    {b.reviewedByName && (
                      <span className="block text-[10px] font-bold text-rose-600 pl-6">
                        - By {b.reviewedByName} on {new Date(b.reviewedAt).toLocaleDateString("en-IN")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
