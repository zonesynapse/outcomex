import React, { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { collection, onSnapshot, addDoc, query, where, getDoc, doc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  X,
  Search,
  Send,
  Users,
  MapPin,
  Sparkles,
  MessageSquare
} from "lucide-react";
import StudentLayout from "../../components/student/StudentLayout";

export default function StudentResourceHub() {
  const [user, setUser] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [resources, setResources] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("catalog"); // "catalog" or "my-requests"

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Booking Modal State
  const [selectedResource, setSelectedResource] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Form State
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
          const sSnap = await getDoc(doc(db, "users", u.uid));
          if (sSnap.exists()) setStudentData(sSnap.data());
        } catch (e) {
          console.error("Error fetching student profile:", e);
        }
      }
    });
    return () => unsubAuth();
  }, []);

  // Fetch Available Resources
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

  // Fetch My Student Bookings
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "resource_bookings"),
      where("requesterUid", "==", user.uid)
    );
    const unsubBookings = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setMyBookings(list);
    });
    return () => unsubBookings();
  }, [user]);

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

  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    if (!selectedResource || !bookingDate || !startTime || !endTime || !reason.trim()) {
      alert("Please fill in Date, Start Time, End Time, and Purpose for booking.");
      return;
    }

    if (startTime >= endTime) {
      alert("End Time must be after Start Time.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        resourceId: selectedResource.id,
        resourceName: selectedResource.name,
        category: selectedResource.category,
        location: selectedResource.location,
        requesterUid: user?.uid || "student",
        requesterName: studentData?.name || studentData?.displayName || user?.email || "Student",
        requesterEmail: user?.email || "",
        requesterRole: "Student",
        requesterDept: studentData?.department || studentData?.dept || "",
        bookingDate,
        startTime,
        endTime,
        reason: reason.trim(),
        attendeeCount: attendeeCount ? parseInt(attendeeCount, 10) : 0,
        amenitiesRequested: selectedAmenities,
        status: "Pending",
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, "resource_bookings"), payload);
      triggerToast("Booking request submitted! Waiting for manager approval.");
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
    <StudentLayout title="Resource Hub">
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
          <div className="relative z-10 space-y-3">
            <div className="inline-flex items-center gap-2 bg-blue-400/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase text-blue-200 border border-blue-300/30">
              <Sparkles size={14} className="text-blue-300 animate-pulse" /> Student Resource Hub
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Campus Facilities & Equipment</h1>
            <p className="text-blue-100/90 text-xs md:text-sm max-w-2xl leading-relaxed font-medium">
              Request campus auditoriums, computer labs, seminar halls, and projectors for student events, club activities, and workshops.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab("catalog")}
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              activeTab === "catalog"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            Browse Resources
          </button>
          <button
            onClick={() => setActiveTab("my-requests")}
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all relative ${
              activeTab === "my-requests"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            My Requests ({myBookings.length})
          </button>
        </div>

        {/* Tab 1: Catalog */}
        {activeTab === "catalog" && (
          <div className="space-y-6">
            {/* Search & Filter */}
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search resources by venue or location..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto shrink-0">
                <span className="text-xs font-bold text-slate-500">Category:</span>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      selectedCategory === cat
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-50 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Catalog Grid */}
            {loading ? (
              <div className="py-20 text-center text-xs font-bold text-slate-400">Loading catalog...</div>
            ) : filteredResources.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center text-slate-400 text-xs border border-slate-100">
                No resources available matching search.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredResources.map((res) => (
                  <div
                    key={res.id}
                    className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                          {res.category}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          Available
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-extrabold text-slate-900">{res.name}</h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                          <MapPin size={13} className="text-slate-400" />
                          <span>{res.location}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-2xl text-xs">
                        <div>
                          <span className="block text-[9px] font-bold text-slate-400 uppercase">Capacity</span>
                          <span className="font-extrabold text-slate-800">{res.capacity || 0} Seats</span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold text-slate-400 uppercase">Amenities</span>
                          <span className="font-extrabold text-slate-800">{res.amenities?.length || 0} Facilities</span>
                        </div>
                      </div>

                      {res.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{res.description}</p>
                      )}
                    </div>

                    <button
                      onClick={() => handleOpenBookingModal(res)}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-2xl text-xs font-bold shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                    >
                      <Calendar size={14} /> Request Slot
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: My Requests */}
        {activeTab === "my-requests" && (
          <div className="space-y-4">
            {myBookings.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center text-slate-400 text-xs border border-slate-100">
                You haven't submitted any resource requests yet.
              </div>
            ) : (
              myBookings.map((b) => (
                <div
                  key={b.id}
                  className="bg-white rounded-3xl border border-slate-100 p-5 md:p-6 shadow-sm space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {b.category}
                      </span>
                      <h3 className="text-base font-black text-slate-900 mt-1">{b.resourceName}</h3>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                        b.status === "Approved"
                          ? "bg-emerald-50 text-emerald-700"
                          : b.status === "Pending"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-semibold">
                    <div className="bg-slate-50 p-2.5 rounded-xl">
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Date</span>
                      <span className="text-slate-800 font-extrabold">{b.bookingDate}</span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl">
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Time Slot</span>
                      <span className="text-slate-800 font-extrabold">
                        {b.startTime} - {b.endTime}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl">
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Purpose</span>
                      <span className="text-slate-800 font-medium truncate block">{b.reason}</span>
                    </div>
                  </div>

                  {/* Revocation Reason Display */}
                  {(b.status === "Revoked" || b.status === "Rejected") && b.revocationReason && (
                    <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-rose-800">
                        <MessageSquare size={14} className="text-rose-600" />
                        <span>{b.status === "Revoked" ? "Reason for Revocation:" : "Reason for Rejection:"}</span>
                      </div>
                      <p className="text-rose-900 font-medium leading-relaxed pl-5 font-semibold">
                        "{b.revocationReason}"
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Modal: Request Slot */}
        {showModal && selectedResource && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-slate-100 space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900">{selectedResource.name}</h2>
                  <p className="text-xs text-slate-500">{selectedResource.location}</p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitBooking} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase">
                    Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split("T")[0]}
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase">
                      Start Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase">
                      End Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      required
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase">
                    Reason / Purpose <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Event title, club activity, workshop details..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase">
                    Expected Attendees
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 50"
                    value={attendeeCount}
                    onChange={(e) => setAttendeeCount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-200 flex items-center gap-2"
                  >
                    {submitting && (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    Submit Request
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
