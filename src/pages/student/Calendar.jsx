import { useState, useEffect, useMemo } from "react";
import { db } from "../../firebase";
import { collection, getDocs } from "firebase/firestore";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

const EVENT_COLORS = {
  Holiday: "bg-rose-400",
  Exam: "bg-amber-400",
  Event: "bg-indigo-400",
  Academic: "bg-emerald-400",
};

const getEventColor = (type) => EVENT_COLORS[type] || "bg-blue-300";

const EVENT_BG_CLASSES = {
  Holiday: "bg-rose-100 text-rose-800",
  Exam: "bg-amber-100 text-amber-800",
  Event: "bg-indigo-100 text-indigo-800",
  Academic: "bg-emerald-100 text-emerald-800",
};

const getEventBgClass = (type) => EVENT_BG_CLASSES[type] || "bg-blue-100 text-blue-800";

export default function Calendar() {
  const [loading, setLoading] = useState(true);
  const [eventsByDate, setEventsByDate] = useState({});
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    const fetchCalendar = async () => {
      try {
        const snapshot = await getDocs(collection(db, "academic_calendar_events"));
        const dateMap = {};

        snapshot.forEach((docSnap) => {
          const ev = { id: docSnap.id, ...docSnap.data() };
          const fromDate = ev.fromDate;
          const toDate = ev.toDate;

          if (fromDate && toDate) {
            const start = new Date(fromDate + 'T00:00:00');
            const end = new Date(toDate + 'T00:00:00');
            if (!isNaN(start) && !isNaN(end)) {
              let cursor = new Date(start);
              while (cursor <= end) {
                const dStr = cursor.toISOString().split('T')[0];
                if (!dateMap[dStr]) dateMap[dStr] = [];
                dateMap[dStr].push(ev);
                cursor.setDate(cursor.getDate() + 1);
              }
              return;
            }
          }

          if (ev.eventDate) {
            if (!dateMap[ev.eventDate]) dateMap[ev.eventDate] = [];
            dateMap[ev.eventDate].push(ev);
          }
        });

        setEventsByDate(dateMap);
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    fetchCalendar();
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const days = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= totalDays; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({ day: i, date: dateStr });
    }
    return days;
  }, [year, month]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-[#120c7a]" size={40} />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-[#120c7a]/10 rounded-2xl">
          <CalendarDays size={28} className="text-[#120c7a]" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800">Academic Calendar</h1>
          <p className="text-sm text-slate-500">Important dates and events</p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
        {/* Month Navigation */}
        <div className="flex items-center justify-between px-3 md:px-6 py-4 bg-slate-50/50 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <CalendarDays size={20} className="text-[#120c7a]" />
            <h2 className="text-xl font-black text-slate-800">
              {MONTHS[month]} {year}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-500"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-1.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:border-[#120c7a]/30 hover:text-[#120c7a] transition-all"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-500"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 px-2 md:px-4 pt-4 pb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 px-2 md:px-4 pb-4 gap-1">
          {calendarDays.map((dayObj, idx) => {
            if (!dayObj) {
              return <div key={`e-${idx}`} className="min-h-[70px] md:min-h-[100px]" />;
            }

            const dateEvents = eventsByDate[dayObj.date] || [];
            const isToday = dayObj.date === new Date().toISOString().split('T')[0];
            const dateDate = new Date(dayObj.date + 'T00:00:00');
            const isSunday = dateDate.getDay() === 0;

            const hasHoliday = dateEvents.some(e => e.type === 'Holiday');
            const hasExam = dateEvents.some(e => e.type === 'Exam');
            const hasOther = dateEvents.length > 0 && !hasHoliday && !hasExam;

            let cellBg = "bg-white hover:bg-slate-50";
            let dayText = "text-slate-700";

            if (isToday) {
              cellBg = "bg-[#120c7a] hover:bg-[#120c7a]";
              dayText = "text-white";
            } else if (hasHoliday) {
              cellBg = "bg-rose-50 hover:bg-rose-100";
              dayText = "text-rose-800";
            } else if (hasExam) {
              cellBg = "bg-amber-50 hover:bg-amber-100";
              dayText = "text-amber-800";
            } else if (hasOther) {
              cellBg = "bg-indigo-50 hover:bg-indigo-100";
              dayText = "text-indigo-800";
            } else if (isSunday) {
              cellBg = "bg-red-50/40";
              dayText = "text-red-500";
            }

            return (
              <div
                key={dayObj.date}
                className={`min-h-[70px] md:min-h-[100px] rounded-2xl border border-slate-100 p-1 md:p-2 flex flex-col transition-colors relative group ${cellBg}`}
              >
                <span className={`text-xs md:text-sm font-black ${dayText}`}>
                  {dayObj.day}
                </span>

                <div className="flex-1 flex flex-col gap-0.5 mt-1 overflow-hidden">
                  {dateEvents.slice(0, 3).map(ev => (
                    <div
                      key={ev.id}
                      className={`w-full rounded px-1 py-0.5 truncate text-[9px] md:text-[10px] font-bold leading-tight ${
                        isToday ? 'text-white bg-white/20' : getEventBgClass(ev.type)
                      }`}
                      title={ev.title}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {dateEvents.length > 3 && (
                    <span className={`text-[8px] font-black text-center ${isToday ? 'text-white/70' : 'text-slate-400'}`}>
                      +{dateEvents.length - 3} more
                    </span>
                  )}
                </div>

                {/* Hover popup */}
                {dateEvents.length > 0 && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    <p className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-1 mb-1">{dayObj.date}</p>
                    {dateEvents.slice(0, 4).map(ev => (
                      <div key={ev.id} className="flex items-center gap-2 py-1">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${getEventColor(ev.type)}`} />
                        <span className="text-xs text-slate-600 truncate">{ev.title}</span>
                        <span className="text-[9px] font-bold text-slate-400 ml-auto uppercase">{ev.type}</span>
                      </div>
                    ))}
                    {dateEvents.length > 4 && (
                      <p className="text-[10px] font-bold text-slate-400 text-center mt-1">+{dateEvents.length - 4} more</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-3 md:gap-6 text-xs text-slate-500">
        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Holiday</span>
        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Exam</span>
        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-indigo-400" /> Event</span>
        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Academic</span>
      </div>
    </div>
  );
}
