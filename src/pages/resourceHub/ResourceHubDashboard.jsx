import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { db, auth } from "../../firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  ClipboardList,
  SlidersHorizontal,
  Sparkles,
  ArrowRight,
  UserCheck,
  RotateCcw,
  Users,
  MapPin,
  CalendarX2,
  Inbox,
  ChevronRight,
  ShieldCheck,
  Layers
} from "lucide-react";
import Layout from "../../components/Layout";

export default function ResourceHubDashboard() {
  const [user, setUser] = useState(null);
  const [resources, setResources] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const unsubRes = onSnapshot(collection(db, "resources"), (snapshot) => {
      setResources(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubBookings = onSnapshot(collection(db, "resource_bookings"), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setBookings(list);
      setLoading(false);
    });

    return () => {
      unsubRes();
      unsubBookings();
    };
  }, []);

  const todayStr = new Date().toISOString().split("T")[0];

  const totalResourcesCount = resources.length;
  const availableResourcesCount = resources.filter((r) => r.status === "Available").length;
  const todayBookings = bookings.filter((b) => b.bookingDate === todayStr && b.status === "Approved");
  const pendingRequestsCount = bookings.filter((b) => b.status === "Pending").length;
  const revokedCount = bookings.filter((b) => b.status === "Revoked" || b.status === "Rejected").length;

  return (
    <Layout title="Resource Hub Overview">
      <div className="p-4 md:p-8 w-full space-y-8 font-sans">
        {/* Header Banner - Signature Royal Blue Theme matching all pages */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a10a0] to-[#0d095c] p-6 md:p-10 text-white shadow-2xl border border-blue-900/30">
          {/* Ambient Radial Glows */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-indigo-400/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none hidden lg:block">
            <Building2 size={260} strokeWidth={1} />
          </div>

          <div className="relative z-10 space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-widest bg-blue-400/20 text-blue-200 border border-blue-300/30 backdrop-blur-md">
              <Sparkles size={14} className="text-blue-300 animate-pulse" /> Campus Infrastructure Hub
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Resource Hub Dashboard
            </h1>
            <p className="text-blue-100/90 text-sm md:text-base font-medium max-w-2xl leading-relaxed">
              Manage campus auditoriums, computer labs, seminar halls, and equipment using a First-Come First-Serve (FCFS) booking system with automated conflict resolution.
            </p>
          </div>
        </div>

        {/* Quick Action Navigation Grid - Premium Interactive Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Action Card 1: Request Booking (Featured Brand Gradient) */}
          <Link
            to="/resource-hub/booking"
            className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a10a0] to-[#100b6e] p-6 text-white shadow-lg shadow-blue-950/20 hover:shadow-2xl hover:shadow-blue-900/40 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between border border-blue-400/30 no-underline [&_*]:!no-underline"
          >
            <div className="flex items-center justify-between">
              <div className="p-3.5 bg-white/20 backdrop-blur-md rounded-2xl border border-white/20 shadow-inner">
                <Calendar size={22} className="text-white" />
              </div>
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-[#120c7a] text-white transition-all duration-300 shadow-sm">
                <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform duration-300" />
              </div>
            </div>
            <div className="mt-8 space-y-1.5">
              <h3 className="text-xl font-extrabold tracking-tight">Request Booking</h3>
              <p className="text-blue-100/90 text-xs font-medium leading-normal">
                Browse catalog & check real-time slot availability
              </p>
            </div>
          </Link>

          {/* Action Card 2: My Requests */}
          <Link
            to="/resource-hub/my-bookings"
            className="group rounded-3xl bg-white p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 border border-slate-200/80 transition-all duration-300 flex flex-col justify-between no-underline [&_*]:!no-underline"
          >
            <div className="flex items-center justify-between">
              <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                <ClipboardList size={22} />
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-50 group-hover:bg-indigo-50 text-slate-400 group-hover:text-indigo-600 flex items-center justify-center transition-all duration-300">
                <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform duration-300" />
              </div>
            </div>
            <div className="mt-8 space-y-1.5">
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight group-hover:text-indigo-600 transition-colors">
                My Requests
              </h3>
              <p className="text-slate-500 text-xs font-medium leading-normal">
                View booking status & manager revocation reasons
              </p>
            </div>
          </Link>

          {/* Action Card 3: Approvals & FCFS Queue */}
          <Link
            to="/resource-hub/approvals"
            className="group rounded-3xl bg-white p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 border border-slate-200/80 transition-all duration-300 flex flex-col justify-between no-underline [&_*]:!no-underline"
          >
            <div className="flex items-center justify-between">
              <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-500 group-hover:text-white transition-colors duration-300 relative">
                <UserCheck size={22} />
                {pendingRequestsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow-md border-2 border-white">
                    {pendingRequestsCount}
                  </span>
                )}
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-50 group-hover:bg-amber-50 text-slate-400 group-hover:text-amber-600 flex items-center justify-center transition-all duration-300">
                <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform duration-300" />
              </div>
            </div>
            <div className="mt-8 space-y-1.5">
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight group-hover:text-amber-600 transition-colors">
                Approvals & FCFS
              </h3>
              <p className="text-slate-500 text-xs font-medium leading-normal">
                Review FCFS queue & approve/revoke bookings
              </p>
            </div>
          </Link>

          {/* Action Card 4: Resource Config */}
          <Link
            to="/resource-hub/manage"
            className="group rounded-3xl bg-white p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 border border-slate-200/80 transition-all duration-300 flex flex-col justify-between no-underline [&_*]:!no-underline"
          >
            <div className="flex items-center justify-between">
              <div className="p-3.5 bg-slate-100 text-slate-700 rounded-2xl group-hover:bg-slate-900 group-hover:text-white transition-colors duration-300">
                <SlidersHorizontal size={22} />
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-50 group-hover:bg-slate-100 text-slate-400 group-hover:text-slate-800 flex items-center justify-center transition-all duration-300">
                <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform duration-300" />
              </div>
            </div>
            <div className="mt-8 space-y-1.5">
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight group-hover:text-slate-900 transition-colors">
                Resource Config
              </h3>
              <p className="text-slate-500 text-xs font-medium leading-normal">
                Configure auditoriums, labs & capacity status
              </p>
            </div>
          </Link>
        </div>

        {/* Metric Cards - Sleek Modern Stat Blocks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Metric 1 */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Total Resources</span>
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <Building2 size={20} />
              </div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                {totalResourcesCount}
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100">
                <CheckCircle2 size={12} className="text-emerald-500" /> {availableResourcesCount} Available
              </span>
            </div>
          </div>

          {/* Metric 2 */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Approved Today</span>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <CheckCircle2 size={20} />
              </div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                {todayBookings.length}
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                Active Bookings ({todayStr})
              </span>
            </div>
          </div>

          {/* Metric 3 */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Pending FCFS</span>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                <AlertCircle size={20} />
              </div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                {pendingRequestsCount}
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-100">
                <Clock size={12} className="text-amber-500" /> Awaiting Review
              </span>
            </div>
          </div>

          {/* Metric 4 */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Revoked / Rejected</span>
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                <RotateCcw size={20} />
              </div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                {revokedCount}
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                With Reason History Log
              </span>
            </div>
          </div>
        </div>

        {/* Today's Schedule & Recent Activity Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Today's Schedule Panel */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <Clock size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Today's Schedule</h2>
                  <p className="text-xs text-slate-400 font-medium">Approved allocations for {todayStr}</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-indigo-50 text-indigo-700 font-extrabold text-xs rounded-full border border-indigo-100">
                {todayBookings.length} Bookings
              </span>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-bold text-slate-400">Loading schedule...</p>
              </div>
            ) : todayBookings.length === 0 ? (
              <div className="py-12 px-4 rounded-2xl bg-slate-50/70 border border-dashed border-slate-200 text-center flex flex-col items-center justify-center gap-2">
                <div className="p-3 bg-white text-slate-300 rounded-2xl shadow-xs">
                  <CalendarX2 size={28} />
                </div>
                <h4 className="text-sm font-bold text-slate-700 mt-1">No Active Bookings Today</h4>
                <p className="text-xs text-slate-400 max-w-xs">
                  There are no approved resource allocations scheduled for today ({todayStr}).
                </p>
                <Link
                  to="/resource-hub/booking"
                  className="mt-2 text-xs font-extrabold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
                >
                  Request a Slot <ChevronRight size={14} />
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {todayBookings.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100 flex items-center justify-between gap-4 hover:border-slate-200 transition-all"
                  >
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-100/70 px-2.5 py-0.5 rounded-full border border-indigo-200/50">
                        {b.resourceName}
                      </span>
                      <h4 className="text-xs font-extrabold text-slate-800">{b.reason || "Event"}</h4>
                      <p className="text-[11px] text-slate-500 font-semibold">
                        Requested by: <span className="text-slate-700 font-bold">{b.requesterName}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-black text-indigo-600 block">
                        {b.startTime} - {b.endTime}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full inline-block mt-1 border border-emerald-100">
                        Approved
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Queue Submissions Panel */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 md:p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Recent FCFS Requests</h2>
                  <p className="text-xs text-slate-400 font-medium">Latest requests submitted to queue</p>
                </div>
              </div>
              <Link
                to="/resource-hub/approvals"
                className="text-xs font-extrabold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 hover:underline"
              >
                View Queue <ChevronRight size={14} />
              </Link>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-bold text-slate-400">Loading activity...</p>
              </div>
            ) : bookings.length === 0 ? (
              <div className="py-12 px-4 rounded-2xl bg-slate-50/70 border border-dashed border-slate-200 text-center flex flex-col items-center justify-center gap-2">
                <div className="p-3 bg-white text-slate-300 rounded-2xl shadow-xs">
                  <Inbox size={28} />
                </div>
                <h4 className="text-sm font-bold text-slate-700 mt-1">No Booking Activity Yet</h4>
                <p className="text-xs text-slate-400 max-w-xs">
                  No resource booking requests have been submitted to the system yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.slice(0, 5).map((b) => (
                  <div
                    key={b.id}
                    className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100 flex items-center justify-between gap-4 hover:border-slate-200 transition-all text-xs"
                  >
                    <div className="space-y-1 truncate">
                      <span className="font-extrabold text-slate-900 text-xs truncate block">{b.resourceName}</span>
                      <span className="text-[11px] text-slate-500 font-semibold block">
                        {b.requesterName} &bull; {b.bookingDate} ({b.startTime} - {b.endTime})
                      </span>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-extrabold shrink-0 ${
                        b.status === "Approved"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                          : b.status === "Pending"
                          ? "bg-amber-50 text-amber-700 border border-amber-100"
                          : "bg-rose-50 text-rose-700 border border-rose-100"
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
