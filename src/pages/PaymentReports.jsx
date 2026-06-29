import { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import {
  Users, FileText, IndianRupee, Award, TrendingUp, Zap,
  Search, Download, Printer, ClipboardList, ArrowLeft, X, CheckCircle2
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
  const [claimModal, setClaimModal] = useState({ open: false, entry: null, member: null, entryId: null });
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
                      onClick={() => setClaimModal({ open: true, entry: e, member: memberMatch, entryId: e.id })}
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
                    <th key={i} className={`px-4 py-3 font-bold text-zinc-600 text-xs uppercase tracking-wider ${i > 0 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {detailRows.map((row, i) => (
                  <tr key={i} className="hover:bg-zinc-50/50 transition-colors">
                    {row.map((cell, j) => (
                      <td key={j} className={`px-4 py-3 ${j === row.length - 1 ? 'text-center' : j > 0 ? 'text-right' : ''} ${j === 0 ? 'font-semibold text-zinc-800' : ''} text-zinc-600`}>{cell}</td>
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

/* ─── Claim Form Modal ─── */
function ClaimFormModal({ modal, setClaimModal, showToast }) {
  const { open, entry, member, entryId } = modal;
  if (!open || !entry || !member) return null;

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    branch: "",
    panNumber: "",
    remarks: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.bankName.trim()) return showToast("Bank name is required", "error");
    if (!form.accountNumber.trim()) return showToast("Account number is required", "error");
    if (!form.ifscCode.trim()) return showToast("IFSC code is required", "error");

    setSaving(true);
    try {
      const entryRef = doc(db, "payment_entries", entryId);
      const updatedMembers = (entry.members || []).map((m) => {
        if (m.facultyName === member.facultyName) {
          return { ...m, claimed: true, claimData: { ...form, claimedAt: new Date().toISOString() } };
        }
        return m;
      });
      await updateDoc(entryRef, { members: updatedMembers, updatedAt: serverTimestamp() });
      showToast("Claim submitted successfully");
      setClaimModal({ open: false, entry: null, member: null, entryId: null });
    } catch (err) {
      console.error(err);
      showToast("Failed to submit claim", "error");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-[#120c7a] p-5 text-white flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">Claim Form</h3>
            <p className="text-xs text-white/70 mt-0.5">Letter will be generated after submission</p>
          </div>
          <button onClick={() => setClaimModal({ open: false, entry: null, member: null, entryId: null })}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-all"
          ><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-zinc-50 rounded-xl p-4 space-y-2 border border-zinc-200">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Faculty</span>
              <span className="font-bold text-zinc-800">{member.facultyName}</span>
            </div>
            {member.designation && <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Designation</span>
              <span className="font-medium text-zinc-700">{member.designation}</span>
            </div>}
            {member.department && <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Department</span>
              <span className="font-medium text-zinc-700">{member.department}</span>
            </div>}
            {member.email && <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Email</span>
              <span className="font-medium text-zinc-700">{member.email}</span>
            </div>}
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Role</span>
              <span className="font-medium text-zinc-700">{entry.roleName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Scripts</span>
              <span className="font-medium text-zinc-700">{entry.totalScripts}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Amount</span>
              <span className="font-bold text-[#120c7a]">₹{(member.amount || 0).toLocaleString()}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Bank Name *</label>
              <input type="text" value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                placeholder="e.g. State Bank of India"
                className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-600 mb-1">Account Number *</label>
                <input type="text" value={form.accountNumber}
                  onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                  placeholder="Account number"
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-600 mb-1">IFSC Code *</label>
                <input type="text" value={form.ifscCode}
                  onChange={(e) => setForm({ ...form, ifscCode: e.target.value })}
                  placeholder="e.g. SBIN0001234"
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-600 mb-1">Branch</label>
                <input type="text" value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  placeholder="Branch name"
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-600 mb-1">PAN Number</label>
                <input type="text" value={form.panNumber}
                  onChange={(e) => setForm({ ...form, panNumber: e.target.value })}
                  placeholder="e.g. ABCDE1234F"
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all uppercase"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-600 mb-1">Remarks</label>
              <textarea value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                rows={2}
                placeholder="Optional notes..."
                className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all resize-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button"
                onClick={() => setClaimModal({ open: false, entry: null, member: null, entryId: null })}
                className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors"
              >Cancel</button>
              <button type="submit" disabled={saving}
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
          </form>
        </div>
      </div>
    </div>
  );
}
