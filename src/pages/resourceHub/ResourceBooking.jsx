import React, { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { collection, onSnapshot, addDoc, getDoc, doc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Calendar,
  Clock,
  Building2,
  Users,
  MapPin,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Send,
  X,
  Search,
  SlidersHorizontal,
  Info,
  Layers,
  ChevronRight
} from "lucide-react";
import Layout from "../../components/Layout";

export default function ResourceBooking() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [resources, setResources] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Booking Modal State
  const [selectedResource, setSelectedResource] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Booking Form State
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:00");
  const [reason, setReason] = useState("");
  const [attendeeCount, setAttendeeCount] = useState("");
  const [selectedAmenities, setSelectedAmenities] = useState([]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const userSnap = await getDoc(doc(db, "users", u.uid));
          if (userSnap.exists()) setUserData(userSnap.data());
        } catch (e) {
          console.error("Error fetching user data:", e);
        }
      }
    });
    return () => unsubAuth();
  }, []);

  // Real-time listener for Resources
  useEffect(() => {
    const unsubRes = onSnapshot(collection(db, "resources"), (snapshot) => {
      const list = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => r.status === "Available");
      setResources(list);
      setLoading(false);
    });
    return () => unsubRes();
  }, []);

  // Real-time listener for Bookings (for conflict detection & slot availability)
  useEffect(() => {
    const unsubBookings = onSnapshot(collection(db, "resource_bookings"), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBookings(list);
    });
    return () => unsubBookings();
  }, []);

  const handleOpenBookingModal = (resource) => {
    setSelectedResource(resource);
    setBookingDate(new Date().toISOString().split("T")[0]);
    setStartTime("09:00");
    setEndTime("11:00");
    setReason("");
    setAttendeeCount("");
    setSelectedAmenities([]);
    setShowModal(true);
  };

  const toggleAmenity = (item) => {
    if (selectedAmenities.includes(item)) {
      setSelectedAmenities(selectedAmenities.filter((a) => a !== item));
    } else {
      setSelectedAmenities([...selectedAmenities, item]);
    }
  };

  // Helper: check time overlap between two intervals (date + HH:mm)
  const isTimeOverlapping = (dateA, startA, endA, dateB, startB, endB) => {
    if (dateA !== dateB) return false;
    return startA < endB && endA > startB;
  };

  // Find existing overlapping bookings for the selected resource & date/time
  const getConflicts = () => {
    if (!selectedResource || !bookingDate || !startTime || !endTime) return [];
    return bookings.filter((b) => {
      if (b.resourceId !== selectedResource.id) return false;
      if (b.status === "Rejected" || b.status === "Revoked" || b.status === "Cancelled") return false;
      return isTimeOverlapping(bookingDate, startTime, endTime, b.bookingDate, b.startTime, b.endTime);
    });
  };

  const conflicts = getConflicts();
  const hasApprovedConflict = conflicts.some((c) => c.status === "Approved");
  const hasPendingConflict = conflicts.some((c) => c.status === "Pending");

  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    if (!selectedResource || !bookingDate || !startTime || !endTime || !reason.trim()) {
      alert("Please fill in Date, Start Time, End Time, and Reason for booking.");
      return;
    }

    if (startTime >= endTime) {
      alert("End Time must be after Start Time.");
      return;
    }

    if (hasApprovedConflict) {
      alert("This resource is already APPROVED & BOOKED for the selected time slot. Please choose another slot.");
      return;
    }

    setSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const payload = {
        resourceId: selectedResource.id,
        resourceName: selectedResource.name,
        category: selectedResource.category,
        location: selectedResource.location,
        requesterUid: user?.uid || "anonymous",
        requesterName: userData?.displayName || userData?.facultyName || user?.email || "User",
        requesterEmail: user?.email || "",
        requesterRole: userData?.role || "Faculty",
        requesterDept: userData?.department || userData?.dept || "",
        bookingDate,
        startTime,
        endTime,
        reason: reason.trim(),
        attendeeCount: attendeeCount ? parseInt(attendeeCount, 10) : 0,
        amenitiesRequested: selectedAmenities,
        status: "Pending", // First-Come First-Serve approval queue
        createdAt: nowIso, // Used as priority timestamp for FCFS
        hasConflictWarning: hasPendingConflict
      };

      await addDoc(collection(db, "resource_bookings"), payload);
      triggerToast(
        hasPendingConflict
          ? "Request submitted to FCFS Queue (Pending review with earlier requests)."
          : "Booking request submitted successfully!"
      );
      setShowModal(false);
    } catch (err) {
      console.error("Error submitting booking request:", err);
      alert("Failed to submit request: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  const categories = ["All", ...Array.from(new Set(resources.map((r) => r.category)))];

  const filteredResources = resources.filter((res) => {
    const matchesSearch =
      res.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      res.location?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "All" || res.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <Layout title="Book Resource">
      <div className="p-4 md:p-8 w-full space-y-8 font-sans">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-bounce">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span className="text-xs md:text-sm font-extrabold">{toastMessage}</span>
          </div>
        )}

        {/* Header Banner - Signature Royal Blue Theme matching all pages */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a10a0] to-[#0d095c] p-6 md:p-10 text-white shadow-2xl border border-blue-900/30">
          <div className="absolute top-0 right-0 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none hidden lg:block">
            <Building2 size={260} strokeWidth={1} />
          </div>
          <div className="relative z-10 space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-blue-400/20 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-widest text-blue-200 border border-blue-300/30">
              <Sparkles size={14} className="text-blue-300 animate-pulse" /> First-Come First-Serve Allocation
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Request Campus Resources</h1>
            <p className="text-blue-100/90 text-sm md:text-base font-medium leading-relaxed">
              Browse available auditoriums, labs, seminar halls, and equipment. Select dates and time slots to submit requests for instant FCFS processing.
            </p>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search resources by venue name or location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 shrink-0">
            <SlidersHorizontal size={15} className="text-slate-400 ml-1" />
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mr-1">Category:</span>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                  selectedCategory === cat
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/70"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Resource Catalog Grid */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-[3px] border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-extrabold text-slate-400">Loading catalog...</p>
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 border border-slate-200/80 shadow-sm text-center flex flex-col items-center justify-center gap-3">
            <div className="p-4 rounded-2xl bg-indigo-50 text-indigo-500 mb-2">
              <Building2 size={36} />
            </div>
            <h3 className="text-base font-extrabold text-slate-800">No Resources Available</h3>
            <p className="text-xs text-slate-400 max-w-sm font-medium">
              There are no available campus resources matching your current search criteria.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredResources.map((res) => (
              <div
                key={res.id}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col justify-between group"
              >
                <div className="p-6 space-y-4">
                  {/* Top Bar */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
                      {res.category}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 size={12} className="text-emerald-500" /> Available
                    </span>
                  </div>

                  {/* Title & Location */}
                  <div>
                    <h3 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors tracking-tight">
                      {res.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mt-1">
                      <MapPin size={14} className="text-slate-400 shrink-0" />
                      <span>{res.location}</span>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100/80 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-white rounded-xl shadow-xs text-indigo-600">
                        <Users size={14} />
                      </div>
                      <div>
                        <span className="block text-[9px] font-extrabold uppercase text-slate-400">Capacity</span>
                        <span className="font-extrabold text-slate-900">
                          {res.capacity > 0 ? `${res.capacity} Seats` : "N/A"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-white rounded-xl shadow-xs text-indigo-600">
                        <Sparkles size={14} />
                      </div>
                      <div>
                        <span className="block text-[9px] font-extrabold uppercase text-slate-400">Amenities</span>
                        <span className="font-extrabold text-slate-900">
                          {res.amenities?.length || 0} Facilities
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {res.description && (
                    <p className="text-xs text-slate-500 font-medium line-clamp-2 leading-relaxed">
                      {res.description}
                    </p>
                  )}

                  {/* Amenities Badges */}
                  {res.amenities?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {res.amenities.slice(0, 4).map((am, i) => (
                        <span key={i} className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md">
                          {am}
                        </span>
                      ))}
                      {res.amenities.length > 4 && (
                        <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                          +{res.amenities.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Action */}
                <div className="p-5 bg-slate-50/60 border-t border-slate-100">
                  <button
                    onClick={() => handleOpenBookingModal(res)}
                    className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white py-3 rounded-2xl text-xs font-extrabold shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                  >
                    <Calendar size={15} /> Request Booking Slot
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: Request Slot */}
        {showModal && selectedResource && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-slate-100 space-y-6 max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                    <Building2 size={22} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">{selectedResource.name}</h2>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                      {selectedResource.location} &bull; Capacity: {selectedResource.capacity || 0} Seats
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Real-time FCFS Conflict Warning Box */}
              {hasApprovedConflict ? (
                <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-start gap-3 text-rose-800 text-xs">
                  <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Slot Unavailable (Already Booked)</strong>
                    <span className="font-medium">An approved booking already occupies this resource during the selected date and time.</span>
                  </div>
                </div>
              ) : hasPendingConflict ? (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3 text-amber-800 text-xs">
                  <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Earlier Pending Request Exists (FCFS)</strong>
                    <span className="font-medium">Another user has requested this slot. Your request will enter the FCFS queue behind earlier submissions.</span>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl flex items-center gap-2 text-emerald-800 text-xs font-extrabold">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>Slot is currently available for instant FCFS queueing!</span>
                </div>
              )}

              {/* Booking Form */}
              <form onSubmit={handleSubmitBooking} className="space-y-4">
                {/* Date Input */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                    Booking Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split("T")[0]}
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer"
                  />
                </div>

                {/* Time Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                      Start Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                      End Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      required
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer"
                    />
                  </div>
                </div>

                {/* Purpose / Reason */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                    Reason / Purpose of Booking <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Provide details about the event, workshop, guest lecture, or activity..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all resize-none"
                  />
                </div>

                {/* Attendee Count */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                    Expected Number of Attendees
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 150"
                    value={attendeeCount}
                    onChange={(e) => setAttendeeCount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                  />
                </div>

                {/* Special Equipment Checkboxes */}
                {selectedResource.amenities?.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                      Select Required Equipment / Setup
                    </label>
                    <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto p-2.5 bg-slate-50 border border-slate-200 rounded-2xl">
                      {selectedResource.amenities.map((am) => {
                        const isChecked = selectedAmenities.includes(am);
                        return (
                          <button
                            type="button"
                            key={am}
                            onClick={() => toggleAmenity(am)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${
                              isChecked
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {isChecked ? "✓ " : "+ "} {am}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Modal Footer */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-3 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || hasApprovedConflict}
                    className="bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white px-6 py-3 rounded-2xl text-xs font-extrabold shadow-md shadow-indigo-200 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send size={15} />
                    )}
                    Submit Request
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
