import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Bus,
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertTriangle, 
  Users, 
  X, 
  RefreshCw,
  Save,
  Search,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import Layout from "../components/Layout";
import { db } from "../firebase";
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

/**
 * @typedef {Object} Bus
 * @property {string} id
 * @property {string} busNo
 * @property {number} capacity
 * @property {string} regNo
 * @property {string|null} driverId
 * @property {string|null} routeId
 * @property {'Active'|'Maintenance'|'Inactive'} status
 * @property {'Standard'|'Deluxe'|'AC'|'Non-AC'} busType
 * @property {string} manufacturer
 * @property {number} yearOfManufacture
 * @property {string} insuranceExpiry
 * @property {string} fitnessExpiry
 * @property {string} permitExpiry
 */

/**
 * @typedef {Object} Driver
 * @property {string} id
 * @property {string} name
 * @property {string} licenseNo
 * @property {string} phone
 * @property {number} experienceYears
 * @property {string|null} assignedBusId
 * @property {'Active'|'Inactive'} status
 */

/**
 * @typedef {Object} Route
 * @property {string} id
 * @property {string} code
 * @property {string} name
 * @property {Array<{id: string, stageName: string}>} stages
 */

export default function TransportBusFleet() {
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedBus, setSelectedBus] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    const busesRef = doc(db, 'transport_config', 'bus_fleet');
    const driversRef = doc(db, 'transport_config', 'drivers');
    const routesRef = doc(db, 'transport_config', 'routes');
    let busesLoaded = false, driversLoaded = false, routesLoaded = false;

    const checkLoading = () => {
      if (busesLoaded && driversLoaded && routesLoaded) {
        setLoading(false);
      }
    };

    const unsubBuses = onSnapshot(busesRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && Array.isArray(data.buses)) {
          setBuses(data.buses);
        } else {
          setBuses([]);
        }
      } else {
        setBuses([]);
      }
      busesLoaded = true;
      checkLoading();
    }, (error) => {
      console.warn('Firestore bus_fleet snapshot error:', error);
      busesLoaded = true;
      checkLoading();
    });

    const unsubDrivers = onSnapshot(driversRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && Array.isArray(data.drivers)) {
          setDrivers(data.drivers);
        } else {
          setDrivers([]);
        }
      } else {
        setDrivers([]);
      }
      driversLoaded = true;
      checkLoading();
    }, (error) => {
      console.warn('Firestore drivers snapshot error:', error);
      driversLoaded = true;
      checkLoading();
    });

    const unsubRoutes = onSnapshot(routesRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && Array.isArray(data.routes)) {
          setRoutes(data.routes);
        } else {
          setRoutes([]);
        }
      } else {
        setRoutes([]);
      }
      routesLoaded = true;
      checkLoading();
    }, (error) => {
      console.warn('Firestore routes snapshot error:', error);
      routesLoaded = true;
      checkLoading();
    });

    return () => {
      unsubBuses();
      unsubDrivers();
      unsubRoutes();
    };
  }, []);

  const filteredBuses = buses.filter(bus => {
    const matchesSearch = bus.busNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         bus.regNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (bus.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || bus.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeBuses = buses.filter(b => b.status === 'Active').length;
  const maintenanceBuses = buses.filter(b => b.status === 'Maintenance').length;
  const totalCapacity = buses.reduce((sum, b) => sum + (b.status === 'Active' ? b.capacity : 0), 0);
  const assignedDrivers = buses.filter(b => b.driverId).length;

  const handleOpenAdd = () => {
    const newBusTemplate = {
      id: `BUS-${Date.now()}`,
      busNo: `BUS #${buses.length + 1}`,
      capacity: 52,
      regNo: '',
      driverId: null,
      routeId: null,
      status: 'Active',
      busType: 'Standard',
      manufacturer: '',
      yearOfManufacture: new Date().getFullYear(),
      insuranceExpiry: '',
      fitnessExpiry: '',
      permitExpiry: '',
    };
    setFormData(newBusTemplate);
    setSelectedBus(null);
    setIsEditing(true);
  };

  const handleOpenEdit = (bus) => {
    setFormData({ ...bus });
    setSelectedBus(bus);
    setIsEditing(true);
  };

  const handleDeleteBus = (busId) => {
    if (window.confirm('Are you sure you want to delete this bus? This action cannot be undone.')) {
      const updated = buses.filter((b) => b.id !== busId);
      handleUpdateBuses(updated);
      if (selectedBus?.id === busId) {
        setSelectedBus(null);
        setIsEditing(false);
      }
    }
  };

  const handleUpdateBuses = async (newBuses) => {
    setBuses(newBuses);
    setSaving(true);
    try {
      const docRef = doc(db, 'transport_config', 'bus_fleet');
      await setDoc(docRef, { buses: newBuses, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.error('Error saving bus fleet to Firestore:', err);
      alert('Failed to save bus fleet. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBus = (e) => {
    e.preventDefault();
    
    if (!formData.busNo || !formData.capacity || !formData.regNo) {
      alert('Please fill in all required fields: Bus Number, Capacity, Registration Number');
      return;
    }

    const busData = {
      id: formData.id || `BUS-${Date.now()}`,
      busNo: formData.busNo,
      capacity: Number(formData.capacity),
      regNo: formData.regNo,
      driverId: formData.driverId || null,
      routeId: formData.routeId || null,
      status: formData.status || 'Active',
      busType: formData.busType || 'Standard',
      manufacturer: formData.manufacturer || '',
      yearOfManufacture: Number(formData.yearOfManufacture) || new Date().getFullYear(),
      insuranceExpiry: formData.insuranceExpiry || '',
      fitnessExpiry: formData.fitnessExpiry || '',
      permitExpiry: formData.permitExpiry || '',
    };

    let updatedBuses;
    if (selectedBus) {
      updatedBuses = buses.map(b => b.id === selectedBus.id ? busData : b);
    } else {
      updatedBuses = [...buses, busData];
    }

    handleUpdateBuses(updatedBuses);
    setIsEditing(false);
    setSelectedBus(null);
    setFormData({});
  };

  const getDriverName = (driverId) => {
    if (!driverId) return 'Unassigned';
    const driver = drivers.find(d => d.id === driverId);
    return driver ? `${driver.name} (${driver.licenseNo})` : 'Unknown';
  };

  const getRouteName = (routeId) => {
    if (!routeId) return 'Unassigned';
    const route = routes.find(r => r.id === routeId);
    return route ? `${route.code} - ${route.name}` : 'Unknown';
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Active':
        return 'bg-emerald-100 text-emerald-800';
      case 'Maintenance':
        return 'bg-amber-100 text-amber-800';
      case 'Inactive':
        return 'bg-slate-100 text-slate-800';
      default:
        return 'bg-zinc-100 text-zinc-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Active': return <CheckCircle2 size={14} className="text-emerald-600" />;
      case 'Maintenance': return <AlertTriangle size={14} className="text-amber-600" />;
      case 'Inactive': return <X size={14} className="text-slate-600" />;
      default: return <CheckCircle2 size={14} className="text-zinc-600" />;
    }
  };

  return (
    <Layout title="Transport Configuration — Bus Fleet">
      <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB] p-4 md:p-6">
        {/* Header Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl mb-6">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
                <Building2 size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black leading-tight">Transport Configuration — Bus Fleet</h1>
                <p className="text-sm text-blue-100/90 font-medium">C.K. College of Engineering & Technology — Fleet Management & Bus Registry</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-4 md:grid-cols-4 text-xs">
                <div className="bg-white/10 backdrop-blur p-3 rounded-xl border border-white/20 text-center">
                  <p className="text-2xl font-black">{buses.length}</p>
                  <p className="opacity-80">Total Buses</p>
                </div>
                <div className="bg-white/10 backdrop-blur p-3 rounded-xl border border-white/20 text-center">
                  <p className="text-2xl font-black">{activeBuses}</p>
                  <p className="opacity-80">Active</p>
                </div>
                <div className="bg-white/10 backdrop-blur p-3 rounded-xl border border-white/20 text-center">
                  <p className="text-2xl font-black">{maintenanceBuses}</p>
                  <p className="opacity-80">Maintenance</p>
                </div>
                <div className="bg-white/10 backdrop-blur p-3 rounded-xl border border-white/20 text-center">
                  <p className="text-2xl font-black">{totalCapacity}</p>
                  <p className="opacity-80">Total Capacity</p>
                </div>
              </div>
              
              <button
                onClick={handleOpenAdd}
                className="px-5 py-2.5 bg-white/15 backdrop-blur border border-white/20 hover:bg-white/25 text-white font-semibold rounded-xl transition-all flex items-center gap-2"
              >
                <Plus size={18} />
                <span>Add Bus</span>
              </button>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search by Bus No, Reg No, Manufacturer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent text-sm"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-zinc-600">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent text-sm bg-white"
              >
                <option value="all">All Status</option>
                <option value="Active">Active</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bus Fleet Table */}
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          {isEditing ? (
            <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <Building2 size={22} className="text-[#120c7a]" />
                  {selectedBus ? 'Edit Bus' : 'Add New Bus'}
                </h2>
                <button
                  onClick={() => { setIsEditing(false); setSelectedBus(null); setFormData({}); }}
                  className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSaveBus} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Bus Number *</label>
                  <input
                    type="text"
                    value={formData.busNo || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, busNo: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                    placeholder="e.g., BUS #01"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Capacity *</label>
                  <input
                    type="number"
                    value={formData.capacity || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, capacity: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                    placeholder="e.g., 52"
                    min="1"
                    max="80"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Registration Number *</label>
                  <input
                    type="text"
                    value={formData.regNo || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, regNo: e.target.value.toUpperCase() }))}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                    placeholder="e.g., TN-28-AX-1234"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Driver</label>
                  <select
                    value={formData.driverId || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, driverId: e.target.value || null }))}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                  >
                    <option value="">Unassigned</option>
                    {drivers.filter(d => d.status === 'Active').map(driver => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name} — {driver.licenseNo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Route</label>
                  <select
                    value={formData.routeId || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, routeId: e.target.value || null }))}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                  >
                    <option value="">Unassigned</option>
                    {routes.map(route => (
                      <option key={route.id} value={route.id}>
                        {route.code} — {route.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Status *</label>
                  <select
                    value={formData.status || 'Active'}
                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                  >
                    <option value="Active">Active</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Bus Type</label>
                  <select
                    value={formData.busType || 'Standard'}
                    onChange={(e) => setFormData(prev => ({ ...prev, busType: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Deluxe">Deluxe</option>
                    <option value="AC">AC</option>
                    <option value="Non-AC">Non-AC</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Manufacturer</label>
                  <input
                    type="text"
                    value={formData.manufacturer || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, manufacturer: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                    placeholder="e.g., Tata, Ashok Leyland"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Year of Manufacture</label>
                  <input
                    type="number"
                    value={formData.yearOfManufacture || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, yearOfManufacture: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                    placeholder="e.g., 2024"
                    min="1990"
                    max={new Date().getFullYear() + 1}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Insurance Expiry</label>
                  <input
                    type="date"
                    value={formData.insuranceExpiry || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, insuranceExpiry: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Fitness Expiry</label>
                  <input
                    type="date"
                    value={formData.fitnessExpiry || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, fitnessExpiry: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">Permit Expiry</label>
                  <input
                    type="date"
                    value={formData.permitExpiry || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, permitExpiry: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                  />
                </div>
                <div className="lg:col-span-3 flex justify-end gap-3 pt-4 border-t border-zinc-200">
                  <button
                    type="button"
                    onClick={() => { setIsEditing(false); setSelectedBus(null); setFormData({}); }}
                    className="px-6 py-2.5 border border-zinc-300 text-zinc-700 font-semibold rounded-xl hover:bg-zinc-50 transition-colors flex items-center gap-2"
                  >
                    <X size={16} /> Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 bg-[#120c7a] text-white font-semibold rounded-xl hover:bg-[#0f0a66] transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save size={16} /> {saving ? 'Saving...' : (selectedBus ? 'Update Bus' : 'Add Bus')}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Bus Number</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Reg Number</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Capacity</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Driver</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Route</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Documents</th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-zinc-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredBuses.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-zinc-500">
                          {buses.length === 0 ? (
                            <div className="flex flex-col items-center gap-3">
                              <Building2 size={48} className="text-zinc-300" />
                              <p className="text-lg font-medium">No buses configured yet</p>
                              <p className="text-sm">Click "Add Bus" to register your first bus</p>
                            </div>
                          ) : (
                            <p>No buses match your search/filter criteria</p>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredBuses.map((bus, index) => (
                        <tr key={bus.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded-lg bg-[#120c7a]/10 flex items-center justify-center">
                                <Building2 size={16} className="text-[#120c7a]" />
                              </span>
                              <div>
                                <p className="font-semibold text-zinc-900">{bus.busNo}</p>
                                <p className="text-xs text-zinc-500">{bus.manufacturer || '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <code className="text-sm font-mono text-zinc-700 bg-zinc-50 px-2 py-1 rounded">{bus.regNo}</code>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                              <Users size={12} /> {bus.capacity}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-medium">
                              {bus.busType}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                                <Users size={12} className="text-blue-600" />
                              </div>
                              <span className="text-sm text-zinc-700 max-w-xs truncate">{getDriverName(bus.driverId)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-zinc-700 max-w-xs truncate">{getRouteName(bus.routeId)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${getStatusBadge(bus.status)}`}>
                              {getStatusIcon(bus.status)}
                              {bus.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {bus.insuranceExpiry && (
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  new Date(bus.insuranceExpiry) < new Date() ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                }`}>
                                  Insurance: {new Date(bus.insuranceExpiry).toLocaleDateString()}
                                </span>
                              )}
                              {bus.fitnessExpiry && (
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  new Date(bus.fitnessExpiry) < new Date() ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                }`}>
                                  Fitness: {new Date(bus.fitnessExpiry).toLocaleDateString()}
                                </span>
                              )}
                              {bus.permitExpiry && (
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  new Date(bus.permitExpiry) < new Date() ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                }`}>
                                  Permit: {new Date(bus.permitExpiry).toLocaleDateString()}
                                </span>
                              )}
                              {!bus.insuranceExpiry && !bus.fitnessExpiry && !bus.permitExpiry && (
                                <span className="px-2 py-1 text-xs bg-zinc-100 text-zinc-500 rounded-full">No docs</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleOpenEdit(bus)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteBus(bus.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {buses.length > 0 && !isEditing && (
          <div className="mt-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-200">
            <p className="text-sm text-zinc-600 text-center">
              Showing <strong>{filteredBuses.length}</strong> of <strong>{buses.length}</strong> buses • 
              {assignedDrivers} assigned drivers • {totalCapacity} total seating capacity
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}