import { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, setDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Plus, Search, Edit3, Trash2, X, CheckCircle2, AlertCircle, Save, ToggleLeft, ToggleRight } from "lucide-react";
import Layout from "../components/Layout";

const DEFAULT_SAMPLE_ROLES = [
  { roleName: "Chief Examiner", ratePerScript: 15 },
  { roleName: "Examiner", ratePerScript: 25 },
  { roleName: "Additional Examiner", ratePerScript: 20 },
  { roleName: "Scrutiny", ratePerScript: 5 },
  { roleName: "Tabulation", ratePerScript: 10 },
  { roleName: "Question Paper Setter", ratePerScript: 30 },
  { roleName: "Practical Examiner", ratePerScript: 20 },
  { roleName: "Chief Superintendent", ratePerScript: 50 },
  { roleName: "Flying Squad", ratePerScript: 40 },
  { roleName: "Project Viva", ratePerScript: 25 },
  { roleName: "Project Evaluation", ratePerScript: 20 },
];

export default function PaymentRoles() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ roleName: "", ratePerScript: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "payment_roles"),
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setRoles(list);
        setLoading(false);
      },
      (err) => {
        console.error("payment_roles error", err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    if (!search) return roles;
    const q = search.toLowerCase();
    return roles.filter(
      (r) =>
        r.roleName?.toLowerCase().includes(q) ||
        String(r.ratePerScript).includes(q)
    );
  }, [roles, search]);

  const openAdd = () => {
    setEditId(null);
    setForm({ roleName: "", ratePerScript: "" });
    setShowModal(true);
  };

  const openEdit = (role) => {
    setEditId(role.id);
    setForm({ roleName: role.roleName || "", ratePerScript: String(role.ratePerScript || "") });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const name = form.roleName.trim();
    const rate = parseFloat(form.ratePerScript);
    if (!name) return showToast("Role name is required", "error");
    if (!rate || rate <= 0) return showToast("Rate must be a positive number", "error");

    const duplicate = roles.find(
      (r) => r.roleName?.toLowerCase() === name.toLowerCase() && r.id !== editId
    );
    if (duplicate) return showToast("Role name already exists", "error");

    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db, "payment_roles", editId), {
          roleName: name,
          ratePerScript: rate,
          updatedAt: serverTimestamp(),
        });
        showToast("Role updated");
      } else {
        const ref = doc(collection(db, "payment_roles"));
        await setDoc(ref, {
          roleName: name,
          ratePerScript: rate,
          status: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast("Role added");
      }
      setShowModal(false);
    } catch (err) {
      console.error(err);
      showToast("Failed to save role", "error");
    }
    setSaving(false);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete role "${name}"?`)) return;
    try {
      await deleteDoc(doc(db, "payment_roles", id));
      showToast("Role deleted");
    } catch (err) {
      console.error(err);
      showToast("Failed to delete", "error");
    }
  };

  const handleToggleStatus = async (id, current) => {
    await updateDoc(doc(db, "payment_roles", id), {
      status: !current,
      updatedAt: serverTimestamp(),
    });
  };

  const handleAddSample = async () => {
    setSaving(true);
    try {
      for (const sample of DEFAULT_SAMPLE_ROLES) {
        const exists = roles.some(
          (r) => r.roleName?.toLowerCase() === sample.roleName.toLowerCase()
        );
        if (exists) continue;
        const ref = doc(collection(db, "payment_roles"));
        await setDoc(ref, {
          ...sample,
          status: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      showToast("Sample roles added");
    } catch (err) {
      console.error(err);
      showToast("Failed to add samples", "error");
    }
    setSaving(false);
  };

  return (
    <Layout title="Payment Roles">
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex gap-2">
            <button
              onClick={handleAddSample}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-sm font-bold transition-all"
            >
              <Plus size={16} /> Sample Roles
            </button>
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#120c7a] hover:bg-[#0e0960] text-white rounded-xl text-sm font-bold transition-all shadow-sm"
            >
              <Plus size={16} /> Add Role
            </button>
          </div>
        </div>

        <div className="relative max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search roles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
          />
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-[#120c7a]" />
              <p className="mt-3 text-sm text-zinc-500">Loading roles...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-zinc-400 text-sm">
                {search ? "No roles match your search." : "No roles configured yet."}
              </p>
              {!search && (
                <button
                  onClick={openAdd}
                  className="mt-3 text-sm font-bold text-[#120c7a] hover:underline"
                >
                  + Add your first role
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <colgroup>
                  <col className="w-auto" />
                  <col className="w-44" />
                  <col className="w-36" />
                  <col className="w-28" />
                </colgroup>
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="px-6 py-4 text-left font-bold text-zinc-600 text-xs uppercase tracking-wider">Role Name</th>
                    <th className="px-6 py-4 text-center font-bold text-zinc-600 text-xs uppercase tracking-wider">Rate Per Script (₹)</th>
                    <th className="px-6 py-4 text-center font-bold text-zinc-600 text-xs uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-right font-bold text-zinc-600 text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filtered.map((role) => (
                    <tr key={role.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-zinc-800">{role.roleName}</td>
                      <td className="px-6 py-4 text-center font-bold text-[#120c7a]">₹{role.ratePerScript}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleToggleStatus(role.id, role.status)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                            role.status !== false
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          }`}
                        >
                          {role.status !== false ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                          {role.status !== false ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(role)}
                            className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Edit"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(role.id, role.roleName)}
                            className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-zinc-200 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-800">
                {editId ? "Edit Role" : "Add Role"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-all"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1.5">Role Name</label>
                <input
                  type="text"
                  value={form.roleName}
                  onChange={(e) => setForm({ ...form, roleName: e.target.value })}
                  placeholder="e.g. Examiner, Chief Examiner"
                  className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-1.5">Rate Per Script (₹)</label>
                <input
                  type="number"
                  value={form.ratePerScript}
                  onChange={(e) => setForm({ ...form, ratePerScript: e.target.value })}
                  placeholder="e.g. 25, 0.50, 2.786"
                  min="0.01"
                  step="any"
                  className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] transition-all"
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-sm font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#120c7a] hover:bg-[#0e0960] text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Save size={16} />
                  )}
                  {editId ? "Update" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
