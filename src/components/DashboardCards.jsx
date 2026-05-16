import { Calendar, CheckCircle2, Clock, Users, FileText } from "lucide-react";

const DEFAULT_CARDS = [
  { key: "total", label: "Total Enquiries", icon: Users, accent: "#120c7a" },
  { key: "today", label: "Today Enquiries", icon: Calendar, accent: "#120c7a" },
  { key: "new", label: "Enquiry", icon: Clock, accent: "#120c7a" },
  { key: "application", label: "Application", icon: FileText, accent: "#120c7a" },
  { key: "admission", label: "Admission", icon: CheckCircle2, accent: "#120c7a" }
];

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded-full bg-zinc-200" />
          <div className="h-8 w-16 rounded-full bg-zinc-200" />
        </div>
        <div className="h-12 w-12 rounded-2xl bg-zinc-200" />
      </div>
      <div className="mt-5 h-2 w-24 rounded-full bg-zinc-200" />
    </div>
  );
}

export default function DashboardCards({ stats = {}, loading = false, cards = DEFAULT_CARDS }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <SkeletonCard key={card.key} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = stats[card.key] ?? 0;

        return (
          <div
            key={card.key}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-500">{card.label}</p>
                <p className="mt-2 text-3xl font-bold text-zinc-900">{value}</p>
              </div>
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200"
                style={{ backgroundColor: "rgba(18, 12, 122, 0.08)", color: card.accent }}
              >
                <Icon size={20} />
              </div>
            </div>
            <div className="mt-5 h-1.5 w-16 rounded-full bg-zinc-100">
              <div className="h-1.5 rounded-full" style={{ width: "100%", backgroundColor: card.accent }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
