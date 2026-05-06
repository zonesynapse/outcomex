import { useState, useEffect, useMemo } from "react";
import { rtdb, auth } from "../firebase";
import { ref, onValue, set, get, push, remove } from "firebase/database";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  FileText, 
  Download, 
  Clock, 
  MapPin, 
  X,
  CheckCircle2,
  Bell
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Layout from "../components/Layout";
import { formatProgDisplay, formatProgrammeKey, sanitizeKey } from "../lib/utils";
import { useDepartments } from "../hooks/useDepartments";

export default function AcademicCalendar() {
  // Removed Programme, Batch, and Academic Year filter states
  // The calendar now works globally for the institution

  // Calendar Logic States
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState({});
  const [officialDoc, setOfficialDoc] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  
  // Form State
  const [newEvent, setNewEvent] = useState({ title: "", type: "Holiday", description: "", time: "" });
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      get(ref(rtdb, `users/${user.uid}`)).then(snap => {
        if (snap.exists()) setUserRole(snap.val().role);
      });
    }
  }, []);

  const isAdmin = userRole === 'Admin' || userRole === 'HOD';

  // Fetch Data
  useEffect(() => {
    // Fetch Global Institutional Academic Calendar PDF
    const docRef = ref(rtdb, `institutional_academic_calendar/current`);
    const unsubDoc = onValue(docRef, (snap) => setOfficialDoc(snap.val()));

    // Fetch Global Digital Events
    const eventsRef = ref(rtdb, `academic_calendar_events`);
    const unsubEvents = onValue(eventsRef, (snap) => setEvents(snap.val() || {}));
    
    return () => { unsubDoc(); unsubEvents(); };
  }, []);

  // Calendar Helper Functions
  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days = [];
    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);

    // Padding for previous month
    for (let i = 0; i < startDay; i++) days.push(null);
    
    // Actual days
    for (let i = 1; i <= totalDays; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({ day: i, date: dateStr });
    }
    return days;
  }, [currentDate]);

  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const year = currentDate.getFullYear();

  const handleAddEvent = async () => {
    if (!newEvent.title || !selectedDate) return;
    const path = `academic_calendar_events/${selectedDate}`;
    
    const newEventRef = push(ref(rtdb, path));
    await set(newEventRef, { ...newEvent, id: newEventRef.key, createdAt: new Date().toISOString() });
    
    setShowEventModal(false);
    setNewEvent({ title: "", type: "Holiday", description: "", time: "" });
  };

  const handleDeleteEvent = async (date, eventId) => {
    await remove(ref(rtdb, `academic_calendar_events/${date}/${eventId}`));
  };

  const EVENT_TYPES = {
    Holiday: "bg-rose-100 text-rose-700 border-rose-200",
    Exam: "bg-amber-100 text-amber-700 border-amber-200",
    Event: "bg-indigo-100 text-indigo-700 border-indigo-200",
    Academic: "bg-emerald-100 text-emerald-700 border-emerald-200"
  };

  return (
    <Layout title="Academic Calendar">
      <div className="max-w-[1600px] mx-auto p-4 md:p-4 space-y-4">
        
        {/* Simplified Header with only Official Doc link if exists */}
        {officialDoc?.file_url && (
          <div className="flex justify-end pr-4">
            <motion.a 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href={officialDoc.file_url}
                target="_blank"
                className="flex items-center gap-3 bg-[#120c7a] text-white px-6 py-2.5 rounded-2xl font-bold shadow-xl shadow-blue-900/10"
              >
                <FileText size={18} />
                Institutional PDF
                <Download size={14} className="ml-2 opacity-50" />
            </motion.a>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          
          {/* Left: Events & Info Sidebar */}
          <div className="space-y-8">
            <div className="bg-white rounded-[2.5rem] p-6 shadow-xl border border-zinc-100">
              <h3 className="text-lg font-black text-zinc-800 mb-4 flex items-center gap-3">
                <Bell className="text-blue-600" size={24} />
                Upcoming
              </h3>
              <div className="space-y-6">
                {Object.entries(events)
                  .filter(([date]) => new Date(date) >= new Date().setHours(0,0,0,0))
                  .sort(([a], [b]) => a.localeCompare(b))
                  .slice(0, 5)
                  .map(([date, dateEvents]) => (
                    Object.values(dateEvents).map(ev => (
                      <div key={ev.id} className="relative pl-6 border-l-2 border-zinc-100 space-y-1 group">
                        <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50 group-hover:scale-150 transition-transform" />
                        <p className="text-[10px] font-black text-zinc-400 uppercase">{new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
                        <p className="font-bold text-zinc-800 text-sm leading-tight">{ev.title}</p>
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${EVENT_TYPES[ev.type]}`}>{ev.type}</span>
                      </div>
                    ))
                  ))}
                {Object.keys(events).length === 0 && (
                  <div className="text-center py-10">
                    <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-3 text-zinc-300">
                      <CalendarIcon size={24} />
                    </div>
                    <p className="text-xs text-zinc-400 font-medium">No upcoming events listed</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats Card */}
            <div className="bg-gradient-to-br from-[#120c7a] to-blue-800 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-blue-900/40 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16" />
              <h4 className="text-sm font-bold mb-3">Academic Status</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                  <p className="text-[10px] font-bold text-blue-200 uppercase opacity-70">Total Holidays</p>
                  <p className="text-lg font-black">{Object.values(events).flat().filter(e => e.type === 'Holiday').length}</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                  <p className="text-[10px] font-bold text-blue-200 uppercase opacity-70">Working Days</p>
                  <p className="text-lg font-black">22</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Main Digital Calendar */}
          <div className="xl:col-span-3 bg-white rounded-[3rem] shadow-2xl border border-zinc-100 overflow-hidden flex flex-col">
            
            {/* Calendar Controls */}
            <div className="p-4 flex items-center justify-between border-b border-zinc-50 bg-zinc-50/30">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-white rounded-xl shadow-sm border border-zinc-100">
                  <CalendarIcon className="text-blue-600" size={18} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-zinc-800 tracking-tight">{monthName}</h2>
                  <p className="text-zinc-400 font-bold tracking-widest uppercase text-xs">{year}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))}
                  className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors text-zinc-400 hover:text-zinc-800"
                >
                  <ChevronLeft size={24} />
                </button>
                <button 
                  onClick={() => setCurrentDate(new Date())}
                  className="px-6 py-2.5 bg-white border border-zinc-200 rounded-2xl text-sm font-bold text-zinc-600 hover:border-blue-500 hover:text-blue-600 transition-all"
                >
                  Today
                </button>
                <button 
                  onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))}
                  className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors text-zinc-400 hover:text-zinc-800"
                >
                  <ChevronRight size={24} />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 p-4 md:p-4">
              <div className="grid grid-cols-7 gap-1 mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-[10px] font-black text-zinc-400 uppercase tracking-widest py-2">
                    {day}
                  </div>
                ))}
              </div>
              
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((dayObj, idx) => {
                  if (!dayObj) return <div key={`empty-${idx}`} className="min-h-[60px] md:min-h-[80px] bg-zinc-50/50 rounded-2xl" />;
                  
                  const isToday = dayObj.date === new Date().toISOString().split('T')[0];
                  const dateDate = new Date(dayObj.date + 'T00:00:00');
                  const isSunday = dateDate.getDay() === 0;
                  const dayEvents = Object.values(events[dayObj.date] || {});
                  
                  // Determine primary event type for background color
                  const hasHoliday = dayEvents.some(e => e.type === 'Holiday');
                  const hasExam = dayEvents.some(e => e.type === 'Exam');
                  const hasEvent = dayEvents.some(e => e.type === 'Event');
                  const hasAcademic = dayEvents.some(e => e.type === 'Academic');

                  let bgClass = "bg-white border-zinc-100 hover:shadow-zinc-200/50 text-zinc-800";
                  let textClass = "text-zinc-400";

                  if (isToday) {
                    bgClass = "bg-blue-600 border-blue-600 shadow-xl shadow-blue-600/30 text-white";
                    textClass = "text-white";
                  } else if (hasHoliday) {
                    bgClass = "bg-rose-50 border-rose-100 text-rose-900";
                    textClass = "text-rose-600";
                  } else if (hasExam) {
                    bgClass = "bg-amber-50 border-amber-100 text-amber-900";
                    textClass = "text-amber-600";
                  } else if (hasEvent) {
                    bgClass = "bg-indigo-50 border-indigo-100 text-indigo-900";
                    textClass = "text-indigo-600";
                  } else if (hasAcademic) {
                    bgClass = "bg-emerald-50 border-emerald-100 text-emerald-900";
                    textClass = "text-emerald-600";
                  } else if (isSunday) {
                    bgClass = "bg-red-50/40 border-red-100/50 text-red-700";
                    textClass = "text-red-500";
                  }
                  
                  return (
                    <motion.div 
                      key={dayObj.date}
                      whileHover={{ y: -5, scale: 1.02 }}
                      onClick={() => { if (isAdmin) { setSelectedDate(dayObj.date); setShowEventModal(true); }}}
                      className={`min-h-[60px] md:min-h-[80px] relative p-2 rounded-2xl border transition-all cursor-pointer flex flex-col group ${bgClass}`}
                    >
                      <span className={`text-xs md:text-base font-black ${textClass} group-hover:scale-110 transition-transform`}>
                        {dayObj.day}
                      </span>
                      
                      <div className="flex-grow flex flex-col gap-1 mt-2 overflow-hidden">
                        {dayEvents.slice(0, 2).map(ev => (
                          <div key={ev.id} className={`h-1.5 rounded-full ${isToday ? 'bg-white/40' : 'bg-blue-100'}`} title={ev.title} />
                        ))}
                        {dayEvents.length > 2 && (
                          <div className={`text-[8px] font-black text-center ${isToday ? 'text-white' : 'text-zinc-400'}`}>
                            +{dayEvents.length - 2}
                          </div>
                        )}
                      </div>

                      {/* Hover Overlay with detail */}
                      {dayEvents.length > 0 && !isToday && (
                        <div className="absolute inset-0 bg-white/95 rounded-[2rem] p-4 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center text-center z-10">
                           <p className="text-[10px] font-black text-blue-600 truncate w-full">{dayEvents[0].title}</p>
                           <span className="text-[8px] font-bold text-zinc-400 mt-1 uppercase">{dayEvents[0].type}</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Modern Event Modal */}
        <AnimatePresence>
          {showEventModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl overflow-hidden"
              >
                <div className="bg-[#120c7a] p-8 text-white flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-black">Manage Events</h3>
                    <p className="text-blue-100 text-sm opacity-80">{selectedDate}</p>
                  </div>
                  <button onClick={() => setShowEventModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <X size={28} />
                  </button>
                </div>

                <div className="p-8 space-y-8">
                  {/* Current Events List */}
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {Object.values(events[selectedDate] || {}).map(ev => (
                      <div key={ev.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100 group">
                        <div className="flex items-center gap-4">
                          <div className={`w-2 h-2 rounded-full ${ev.type === 'Holiday' ? 'bg-rose-500' : 'bg-blue-500'}`} />
                          <div>
                            <p className="font-bold text-zinc-800 text-sm">{ev.title}</p>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{ev.type}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDeleteEvent(selectedDate, ev.id)}
                          className="p-2 text-zinc-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* New Event Form */}
                  <div className="space-y-4 pt-6 border-t border-zinc-100">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Event Title</label>
                        <input 
                          type="text" 
                          value={newEvent.title}
                          onChange={e => setNewEvent({...newEvent, title: e.target.value})}
                          className="w-full bg-zinc-50 border-none rounded-2xl px-4 py-3 font-bold text-zinc-700 focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="Independence Day"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Type</label>
                        <select 
                          value={newEvent.type}
                          onChange={e => setNewEvent({...newEvent, type: e.target.value})}
                          className="w-full bg-zinc-50 border-none rounded-2xl px-4 py-3 font-bold text-zinc-700 focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          {Object.keys(EVENT_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Description (Optional)</label>
                        <textarea 
                          value={newEvent.description}
                          onChange={e => setNewEvent({...newEvent, description: e.target.value})}
                          className="w-full bg-zinc-50 border-none rounded-2xl px-4 py-3 font-bold text-zinc-700 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                          rows={2}
                        />
                    </div>
                    <button 
                      onClick={handleAddEvent}
                      className="w-full bg-[#120c7a] text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 hover:scale-[1.02] transition-all"
                    >
                      Add to Calendar
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
      `}</style>
    </Layout>
  );
}
