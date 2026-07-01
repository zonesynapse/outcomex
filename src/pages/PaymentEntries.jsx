import { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, setDoc, doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import {
  Plus, Trash2, Copy, CheckCircle2, AlertCircle, Save, X, Search, Filter,
  Download, Printer, FileText, Users, ChevronDown, ChevronRight, Edit
} from "lucide-react";
import Layout from "../components/Layout";

function formatAmount(val) {
  if (val === undefined || val === null) return "0";
  const num = Number(val);
  if (isNaN(num)) return "0";
  if (num % 1 !== 0) {
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const TABS = [
  { id: "new", label: "New Entry" },
  { id: "bulk", label: "Bulk Entry" },
  { id: "list", label: "All Entries" },
];

export default function PaymentEntries() {
  const [activeTab, setActiveTab] = useState("new");
  const [roles, setRoles] = useState([]);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [editingEntry, setEditingEntry] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ show: true, message: msg, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "payment_roles"), (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.status !== false) list.push({ id: d.id, ...data });
      });
      setRoles(list);
    });
    return unsub;
  }, []);

  return (
    <Layout title="Payment Entries">
      {toast.show && (
        <div
          className={`fixed top-4 right-4 z-[200] flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-sm animate-in slide-in-from-right-2 ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-bold">{toast.message}</span>
        </div>
      )}

      <div className="p-4 md:p-8 space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-white text-[#120c7a] shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {tab.id === "new" && editingEntry ? "Edit Entry" : tab.label}
            </button>
          ))}
        </div>

        {activeTab === "new" && (
          <NewEntryTab
            roles={roles}
            showToast={showToast}
            editingEntry={editingEntry}
            onCancelEdit={() => setEditingEntry(null)}
          />
        )}
        {activeTab === "bulk" && <BulkEntryTab roles={roles} showToast={showToast} />}
        {activeTab === "list" && (
          <EntryListTab
            showToast={showToast}
            onEdit={(entry) => {
              setEditingEntry(entry);
              setActiveTab("new");
            }}
          />
        )}
      </div>
    </Layout>
  );
}

/* ─── New Entry Tab ─── */
function splitEqually(total, count) {
  if (!total || !count) return [];
  const base = Math.floor(total / count);
  const rem = total % count;
  return Array.from({ length: count }, (_, i) => (i < rem ? base + 1 : base));
}

const memberCash = (entry) => {
  const total = entry.totalScripts || 0;
  const rate = entry.rate || 0;
  const count = (entry.members || []).length || 1;
  
  const scriptsSplit = splitEqually(total, count);
  let amounts = (entry.members || []).map(m => m.amount);
  const hasSavedAmounts = amounts.every(a => a !== undefined && a !== null);
  
  if (!hasSavedAmounts) {
    if (total > 0 && rate > 0) {
      amounts = scriptsSplit.map(s => s * rate);
    } else {
      const totalAmt = entry.totalAmount || 0;
      amounts = splitEqually(totalAmt, count);
    }
  }

  return (entry.members || []).map((m, i) => ({
    facultyName: m.facultyName,
    facultyCode: m.facultyCode || "",
    designation: m.designation || "",
    department: m.department || "",
    college: m.college || "",
    email: m.email || "",
    scripts: scriptsSplit[i] !== undefined ? scriptsSplit[i] : 0,
    amount: amounts[i] !== undefined ? amounts[i] : 0,
  }));
};

function NewEntryTab({ roles, showToast, editingEntry, onCancelEdit }) {
  const [form, setForm] = useState({
    exam: "",
    academicYear: "",
    fromDate: "",
    toDate: "",
    roleId: "",
    rate: "",
    totalScripts: "",
    remarks: "",
  });
  const [members, setMembers] = useState([{ facultyName: "", facultyCode: "", designation: "", department: "", college: "", email: "" }]);
  const [saving, setSaving] = useState(false);

  // Populate form and members from editingEntry
  useEffect(() => {
    if (editingEntry) {
      setForm({
        exam: editingEntry.exam || "",
        academicYear: editingEntry.academicYear || "",
        fromDate: editingEntry.fromDate || "",
        toDate: editingEntry.toDate || "",
        roleId: editingEntry.roleId || "",
        rate: editingEntry.rate !== undefined ? String(editingEntry.rate) : "",
        totalScripts: editingEntry.totalScripts !== undefined ? String(editingEntry.totalScripts) : "",
        remarks: editingEntry.remarks || "",
      });
      if (editingEntry.members && editingEntry.members.length > 0) {
        setMembers(editingEntry.members.map(m => ({
          facultyName: m.facultyName || "",
          facultyCode: m.facultyCode || "",
          designation: m.designation || "",
          department: m.department || "",
          college: m.college || "",
          email: m.email || "",
        })));
      } else {
        setMembers([{ facultyName: "", facultyCode: "", designation: "", department: "", college: "", email: "" }]);
      }
    } else {
      setForm({
        exam: "",
        academicYear: "",
        fromDate: "",
        toDate: "",
        roleId: "",
        rate: "",
        totalScripts: "",
        remarks: "",
      });
      setMembers([{ facultyName: "", facultyCode: "", designation: "", department: "", college: "", email: "" }]);
    }
  }, [editingEntry]);

  // Handle role change or load
  useEffect(() => {
    const isInitialLoadOfEditingEntry = editingEntry && form.roleId === editingEntry.roleId;
    const role = roles.find((r) => r.id === form.roleId);
    setForm((prev) => ({
      ...prev,
      roleName: role?.roleName || "",
      rate: isInitialLoadOfEditingEntry && editingEntry.rate !== undefined
        ? String(editingEntry.rate)
        : (role ? String(role.ratePerScript) : ""),
    }));
  }, [form.roleId, roles, editingEntry]);

  const total = parseInt(form.totalScripts, 10) || 0;
  const rate = parseFloat(form.rate) || 0;
  const totalAmount = total * rate;
  const scriptsSplit = splitEqually(total, members.length);
  const cashSplit = scriptsSplit.map(s => s * rate);

  const addMember = () => setMembers((prev) => [...prev, { facultyName: "", facultyCode: "", designation: "", department: "", college: "", email: "" }]);
  const removeMember = (idx) => {
    if (members.length === 1) return;
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.exam.trim()) return showToast("Exam is required", "error");
    if (!form.academicYear.trim()) return showToast("Academic year is required", "error");
    if (!form.roleId) return showToast("Role is required", "error");
    if (members.some((m) => !m.facultyName.trim()))
      return showToast("All members must have a name", "error");
    if (!total || total <= 0)
      return showToast("Total scripts must be > 0", "error");
    if (members.length === 0)
      return showToast("At least one member is required", "error");

    setSaving(true);
    const isEdit = !!editingEntry;
    try {
      const ref = isEdit ? doc(db, "payment_entries", editingEntry.id) : doc(collection(db, "payment_entries"));
      
      const payload = {
        exam: form.exam.trim(),
        academicYear: form.academicYear.trim(),
        fromDate: form.fromDate,
        toDate: form.toDate,
        roleId: form.roleId,
        roleName: roles.find((r) => r.id === form.roleId)?.roleName || "",
        rate,
        members: members.map((m, i) => {
          const existingMember = editingEntry?.members?.[i];
          return {
            facultyName: m.facultyName.trim(),
            facultyCode: m.facultyCode.trim(),
            designation: m.designation.trim(),
            department: m.department.trim(),
            college: m.college.trim(),
            email: m.email.trim(),
            amount: cashSplit[i],
            claimed: existingMember ? (existingMember.claimed || false) : false,
          };
        }),
        totalScripts: total,
        totalAmount,
        remarks: form.remarks.trim(),
        status: isEdit ? (editingEntry.status || "Pending") : "Pending",
        updatedAt: serverTimestamp(),
      };

      if (!isEdit) {
        payload.createdBy = "admin";
        payload.createdAt = serverTimestamp();
      }

      await setDoc(ref, payload, { merge: true });
      showToast(isEdit ? "Payment entry updated" : "Payment entry created");

      if (isEdit) {
        onCancelEdit();
      } else {
        setForm({ exam: "", academicYear: "", fromDate: "", toDate: "", roleId: "", rate: "", totalScripts: "", remarks: "" });
        setMembers([{ facultyName: "", facultyCode: "", designation: "", department: "", college: "", email: "" }]);
      }
    } catch (err) {
      console.error(err);
      showToast(isEdit ? "Failed to update entry" : "Failed to create entry", "error");
    }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-6">
      {editingEntry && (
        <div className="flex items-center justify-between p-3.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl">
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <Edit size={16} className="text-[#120c7a]" />
            <span>Editing Payment Entry for <strong className="text-[#120c7a]">{editingEntry.roleName || "—"}</strong> ({editingEntry.exam || ""})</span>
          </div>
          <button
            type="button"
            onClick={onCancelEdit}
            className="flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-zinc-800 px-2.5 py-1.5 rounded-lg hover:bg-blue-100/50 transition-all"
          >
            <X size={14} /> Discard & New
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-bold text-zinc-700 mb-1.5">Exam *</label>
          <input
            type="text" value={form.exam}
            onChange={(e) => setForm({ ...form, exam: e.target.value })}
            placeholder="e.g. April 2026"
            className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-zinc-700 mb-1.5">Academic Year *</label>
          <input
            type="text" value={form.academicYear}
            onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
            placeholder="e.g. 2025-2026"
            className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-zinc-700 mb-1.5">From Date *</label>
          <input
            type="date" value={form.fromDate}
            onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
            className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-zinc-700 mb-1.5">To Date *</label>
          <input
            type="date" value={form.toDate}
            onChange={(e) => setForm({ ...form, toDate: e.target.value })}
            className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-zinc-700 mb-1.5">Role *</label>
          <select
            value={form.roleId}
            onChange={(e) => setForm({ ...form, roleId: e.target.value })}
            className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
            required
          >
            <option value="">Select Role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.roleName} (₹{r.ratePerScript})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold text-zinc-700 mb-1.5">Rate Per Script (₹)</label>
          <input type="number" value={form.rate} readOnly
            className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-500 outline-none cursor-default"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-zinc-700 mb-1.5">Total Number of Scripts *</label>
          <input type="number" value={form.totalScripts}
            onChange={(e) => setForm({ ...form, totalScripts: e.target.value })}
            placeholder="e.g. 120"
            min="1"
            className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
            required
          />
        </div>
      </div>

      {/* Members */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-bold text-zinc-700">Team Members</label>
          <button type="button" onClick={addMember}
            className="flex items-center gap-1 text-xs font-bold text-[#120c7a] hover:underline"
          >
            <Plus size={14} /> Add Member
          </button>
        </div>
        <div className="space-y-2">
          {members.map((m, idx) => (
            <div key={idx} className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-400 w-5">{idx + 1}.</span>
                <input
                  type="text" value={m.facultyName}
                  onChange={(e) => {
                    const next = [...members];
                    next[idx] = { ...next[idx], facultyName: e.target.value };
                    setMembers(next);
                  }}
                  placeholder="Faculty name *"
                  className="flex-1 px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                />
                <input
                  type="text" value={m.facultyCode}
                  onChange={(e) => {
                    const next = [...members];
                    next[idx] = { ...next[idx], facultyCode: e.target.value };
                    setMembers(next);
                  }}
                  placeholder="College Code"
                  className="w-24 px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                />
                <input
                  type="number" value={total > 0 ? scriptsSplit[idx] : ""} readOnly
                  className="w-20 px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-lg text-sm text-zinc-600 outline-none cursor-default text-center"
                  title="Allocated scripts"
                />
                {totalAmount > 0 && (
                  <span className="text-xs font-bold text-[#120c7a] w-24 text-right">
                    ₹{formatAmount(cashSplit[idx])}
                  </span>
                )}
                <button type="button" onClick={() => removeMember(idx)}
                  disabled={members.length === 1}
                  className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 ml-7">
                <input type="text" value={m.designation}
                  onChange={(e) => { const next = [...members]; next[idx] = { ...next[idx], designation: e.target.value }; setMembers(next); }}
                  placeholder="Designation"
                  className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                />
                <input type="text" value={m.department}
                  onChange={(e) => { const next = [...members]; next[idx] = { ...next[idx], department: e.target.value }; setMembers(next); }}
                  placeholder="Department"
                  className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                />
                <input type="text" value={m.college}
                  onChange={(e) => { const next = [...members]; next[idx] = { ...next[idx], college: e.target.value }; setMembers(next); }}
                  placeholder="College"
                  className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                />
                <input type="email" value={m.email}
                  onChange={(e) => { const next = [...members]; next[idx] = { ...next[idx], email: e.target.value }; setMembers(next); }}
                  placeholder="Email ID"
                  className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                />
              </div>
            </div>
          ))}
        </div>
        {totalAmount > 0 && members.length > 1 && (
          <p className="text-xs text-zinc-400 mt-2">
            Scripts split as {total % members.length === 0 ? "equally" : "evenly"} ({total % members.length > 0 ? `${total % members.length} member(s) get ${Math.floor(total / members.length) + 1} scripts, others get ${Math.floor(total / members.length)} scripts` : `${Math.floor(total / members.length)} scripts each`}) at rate of ₹{rate}/script.
          </p>
        )}
      </div>

      {/* Totals */}
      <div className="flex gap-6 py-3 px-4 bg-zinc-50 rounded-xl">
        <span className="text-sm font-medium text-zinc-600">
          No. of Members: <strong className="text-zinc-800">{members.length}</strong>
        </span>
        <span className="text-sm font-medium text-zinc-600">
          Total Scripts: <strong className="text-zinc-800">{total.toLocaleString()}</strong>
        </span>
        <span className="text-sm font-medium text-zinc-600">
          Total Amount: <strong className="text-[#120c7a]">₹{formatAmount(totalAmount)}</strong>
        </span>
      </div>

      <div>
        <label className="block text-sm font-bold text-zinc-700 mb-1.5">Remarks</label>
        <textarea
          value={form.remarks}
          onChange={(e) => setForm({ ...form, remarks: e.target.value })}
          rows={2}
          placeholder="Optional notes..."
          className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all resize-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#120c7a] hover:bg-[#0e0960] text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 cursor-pointer"
        >
          {saving ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Save size={16} />
          )}
          {editingEntry ? "Update Payment Entry" : "Create Payment Entry"}
        </button>
        {editingEntry && (
          <button
            type="button"
            onClick={onCancelEdit}
            disabled={saving}
            className="px-6 py-2.5 border border-zinc-200 hover:bg-zinc-50 text-zinc-700 rounded-xl text-sm font-bold transition-all cursor-pointer"
          >
            Cancel Edit
          </button>
        )}
      </div>
    </form>
  );
}

/* ─── Bulk Entry Tab (card-based, same member UI as New Entry) ─── */
function BulkEntryTab({ roles, showToast }) {
  const [exam, setExam] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [cards, setCards] = useState([{ roleId: "", scripts: "", members: [{ facultyName: "", facultyCode: "", designation: "", department: "", college: "", email: "" }] }]);
  const [saving, setSaving] = useState(false);

  const addCard = () => setCards([...cards, { roleId: "", scripts: "", members: [{ facultyName: "", facultyCode: "" }] }]);
  const removeCard = (idx) => {
    if (cards.length === 1) return;
    setCards(cards.filter((_, i) => i !== idx));
  };
  const duplicateCard = (idx) => {
    const newCards = [...cards];
    newCards.splice(idx + 1, 0, JSON.parse(JSON.stringify(cards[idx])));
    setCards(newCards);
  };

  const updateCard = (idx, field, value) => {
    const newCards = [...cards];
    newCards[idx] = { ...newCards[idx], [field]: value };
    setCards(newCards);
  };

  const addMember = (cardIdx) => {
    const newCards = [...cards];
    newCards[cardIdx] = { ...newCards[cardIdx], members: [...newCards[cardIdx].members, { facultyName: "", facultyCode: "", designation: "", department: "", college: "", email: "" }] };
    setCards(newCards);
  };

  const removeMember = (cardIdx, memberIdx) => {
    const newCards = [...cards];
    const members = newCards[cardIdx].members.filter((_, i) => i !== memberIdx);
    if (members.length === 0) members.push({ facultyName: "", facultyCode: "", designation: "", department: "", college: "", email: "" });
    newCards[cardIdx] = { ...newCards[cardIdx], members };
    setCards(newCards);
  };

  const updateMember = (cardIdx, memberIdx, field, value) => {
    const newCards = [...cards];
    const members = [...newCards[cardIdx].members];
    members[memberIdx] = { ...members[memberIdx], [field]: value };
    newCards[cardIdx] = { ...newCards[cardIdx], members };
    setCards(newCards);
  };

  const getRate = (roleId) => {
    const role = roles.find((r) => r.id === roleId);
    return role ? role.ratePerScript : 0;
  };

  const validate = () => {
    if (!exam.trim()) { showToast("Exam is required", "error"); return false; }
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (!c.roleId) { showToast(`Entry ${i + 1}: Role required`, "error"); return false; }
      if (!parseInt(c.scripts, 10)) { showToast(`Entry ${i + 1}: Scripts must be > 0`, "error"); return false; }
      const names = c.members.map((m) => m.facultyName.trim()).filter(Boolean);
      if (names.length === 0) { showToast(`Entry ${i + 1}: At least one member required`, "error"); return false; }
    }
    return true;
  };

  const handleSaveAll = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      for (const card of cards) {
        const scripts = parseInt(card.scripts, 10);
        const rate = getRate(card.roleId);
        const totalAmt = scripts * rate;
        const names = card.members.map((m) => m.facultyName.trim()).filter(Boolean);
        const scriptsSplit = splitEqually(scripts, names.length || 1);
        const cashSplit = scriptsSplit.map(s => s * rate);
        const role = roles.find((r) => r.id === card.roleId);
        const ref = doc(collection(db, "payment_entries"));
        await setDoc(ref, {
          exam: exam.trim(),
          academicYear: academicYear.trim(),
          fromDate,
          toDate,
          roleId: card.roleId,
          roleName: role?.roleName || "",
          rate,
          members: card.members.filter(m => m.facultyName.trim()).map((m, i) => ({
            facultyName: m.facultyName.trim(),
            facultyCode: m.facultyCode?.trim() || "",
            designation: m.designation?.trim() || "",
            department: m.department?.trim() || "",
            college: m.college?.trim() || "",
            email: m.email?.trim() || "",
            amount: cashSplit[i],
            claimed: false,
          })),
          totalScripts: scripts,
          totalAmount: totalAmt,
          status: "Pending",
          createdBy: "admin",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      showToast(`${cards.length} entries saved`);
      setCards([{ roleId: "", scripts: "", members: [{ facultyName: "", facultyCode: "", designation: "", department: "", college: "", email: "" }] }]);
      setExam(""); setAcademicYear(""); setFromDate(""); setToDate("");
    } catch (err) {
      console.error(err);
      showToast("Failed to save entries", "error");
    }
    setSaving(false);
  };

  const totalAmount = cards.reduce((s, c) => {
    const scripts = parseInt(c.scripts, 10) || 0;
    const rate = getRate(c.roleId);
    return s + scripts * rate;
  }, 0);

  return (
    <div className="space-y-4">
      {/* Common fields */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white rounded-2xl border border-zinc-200 shadow-sm p-5">
        <div>
          <label className="block text-xs font-bold text-zinc-600 mb-1 uppercase tracking-wider">Exam *</label>
          <input type="text" value={exam} onChange={(e) => setExam(e.target.value)}
            placeholder="e.g. April 2026"
            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-600 mb-1 uppercase tracking-wider">Academic Year</label>
          <input type="text" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="e.g. 2025-2026"
            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-600 mb-1 uppercase tracking-wider">From Date *</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-600 mb-1 uppercase tracking-wider">To Date *</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={addCard}
            className="flex items-center gap-1.5 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-sm font-bold transition-all"
          ><Plus size={16} /> Add Entry</button>
          <button onClick={handleSaveAll} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#120c7a] hover:bg-[#0e0960] text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-sm"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Save size={16} />
            )}
            Save All ({cards.length})
          </button>
        </div>
        <span className="text-sm font-bold text-zinc-800">
          Total: <span className="text-[#120c7a]">₹{formatAmount(totalAmount)}</span>
        </span>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((card, idx) => {
          const rate = getRate(card.roleId);
          const scripts = parseInt(card.scripts, 10) || 0;
          const totalAmt = scripts * rate;
          const names = card.members.map((m) => m.facultyName.trim()).filter(Boolean);
          const scriptsSplit = splitEqually(scripts, names.length || 1);
          const cashSplit = scriptsSplit.map(s => s * rate);
          return (
            <div key={idx} className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Entry {idx + 1}</span>
                <div className="flex gap-1">
                  <button onClick={() => duplicateCard(idx)}
                    className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                    title="Duplicate"
                  ><Copy size={14} /></button>
                  <button onClick={() => removeCard(idx)} disabled={cards.length === 1}
                    className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30"
                    title="Remove"
                  ><Trash2 size={14} /></button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-600 mb-1">Role *</label>
                  <select value={card.roleId}
                    onChange={(e) => updateCard(idx, "roleId", e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                  >
                    <option value="">Select</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.roleName} (₹{r.ratePerScript})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-600 mb-1">Total Scripts *</label>
                  <input type="number" value={card.scripts}
                    onChange={(e) => updateCard(idx, "scripts", e.target.value)}
                    min="1" placeholder="e.g. 120"
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-4 text-xs">
                <span className="text-zinc-500">Rate: <strong className="text-zinc-700">₹{rate}</strong></span>
                <span className="text-zinc-500">Amount: <strong className="text-[#120c7a]">₹{formatAmount(totalAmt)}</strong></span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-zinc-600">Team Members</label>
                  <button type="button" onClick={() => addMember(idx)}
                    className="flex items-center gap-0.5 text-[10px] font-bold text-[#120c7a] hover:underline"
                  ><Plus size={12} /> Add</button>
                </div>
                <div className="space-y-1.5">
                  {card.members.map((m, mi) => (
                    <div key={mi} className="bg-zinc-50 border border-zinc-200 rounded-lg p-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-zinc-400 w-4">{mi + 1}.</span>
                        <input type="text" value={m.facultyName}
                          onChange={(e) => updateMember(idx, mi, "facultyName", e.target.value)}
                          placeholder="Faculty name *"
                          className="flex-1 px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                        />
                        <input type="text" value={m.facultyCode || ""}
                          onChange={(e) => updateMember(idx, mi, "facultyCode", e.target.value)}
                          placeholder="College Code"
                          className="w-20 px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                        />
                        <input type="number" value={scripts > 0 ? scriptsSplit[mi] : ""} readOnly
                          className="w-14 px-2 py-1.5 bg-zinc-100 border border-zinc-200 rounded-lg text-xs text-zinc-600 outline-none cursor-default text-center"
                          title="Allocated scripts"
                        />
                        {totalAmt > 0 && (
                          <span className="text-[10px] font-bold text-[#120c7a] w-16 text-right">
                            ₹{formatAmount(cashSplit[mi])}
                          </span>
                        )}
                        <button type="button" onClick={() => removeMember(idx, mi)}
                          disabled={card.members.length === 1}
                          className="p-1 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30"
                        ><Trash2 size={12} /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 ml-5">
                        <input type="text" value={m.designation || ""}
                          onChange={(e) => updateMember(idx, mi, "designation", e.target.value)}
                          placeholder="Designation"
                          className="px-2 py-1 bg-white border border-zinc-200 rounded text-[10px] outline-none focus:ring-1 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                        />
                        <input type="text" value={m.department || ""}
                          onChange={(e) => updateMember(idx, mi, "department", e.target.value)}
                          placeholder="Department"
                          className="px-2 py-1 bg-white border border-zinc-200 rounded text-[10px] outline-none focus:ring-1 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                        />
                        <input type="text" value={m.college || ""}
                          onChange={(e) => updateMember(idx, mi, "college", e.target.value)}
                          placeholder="College"
                          className="px-2 py-1 bg-white border border-zinc-200 rounded text-[10px] outline-none focus:ring-1 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                        />
                        <input type="email" value={m.email || ""}
                          onChange={(e) => updateMember(idx, mi, "email", e.target.value)}
                          placeholder="Email ID"
                          className="px-2 py-1 bg-white border border-zinc-200 rounded text-[10px] outline-none focus:ring-1 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {totalAmt > 0 && names.length > 1 && (
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Scripts split as {scripts % names.length === 0 ? "equally" : "evenly"} ({scripts % names.length > 0 ? `${scripts % names.length} member(s) get ${Math.floor(scripts / names.length) + 1} scripts, others get ${Math.floor(scripts / names.length)} scripts` : `${Math.floor(scripts / names.length)} scripts each`}) at rate of ₹{rate}/script.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Entry List Tab ─── */
function EntryListTab({ showToast, onEdit }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ exam: "", role: "", academicYear: "", status: "" });
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "payment_entries"),
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setEntries(list);
        setLoading(false);
      },
      (err) => {
        console.error("payment_entries error", err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const filterOptions = useMemo(() => {
    const exams = new Set(), roles = new Set(), years = new Set();
    entries.forEach((e) => {
      if (e.exam) exams.add(e.exam);
      if (e.roleName) roles.add(e.roleName);
      if (e.academicYear) years.add(e.academicYear);
    });
    return {
      exams: Array.from(exams).sort(),
      roles: Array.from(roles).sort(),
      years: Array.from(years).sort(),
    };
  }, [entries]);

  const filtered = useMemo(() => {
    let list = entries;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        (e.members || []).some((m) => m.facultyName?.toLowerCase().includes(q)) ||
        e.roleName?.toLowerCase().includes(q) ||
        e.exam?.toLowerCase().includes(q) ||
        e.courseName?.toLowerCase().includes(q) ||
        e.fromDate?.toLowerCase().includes(q) ||
        e.toDate?.toLowerCase().includes(q)
      );
    }
    if (filters.exam) list = list.filter((e) => e.exam === filters.exam);
    if (filters.role) list = list.filter((e) => e.roleName === filters.role);
    if (filters.academicYear) list = list.filter((e) => e.academicYear === filters.academicYear);
    if (filters.status) list = list.filter((e) => e.status === filters.status);
    return list;
  }, [entries, search, filters]);

  const totalScripts = filtered.reduce((s, e) => s + (e.totalScripts || 0), 0);
  const totalAmount = filtered.reduce((s, e) => s + (e.totalAmount || 0), 0);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    await deleteDoc(doc(db, "payment_entries", id));
    showToast("Entry deleted");
  };

  const handleStatusChange = async (id, status) => {
    await updateDoc(doc(db, "payment_entries", id), { status, updatedAt: serverTimestamp() });
    showToast(`Status updated to ${status}`);
  };

  const toggleExpand = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const exportCSV = () => {
    const headers = ["Member", "College Code", "Designation", "Department", "College", "Email", "Role", "Scripts", "Rate", "Amount", "Exam", "From Date", "To Date", "Academic Year", "Status"];
    const rows = [];
    filtered.forEach((e) => {
      (e.members || [{}]).forEach((m) => {
        rows.push([m.facultyName || "", m.facultyCode || "", m.designation || "", m.department || "", m.college || "", m.email || "", e.roleName, m.scripts || e.totalScripts, e.rate, e.totalAmount, e.exam, e.fromDate || "", e.toDate || "", e.academicYear, e.status]);
      });
    });
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v || ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "payment_entries.csv";
    a.click();
  };

  const handlePrint = () => window.print();

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input type="text" placeholder="Search member, role, exam..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
              showFilters
                ? "bg-[#120c7a] text-white border-[#120c7a]"
                : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300"
            }`}
          ><Filter size={16} /> Filters</button>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-xl text-sm font-bold hover:border-zinc-300 transition-all"
          ><Download size={16} /> CSV</button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-xl text-sm font-bold hover:border-zinc-300 transition-all"
          ><Printer size={16} /> Print</button>
        </div>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white rounded-2xl border border-zinc-200 shadow-sm p-4">
          <select value={filters.exam} onChange={(e) => setFilters({ ...filters, exam: e.target.value })}
            className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
          >
            <option value="">All Exams</option>
            {filterOptions.exams.map((v) => (<option key={v} value={v}>{v}</option>))}
          </select>
          <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}
            className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
          >
            <option value="">All Roles</option>
            {filterOptions.roles.map((v) => (<option key={v} value={v}>{v}</option>))}
          </select>
          <select value={filters.academicYear} onChange={(e) => setFilters({ ...filters, academicYear: e.target.value })}
            className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
          >
            <option value="">All Years</option>
            {filterOptions.years.map((v) => (<option key={v} value={v}>{v}</option>))}
          </select>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
          >
            <option value="">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Paid">Paid</option>
          </select>
        </div>
      )}

      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span className="px-3 py-1.5 bg-zinc-100 rounded-lg font-medium text-zinc-600">
          Entries: <strong className="text-zinc-800">{filtered.length}</strong>
        </span>
        <span className="px-3 py-1.5 bg-zinc-100 rounded-lg font-medium text-zinc-600">
          Scripts: <strong className="text-zinc-800">{totalScripts.toLocaleString()}</strong>
        </span>
        <span className="px-3 py-1.5 bg-zinc-100 rounded-lg font-medium text-zinc-600">
          Amount: <strong className="text-[#120c7a]">₹{formatAmount(totalAmount)}</strong>
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-[#120c7a]" />
            <p className="mt-3 text-sm text-zinc-500">Loading entries...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={40} className="mx-auto text-zinc-300" />
            <p className="mt-3 text-sm text-zinc-400">No payment entries found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-4 py-3 text-left font-bold text-zinc-600 text-xs uppercase tracking-wider">Members</th>
                  <th className="px-4 py-3 text-left font-bold text-zinc-600 text-xs uppercase tracking-wider">Role</th>
                   <th className="px-4 py-3 text-left font-bold text-zinc-600 text-xs uppercase tracking-wider">Dates</th>
                  <th className="px-4 py-3 text-center font-bold text-zinc-600 text-xs uppercase tracking-wider">Scripts</th>
                  <th className="px-4 py-3 text-center font-bold text-zinc-600 text-xs uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-center font-bold text-zinc-600 text-xs uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-center font-bold text-zinc-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map((entry) => {
                  const memberList = entry.members || [{ facultyName: "—" }];
                  const isExpanded = expanded[entry.id];
                  return (
                    <tr key={entry.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleExpand(entry.id)}
                            className="p-0.5 text-zinc-400 hover:text-zinc-600"
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          <div>
                            <div className="font-semibold text-zinc-800">
                              {memberList[0]?.facultyName || "—"}
                            </div>
                            {memberList.length > 1 && (
                              <span className="text-xs text-zinc-400">+{memberList.length - 1} more</span>
                            )}
                          </div>
                        </div>
                        {isExpanded && memberList.length > 1 && (() => {
                          const cashEntries = memberCash(entry);
                          return (
                            <div className="mt-2 ml-6 space-y-1">
                              {cashEntries.map((m, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs text-zinc-500">
                                  <Users size={12} />
                                  <div>
                                    <span className="font-medium">{m.facultyName}</span>
                                    {m.facultyCode && <span className="text-zinc-400"> [{m.facultyCode}]</span>}
                                    {m.designation && <span className="text-zinc-400"> · {m.designation}</span>}
                                    {m.department && <span className="text-zinc-400"> · {m.department}</span>}
                                    {m.college && <span className="text-zinc-400"> · {m.college}</span>}
                                    {m.email && <span className="text-zinc-400"> · {m.email}</span>}
                                    <span className="ml-2 font-bold text-[#120c7a]">₹{formatAmount(m.amount)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">
                          {entry.roleName || "—"}
                        </span>
                        <div className="text-xs text-zinc-400 mt-0.5">₹{entry.rate}/script</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        <div>{entry.fromDate || "—"}{entry.toDate ? ` → ${entry.toDate}` : ""}</div>
                        <div className="text-xs text-zinc-400">{entry.exam || ""}</div>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-zinc-800">
                        {entry.totalScripts || memberList.reduce((s, m) => s + (m.scripts || 0), 0)}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-[#120c7a]">
                        ₹{formatAmount(entry.totalAmount || 0)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select
                          value={entry.status || "Pending"}
                          onChange={(e) => handleStatusChange(entry.id, e.target.value)}
                          className={`px-2 py-0.5 rounded text-xs font-bold border outline-none ${
                            entry.status === "Paid"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : entry.status === "Approved"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Approved">Approved</option>
                          <option value="Paid">Paid</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => onEdit(entry)}
                            className="p-1.5 text-zinc-400 hover:text-[#120c7a] hover:bg-[#120c7a]/5 rounded-lg transition-all cursor-pointer"
                            title="Edit"
                          >
                            <Edit size={15} />
                          </button>
                          <button onClick={() => handleDelete(entry.id)}
                            className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
