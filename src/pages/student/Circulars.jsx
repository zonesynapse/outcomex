import { useState, useEffect, useMemo } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { Megaphone, Globe, Building2, Calendar, Eye, X, FileText, Search, CheckCircle2 } from "lucide-react";

const formatDate = (val) => {
  if (!val) return "-";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "-"; }
};

const formatDateTime = (val) => {
  if (!val) return "-";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "-"; }
};

export default function Circulars({ embedded, onClose }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [circulars, setCirculars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewCircular, setViewCircular] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) setUserData(snap.data());
        } catch (e) { console.error(e); }
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "circulars"), (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      const getMillis = (dateObj) => {
        if (!dateObj) return 0;
        if (typeof dateObj.toMillis === 'function') return dateObj.toMillis();
        if (typeof dateObj.toDate === 'function') return dateObj.toDate().getTime();
        if (dateObj.seconds) return dateObj.seconds * 1000;
        const parsed = Date.parse(dateObj);
        return isNaN(parsed) ? 0 : parsed;
      };

      list.sort((a, b) => {
        const da = a.principalApprovedAt || a.createdAt;
        const db = b.principalApprovedAt || b.createdAt;
        return getMillis(db) - getMillis(da);
      });
      setCirculars(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const approvedCirculars = useMemo(() => {
    return circulars.filter(c => c.status === "Approved");
  }, [circulars]);

  const filtered = useMemo(() => {
    let result = approvedCirculars;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(c =>
        (c.title || "").toLowerCase().includes(q) ||
        (c.content || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [approvedCirculars, search]);

  const markAsViewed = async (circId) => {
    if (!currentUser?.uid) return;
    try {
      const ref = doc(db, "circulars", circId);
      await updateDoc(ref, {
        [`viewedBy.${currentUser.uid}`]: new Date().toISOString()
      });
    } catch (e) { console.error(e); }
  };

  const handleView = (circ) => {
    setViewCircular(circ);
    markAsViewed(circ.id);
  };

  if (embedded) {
    // Embedded mode used for popup
    return (
      <div>
        {viewCircular && (
          <CircularDetailModal
            circular={viewCircular}
            onClose={() => setViewCircular(null)}
          />
        )}
        {/* Render as children - the parent controls layout */}
        {filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((circ) => (
              <div
                key={circ.id}
                onClick={() => handleView(circ)}
                className="bg-white rounded-xl border border-zinc-200 p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    circ.type === "institution" ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600"
                  }`}>
                    {circ.type === "institution" ? <Globe size={16} /> : <Building2 size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-zinc-900 truncate">{circ.title}</h4>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
                      <span>{formatDate(circ.principalApprovedAt || circ.createdAt)}</span>
                      {circ.type === "department" && circ.department && (
                        <>
                          <span>•</span>
                          <span>{circ.department}</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-zinc-600 mt-2 line-clamp-2">{circ.content}</p>
                  </div>
                  <button className="p-1.5 rounded-lg border border-zinc-200 text-zinc-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors shrink-0">
                    <Eye size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full page mode
  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-6 md:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a12a8] to-[#0f0a66] p-6 md:p-8 mb-8 shadow-lg">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-white/10">
              <Megaphone size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Circulars</h1>
              <p className="text-blue-200 text-sm">Institution & department circulars</p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#120c7a] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
            <Megaphone size={28} />
          </div>
          <h3 className="text-lg font-bold text-zinc-900">No Circulars</h3>
          <p className="text-sm text-zinc-500 mt-1">No approved circulars available yet.</p>
        </div>
      ) : (
        <>
          {!embedded && (
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 mb-6">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search circulars..."
                  className="w-full rounded-xl border border-zinc-200 pl-9 pr-4 py-2.5 text-sm font-semibold text-zinc-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>
          )}

          <div className="space-y-3">
            {filtered.map((circ) => (
              <div
                key={circ.id}
                onClick={() => handleView(circ)}
                className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-2.5 rounded-xl shrink-0 ${
                    circ.type === "institution" ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600"
                  }`}>
                    {circ.type === "institution" ? <Globe size={20} /> : <Building2 size={20} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-zinc-900">{circ.title}</h3>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500">
                      <Calendar size={12} />
                      <span>{formatDate(circ.principalApprovedAt || circ.createdAt)}</span>
                      {circ.type === "department" && circ.department && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Building2 size={11} /> {circ.department}</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-zinc-600 mt-2 line-clamp-2">{circ.content}</p>
                  </div>
                  <button className="p-2 rounded-lg border border-zinc-200 text-zinc-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors shrink-0">
                    <Eye size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {viewCircular && (
        <CircularDetailModal
          circular={viewCircular}
          onClose={() => setViewCircular(null)}
        />
      )}
    </div>
  );
}

function CircularDetailModal({ circular, onClose }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-8 pb-8 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-[#120c7a] to-[#0e095e] px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white/20">
                <Megaphone size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{circular.title}</h2>
                <p className="text-blue-200 text-xs">
                  {circular.type === "institution" ? "Institution Level" : `Department of ${circular.department || "N/A"}`}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="px-6 py-5 max-h-[65vh] overflow-y-auto space-y-5">
          <div className="rounded-xl border border-zinc-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b border-zinc-200">
              <FileText size={14} className="text-[#120c7a]" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Published on</span>
              <span className="text-xs text-zinc-500 ml-auto">{formatDate(circular.principalApprovedAt || circular.createdAt)}</span>
            </div>
            <div className="p-5">
              <div className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
                {circular.content}
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-end">
          <button onClick={onClose}
            className="rounded-xl border border-zinc-200 px-5 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
