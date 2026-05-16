import { useEffect, useMemo, useState } from "react";
import { Filter, Plus, Search, Inbox, X, Trash2 } from "lucide-react";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import DashboardCards from "../components/DashboardCards";
import EnquiryTable from "../components/EnquiryTable";
import AddEnquiryModal from "../components/AddEnquiryModal";
import { addEnquiry, createEmptyEnquiryForm, deleteEnquiry, getEnquiriesRealtime, updateEnquiry, getEnquiryById } from "../services/enquiryService";

const STATUS_FILTERS = ["All", "Enquiry", "Application", "Admission"];

const getTodayKey = (value) => new Date(value).toDateString();

export default function AdmissionEnquiries() {
  const { departments: deptMap } = useDepartments();
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [formModal, setFormModal] = useState({ open: false, mode: "add", enquiry: null });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  useEffect(() => {
    setLoading(true);
    const unsubscribe = getEnquiriesRealtime(
      (items) => {
        setEnquiries(items);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const departmentOptions = useMemo(() => {
    const fromConfig = Object.values(deptMap || {}).flat();
    const fromData = enquiries.flatMap((enquiry) => [enquiry.department, enquiry.department2, enquiry.department3]).filter(Boolean);
    return Array.from(new Set([...fromConfig, ...fromData])).sort((left, right) => left.localeCompare(right));
  }, [deptMap, enquiries]);

  const filteredEnquiries = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return enquiries.filter((enquiry) => {
      const matchesSearch = !query || [enquiry.enquiryId, enquiry.studentName, enquiry.mobile]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query));

      const matchesDepartment = !departmentFilter || [enquiry.department, enquiry.department2, enquiry.department3].includes(departmentFilter);
      const matchesStatus = statusFilter === "All" || enquiry.status === statusFilter;

      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [enquiries, searchTerm, departmentFilter, statusFilter]);

  const stats = useMemo(() => {
    const today = getTodayKey(Date.now());

    return {
      total: enquiries.length,
      today: enquiries.filter((enquiry) => getTodayKey(enquiry.createdAt) === today).length,
      new: enquiries.filter((enquiry) => enquiry.status === "Enquiry").length,
      application: enquiries.filter((enquiry) => enquiry.status === "Application").length,
      admission: enquiries.filter((enquiry) => enquiry.status === "Admission").length
    };
  }, [enquiries]);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    window.clearTimeout(window.__admissionToastTimer);
    window.__admissionToastTimer = window.setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 2500);
  };

  const openAddModal = () => {
    setFormModal({ open: true, mode: "add", enquiry: createEmptyEnquiryForm() });
  };

  const openEditModal = (enquiry) => {
    setFormModal({ open: true, mode: "edit", enquiry });
  };

  const openViewModal = async (enquiry) => {
    if (enquiry?.enquiryId) {
      try {
        const fresh = await getEnquiryById(enquiry.enquiryId);
        setFormModal({ open: true, mode: "view", enquiry: fresh || enquiry });
        return;
      } catch (e) {
        console.error("Failed to fetch enquiry:", e);
      }
    }
    setFormModal({ open: true, mode: "view", enquiry });
  };

  const closeModal = () => {
    setFormModal({ open: false, mode: "add", enquiry: null });
  };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      if (formModal.mode === "edit" && formModal.enquiry?.enquiryId) {
        await updateEnquiry(formModal.enquiry.enquiryId, {
          ...formModal.enquiry,
          ...values
        });
        showToast("Enquiry updated successfully");
      } else {
        await addEnquiry(values);
        showToast("Enquiry created successfully");
      }
      closeModal();
    } catch (error) {
      console.error("Enquiry save error:", error);
      showToast("Failed to save enquiry", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEnquiry(deleteTarget.enquiryId);
      showToast("Enquiry deleted successfully");
    } catch (error) {
      console.error("Delete enquiry error:", error);
      showToast("Failed to delete enquiry", "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setDepartmentFilter("");
    setStatusFilter("All");
  };

  const isEmpty = !loading && enquiries.length === 0;
  const noFilteredResults = !loading && enquiries.length > 0 && filteredEnquiries.length === 0;

  return (
    <Layout title="Admission Enquiries">
      <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 md:px-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#120c7a]/70">Admissions</p>
            <h1 className="mt-2 text-2xl font-bold text-zinc-900 md:text-3xl">Admission Enquiries</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-500">Track incoming admission interest, filter the pipeline, and manage enquiries in real time.</p>
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#120c7a] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0f0a66] hover:shadow-md"
          >
            <Plus size={18} />
            New Enquiry
          </button>
        </div>

        <DashboardCards loading={loading} stats={stats} />

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:p-5">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.8fr_0.8fr_auto]">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-zinc-700">Search</span>
              <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 focus-within:border-[#120c7a] focus-within:ring-2 focus-within:ring-[#120c7a]/10">
                <Search size={18} className="text-zinc-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
                  placeholder="Search by student name, mobile, or enquiry ID"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-zinc-700">Department</span>
              <div className="relative">
                <select
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                  className="w-full appearance-none rounded-xl border border-zinc-200 bg-white px-4 py-3 pr-10 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10"
                >
                  <option value="">All Departments</option>
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-zinc-700">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full appearance-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10"
              >
                {STATUS_FILTERS.map((status) => (
                  <option key={status} value={status}>{status === "All" ? "All Statuses" : status}</option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-3">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:border-[#120c7a] hover:text-[#120c7a]"
              >
                <Filter size={16} />
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6">
          {isEmpty ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#120c7a]/10 text-[#120c7a]">
                <Inbox size={28} />
              </div>
              <h2 className="mt-5 text-xl font-bold text-zinc-900">No admission enquiries yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">Create the first enquiry to start tracking admissions, interest levels, and follow-up status.</p>
              <button
                type="button"
                onClick={openAddModal}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#120c7a] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0f0a66]"
              >
                <Plus size={18} />
                New Enquiry
              </button>
            </div>
          ) : noFilteredResults ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600">
                <Search size={28} />
              </div>
              <h2 className="mt-5 text-xl font-bold text-zinc-900">No enquiries match your filters</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">Try a different department, status, or search keyword.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:border-[#120c7a] hover:text-[#120c7a]"
              >
                <X size={18} />
                Clear Filters
              </button>
            </div>
          ) : (
            <EnquiryTable
              enquiries={filteredEnquiries}
              loading={loading}
              onView={openViewModal}
              onEdit={openEditModal}
              onDelete={setDeleteTarget}
            />
          )}
        </div>
      </div>

      <AddEnquiryModal
        open={formModal.open}
        mode={formModal.mode}
        initialValues={formModal.enquiry}
        departments={departmentOptions}
        saving={saving}
        onClose={closeModal}
        onSubmit={handleSave}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-900">Delete enquiry?</h3>
                <p className="mt-2 text-sm text-zinc-500">
                  {deleteTarget.studentName} ({deleteTarget.enquiryId}) will be removed permanently from enquiries.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast.show && (
        <div className="fixed top-20 left-1/2 z-[130] -translate-x-1/2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
          {toast.message}
        </div>
      )}
    </Layout>
  );
}
