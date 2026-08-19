import React, { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Users,
  MapPin,
  Sparkles,
  SlidersHorizontal,
  X,
  Check
} from "lucide-react";
import Layout from "../../components/Layout";

const RESOURCE_CATEGORIES = [
  "Auditorium",
  "Computer Lab",
  "Science Lab",
  "Seminar Hall",
  "Conference Room",
  "Projector / Equipment",
  "Vehicle / Bus",
  "Sports Complex",
  "Other"
];

const PRESET_AMENITIES = [
  "Air Conditioned (AC)",
  "PA System & Audio",
  "Projector / Screen",
  "Interactive Smart Board",
  "Podium / Stage",
  "Wireless Microphones",
  "Wi-Fi Connectivity",
  "Stage Lighting",
  "Video Conferencing",
  "Power Backup / UPS"
];

export default function ResourceManagement() {
  const [user, setUser] = useState(null);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Form State
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Auditorium");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [amenities, setAmenities] = useState([]);
  const [status, setStatus] = useState("Available");
  const [description, setDescription] = useState("");
  const [customAmenity, setCustomAmenity] = useState("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "resources"), (snapshot) => {
      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setResources(list);
      setLoading(false);
    }, (err) => {
      console.error("Error loading resources:", err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const resetForm = () => {
    setEditingResource(null);
    setName("");
    setCategory("Auditorium");
    setLocation("");
    setCapacity("");
    setAmenities([]);
    setStatus("Available");
    setDescription("");
    setCustomAmenity("");
  };

  const handleOpenAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEditModal = (res) => {
    setEditingResource(res);
    setName(res.name || "");
    setCategory(res.category || "Auditorium");
    setLocation(res.location || "");
    setCapacity(res.capacity || "");
    setAmenities(res.amenities || []);
    setStatus(res.status || "Available");
    setDescription(res.description || "");
    setShowModal(true);
  };

  const toggleAmenity = (item) => {
    if (amenities.includes(item)) {
      setAmenities(amenities.filter((a) => a !== item));
    } else {
      setAmenities([...amenities, item]);
    }
  };

  const handleAddCustomAmenity = () => {
    if (!customAmenity.trim()) return;
    const trimmed = customAmenity.trim();
    if (!amenities.includes(trimmed)) {
      setAmenities([...amenities, trimmed]);
    }
    setCustomAmenity("");
  };

  const handleSaveResource = async (e) => {
    e.preventDefault();
    if (!name.trim() || !location.trim()) {
      alert("Please fill in Resource Name and Location.");
      return;
    }

    setFormSaving(true);
    try {
      const payload = {
        name: name.trim(),
        category,
        location: location.trim(),
        capacity: capacity ? parseInt(capacity, 10) : 0,
        amenities,
        status,
        description: description.trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid || "system"
      };

      if (editingResource) {
        await updateDoc(doc(db, "resources", editingResource.id), payload);
        triggerToast("Resource updated successfully!");
      } else {
        payload.createdAt = new Date().toISOString();
        await addDoc(collection(db, "resources"), payload);
        triggerToast("New resource configured successfully!");
      }

      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error("Failed to save resource:", err);
      alert("Error saving resource: " + err.message);
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteResource = async (resId, resName) => {
    if (!window.confirm(`Are you sure you want to delete "${resName}"? This action cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "resources", resId));
      triggerToast(`"${resName}" deleted.`);
    } catch (err) {
      console.error("Failed to delete resource:", err);
      alert("Failed to delete resource.");
    }
  };

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  };

  const filteredResources = resources.filter((res) => {
    const matchesSearch =
      res.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      res.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      res.category?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCat = selectedCategory === "All" || res.category === selectedCategory;
    const matchesStatus = selectedStatus === "All" || res.status === selectedStatus;

    return matchesSearch && matchesCat && matchesStatus;
  });

  return (
    <Layout title="Resource Management">
      <div className="p-4 md:p-8 w-full space-y-6">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-bounce">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <span className="text-sm font-semibold">{toastMessage}</span>
          </div>
        )}

        {/* Header Banner - Signature Royal Blue Theme matching all pages */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a10a0] to-[#0d095c] p-6 md:p-8 text-white shadow-2xl border border-blue-900/30">
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 opacity-10 pointer-events-none">
            <Building2 size={240} />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 bg-blue-400/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase text-blue-200 border border-blue-300/30">
                <Sparkles size={14} className="text-blue-300" /> Resource Hub Config
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Campus Resource Management</h1>
              <p className="text-blue-100/90 text-xs md:text-sm max-w-xl font-medium">
                Configure auditoriums, computer labs, seminar halls, projectors, and vehicles available for booking across the institution.
              </p>
            </div>
            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white px-5 py-3.5 rounded-2xl text-sm font-extrabold shadow-lg hover:shadow-xl transition-all duration-200 shrink-0 border border-white/20 active:scale-95 cursor-pointer"
            >
              <Plus size={18} /> Configure New Resource
            </button>
          </div>
        </div>

        {/* Filters & Search Bar */}
        <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-100 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search resources by name, location, or type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Dropdown Filters */}
            <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0">
              <div className="flex items-center gap-2 shrink-0">
                <SlidersHorizontal size={14} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-500">Category:</span>
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer"
              >
                <option value="All">All Categories</option>
                {RESOURCE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Available">Available</option>
                <option value="Under Maintenance">Under Maintenance</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Resources Grid */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-[3px] border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-400">Loading resources...</p>
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 border border-slate-100 shadow-sm text-center flex flex-col items-center justify-center gap-3">
            <div className="p-4 rounded-2xl bg-indigo-50 text-indigo-500 mb-2">
              <Building2 size={36} />
            </div>
            <h3 className="text-base font-bold text-slate-800">No Resources Configured</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              No campus resources match your current filter criteria. Click below to configure auditoriums, labs, or seminar halls.
            </p>
            <button
              onClick={handleOpenAddModal}
              className="mt-3 inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all"
            >
              <Plus size={16} /> Configure First Resource
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredResources.map((res) => (
              <div
                key={res.id}
                className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group"
              >
                <div className="p-5 space-y-4">
                  {/* Top Bar: Category & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
                      {res.category}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        res.status === "Available"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : res.status === "Under Maintenance"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {res.status === "Available" ? (
                        <CheckCircle2 size={12} className="text-emerald-500" />
                      ) : res.status === "Under Maintenance" ? (
                        <Wrench size={12} className="text-amber-500" />
                      ) : (
                        <AlertCircle size={12} className="text-slate-400" />
                      )}
                      {res.status}
                    </span>
                  </div>

                  {/* Title & Location */}
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {res.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mt-1">
                      <MapPin size={13} className="text-slate-400 shrink-0" />
                      <span>{res.location || "Main Campus"}</span>
                    </div>
                  </div>

                  {/* Details Card Grid */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-3 rounded-2xl border border-slate-100/80 text-xs">
                    <div className="flex items-center gap-2">
                      <Users size={14} className="text-indigo-500 shrink-0" />
                      <div>
                        <span className="block text-[9px] font-bold uppercase text-slate-400">Capacity</span>
                        <span className="font-extrabold text-slate-800">
                          {res.capacity > 0 ? `${res.capacity} Seats` : "N/A"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-indigo-500 shrink-0" />
                      <div>
                        <span className="block text-[9px] font-bold uppercase text-slate-400">Amenities</span>
                        <span className="font-extrabold text-slate-800">
                          {res.amenities?.length || 0} Facilities
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {res.description && (
                    <p className="text-xs text-slate-500 font-medium line-clamp-2 leading-relaxed">
                      {res.description}
                    </p>
                  )}

                  {/* Amenities Badges */}
                  {res.amenities?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {res.amenities.slice(0, 4).map((am, i) => (
                        <span
                          key={i}
                          className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md"
                        >
                          {am}
                        </span>
                      ))}
                      {res.amenities.length > 4 && (
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                          +{res.amenities.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="px-5 py-3.5 bg-slate-50/60 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleOpenEditModal(res)}
                    className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                    title="Edit Resource"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteResource(res.id, res.name)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                    title="Delete Resource"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: Add / Edit Resource */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-xl w-full p-6 md:p-8 shadow-2xl border border-slate-100 space-y-6 max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                    <Building2 size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">
                      {editingResource ? "Edit Resource Configuration" : "Configure New Campus Resource"}
                    </h2>
                    <p className="text-xs text-slate-400 font-medium">
                      Fill in details for booking allocation across departments.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSaveResource} className="space-y-4">
                {/* Resource Name */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Resource Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Main Central Auditorium, Computer Lab 3"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                  />
                </div>

                {/* Grid: Category & Location */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer"
                    >
                      {RESOURCE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      Location / Room <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Block B, 2nd Floor, Room 204"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>

                {/* Grid: Capacity & Status */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      Seating Capacity
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 250"
                      value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      Status <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer"
                    >
                      <option value="Available">Available</option>
                      <option value="Under Maintenance">Under Maintenance</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Description & Usage Guidelines
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief description of the venue, sound equipment, or special rules..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all resize-none"
                  />
                </div>

                {/* Amenities Checkboxes */}
                <div className="space-y-2 pt-2">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Amenities & Equipment Provided
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    {PRESET_AMENITIES.map((am) => {
                      const isChecked = amenities.includes(am);
                      return (
                        <label
                          key={am}
                          onClick={() => toggleAmenity(am)}
                          className={`flex items-center gap-2 p-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                            isChecked
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/60"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                              isChecked ? "bg-white border-white text-indigo-600" : "border-slate-300 bg-white"
                            }`}
                          >
                            {isChecked && <Check size={12} strokeWidth={3} />}
                          </div>
                          <span className="truncate">{am}</span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Add Custom Amenity */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Add custom amenity (e.g., Green Room)..."
                      value={customAmenity}
                      onChange={(e) => setCustomAmenity(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomAmenity}
                      className="bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-slate-900 transition-all shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Modal Footer Actions */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formSaving}
                    className="bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-200 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {formSaving && (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    {editingResource ? "Update Configuration" : "Save Resource"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
