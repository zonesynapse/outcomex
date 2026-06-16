import { useEffect, useMemo, useState } from "react";
import { Filter, Plus, Search, Inbox, X, Trash2 } from "lucide-react";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import DashboardCards from "../components/DashboardCards";
import EnquiryTable from "../components/EnquiryTable";
import AddEnquiryModal from "../components/AddEnquiryModal";
import { addEnquiry, createEmptyEnquiryForm, deleteEnquiry, getEnquiriesPaginated, getEnquiriesCount as getEnquiriesCountService, getEnquiriesStats, updateEnquiry, getEnquiryById, getAllEnquiries } from "../services/enquiryService";
import { getSeatConfigurationsRealtime } from "../services/seatService";

const STATUS_FILTERS = ["All", "Enquiry", "Application", "Admission", "Approved"];

const hasQuotaSeats = (config) => {
  if (!config || !config.quotas) return false;
  let totalQuotaSeats = 0;
  Object.values(config.quotas).forEach((q) => {
    if (typeof q === "object" && q !== null) {
      totalQuotaSeats += Number(q.total) || 0;
    } else {
      totalQuotaSeats += Number(q) || 0;
    }
  });
  return totalQuotaSeats > 0;
};

export default function AdmissionEnquiries() {
  const { departments: deptMap } = useDepartments();
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [programmeFilter, setProgrammeFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [formModal, setFormModal] = useState({ open: false, mode: "add", enquiry: null });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [seatConfigs, setSeatConfigs] = useState({});
  const [pageCursors, setPageCursors] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, today: 0, new: 0, application: 0, admission: 0 });
  const [searchResults, setSearchResults] = useState(null);
  const [filterResults, setFilterResults] = useState(null);
  const PAGE_SIZE = 20;

  const loadPage = async (page, cursor) => {
    setLoading(true);
    try {
      const result = await getEnquiriesPaginated({ pageSize: PAGE_SIZE, startAfterDoc: cursor });
      setEnquiries(result.items);
      setHasMore(result.hasMore);
      setPageCursors((prev) => {
        const next = [...prev];
        next[page - 1] = result.lastDoc;
        return next;
      });
    } catch (err) {
      console.error("Failed to load enquiries:", err);
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (page) => {
    if (page < 1) return;
    const cursor = page > 1 ? pageCursors[page - 2] : null;
    setCurrentPage(page);
    loadPage(page, cursor);
  };

  useEffect(() => {
    goToPage(1);
    getEnquiriesCountService().then((count) => setTotalCount(count)).catch(() => {});
    getEnquiriesStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = getSeatConfigurationsRealtime(
      (data) => {
        setSeatConfigs(data || {});
      },
      (err) => console.error("Error fetching seat configurations:", err)
    );

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const all = await getAllEnquiries();
        const q = searchTerm.trim().toLowerCase();
        const filtered = all.filter((enquiry) =>
          [enquiry.enquiryId, enquiry.applicationNo, enquiry.studentName, enquiry.firstName, enquiry.lastName, enquiry.mobile]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(q))
        );
        setSearchResults(filtered);
      } catch (err) {
        console.error("Search failed:", err);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const hasDropdownFilter = programmeFilter || departmentFilter || statusFilter !== "All";

  useEffect(() => {
    if (searchTerm.trim()) return;
    if (!hasDropdownFilter) {
      setFilterResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const all = await getAllEnquiries();
        setFilterResults(all);
      } catch (err) {
        console.error("Filter fetch failed:", err);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [programmeFilter, departmentFilter, statusFilter, searchTerm]);

  const programmeOptions = useMemo(() => {
    return Object.keys(deptMap || {}).sort();
  }, [deptMap]);

  const departmentOptions = useMemo(() => {
    let fromConfig;
    if (programmeFilter) {
      fromConfig = deptMap?.[programmeFilter] || [];
    } else {
      fromConfig = Object.values(deptMap || {}).flat();
    }
    const options = fromConfig.filter((dept) => {
      const config = seatConfigs[dept];
      return hasQuotaSeats(config);
    });
    return (options.length > 0 ? options : fromConfig)
      .sort((left, right) => left.localeCompare(right));
  }, [deptMap, seatConfigs, programmeFilter]);

  const filteredEnquiries = useMemo(() => {
    const source = searchResults !== null ? searchResults : (filterResults !== null ? filterResults : enquiries);
    const progDeptList = programmeFilter ? (deptMap?.[programmeFilter] || []) : [];

    return source.filter((enquiry) => {
      const matchesProgramme = !programmeFilter ||
        progDeptList.includes(enquiry.department) ||
        progDeptList.includes(enquiry.department2) ||
        progDeptList.includes(enquiry.department3);
      const matchesDepartment = !departmentFilter || [enquiry.department, enquiry.department2, enquiry.department3].includes(departmentFilter);
      const matchesStatus = statusFilter === "All" || enquiry.status === statusFilter;
      return matchesProgramme && matchesDepartment && matchesStatus;
    });
  }, [enquiries, searchResults, filterResults, programmeFilter, departmentFilter, statusFilter, deptMap]);

  // stats now come from getEnquiriesStats (aggregation queries on the entire dataset)

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

  const handleMove = (enquiry) => {
    if (enquiry.status === "Enquiry") {
      openEditModal({ ...enquiry, status: "Application" });
    } else if (enquiry.status === "Approved") {
      openEditModal({ ...enquiry });
    }
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
      }
      closeModal();
      refreshPage();
      getEnquiriesCountService().then((count) => setTotalCount(count)).catch(() => {});
      getEnquiriesStats().then(setStats).catch(() => {});
    } catch (error) {
      console.error("Enquiry save error:", error);
      const msg = error.code === 'permission-denied' ? "Permission Denied: You don't have Admin rights." : "Failed to save enquiry";
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEnquiry(deleteTarget.enquiryId);
      showToast("Enquiry deleted successfully");
      refreshPage();
      getEnquiriesCountService().then((count) => setTotalCount(count)).catch(() => {});
      getEnquiriesStats().then(setStats).catch(() => {});
    } catch (error) {
      console.error("Delete enquiry error:", error);
      showToast("Failed to delete enquiry", "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setProgrammeFilter("");
    setDepartmentFilter("");
    setStatusFilter("All");
  };

  const isEmpty = !loading && totalCount === 0;
  const noFilteredResults = !loading && (searchResults !== null || filterResults !== null) && filteredEnquiries.length === 0;

  const refreshPage = () => goToPage(currentPage);

  return (
    <Layout title="Admission Enquiries">
      <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 md:px-6">

        <DashboardCards loading={loading} stats={stats} />

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:p-5">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_auto]">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-zinc-700">Search</span>
              <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 focus-within:border-[#120c7a] focus-within:ring-2 focus-within:ring-[#120c7a]/10">
                <Search size={18} className="text-zinc-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
                  placeholder="Search by student name, mobile, or ID"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-zinc-700">Programme</span>
              <div className="relative">
                <select
                  value={programmeFilter}
                  onChange={(event) => { setProgrammeFilter(event.target.value); setDepartmentFilter(""); }}
                  className="w-full appearance-none rounded-xl border border-zinc-200 bg-white px-4 py-3 pr-10 text-sm outline-none transition-all focus:border-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/10"
                >
                  <option value="">All Programmes</option>
                  {programmeOptions.map((prog) => (
                    <option key={prog} value={prog}>{prog}</option>
                  ))}
                </select>
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
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#120c7a] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0f0a66] hover:shadow-md"
              >
                <Plus size={18} />
                New Enquiry
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
              onMove={handleMove}
            />
          )}

          {!isEmpty && !noFilteredResults && searchResults === null && filterResults === null && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-zinc-500">
                Page {currentPage} of {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))} ({totalCount} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => goToPage(currentPage - 1)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-[#120c7a] hover:text-[#120c7a] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!hasMore}
                  onClick={() => goToPage(currentPage + 1)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-[#120c7a] hover:text-[#120c7a] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
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
        showReceipt={false}
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
                  {deleteTarget.firstName || deleteTarget.lastName 
                    ? `${deleteTarget.firstName || ""} ${deleteTarget.lastName || ""}`.trim() 
                    : deleteTarget.studentName || "Student"}{" "}
                  ({deleteTarget.enquiryId}) will be removed permanently from enquiries.
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
