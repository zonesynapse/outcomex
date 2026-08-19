import React, { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { collection, onSnapshot, updateDoc, doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Building2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  Search,
  SlidersHorizontal,
  Calendar,
  Clock,
  User,
  MessageSquare,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Award
} from "lucide-react";
import Layout from "../../components/Layout";

export default function ResourceApprovals() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Revoke / Reject Modal State
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [selectedBookingForAction, setSelectedBookingForAction] = useState(null);
  const [actionType, setActionType] = useState("Reject"); // "Reject" or "Revoke"
  const [revocationReason, setRevocationReason] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const uSnap = await getDoc(doc(db, "users", u.uid));
          if (uSnap.exists()) setUserData(uSnap.data());
        } catch (e) {
          console.error("Error fetching user data:", e);
        }
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "resource_bookings"),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));
        // Sort strictly by FCFS submission timestamp (createdAt asc)
        list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        setBookings(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading booking approvals:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Check if a booking has overlapping time conflicts with another approved or earlier pending request
  const checkConflicts = (currentBooking) => {
    return bookings.filter((b) => {
      if (b.id === currentBooking.id) return false;
      if (b.resourceId !== currentBooking.resourceId) return false;
      if (b.bookingDate !== currentBooking.bookingDate) return false;
      if (b.status === "Rejected" || b.status === "Revoked" || b.status === "Cancelled") return false;

      // Check time overlap
      const isOverlap = currentBooking.startTime < b.endTime && currentBooking.endTime > b.startTime;
      return isOverlap;
    });
  };

  const handleApproveBooking = async (b) => {
    const conflicts = checkConflicts(b);
    const approvedConflict = conflicts.find((c) => c.status === "Approved");

    if (approvedConflict) {
      alert(
        `Cannot approve: Slot is already APPROVED for "${approvedConflict.requesterName}" (${approvedConflict.startTime} - ${approvedConflict.endTime}). You must revoke that booking first if you wish to re-assign it.`
      );
      return;
    }

    if (!window.confirm(`Approve booking for "${b.resourceName}" requested by ${b.requesterName}?`)) return;

    try {
      await updateDoc(doc(db, "resource_bookings", b.id), {
        status: "Approved",
        reviewedBy: user?.uid || "system",
        reviewedByName: userData?.displayName || userData?.facultyName || user?.email || "Manager",
        reviewedAt: new Date().toISOString()
      });
      triggerToast(`Booking approved for ${b.requesterName}!`);
    } catch (err) {
      console.error("Failed to approve booking:", err);
      alert("Error approving booking.");
    }
  };

  const handleOpenActionModal = (b, type) => {
    setSelectedBookingForAction(b);
    setActionType(type);
    setRevocationReason("");
    setActionModalOpen(true);
  };

  const handleConfirmRejectOrRevoke = async (e) => {
    e.preventDefault();
    if (!selectedBookingForAction) return;

    if (!revocationReason.trim()) {
      alert(`Mandatory: Please type the reason for ${actionType === "Revoke" ? "revoking this approved booking" : "rejecting this request"}.`);
      return;
    }

    setActionSubmitting(true);
    try {
      const payload = {
        status: actionType === "Revoke" ? "Revoked" : "Rejected",
        revocationReason: revocationReason.trim(),
        reviewedBy: user?.uid || "system",
        reviewedByName: userData?.displayName || userData?.facultyName || user?.email || "Manager",
        reviewedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, "resource_bookings", selectedBookingForAction.id), payload);
      triggerToast(
        actionType === "Revoke"
          ? `Approved booking revoked with specified reason.`
          : `Request rejected with specified reason.`
      );
      setActionModalOpen(false);
      setSelectedBookingForAction(null);
    } catch (err) {
      console.error(`Failed to ${actionType} booking:`, err);
      alert(`Error processing ${actionType}.`);
    } finally {
      setActionSubmitting(false);
    }
  };

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  };

  const categories = ["All", ...Array.from(new Set(bookings.map((b) => b.category)))];

  const filteredBookings = bookings.filter((b) => {
    const matchesSearch =
      b.resourceName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.requesterName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.reason?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "All" || b.status === statusFilter;
    const matchesCategory = selectedCategory === "All" || b.category === selectedCategory;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  return (
    <Layout title="Resource Booking Approvals">
      <div className="p-4 md:p-8 w-full space-y-6">
        {/* Toast Notification */}
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
            <div className="inline-flex items-center gap-2 bg-blue-400/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase text-blue-200 border border-blue-300/30">
              <Sparkles size={14} className="text-blue-300 animate-pulse" /> First-Come First-Serve (FCFS) Queue
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Resource Request Approvals</h1>
            <p className="text-blue-100/90 text-xs md:text-sm max-w-2xl leading-relaxed font-medium">
              Review resource requests sorted by submission timestamp. Approve allocations or revoke/reject bookings with mandatory revocation reasoning.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-100 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search by resource, requester name, or reason..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 shrink-0">
              <SlidersHorizontal size={14} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500">Status:</span>
              {["Pending", "Approved", "Revoked", "Rejected", "Cancelled", "All"].map((st) => (
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
        </div>

        {/* Approvals Queue */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-[3px] border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-400">Loading FCFS approval queue...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 border border-slate-100 shadow-sm text-center flex flex-col items-center justify-center gap-3">
            <div className="p-4 rounded-2xl bg-indigo-50 text-indigo-500 mb-2">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="text-base font-bold text-slate-800">No Requests to Review</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              There are no resource requests in the "{statusFilter}" queue matching your search filters.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((b, index) => {
              const conflicts = checkConflicts(b);
              const approvedConflict = conflicts.find((c) => c.status === "Approved");
              const earlierPendingConflict = conflicts.find((c) => c.status === "Pending" && new Date(c.createdAt) < new Date(b.createdAt));

              return (
                <div
                  key={b.id}
                  className="bg-white rounded-3xl border border-slate-100 p-5 md:p-6 shadow-sm hover:shadow-md transition-all space-y-4 relative overflow-hidden"
                >
                  {/* FCFS Priority Tag */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                          {b.category}
                        </span>
                        <span className="text-xs font-bold text-slate-400">
                          FCFS Priority Timestamp: {new Date(b.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <h3 className="text-lg font-black text-slate-900">{b.resourceName}</h3>
                    </div>

                    <div className="flex items-center gap-2">
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
                        {b.status}
                      </span>
                    </div>
                  </div>

                  {/* Requester & Slot Info */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-semibold">
                    <div className="flex items-center gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <User size={16} className="text-indigo-600 shrink-0" />
                      <div className="truncate">
                        <span className="block text-[9px] font-bold uppercase text-slate-400">Requester</span>
                        <span className="text-slate-800 font-extrabold truncate block">{b.requesterName}</span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {b.requesterRole} {b.requesterDept ? `(${b.requesterDept})` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <Calendar size={16} className="text-indigo-600 shrink-0" />
                      <div>
                        <span className="block text-[9px] font-bold uppercase text-slate-400">Booking Date</span>
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
                      <Award size={16} className="text-indigo-600 shrink-0" />
                      <div>
                        <span className="block text-[9px] font-bold uppercase text-slate-400">Attendees</span>
                        <span className="text-slate-800 font-extrabold">
                          {b.attendeeCount > 0 ? `${b.attendeeCount} Persons` : "Not specified"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Conflict Notice if any */}
                  {approvedConflict ? (
                    <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl flex items-center gap-2 text-rose-800 text-xs font-bold">
                      <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                      <span>
                        Conflict Warning: Slot is ALREADY APPROVED for "{approvedConflict.requesterName}" ({approvedConflict.startTime} - {approvedConflict.endTime}).
                      </span>
                    </div>
                  ) : earlierPendingConflict ? (
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex items-center gap-2 text-amber-800 text-xs font-bold">
                      <AlertCircle size={16} className="text-amber-600 shrink-0" />
                      <span>
                        FCFS Conflict: Earlier request submitted by "{earlierPendingConflict.requesterName}" at {new Date(earlierPendingConflict.createdAt).toLocaleTimeString()}.
                      </span>
                    </div>
                  ) : null}

                  {/* Purpose / Reason */}
                  {b.reason && (
                    <div className="bg-slate-50/60 p-3.5 rounded-2xl border border-slate-100 text-xs">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Booking Purpose / Reason:
                      </span>
                      <p className="text-slate-700 font-medium leading-relaxed">{b.reason}</p>
                    </div>
                  )}

                  {/* Equipment Needed */}
                  {b.amenitiesRequested?.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Requested Setup:</span>
                      {b.amenitiesRequested.map((am, i) => (
                        <span key={i} className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-100">
                          {am}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Existing Revocation Reason if already revoked/rejected */}
                  {b.revocationReason && (
                    <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl text-xs space-y-1">
                      <span className="block font-bold text-rose-800">
                        {b.status === "Revoked" ? "Revocation Reason:" : "Rejection Reason:"}
                      </span>
                      <p className="text-rose-900 font-medium leading-relaxed">"{b.revocationReason}"</p>
                      {b.reviewedByName && (
                        <span className="block text-[10px] font-bold text-rose-600">
                          - Reviewed by {b.reviewedByName}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                    {b.status === "Pending" && (
                      <>
                        <button
                          onClick={() => handleOpenActionModal(b, "Reject")}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-all"
                        >
                          Reject Request
                        </button>
                        <button
                          onClick={() => handleApproveBooking(b)}
                          className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md shadow-emerald-200 transition-all flex items-center gap-1.5"
                        >
                          <CheckCircle2 size={14} /> Approve Allocation
                        </button>
                      </>
                    )}

                    {b.status === "Approved" && (
                      <button
                        onClick={() => handleOpenActionModal(b, "Revoke")}
                        className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-rose-200 transition-all flex items-center gap-1.5"
                      >
                        <RotateCcw size={14} /> Revoke Booking
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Mandatory Revocation / Rejection Reason */}
        {actionModalOpen && selectedBookingForAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 md:p-8 shadow-2xl border border-slate-100 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                    <AlertTriangle size={22} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900">
                      {actionType === "Revoke" ? "Revoke Approved Booking" : "Reject Booking Request"}
                    </h2>
                    <p className="text-xs text-slate-400 font-medium">
                      Mandatory reason required for audit & notifications.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActionModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Resource Summary */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs space-y-1">
                <span className="block font-extrabold text-slate-800">{selectedBookingForAction.resourceName}</span>
                <span className="block text-slate-500 font-medium">
                  Requested by: {selectedBookingForAction.requesterName} &bull; {selectedBookingForAction.bookingDate} ({selectedBookingForAction.startTime} - {selectedBookingForAction.endTime})
                </span>
              </div>

              {/* Mandatory Reason Form */}
              <form onSubmit={handleConfirmRejectOrRevoke} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-rose-700 uppercase tracking-wider">
                    Reason for {actionType === "Revoke" ? "Revocation" : "Rejection"} <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder={
                      actionType === "Revoke"
                        ? "Enter reason for revoking (e.g., Mandatory emergency institutional event, venue maintenance)..."
                        : "Enter reason for rejection (e.g., Venue unavailable, invalid purpose)..."
                    }
                    value={revocationReason}
                    onChange={(e) => setRevocationReason(e.target.value)}
                    className="w-full bg-slate-50 border border-rose-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500/40 transition-all resize-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setActionModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionSubmitting}
                    className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-rose-200 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {actionSubmitting && (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    Confirm {actionType}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
