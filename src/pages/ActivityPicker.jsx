import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Award, GraduationCap, Building2, User, Search, ChevronRight } from "lucide-react";
import Layout from "../components/Layout";
import { ACTIVITY_REGISTRY, ACTIVITY_CATEGORIES } from "../data/activityRegistry";

const CATEGORY_ICONS = {
  student: GraduationCap,
  department: Building2,
  faculty: User,
};

const CATEGORY_ORDER = ["student", "department", "faculty"];

export default function ActivityPicker() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const groupedActivities = useMemo(() => {
    const groups = {};
    CATEGORY_ORDER.forEach(cat => groups[cat] = []);
    ACTIVITY_REGISTRY.forEach(a => {
      if (groups[a.category]) groups[a.category].push(a);
    });
    return groups;
  }, []);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedActivities;
    const q = searchQuery.toLowerCase();
    const result = {};
    CATEGORY_ORDER.forEach(cat => {
      result[cat] = groupedActivities[cat].filter(a =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q)
      );
    });
    return result;
  }, [groupedActivities, searchQuery]);

  return (
    <Layout title="New Activity">
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-black text-zinc-800">New Activity</h1>
          <p className="text-sm text-zinc-500 mt-1">Select an activity type to create a new entry</p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="text"
            placeholder="Search activities by code, name, or description..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
          />
        </div>

        {/* Activity Groups */}
        {CATEGORY_ORDER.map(cat => {
          const items = filteredGroups[cat];
          if (items.length === 0) return null;
          const catInfo = ACTIVITY_CATEGORIES[cat];
          const Icon = CATEGORY_ICONS[cat] || Award;
          return (
            <div key={cat} className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${catInfo.color} text-white shadow-md`}>
                  <Icon size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-800">{catInfo.label}</h2>
                  <p className="text-xs text-zinc-400">{items.length} activit{items.length === 1 ? 'y' : 'ies'}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map(a => (
                  <button
                    key={a.code}
                    onClick={() => navigate(`/activities/${a.code}/new`)}
                    className="group flex items-start gap-3 p-4 rounded-xl border border-zinc-200 bg-white hover:border-[#120c7a]/30 hover:shadow-md hover:-translate-y-0.5 transition-all text-left"
                  >
                    <div className={`shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${catInfo.color} flex items-center justify-center text-white font-bold text-xs shadow-sm`}>
                      {a.code}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-zinc-800 group-hover:text-[#120c7a] transition-colors truncate">{a.name}</span>
                        <ChevronRight size={14} className="shrink-0 text-zinc-300 group-hover:text-[#120c7a] group-hover:translate-x-0.5 transition-all" />
                      </div>
                      {a.description && (
                        <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{a.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] font-semibold uppercase text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">
                          {a.mandatory ? 'Mandatory' : 'Optional'}
                        </span>
                        {a.evidenceRequired && (
                          <span className="text-[10px] font-semibold uppercase text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            Evidence
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {CATEGORY_ORDER.every(cat => filteredGroups[cat].length === 0) && (
          <div className="text-center py-16">
            <Search size={48} className="mx-auto text-zinc-200 mb-4" />
            <p className="text-zinc-400 font-medium">No activities match your search</p>
            <button onClick={() => setSearchQuery("")} className="mt-2 text-sm text-[#120c7a] hover:underline">Clear search</button>
          </div>
        )}
      </div>
    </Layout>
  );
}
