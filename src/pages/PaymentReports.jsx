import { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import {
  Users, FileText, IndianRupee, Award, TrendingUp, Zap,
  Search, Download, Printer, ClipboardList, ArrowLeft, X, CheckCircle2, AlertCircle
} from "lucide-react";
import Layout from "../components/Layout";

function splitEqually(total, count) {
  if (!total || !count) return [];
  const base = Math.floor(total / count);
  const rem = total % count;
  return Array.from({ length: count }, (_, i) => (i < rem ? base + 1 : base));
}

const memberCash = (entry) => {
  const totalAmt = entry.totalAmount || 0;
  const count = (entry.members || []).length || 1;
  const amounts = splitEqually(totalAmt, count);
  return (entry.members || []).map((m, i) => ({
    facultyName: m.facultyName,
    designation: m.designation || "",
    department: m.department || "",
    college: m.college || "",
    email: m.email || "",
    claimed: m.claimed || false,
    amount: amounts[i] || m.amount || (m.scripts ? m.scripts * (entry.rate || 0) : 0),
  }));
};

const REPORT_TABS = [
  { id: "dashboard", label: "Dashboard", icon: TrendingUp },
  { id: "faculty", label: "Faculty Wise", icon: Users },
  { id: "role", label: "Role Wise", icon: Award },
  { id: "exam", label: "Exam Wise", icon: ClipboardList },
];

export default function PaymentReports() {
  const [entries, setEntries] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState("dashboard");
  const [selectedFaculty, setSelectedFaculty] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedExam, setSelectedExam] = useState("");
  const [claimModal, setClaimModal] = useState({ open: false, entry: null, member: null, entryId: null, allEntries: [] });
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (msg, type = "success") => {
    setToast({ show: true, message: msg, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  useEffect(() => {
    const unsubE = onSnapshot(collection(db, "payment_entries"), (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setEntries(list);
      setLoading(false);
    });
    const unsubR = onSnapshot(collection(db, "payment_roles"), (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.status !== false) list.push({ id: d.id, ...data });
      });
      setRoles(list);
    });
    return () => { unsubE(); unsubR(); };
  }, []);

  const stats = useMemo(() => {
    const allMembers = entries.flatMap((e) => memberCash(e));
    const uniqueFaculty = new Set(allMembers.map((m) => m.facultyName).filter(Boolean));
    const totalScripts = entries.reduce((s, e) => s + (e.totalScripts || 0), 0);
    const totalAmount = allMembers.reduce((s, m) => s + (m.amount || 0), 0);
    return {
      totalFaculty: uniqueFaculty.size,
      totalScripts,
      totalAmount,
      totalRoles: roles.length,
      totalEntries: entries.length,
    };
  }, [entries, roles]);

  const faculties = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => {
      memberCash(e).forEach((m) => {
        if (m.facultyName && !map.has(m.facultyName)) {
          map.set(m.facultyName, { name: m.facultyName });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const rolesSet = useMemo(() => {
    const set = new Set();
    entries.forEach((e) => { if (e.roleName) set.add(e.roleName); });
    return Array.from(set).sort();
  }, [entries]);

  const examsSet = useMemo(() => {
    const set = new Set();
    entries.forEach((e) => { if (e.exam) set.add(e.exam); });
    return Array.from(set).sort();
  }, [entries]);

  const facultyEntries = useMemo(() => {
    if (!selectedFaculty) return [];
    return entries.filter((e) =>
      memberCash(e).some((m) => m.facultyName === selectedFaculty)
    );
  }, [entries, selectedFaculty]);

  const roleEntries = useMemo(() => {
    if (!selectedRole) return [];
    return entries.filter((e) => e.roleName === selectedRole);
  }, [entries, selectedRole]);

  const examEntries = useMemo(() => {
    if (!selectedExam) return [];
    return entries.filter((e) => e.exam === selectedExam);
  }, [entries, selectedExam]);

  const exportCSV = (type, label) => {
    let headers, rows;
    if (type === "faculty") {
      headers = ["Subject", "Role", "Scripts", "Rate", "Amount", "Exam"];
      rows = facultyEntries.map((e) => [e.courseName, e.roleName, e.totalScripts, e.rate, e.totalAmount, e.exam]);
      rows.push([], ["Grand Total", "", facultyEntries.reduce((s, e) => s + (e.totalScripts || 0), 0), "", facultyEntries.reduce((s, e) => s + (e.totalAmount || 0), 0), ""]);
    } else if (type === "role") {
      headers = ["Faculty", "Scripts", "Rate", "Amount"];
      rows = roleEntries.flatMap((e) =>
        memberCash(e).map((m) => [m.facultyName, e.totalScripts, e.rate, m.amount])
      );
      rows.push([], ["Total", roleEntries.reduce((s, e) => s + (e.totalScripts || 0), 0), "", roleEntries.reduce((s, e) => s + (e.totalAmount || 0), 0)]);
    } else if (type === "exam") {
      headers = ["Faculty", "Role", "Scripts", "Amount"];
      rows = examEntries.flatMap((e) =>
        memberCash(e).map((m) => [m.facultyName, e.roleName, e.totalScripts, m.amount])
      );
      rows.push([], ["Grand Total", "", examEntries.reduce((s, e) => s + (e.totalScripts || 0), 0), examEntries.reduce((s, e) => s + (e.totalAmount || 0), 0)]);
    }
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v || ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${type}_report_${label || ""}.csv`.replace(/\s+/g, "_");
    a.click();
  };

  return (
    <Layout title="Payment Reports">
      <div className="p-4 md:p-8 space-y-6">
        {/* Report type tabs */}
        <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl flex-wrap">
          {REPORT_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveReport(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeReport === tab.id
                    ? "bg-white text-[#120c7a] shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-[#120c7a]" />
          </div>
        ) : (
          <>
            {activeReport === "dashboard" && <DashboardView stats={stats} entries={entries} />}
            {activeReport === "faculty" && (
              <EnhancedReportView
                items={faculties.map(f => {
                  const e = entries.filter(entry =>
                    memberCash(entry).some(m => m.facultyName === f.name)
                  );
                  const total = e.reduce((s, entry) => {
                    const cash = memberCash(entry);
                    return s + cash.filter(m => m.facultyName === f.name).reduce((sum, m) => sum + (m.amount || 0), 0);
                  }, 0);
                  return { id: f.name, label: f.name, amount: total, count: e.length };
                })}
                selectedId={selectedFaculty}
                onSelect={setSelectedFaculty}
                detailHeaders={["Subject", "Role", "Scripts", "Rate", "Amount", "Action"]}
                detailRows={facultyEntries.map((e) => {
                  const memberMatch = memberCash(e).find(m => m.facultyName === selectedFaculty);
                  return [
                    e.fromDate || e.courseName || "—",
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">{e.roleName}</span>,
                    e.totalScripts || 0,
                    `₹${e.rate || 0}`,
                    <span className="font-bold text-[#120c7a]">₹{(memberMatch?.amount || 0).toLocaleString()}</span>,
                    <button
                      onClick={() => setClaimModal({ open: true, entry: e, member: memberMatch, entryId: e.id, allEntries: facultyEntries })}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        memberMatch?.claimed
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default"
                          : "bg-[#120c7a] text-white hover:bg-[#0e0960] shadow-sm"
                      }`}
                    >
                      {memberMatch?.claimed ? "✓ Claimed" : "Get Claim"}
                    </button>,
                  ];
                })}
                detailSummary={{
                  scripts: facultyEntries.reduce((s, e) => s + (e.totalScripts || 0), 0),
                  amount: facultyEntries.reduce((s, e) => s + (e.totalAmount || 0), 0),
                  count: facultyEntries.length,
                }}
                onCSV={() => exportCSV("faculty", selectedFaculty)}
                emptyMessage="No faculties found"
              />
            )}
            {activeReport === "role" && (
              <EnhancedReportView
                items={rolesSet.map(r => {
                  const e = entries.filter(entry => entry.roleName === r);
                  return { id: r, label: r, amount: e.reduce((s, x) => s + (x.totalAmount || 0), 0), count: e.length };
                })}
                selectedId={selectedRole}
                onSelect={setSelectedRole}
                detailHeaders={["Faculty", "Scripts", "Rate", "Amount"]}
                detailRows={roleEntries.flatMap((e) =>
                  memberCash(e).map((m) => [
                    m.facultyName || "—",
                    e.totalScripts || 0,
                    `₹${e.rate || 0}`,
                    <span className="font-bold text-[#120c7a]">₹{(m.amount || 0).toLocaleString()}</span>,
                  ])
                )}
                detailSummary={{
                  scripts: roleEntries.reduce((s, e) => s + (e.totalScripts || 0), 0),
                  amount: roleEntries.reduce((s, e) => s + (e.totalAmount || 0), 0),
                  count: roleEntries.length,
                }}
                onCSV={() => exportCSV("role", selectedRole)}
                emptyMessage="No roles found"
              />
            )}
            {activeReport === "exam" && (
              <EnhancedReportView
                items={examsSet.map(ex => {
                  const e = entries.filter(entry => entry.exam === ex);
                  return { id: ex, label: ex, amount: e.reduce((s, x) => s + (x.totalAmount || 0), 0), count: e.length };
                })}
                selectedId={selectedExam}
                onSelect={setSelectedExam}
                detailHeaders={["Faculty", "Role", "Scripts", "Amount"]}
                detailRows={examEntries.flatMap((e) =>
                  memberCash(e).map((m) => [
                    m.facultyName || "—",
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">{e.roleName}</span>,
                    e.totalScripts || 0,
                    <span className="font-bold text-[#120c7a]">₹{(m.amount || 0).toLocaleString()}</span>,
                  ])
                )}
                detailSummary={{
                  scripts: examEntries.reduce((s, e) => s + (e.totalScripts || 0), 0),
                  amount: examEntries.reduce((s, e) => s + (e.totalAmount || 0), 0),
                  count: examEntries.length,
                }}
                onCSV={() => exportCSV("exam", selectedExam)}
                emptyMessage="No exams found"
              />
            )}
          </>
        )}
      </div>
      {claimModal.open && <ClaimFormModal modal={claimModal} setClaimModal={setClaimModal} showToast={showToast} />}
      {toast.show && (
        <div
          className={`fixed top-4 right-4 z-[200] flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-sm ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-bold">{toast.message}</span>
        </div>
      )}
    </Layout>
  );
}

/* ─── Dashboard View ─── */
function DashboardView({ stats, entries }) {
  const roleWise = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => {
      if (e.roleName) {
        map.set(e.roleName, (map.get(e.roleName) || 0) + (e.totalAmount || 0));
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const topFaculty = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => {
      memberCash(e).forEach((m) => {
        if (m.facultyName) {
          map.set(m.facultyName, (map.get(m.facultyName) || 0) + (m.amount || 0));
        }
      });
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [entries]);

  const recentEntries = useMemo(() => entries.slice(0, 5), [entries]);
  const maxAmount = Math.max(...roleWise.map(([, v]) => v), 1);

  const cards = [
    { key: "totalEntries", label: "Total Entries", icon: FileText, value: stats.totalEntries, accent: "#120c7a" },
    { key: "totalFaculty", label: "Faculty", icon: Users, value: stats.totalFaculty, accent: "#059669" },
    { key: "totalScripts", label: "Total Scripts", icon: Award, value: stats.totalScripts.toLocaleString(), accent: "#d97706" },
    { key: "totalAmount", label: "Total Payment", icon: IndianRupee, value: `₹${stats.totalAmount.toLocaleString()}`, accent: "#dc2626" },
    { key: "totalRoles", label: "Active Roles", icon: TrendingUp, value: stats.totalRoles, accent: "#7c3aed" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.key} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold text-zinc-900">{card.value}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200"
                  style={{ backgroundColor: `${card.accent}15`, color: card.accent }}>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5">
          <h3 className="font-bold text-zinc-800 mb-4 text-sm uppercase tracking-wider">Role Wise Distribution</h3>
          {roleWise.length === 0 ? (
            <p className="text-sm text-zinc-400">No data</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {roleWise.map(([role, amount]) => (
                <div key={role}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-zinc-700">{role}</span>
                    <span className="font-bold text-emerald-600">₹{amount.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(amount / maxAmount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5">
          <h3 className="font-bold text-zinc-800 mb-4 text-sm uppercase tracking-wider">Highest Payment Faculty</h3>
          {topFaculty.length === 0 ? (
            <p className="text-sm text-zinc-400">No data</p>
          ) : (
            <div className="space-y-3">
              {topFaculty.map(([name, amount]) => (
                <div key={name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-amber-500" />
                    <span className="text-sm font-medium text-zinc-700">{name}</span>
                  </div>
                  <span className="text-sm font-bold text-[#120c7a]">₹{amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5">
        <h3 className="font-bold text-zinc-800 mb-4 text-sm uppercase tracking-wider">Recent Entries</h3>
        {recentEntries.length === 0 ? (
          <p className="text-sm text-zinc-400">No recent entries</p>
        ) : (
          <div className="space-y-2">
            {recentEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-zinc-800">
                    {memberCash(e).map((m) => m.facultyName).join(", ")}
                  </p>
                  <p className="text-xs text-zinc-400">{e.roleName} · {e.courseName || ""}</p>
                </div>
                <span className="text-sm font-bold text-[#120c7a]">₹{(e.totalAmount || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Enhanced Report View (card grid + drill-down) ─── */
function EnhancedReportView({ items, selectedId, onSelect, detailHeaders, detailRows, detailSummary, onCSV, emptyMessage }) {
  if (!selectedId) {
    return items.length === 0 ? (
      <div className="p-12 text-center bg-white rounded-2xl border border-zinc-200">
        <FileText size={40} className="mx-auto text-zinc-300" />
        <p className="mt-3 text-sm text-zinc-400">{emptyMessage || "No data available."}</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.sort((a, b) => b.amount - a.amount).map((item) => (
          <button key={item.id} onClick={() => onSelect(item.id)}
            className="text-left bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
          >
            <p className="font-bold text-zinc-800 group-hover:text-[#120c7a] transition-colors">{item.label}</p>
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-zinc-400">{item.count} entry{item.count !== 1 ? 's' : ''}</span>
              <span className="font-bold text-[#120c7a]">₹{(item.amount || 0).toLocaleString()}</span>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-zinc-100">
              <div className="h-1.5 rounded-full bg-[#120c7a]/20" style={{ width: `${Math.min((item.amount / Math.max(...items.map(x => x.amount), 1)) * 100, 100)}%` }} />
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Detail header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => onSelect("")}
            className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-800 transition-all"
          ><ArrowLeft size={16} /> Back</button>
          <div className="w-px h-6 bg-zinc-200" />
          <div>
            <p className="text font-bold text-zinc-800">{selectedId}</p>
            <p className="text-xs text-zinc-400">{detailSummary.count} entr{detailSummary.count !== 1 ? 'ies' : 'y'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="text-right">
            <p className="text-xs text-zinc-500">Total Scripts</p>
            <p className="text-lg font-bold text-zinc-800">{detailSummary.scripts.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Total Amount</p>
            <p className="text-lg font-bold text-[#120c7a]">₹{detailSummary.amount.toLocaleString()}</p>
          </div>
          {detailRows.length > 0 && (
            <button onClick={onCSV}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-xl text-sm font-bold hover:border-zinc-300 transition-all"
            ><Download size={16} /> CSV</button>
          )}
        </div>
      </div>

      {/* Detail table */}
      {detailRows.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-zinc-200">
          <FileText size={40} className="mx-auto text-zinc-300" />
          <p className="mt-3 text-sm text-zinc-400">No entries found for this selection.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  {detailHeaders.map((h, i) => (
                    <th key={i} className={`px-4 py-3 font-bold text-zinc-600 text-xs uppercase tracking-wider ${i > 0 ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {detailRows.map((row, i) => (
                  <tr key={i} className="hover:bg-zinc-50/50 transition-colors">
                    {row.map((cell, j) => (
                      <td key={j} className={`px-4 py-3 ${j > 0 ? 'text-center' : ''} ${j === 0 ? 'font-semibold text-zinc-800' : ''} text-zinc-600`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Number to Words helper ─── */
function numberToWords(num) {
  if (num === 0) return 'ZERO';
  const ones = ['','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
  const tens = ['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
  const convert = (n) => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' HUNDRED' + (n % 100 ? ' AND ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' THOUSAND' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' LAKH' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' CRORE' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  };
  return convert(Math.round(num));
}

/* ─── Claim Form Modal ─── */
function ClaimFormModal({ modal, setClaimModal, showToast }) {
  const { open, entry, member, entryId, allEntries } = modal;
  if (!open || !entry || !member) return null;

  const [saving, setSaving] = useState(false);

  const allClaimEntries = useMemo(() => {
    if (!member?.facultyName || !allEntries?.length) return [];
    return allEntries.filter(e =>
      (e.members || []).some(m => m.facultyName === member.facultyName)
    ).sort((a, b) => (a.fromDate || '').localeCompare(b.fromDate || ''));
  }, [allEntries, member]);

  const claimDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const claimNo = useMemo(() => {
    const now = new Date();
    const monthAbbr = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][now.getMonth()];
    const short = String(now.getFullYear()).slice(2);
    const hash = (member?.facultyName || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return `${monthAbbr}-${short}/${String(hash).padStart(5, '0')}`;
  }, [member]);

  const subTotal = allClaimEntries.reduce((s, e) => s + (e.totalAmount || 0), 0);
  const totalScripts = allClaimEntries.reduce((s, e) => s + (e.totalScripts || 0), 0);
  const daAmount = 0;
  const grandTotal = subTotal + daAmount;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=1200');
    if (!printWindow) return;
    printWindow.document.write(buildPrintHTML());
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      for (const e of allClaimEntries) {
        const entryRef = doc(db, "payment_entries", e.id);
        const updatedMembers = (e.members || []).map((m) => {
          if (m.facultyName === member.facultyName) {
            return { ...m, claimed: true, claimNo, claimDate };
          }
          return m;
        });
        await updateDoc(entryRef, { members: updatedMembers, updatedAt: serverTimestamp() });
      }
      showToast("Claim submitted and marked as claimed for all entries!");
      setClaimModal({ open: false, entry: null, member: null, entryId: null, allEntries: [] });
    } catch (err) {
      console.error(err);
      showToast("Failed to submit claim", "error");
    }
    setSaving(false);
  };

  const buildPrintHTML = () => {
    const examLabel = entry.exam || 'END SEMESTER EXAMINATIONS';
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Claim Form - ${claimNo}</title>
<style>
@page{size:A4;margin:.75in}
body{font-family:'Times New Roman',Times,serif;font-size:11px;color:#333;margin:0;padding:20px}
.hdr{text-align:center;margin-bottom:10px}
.hdr img{width:100%;max-width:700px;height:auto;margin-bottom:5px}
.hdr h3{font-size:9px;margin:6px 0 2px;text-decoration:underline}
.info{display:flex;justify-content:space-between;margin:10px 0;font-size:11px}
.dtbl{width:100%;border-collapse:collapse;margin:10px 0}
.dtbl td{border:1px solid #333;padding:6px 10px;font-size:11px}
.dtbl td strong{display:block;margin-bottom:2px}
.rtbl{width:100%;border-collapse:collapse;margin:12px 0}
.rtbl th,.rtbl td{border:1px solid #333;padding:6px 8px;font-size:11px;text-align:center}
.rtbl th{background:#f0f0f0;font-weight:bold}
.rtbl td.l{text-align:left}.rtbl td.r{text-align:right}
.tot td{background:#fafafa;font-weight:bold}
.signs{display:flex;justify-content:space-between;margin-top:50px;font-size:11px}
.signs div{text-align:center;width:30%}
.signs .ln{border-top:1px solid #333;margin-top:40px;padding-top:4px}
.obox{border:1px solid #333;padding:10px;margin-top:30px}
.obox h4{text-align:center;font-size:9px;margin:0 0 8px;text-decoration:underline}
.obox .rw{display:flex;justify-content:space-between;margin:6px 0;font-size:11px}
.rupees{font-size:11px;font-weight:bold;margin:8px 0}
</style></head><body>
<div class="hdr">
<img src="/logo.png" alt="logo" style="width:100%;max-width:700px;height:auto"/>
<h3>${examLabel.toUpperCase()}</h3>
<h3 style="text-decoration:none;font-size:10px;margin-top:4px">EXAMINER CLAIM FORM</h3>
</div>
<div class="info">
<span><strong>Claim No. : ${claimNo}</strong></span>
<span><strong>Date : ${claimDate}</strong></span>
</div>
<table class="dtbl"><tr>
<td style="width:50%"><strong>Name, Designation &amp; Department</strong><br/>
${member.facultyName}${member.designation ? ', ' + member.designation : ''}${member.department ? ' &amp; ' + member.department : ''}</td>
<td style="width:50%"><strong>Faculty Code &amp; College</strong><br/>
${member.college || 'N/A'}</td>
</tr></table>
<h4 style="font-size:9px;margin:12px 0 4px;text-decoration:underline">REMUNERATION FOR VALUATION</h4>
<table class="rtbl"><thead><tr>
<th style="width:6%">S. No.</th><th style="width:16%">Date</th>
<th style="width:14%">No.Scripts</th>
<th style="width:30%">Remuneration Per Script</th><th style="width:34%">Amount</th>
</tr></thead><tbody>
${allClaimEntries.map((e2, i) => {
  const amt = e2.totalAmount || 0;
  return '<tr><td>' + (i+1) + '</td><td>' + (e2.fromDate || claimDate) + '</td><td class="r">' + (e2.totalScripts || 0) + '</td><td class="r">' + Number(e2.rate || 0).toFixed(2) + '</td><td class="r">' + amt.toLocaleString('en-IN', {minimumFractionDigits:2}) + '</td></tr>';
}).join('')}
<tr class="tot"><td colspan="2"></td><td class="r">${totalScripts}</td><td class="r">Sub Total</td><td class="r">${subTotal.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
<tr class="tot"><td colspan="3"></td><td class="r">DA Amount</td><td class="r">${daAmount.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
<tr class="tot"><td colspan="3"></td><td class="r">Total</td><td class="r" style="font-size:13px">${grandTotal.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
</tbody></table>
<div class="rupees">* TA - Travel Allowance (only to the external examiners).<br/>
(Received Rs. ${grandTotal.toLocaleString('en-IN',{minimumFractionDigits:2})} (Rupees ${numberToWords(grandTotal)} ONLY))</div>
<div class="signs"><div><div class="ln">Signature of the Examiner</div>
<div style="font-size:9px;margin-top:2px">(To be signed on Revenue Stamp if exceed Rs.5000)</div></div></div>
<div class="obox"><h4>FOR OFFICE USE ONLY.</h4>
<div class="rw"><span>Verified: Passed for Payment</span><span>Payment Mode: Cash / NEFT</span></div>
<div class="rw"><span>Date:</span><span style="font-weight:bold">CONTROLLER OF EXAMINATIONS</span></div></div>
</body></html>`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[95vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="bg-[#120c7a] py-2.5 px-5 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-bold">Examiner Claim Form</h3>
            <p className="text-xs text-white/70 mt-0.5">Claim No: {claimNo} · {allClaimEntries.length} entr{allClaimEntries.length !== 1 ? 'ies' : 'y'}</p>
          </div>
          <button onClick={() => setClaimModal({ open: false, entry: null, member: null, entryId: null, allEntries: [] })}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-all"
          ><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          <div className="bg-white border border-zinc-200 rounded-xl shadow-sm p-8 max-w-[800px] mx-auto" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
            <div className="text-center mb-4">
              <img src="/logo.png" alt="College Logo" className="w-full max-w-[700px] h-auto mx-auto mb-2" />
              <h3 className="text-[9px] underline mt-2 mb-0">{entry.exam || 'END SEMESTER EXAMINATIONS'}</h3>
              <h3 className="text-[10px] font-bold mt-1">EXAMINER CLAIM FORM</h3>
            </div>

            <div className="flex justify-between text-xs font-bold mb-3">
              <span>Claim No. : {claimNo}</span>
              <span>Date : {claimDate}</span>
            </div>

            <table className="w-full border-collapse border border-zinc-800 text-xs mb-4">
              <tbody>
                <tr>
                  <td className="border border-zinc-800 p-2 w-1/2">
                    <strong>Name, Designation &amp; Department</strong><br/>
                    {member.facultyName}{member.designation ? `, ${member.designation}` : ''}{member.department ? ` & ${member.department}` : ''}
                  </td>
                  <td className="border border-zinc-800 p-2 w-1/2">
                    <strong>Faculty Code &amp; College</strong><br/>
                    {member.college || 'N/A'}
                  </td>
                </tr>
              </tbody>
            </table>

            <h4 className="text-[9px] underline mb-2">REMUNERATION FOR VALUATION</h4>

            <table className="w-full border-collapse border border-zinc-800 text-xs mb-3">
              <thead>
                <tr className="bg-zinc-100">
                  <th className="border border-zinc-800 p-1.5 w-[6%]">S.No</th>
                  <th className="border border-zinc-800 p-1.5 w-[16%]">Date</th>
                  <th className="border border-zinc-800 p-1.5 w-[14%]">No.Scripts</th>
                  <th className="border border-zinc-800 p-1.5 w-[30%]">Remuneration Per Script</th>
                  <th className="border border-zinc-800 p-1.5 w-[34%]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {allClaimEntries.map((e, i) => {
                  const amt = e.totalAmount || 0;
                  return (
                    <tr key={i}>
                      <td className="border border-zinc-800 p-1.5 text-center">{i + 1}</td>
                      <td className="border border-zinc-800 p-1.5 text-center">{e.fromDate || claimDate}</td>
                      <td className="border border-zinc-800 p-1.5 text-right">{e.totalScripts || 0}</td>
                      <td className="border border-zinc-800 p-1.5 text-right">{Number(e.rate || 0).toFixed(2)}</td>
                      <td className="border border-zinc-800 p-1.5 text-right">{amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
                <tr className="bg-zinc-50 font-bold">
                  <td colSpan={2} className="border border-zinc-800 p-1.5"></td>
                  <td className="border border-zinc-800 p-1.5 text-right">{totalScripts}</td>
                  <td className="border border-zinc-800 p-1.5 text-right">Sub Total</td>
                  <td className="border border-zinc-800 p-1.5 text-right">{subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr className="bg-zinc-50 font-bold">
                  <td colSpan={3} className="border border-zinc-800 p-1.5"></td>
                  <td className="border border-zinc-800 p-1.5 text-right">DA Amount</td>
                  <td className="border border-zinc-800 p-1.5 text-right">{daAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr className="bg-zinc-50 font-bold text-sm">
                  <td colSpan={3} className="border border-zinc-800 p-1.5"></td>
                  <td className="border border-zinc-800 p-1.5 text-right">Total</td>
                  <td className="border border-zinc-800 p-1.5 text-right">{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>

            <div className="text-xs mb-2">DA for : day(s)</div>

            <div className="text-xs font-bold mb-4">
              * TA - Travel Allowance (only to the external examiners).<br/>
              (Received Rs. {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Rupees {numberToWords(grandTotal)} ONLY))
            </div>

            <div className="flex justify-between text-xs mt-10">
              <div className="text-center w-1/3">
                <div className="border-t border-zinc-800 mt-8 pt-1">Signature of the Examiner</div>
                <div className="text-[9px] mt-0.5">(To be signed on Revenue Stamp if exceed Rs.5000)</div>
              </div>
            </div>

            <div className="border border-zinc-800 p-3 mt-8">
              <h4 className="text-[9px] text-center underline mb-2">FOR OFFICE USE ONLY.</h4>
              <div className="flex justify-between text-xs">
                <span>Verified: Passed for Payment</span>
                <span>Payment Mode: Cash / NEFT</span>
              </div>
              <div className="flex justify-between text-xs mt-2">
                <span>Date:</span>
                <span className="font-bold">CONTROLLER OF EXAMINATIONS</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-200 p-4 flex justify-end gap-3 bg-zinc-50 shrink-0">
          <button onClick={() => setClaimModal({ open: false, entry: null, member: null, entryId: null, allEntries: [] })}
            className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors"
          >Cancel</button>
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 bg-white border border-zinc-300 text-zinc-700 rounded-lg text-sm font-bold hover:bg-zinc-100 transition-all"
          ><Printer size={16} /> Print</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-[#120c7a] hover:bg-[#0e0960] text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            Submit Claim
          </button>
        </div>
      </div>
    </div>
  );
}
