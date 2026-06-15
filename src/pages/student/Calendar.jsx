import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { CalendarDays, AlertCircle, Loader2 } from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function getMonthKey(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "0";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export default function Calendar() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const fetchCalendar = async () => {
      try {
        const snap = await getDoc(doc(db, "info_configuration", "academic_calendar"));
        if (snap.exists()) {
          const data = snap.data();
          const list = [];

          if (Array.isArray(data.events)) {
            data.events.forEach((ev, i) => {
              list.push({ id: `ev-${i}`, ...ev });
            });
          } else if (typeof data.events === "object" && data.events !== null) {
            Object.entries(data.events).forEach(([key, ev]) => {
              list.push({ id: key, ...ev });
            });
          }

          Object.entries(data).forEach(([key, val]) => {
            if (key === "events") return;
            if (val && typeof val === "object" && (val.date || val.startDate)) {
              list.push({ id: key, ...val });
            }
          });

          list.sort((a, b) => {
            const da = new Date(a.date || a.startDate || 0);
            const dbv = new Date(b.date || b.startDate || 0);
            return da - dbv;
          });

          setEvents(list);
        }
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    fetchCalendar();
  }, []);

  const grouped = useMemo(() => {
    const map = {};
    events.forEach((ev) => {
      const dateStr = ev.date || ev.startDate || "";
      const mk = getMonthKey(dateStr);
      if (!map[mk]) map[mk] = [];
      map[mk].push(ev);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

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

      {events.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-20 text-center border border-slate-100">
          <CalendarDays size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-lg font-bold text-slate-400">No calendar events found.</p>
        </div>
      ) : (
        grouped.map(([monthKey, monthEvents]) => (
          <div key={monthKey} className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-[#120c7a] px-8 py-5">
              <h2 className="text-white font-bold text-xl">{getMonthLabel(monthKey)}</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {monthEvents.map((ev, idx) => {
                  const dateStr = ev.date || ev.startDate || "";
                  const desc = ev.description || ev.details || "";
                  return (
                    <div key={ev.id || idx} className="flex items-start gap-5 p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-[#120c7a]/20 transition-all">
                      <div className="min-w-[60px] text-center">
                        <p className="text-2xl font-black text-[#120c7a] leading-none">
                          {dateStr ? new Date(dateStr).getDate() : "-"}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                          {dateStr ? MONTHS[new Date(dateStr).getMonth()].slice(0, 3) : ""}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800">{ev.title || ev.name || "Event"}</p>
                        {desc && <p className="text-sm text-slate-500 mt-1">{desc}</p>}
                        {ev.type && (
                          <span className="inline-block mt-2 text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200 uppercase">
                            {ev.type}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
