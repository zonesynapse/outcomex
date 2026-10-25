import React, { useState, useEffect } from 'react';
import { 
  Building2, 
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
  MapPin,
  Route,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Calculator,
  FileText
} from 'lucide-react';
import Layout from "../components/Layout";
import { db } from "../firebase";
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

/**
 * @typedef {Object} Stage
 * @property {string} id
 * @property {string} stageName
 * @property {number} km
 * @property {string} morningTime
 * @property {string} eveningTime
 * @property {number} monthlyFee
 * @property {number} semesterFee
 * @property {number} annualFee
 */

/**
 * @typedef {Object} Route
 * @property {string} id
 * @property {string} code
 * @property {string} name
 * @property {string} description
 * @property {Stage[]} stages
 */

export default function TransportRoutesStages() {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [editingStageIndex, setEditingStageIndex] = useState(null);
  const [stageFormData, setStageFormData] = useState({});

  useEffect(() => {
    const routesRef = doc(db, 'transport_config', 'routes');
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
      setLoading(false);
    }, (error) => {
      console.warn('Firestore routes snapshot error:', error);
      setLoading(false);
    });

    return () => unsubRoutes();
  }, []);

  const filteredRoutes = routes.filter(route => 
    route.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    route.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    route.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalRoutes = routes.length;
  const totalStages = routes.reduce((sum, r) => sum + r.stages.length, 0);
  const totalRevenue = routes.reduce((sum, r) => sum + r.stages.reduce((s, st) => s + st.annualFee, 0), 0);
  const avgStagesPerRoute = routes.length > 0 ? (totalStages / routes.length).toFixed(1) : 0;

  const handleOpenAddRoute = () => {
    const newRouteTemplate = {
      id: `RT-${Date.now()}`,
      code: `R${routes.length + 101}`,
      name: '',
      description: '',
      stages: [],
    };
    setFormData(newRouteTemplate);
    setSelectedRoute(null);
    setIsEditing(true);
  };

  const handleOpenEditRoute = (route) => {
    setFormData({ ...route });
    setSelectedRoute(route);
    setIsEditing(true);
  };

  const handleDeleteRoute = (routeId) => {
    if (window.confirm('Are you sure you want to delete this route? All stages and fee configurations will be lost.')) {
      const updated = routes.filter((r) => r.id !== routeId);
      handleUpdateRoutes(updated);
      if (selectedRoute?.id === routeId) {
        setSelectedRoute(null);
        setIsEditing(false);
      }
    }
  };

  const handleUpdateRoutes = async (newRoutes) => {
    setRoutes(newRoutes);
    setSaving(true);
    try {
      const docRef = doc(db, 'transport_config', 'routes');
      await setDoc(docRef, { routes: newRoutes, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.error('Error saving routes to Firestore:', err);
      alert('Failed to save routes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRoute = (e) => {
    e.preventDefault();
    
    if (!formData.code || !formData.name) {
      alert('Please fill in Route Code and Route Name');
      return;
    }

    const routeData = {
      id: formData.id || `RT-${Date.now()}`,
      code: formData.code,
      name: formData.name,
      description: formData.description || '',
      stages: formData.stages || [],
    };

    let updatedRoutes;
    if (selectedRoute) {
      updatedRoutes = routes.map(r => r.id === selectedRoute.id ? routeData : r);
    } else {
      updatedRoutes = [...routes, routeData];
    }

    handleUpdateRoutes(updatedRoutes);
    setIsEditing(false);
    setSelectedRoute(null);
    setFormData({});
  };

  const handleOpenAddStage = (routeId) => {
    const route = routes.find(r => r.id === routeId);
    if (!route) return;
    
    const newStage = {
      id: `STG-${Date.now()}`,
      stageName: '',
      km: 0,
      morningTime: '07:00',
      eveningTime: '17:00',
      monthlyFee: 0,
      semesterFee: 0,
      annualFee: 0,
    };
    setStageFormData(newStage);
    setEditingStageIndex(null);
    setSelectedRoute(route);
  };

  const handleOpenEditStage = (route, stageIndex) => {
    setSelectedRoute(route);
    setEditingStageIndex(stageIndex);
    setStageFormData({ ...route.stages[stageIndex] });
  };

  const handleDeleteStage = (routeId, stageIndex) => {
    if (window.confirm('Are you sure you want to delete this stage?')) {
      const route = routes.find(r => r.id === routeId);
      if (!route) return;
      
      const updatedStages = route.stages.filter((_, i) => i !== stageIndex);
      const updatedRoutes = routes.map(r => 
        r.id === routeId ? { ...r, stages: updatedStages } : r
      );
      handleUpdateRoutes(updatedRoutes);
      if (selectedRoute?.id === routeId) {
        setSelectedRoute({ ...route, stages: updatedStages });
      }
    }
  };

  const handleSaveStage = (e) => {
    e.preventDefault();
    
    if (!stageFormData.stageName || stageFormData.km === undefined) {
      alert('Please fill in Stage Name and Distance');
      return;
    }

    if (!selectedRoute) return;

    const stageData = {
      id: stageFormData.id || `STG-${Date.now()}`,
      stageName: stageFormData.stageName,
      km: Number(stageFormData.km) || 0,
      morningTime: stageFormData.morningTime || '07:00',
      eveningTime: stageFormData.eveningTime || '17:00',
      monthlyFee: Number(stageFormData.monthlyFee) || 0,
      semesterFee: Number(stageFormData.semesterFee) || 0,
      annualFee: Number(stageFormData.annualFee) || 0,
    };

    const updatedStages = editingStageIndex !== null
      ? selectedRoute.stages.map((s, i) => i === editingStageIndex ? stageData : s)
      : [...selectedRoute.stages, stageData];

    const updatedRoutes = routes.map(r => 
      r.id === selectedRoute.id ? { ...r, stages: updatedStages } : r
    );
    
    handleUpdateRoutes(updatedRoutes);
    setSelectedRoute({ ...selectedRoute, stages: updatedStages });
    setEditingStageIndex(null);
    setStageFormData({});
  };

  const getStatusBadge = (stages) => {
    if (stages.length === 0) return 'bg-zinc-100 text-zinc-600';
    const hasFees = stages.some(s => s.monthlyFee > 0 || s.semesterFee > 0 || s.annualFee > 0);
    return hasFees ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';
  };

  const getStatusText = (stages) => {
    if (stages.length === 0) return 'No Stages';
    const hasFees = stages.some(s => s.monthlyFee > 0 || s.semesterFee > 0 || s.annualFee > 0);
    return hasFees ? 'Configured' : 'Fee Not Set';
  };

  return (
    <Layout title="Transport Configuration — Routes & Stages Fee">
      <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB] p-4 md:p-6">
        {/* Header Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl mb-6">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
                <Route size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black leading-tight">Transport Configuration — Routes & Stages Fee</h1>
                <p className="text-sm text-blue-100/90 font-medium">C.K. College of Engineering & Technology — Route Master, Stage Distance & Fee Matrix</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-4 md:grid-cols-4 text-xs">
                <div className="bg-white/10 backdrop-blur p-3 rounded-xl border border-white/20 text-center">
                  <p className="text-2xl font-black">{totalRoutes}</p>
                  <p className="opacity-80">Total Routes</p>
                </div>
                <div className="bg-white/10 backdrop-blur p-3 rounded-xl border border-white/20 text-center">
                  <p className="text-2xl font-black">{totalStages}</p>
                  <p className="opacity-80">Total Stages</p>
                </div>
                <div className="bg-white/10 backdrop-blur p-3 rounded-xl border border-white/20 text-center">
                  <p className="text-2xl font-black">{avgStagesPerRoute}</p>
                  <p className="opacity-80">Avg Stages/Route</p>
                </div>
                <div className="bg-white/10 backdrop-blur p-3 rounded-xl border border-white/20 text-center">
                  <p className="text-2xl font-black">₹{totalRevenue.toLocaleString()}</p>
                  <p className="opacity-80">Annual Revenue</p>
                </div>
              </div>
              
              <button
                onClick={handleOpenAddRoute}
                className="px-5 py-2.5 bg-white/15 backdrop-blur border border-white/20 hover:bg-white/25 text-white font-semibold rounded-xl transition-all flex items-center gap-2"
              >
                <Plus size={18} />
                <span>Add Route</span>
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4 mb-6">
          <div className="relative max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by Route Code, Name, Description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent text-sm"
            />
          </div>
        </div>

        {/* Routes List */}
        <div className="space-y-4">
          {isEditing ? (
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
              <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                    <Route size={22} className="text-[#120c7a]" />
                    {selectedRoute ? 'Edit Route' : 'Add New Route'}
                  </h2>
                  <button
                    onClick={() => { setIsEditing(false); setSelectedRoute(null); setFormData({}); }}
                    className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={handleSaveRoute} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-zinc-700">Route Code *</label>
                      <input
                        type="text"
                        value={formData.code || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                        className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                        placeholder="e.g., R101"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-zinc-700">Route Name *</label>
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                        placeholder="e.g., North Campus Express"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-zinc-700">Description</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                      placeholder="Route description, landmarks, etc."
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200">
                    <button
                      type="button"
                      onClick={() => { setIsEditing(false); setSelectedRoute(null); setFormData({}); }}
                      className="px-6 py-2.5 border border-zinc-300 text-zinc-700 font-semibold rounded-xl hover:bg-zinc-50 transition-colors flex items-center gap-2"
                    >
                      <X size={16} /> Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-6 py-2.5 bg-[#120c7a] text-white font-semibold rounded-xl hover:bg-[#0f0a66] transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <Save size={16} /> {saving ? 'Saving...' : (selectedRoute ? 'Update Route' : 'Add Route')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            filteredRoutes.map((route, routeIndex) => (
              <div key={route.id} className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                {/* Route Header Card */}
                <div className="p-5 border-b border-zinc-100 bg-zinc-50/50">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-[#120c7a]/10 flex items-center justify-center">
                        <Route size={22} className="text-[#120c7a]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-bold text-zinc-900">{route.code} — {route.name}</h3>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${getStatusBadge(route.stages)}`}>
                            {getStatusText(route.stages)}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-500 mt-1">{route.description || 'No description'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenAddStage(route.id)}
                        className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2"
                      >
                        <Plus size={16} /> Add Stage
                      </button>
                      <button
                        onClick={() => handleOpenEditRoute(route)}
                        className="px-4 py-2 border border-zinc-300 text-zinc-700 font-semibold rounded-xl hover:bg-zinc-50 transition-colors flex items-center gap-2"
                      >
                        <Edit3 size={16} /> Edit Route
                      </button>
                      <button
                        onClick={() => handleDeleteRoute(route.id)}
                        className="px-4 py-2 border border-red-300 text-red-600 font-semibold rounded-xl hover:bg-red-50 transition-colors flex items-center gap-2"
                      >
                        <Trash2 size={16} /> Delete
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stages Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500 w-8">#</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Stage Name</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Distance (KM)</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Morning Time</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Evening Time</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Monthly Fee</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Semester Fee</th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">Annual Fee</th>
                        <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-zinc-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {route.stages.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-12 text-center text-zinc-500">
                            <div className="flex flex-col items-center gap-3">
                              <MapPin size={48} className="text-zinc-300" />
                              <p className="text-lg font-medium">No stages configured</p>
                              <p className="text-sm">Click "Add Stage" to add boarding points</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        route.stages.map((stage, stageIndex) => (
                          <tr key={stage.id} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-4 py-3 font-mono text-zinc-600">{stageIndex + 1}</td>
                            <td className="px-4 py-3 font-medium text-zinc-900">{stage.stageName}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-mono">
                                <MapPin size={12} /> {stage.km} km
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full text-sm font-mono">
                                {stage.morningTime}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded-full text-sm font-mono">
                                {stage.eveningTime}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-green-700 font-medium">₹{stage.monthlyFee.toLocaleString()}</td>
                            <td className="px-4 py-3 text-blue-700 font-medium">₹{stage.semesterFee.toLocaleString()}</td>
                            <td className="px-4 py-3 text-purple-700 font-medium">₹{stage.annualFee.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleOpenEditStage(route, stageIndex)}
                                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Edit Stage"
                                >
                                  <Edit3 size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteStage(route.id, stageIndex)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete Stage"
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

                {/* Stage Form Modal */}
                {(editingStageIndex !== null || (selectedRoute?.id && stageFormData.stageName !== undefined)) && (
                  <div className="p-5 border-t border-zinc-100 bg-zinc-50/50">
                    <div className="max-w-2xl mx-auto">
                      <h4 className="text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
                        {editingStageIndex !== null ? 'Edit Stage' : 'Add New Stage'}
                      </h4>
                      <form onSubmit={handleSaveStage} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-700">Stage Name *</label>
                            <input
                              type="text"
                              value={stageFormData.stageName || ''}
                              onChange={(e) => setStageFormData(prev => ({ ...prev, stageName: e.target.value }))}
                              className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                              placeholder="e.g., Central Metro Station"
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-700">Distance (KM) *</label>
                            <input
                              type="number"
                              value={stageFormData.km || ''}
                              onChange={(e) => setStageFormData(prev => ({ ...prev, km: e.target.value }))}
                              className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                              placeholder="e.g., 5"
                              min="0"
                              step="0.1"
                              required
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-700">Morning Pickup Time *</label>
                            <input
                              type="time"
                              value={stageFormData.morningTime || ''}
                              onChange={(e) => setStageFormData(prev => ({ ...prev, morningTime: e.target.value }))}
                              className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-700">Evening Return Time *</label>
                            <input
                              type="time"
                              value={stageFormData.eveningTime || ''}
                              onChange={(e) => setStageFormData(prev => ({ ...prev, eveningTime: e.target.value }))}
                              className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                              required
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-700">Monthly Fee (₹)</label>
                            <input
                              type="number"
                              value={stageFormData.monthlyFee || ''}
                              onChange={(e) => setStageFormData(prev => ({ ...prev, monthlyFee: e.target.value }))}
                              className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                              placeholder="0"
                              min="0"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-700">Semester Fee (₹)</label>
                            <input
                              type="number"
                              value={stageFormData.semesterFee || ''}
                              onChange={(e) => setStageFormData(prev => ({ ...prev, semesterFee: e.target.value }))}
                              className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                              placeholder="0"
                              min="0"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-700">Annual Fee (₹)</label>
                            <input
                              type="number"
                              value={stageFormData.annualFee || ''}
                              onChange={(e) => setStageFormData(prev => ({ ...prev, annualFee: e.target.value }))}
                              className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#120c7a] focus:border-transparent"
                              placeholder="0"
                              min="0"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200">
                          <button
                            type="button"
                            onClick={() => { setEditingStageIndex(null); setStageFormData({}); }}
                            className="px-6 py-2.5 border border-zinc-300 text-zinc-700 font-semibold rounded-xl hover:bg-zinc-50 transition-colors flex items-center gap-2"
                          >
                            <X size={16} /> Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={saving}
                            className="px-6 py-2.5 bg-[#120c7a] text-white font-semibold rounded-xl hover:bg-[#0f0a66] transition-colors flex items-center gap-2 disabled:opacity-50"
                          >
                            <Save size={16} /> {saving ? 'Saving...' : (editingStageIndex !== null ? 'Update Stage' : 'Add Stage')}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {routes.length === 0 && !isEditing && !loading && (
          <div className="text-center py-16">
            <Route size={64} className="mx-auto text-zinc-300 mb-4" />
            <h3 className="text-xl font-semibold text-zinc-700 mb-2">No Routes Configured</h3>
            <p className="text-zinc-500 mb-6">Create your first transport route with stages and fee matrix</p>
            <button
              onClick={handleOpenAddRoute}
              className="px-8 py-3 bg-[#120c7a] text-white font-semibold rounded-xl hover:bg-[#0f0a66] transition-colors flex items-center gap-2 mx-auto"
            >
              <Plus size={20} /> Create First Route
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}