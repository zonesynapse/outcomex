import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { 
  Bus, 
  Route as RouteIcon, 
  Users, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Save, 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  Clock, 
  Phone, 
  ShieldCheck, 
  Calendar, 
  CreditCard, 
  AlertCircle,
  FileText,
  BadgeAlert,
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import Layout from "../components/Layout";
import { db } from "../firebase";
import { doc, onSnapshot, setDoc, collection } from 'firebase/firestore';

export default function TransportConfig() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const getInitialTab = () => {
    if (location.pathname.includes('routes')) return 'routes';
    if (location.pathname.includes('driver')) return 'drivers';
    if (location.pathname.includes('bus-fleet')) return 'fleet';
    return searchParams.get('tab') || 'fleet';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Sync state with URL params
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  };

  // Shared Data States
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [websiteUsers, setWebsiteUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  };

  // ==================== FIRESTORE LISTENERS ====================
  useEffect(() => {
    const busesRef = doc(db, 'transport_config', 'bus_fleet');
    const routesRef = doc(db, 'transport_config', 'routes');
    const driversRef = doc(db, 'transport_config', 'drivers');
    const usersRef = collection(db, 'users');

    let busesDone = false, routesDone = false, driversDone = false, usersDone = false;
    const checkDone = () => {
      if (busesDone && routesDone && driversDone && usersDone) setLoading(false);
    };

    const unsubBuses = onSnapshot(busesRef, (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.buses)) {
        setBuses(snap.data().buses);
      } else {
        setBuses([]);
      }
      busesDone = true;
      checkDone();
    }, (err) => {
      console.warn("Buses snapshot error:", err);
      busesDone = true;
      checkDone();
    });

    const unsubRoutes = onSnapshot(routesRef, (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.routes)) {
        setRoutes(snap.data().routes);
      } else {
        setRoutes([]);
      }
      routesDone = true;
      checkDone();
    }, (err) => {
      console.warn("Routes snapshot error:", err);
      routesDone = true;
      checkDone();
    });

    const unsubDrivers = onSnapshot(driversRef, (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.drivers)) {
        setDrivers(snap.data().drivers);
      } else {
        setDrivers([]);
      }
      driversDone = true;
      checkDone();
    }, (err) => {
      console.warn("Drivers snapshot error:", err);
      driversDone = true;
      checkDone();
    });

    const unsubUsers = onSnapshot(usersRef, (snap) => {
      const uList = snap.docs.map(d => ({
        uid: d.id,
        id: d.id,
        ...d.data()
      }));
      setWebsiteUsers(uList);
      usersDone = true;
      checkDone();
    }, (err) => {
      console.warn("Users snapshot error:", err);
      usersDone = true;
      checkDone();
    });

    return () => {
      unsubBuses();
      unsubRoutes();
      unsubDrivers();
      unsubUsers();
    };
  }, []);

  // Sync tab with external query changes (e.g. back/forward navigation)
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (urlTab && urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
  }, [searchParams]);

  // ==================== TAB 1: BUS FLEET STATE & HANDLERS ====================
  const [busSearch, setBusSearch] = useState('');
  const [busStatusFilter, setBusStatusFilter] = useState('all');
  const [busTypeFilter, setBusTypeFilter] = useState('all');
  const [selectedBus, setSelectedBus] = useState(null);
  const [isBusModalOpen, setIsBusModalOpen] = useState(false);
  const [busFormData, setBusFormData] = useState({});

  const filteredBuses = useMemo(() => {
    return buses.filter(bus => {
      const q = busSearch.toLowerCase();
      const matchesSearch = !q || 
        bus.busNo?.toLowerCase().includes(q) ||
        bus.regNo?.toLowerCase().includes(q) ||
        bus.manufacturer?.toLowerCase().includes(q);
      const matchesStatus = busStatusFilter === 'all' || bus.status === busStatusFilter;
      const matchesType = busTypeFilter === 'all' || bus.busType === busTypeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [buses, busSearch, busStatusFilter, busTypeFilter]);

  const busStats = useMemo(() => {
    const active = buses.filter(b => b.status === 'Active').length;
    const maintenance = buses.filter(b => b.status === 'Maintenance').length;
    const inactive = buses.filter(b => b.status === 'Inactive').length;
    const totalCapacity = buses.reduce((acc, b) => acc + (Number(b.capacity) || 0), 0);
    return { total: buses.length, active, maintenance, inactive, totalCapacity };
  }, [buses]);

  const handleOpenAddBus = () => {
    setBusFormData({
      id: `BUS-${Date.now()}`,
      busNo: `BUS #${buses.length + 1}`,
      capacity: 52,
      regNo: '',
      driverId: '',
      routeId: '',
      status: 'Active',
      busType: 'Standard',
      manufacturer: '',
      yearOfManufacture: new Date().getFullYear(),
      insuranceExpiry: '',
      fitnessExpiry: '',
      permitExpiry: '',
    });
    setSelectedBus(null);
    setIsBusModalOpen(true);
  };

  const handleOpenEditBus = (bus) => {
    setBusFormData({ ...bus });
    setSelectedBus(bus);
    setIsBusModalOpen(true);
  };

  const handleSaveBus = async (e) => {
    e.preventDefault();
    if (!busFormData.busNo || !busFormData.regNo || !busFormData.capacity) {
      alert('Please fill in Bus Number, Registration Number, and Seating Capacity');
      return;
    }

    const busPayload = {
      ...busFormData,
      capacity: Number(busFormData.capacity) || 0,
      yearOfManufacture: Number(busFormData.yearOfManufacture) || new Date().getFullYear(),
      driverId: busFormData.driverId || null,
      routeId: busFormData.routeId || null
    };

    let updatedBuses;
    if (selectedBus) {
      updatedBuses = buses.map(b => b.id === selectedBus.id ? busPayload : b);
    } else {
      updatedBuses = [...buses, busPayload];
    }

    setSaving(true);
    try {
      await setDoc(doc(db, 'transport_config', 'bus_fleet'), {
        buses: updatedBuses,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Synchronize assignedBusId in drivers database
      if (busPayload.driverId) {
        try {
          let updatedDrivers = [...drivers];
          const dIdx = updatedDrivers.findIndex(d => d.id === busPayload.driverId || d.userId === busPayload.driverId);
          if (dIdx >= 0) {
            updatedDrivers[dIdx] = { ...updatedDrivers[dIdx], assignedBusId: busPayload.id };
          } else {
            const uDrv = unifiedDrivers.find(d => d.id === busPayload.driverId || d.userId === busPayload.driverId);
            if (uDrv) {
              updatedDrivers.push({
                id: uDrv.id,
                userId: uDrv.userId || null,
                name: uDrv.name,
                designation: uDrv.designation || 'Driver',
                phone: uDrv.phone || '',
                licenseNo: uDrv.licenseNo || '',
                status: uDrv.status || 'Active',
                assignedBusId: busPayload.id
              });
            }
          }
          await setDoc(doc(db, 'transport_config', 'drivers'), {
            drivers: updatedDrivers,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (drvErr) {
          console.warn("Could not sync driver assignedBusId:", drvErr);
        }
      }

      showToast(selectedBus ? 'Bus updated successfully' : 'New bus registered to fleet');
      setIsBusModalOpen(false);
      setSelectedBus(null);
      setBusFormData({});
    } catch (err) {
      console.error('Error saving bus:', err);
      alert('Failed to save bus. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBus = async (busId) => {
    if (!window.confirm('Are you sure you want to delete this bus?')) return;
    const updated = buses.filter(b => b.id !== busId);
    setSaving(true);
    try {
      await setDoc(doc(db, 'transport_config', 'bus_fleet'), {
        buses: updated,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      showToast('Bus removed from fleet', 'success');
      if (selectedBus?.id === busId) {
        setIsBusModalOpen(false);
        setSelectedBus(null);
      }
    } catch (err) {
      console.error('Error deleting bus:', err);
      alert('Failed to delete bus');
    } finally {
      setSaving(false);
    }
  };

  // ==================== TAB 2: ROUTES & STAGES STATE & HANDLERS ====================
  const [routeSearch, setRouteSearch] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [routeFormData, setRouteFormData] = useState({});
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [stageFormData, setStageFormData] = useState({});
  const [editingStageIndex, setEditingStageIndex] = useState(null);

  const filteredRoutes = useMemo(() => {
    return routes.filter(r => {
      const q = routeSearch.toLowerCase();
      return !q || 
        r.code?.toLowerCase().includes(q) || 
        r.name?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q);
    });
  }, [routes, routeSearch]);

  const selectedRoute = useMemo(() => {
    if (!selectedRouteId) return routes[0] || null;
    return routes.find(r => r.id === selectedRouteId) || routes[0] || null;
  }, [routes, selectedRouteId]);

  const routeStats = useMemo(() => {
    const totalStages = routes.reduce((sum, r) => sum + (r.stages?.length || 0), 0);
    const totalMaxKm = routes.reduce((max, r) => {
      const routeMax = (r.stages || []).reduce((m, st) => Math.max(m, Number(st.km) || 0), 0);
      return Math.max(max, routeMax);
    }, 0);
    return { totalRoutes: routes.length, totalStages, totalMaxKm };
  }, [routes]);

  const handleOpenAddRoute = () => {
    setRouteFormData({
      id: `RT-${Date.now()}`,
      code: `R${routes.length + 101}`,
      name: '',
      description: '',
      stages: []
    });
    setIsRouteModalOpen(true);
  };

  const handleOpenEditRoute = (route) => {
    setRouteFormData({ ...route });
    setIsRouteModalOpen(true);
  };

  const handleSaveRoute = async (e) => {
    e.preventDefault();
    if (!routeFormData.code || !routeFormData.name) {
      alert('Please fill in Route Code and Route Name');
      return;
    }

    const routePayload = {
      ...routeFormData,
      code: routeFormData.code,
      routeCode: routeFormData.code,
      name: routeFormData.name,
      routeName: routeFormData.name,
      stages: (routeFormData.stages || []).map(st => ({
        ...st,
        name: st.stageName || st.name,
        stageName: st.stageName || st.name,
        pickupTime: st.morningTime || st.pickupTime,
        morningTime: st.morningTime || st.pickupTime,
        dropTime: st.eveningTime || st.dropTime,
        eveningTime: st.eveningTime || st.dropTime,
        semFee: Number(st.semesterFee ?? st.semFee) || 0,
        semesterFee: Number(st.semesterFee ?? st.semFee) || 0,
        annualFee: Number(st.annualFee) || 0,
        monthlyFee: Number(st.monthlyFee) || 0
      }))
    };

    let updatedRoutes;
    const exists = routes.some(r => r.id === routePayload.id);
    if (exists) {
      updatedRoutes = routes.map(r => r.id === routePayload.id ? routePayload : r);
    } else {
      updatedRoutes = [...routes, routePayload];
    }

    setSaving(true);
    try {
      await setDoc(doc(db, 'transport_config', 'routes'), {
        routes: updatedRoutes,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      showToast('Route saved successfully');
      setIsRouteModalOpen(false);
      setSelectedRouteId(routePayload.id);
    } catch (err) {
      console.error('Error saving route:', err);
      alert('Failed to save route');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRoute = async (routeId) => {
    if (!window.confirm('Are you sure you want to delete this route and its stages?')) return;
    const updated = routes.filter(r => r.id !== routeId);
    setSaving(true);
    try {
      await setDoc(doc(db, 'transport_config', 'routes'), {
        routes: updated,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      showToast('Route deleted');
      if (selectedRouteId === routeId) {
        setSelectedRouteId(updated[0]?.id || null);
      }
    } catch (err) {
      console.error('Error deleting route:', err);
      alert('Failed to delete route');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAddStage = () => {
    if (!selectedRoute) return;
    setStageFormData({
      id: `STG-${Date.now()}`,
      stageName: '',
      km: 0,
      morningTime: '07:30',
      eveningTime: '17:30',
      monthlyFee: 1200,
      semesterFee: 6000,
      annualFee: 12000
    });
    setEditingStageIndex(null);
    setIsStageModalOpen(true);
  };

  const handleOpenEditStage = (stage, index) => {
    setStageFormData({ ...stage });
    setEditingStageIndex(index);
    setIsStageModalOpen(true);
  };

  const handleSaveStage = async (e) => {
    e.preventDefault();
    if (!selectedRoute) return;
    if (!stageFormData.stageName) {
      alert('Please enter Stage / Stop Name');
      return;
    }

    const stagePayload = {
      ...stageFormData,
      name: stageFormData.stageName,
      stageName: stageFormData.stageName,
      pickupTime: stageFormData.morningTime,
      morningTime: stageFormData.morningTime,
      dropTime: stageFormData.eveningTime,
      eveningTime: stageFormData.eveningTime,
      semFee: Number(stageFormData.semesterFee) || 0,
      semesterFee: Number(stageFormData.semesterFee) || 0,
      annualFee: Number(stageFormData.annualFee) || 0,
      monthlyFee: Number(stageFormData.monthlyFee) || 0,
      km: Number(stageFormData.km) || 0
    };

    const currentStages = [...(selectedRoute.stages || [])];
    if (editingStageIndex !== null && editingStageIndex >= 0) {
      currentStages[editingStageIndex] = stagePayload;
    } else {
      currentStages.push(stagePayload);
    }

    const updatedRoutes = routes.map(r => r.id === selectedRoute.id ? { ...r, stages: currentStages } : r);

    setSaving(true);
    try {
      await setDoc(doc(db, 'transport_config', 'routes'), {
        routes: updatedRoutes,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      showToast(editingStageIndex !== null ? 'Stage updated' : 'New stage added to route');
      setIsStageModalOpen(false);
      setEditingStageIndex(null);
    } catch (err) {
      console.error('Error saving stage:', err);
      alert('Failed to save stage');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStage = async (stageIndex) => {
    if (!selectedRoute) return;
    if (!window.confirm('Delete this stage from route?')) return;
    const currentStages = (selectedRoute.stages || []).filter((_, idx) => idx !== stageIndex);
    const updatedRoutes = routes.map(r => r.id === selectedRoute.id ? { ...r, stages: currentStages } : r);
    setSaving(true);
    try {
      await setDoc(doc(db, 'transport_config', 'routes'), {
        routes: updatedRoutes,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      showToast('Stage removed from route');
    } catch (err) {
      console.error('Error deleting stage:', err);
      alert('Failed to delete stage');
    } finally {
      setSaving(false);
    }
  };

  // ==================== TAB 3: DRIVER DATABASE STATE & HANDLERS ====================
  const [driverSearch, setDriverSearch] = useState('');
  const [driverStatusFilter, setDriverStatusFilter] = useState('all');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [driverFormData, setDriverFormData] = useState({});

  // Merge users whose designation is "Driver" or "driver" with transport_config/drivers
  const unifiedDrivers = useMemo(() => {
    // 1. Filter website users whose designation is "driver" (case-insensitive) or role is "driver"
    const driverUsers = websiteUsers.filter(u => {
      const des = (u.designation || '').trim().toLowerCase();
      const role = (u.role || '').trim().toLowerCase();
      return des === 'driver' || des.includes('driver') || role === 'driver';
    });

    const matchedUserIds = new Set();
    const result = driverUsers.map(u => {
      matchedUserIds.add(u.uid);
      const name = u.displayName || u.facultyName || u.name || u.email || 'Driver';

      // Look up existing transport details from transport_config/drivers
      const tDrv = drivers.find(d => 
        (d.userId && d.userId === u.uid) || 
        d.id === u.uid || 
        (d.email && u.email && d.email.toLowerCase() === u.email.toLowerCase()) ||
        (d.name && d.name.trim().toLowerCase() === name.trim().toLowerCase())
      );

      return {
        id: u.uid,
        userId: u.uid,
        name: name,
        email: u.email || '',
        designation: u.designation || 'Driver',
        phone: tDrv?.phone || u.phone || u.phoneNumber || u.mobile || '',
        licenseNo: tDrv?.licenseNo || u.licenseNo || '',
        licenseExpiry: tDrv?.licenseExpiry || u.licenseExpiry || '',
        emergencyContact: tDrv?.emergencyContact || u.emergencyContact || '',
        experienceYears: tDrv?.experienceYears !== undefined ? tDrv.experienceYears : (u.experienceYears ?? ''),
        assignedBusId: tDrv?.assignedBusId || u.assignedBusId || null,
        bloodGroup: tDrv?.bloodGroup || u.bloodGroup || '',
        status: tDrv?.status || (u.isApproved !== false ? 'Active' : 'Inactive'),
        address: tDrv?.address || u.address || '',
        isWebsiteUser: true,
        photoURL: u.photoURL || null
      };
    });

    // 2. Also preserve any existing drivers in transport_config/drivers that are not linked to a user
    drivers.forEach(d => {
      if (!matchedUserIds.has(d.userId) && !matchedUserIds.has(d.id)) {
        result.push({
          ...d,
          isWebsiteUser: false
        });
      }
    });

    return result;
  }, [websiteUsers, drivers]);

  const filteredDrivers = useMemo(() => {
    return unifiedDrivers.filter(d => {
      const q = driverSearch.toLowerCase();
      const matchesSearch = !q ||
        d.name?.toLowerCase().includes(q) ||
        d.licenseNo?.toLowerCase().includes(q) ||
        d.phone?.toLowerCase().includes(q) ||
        d.email?.toLowerCase().includes(q) ||
        d.designation?.toLowerCase().includes(q);
      const matchesStatus = driverStatusFilter === 'all' || d.status === driverStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [unifiedDrivers, driverSearch, driverStatusFilter]);

  const driverStats = useMemo(() => {
    const active = unifiedDrivers.filter(d => d.status === 'Active').length;
    const assigned = unifiedDrivers.filter(d => d.assignedBusId).length;
    const unassigned = unifiedDrivers.filter(d => !d.assignedBusId && d.status === 'Active').length;
    return { total: unifiedDrivers.length, active, assigned, unassigned };
  }, [unifiedDrivers]);

  const handleOpenAddDriver = () => {
    setDriverFormData({
      id: `DRV-${Date.now()}`,
      userId: null,
      name: '',
      designation: 'Driver',
      licenseNo: '',
      phone: '',
      experienceYears: 5,
      assignedBusId: '',
      status: 'Active',
      emergencyContact: '',
      licenseExpiry: '',
      bloodGroup: 'B+',
      address: ''
    });
    setSelectedDriver(null);
    setIsDriverModalOpen(true);
  };

  const handleOpenEditDriver = (driver) => {
    setDriverFormData({ ...driver });
    setSelectedDriver(driver);
    setIsDriverModalOpen(true);
  };

  const handleSaveDriver = async (e) => {
    e.preventDefault();
    if (!driverFormData.name) {
      alert('Please fill in Driver Name');
      return;
    }

    const driverPayload = {
      id: driverFormData.id || driverFormData.userId || `DRV-${Date.now()}`,
      userId: driverFormData.userId || null,
      name: driverFormData.name,
      designation: driverFormData.designation || 'Driver',
      phone: driverFormData.phone || '',
      licenseNo: driverFormData.licenseNo || '',
      licenseExpiry: driverFormData.licenseExpiry || '',
      emergencyContact: driverFormData.emergencyContact || '',
      experienceYears: Number(driverFormData.experienceYears) || 0,
      assignedBusId: driverFormData.assignedBusId || null,
      bloodGroup: driverFormData.bloodGroup || '',
      status: driverFormData.status || 'Active',
      address: driverFormData.address || '',
      updatedAt: new Date().toISOString()
    };

    // Update in transport_config/drivers
    const existingIdx = drivers.findIndex(d => 
      (driverPayload.userId && (d.userId === driverPayload.userId || d.id === driverPayload.userId)) ||
      (driverPayload.id && (d.id === driverPayload.id || d.userId === driverPayload.id))
    );

    let updatedDrivers;
    if (existingIdx >= 0) {
      updatedDrivers = [...drivers];
      updatedDrivers[existingIdx] = { ...updatedDrivers[existingIdx], ...driverPayload };
    } else {
      updatedDrivers = [...drivers, driverPayload];
    }

    setSaving(true);
    try {
      // 1. Save to transport_config/drivers
      await setDoc(doc(db, 'transport_config', 'drivers'), {
        drivers: updatedDrivers,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 2. If it's a website user with a UID, also update the user document in 'users'
      if (driverFormData.userId) {
        try {
          await setDoc(doc(db, 'users', driverFormData.userId), {
            phone: driverFormData.phone || '',
            licenseNo: driverFormData.licenseNo || '',
            licenseExpiry: driverFormData.licenseExpiry || '',
            emergencyContact: driverFormData.emergencyContact || '',
            experienceYears: Number(driverFormData.experienceYears) || 0,
            assignedBusId: driverFormData.assignedBusId || null,
            bloodGroup: driverFormData.bloodGroup || '',
            address: driverFormData.address || ''
          }, { merge: true });
        } catch (uErr) {
          console.warn('Could not update user record in users collection:', uErr);
        }
      }

      // 3. If assigned to a bus, update the bus in bus_fleet
      if (driverPayload.assignedBusId) {
        const busToUpdate = buses.find(b => b.id === driverPayload.assignedBusId);
        if (busToUpdate && busToUpdate.driverId !== driverPayload.id) {
          const updatedBuses = buses.map(b => 
            b.id === driverPayload.assignedBusId ? { ...b, driverId: driverPayload.id } : b
          );
          await setDoc(doc(db, 'transport_config', 'bus_fleet'), {
            buses: updatedBuses,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      }

      showToast(selectedDriver ? 'Driver details updated successfully' : 'Driver saved successfully');
      setIsDriverModalOpen(false);
      setSelectedDriver(null);
      setDriverFormData({});
    } catch (err) {
      console.error('Error saving driver:', err);
      alert('Failed to save driver details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDriver = async (driverId) => {
    const drv = unifiedDrivers.find(d => d.id === driverId || d.userId === driverId);
    if (!drv) return;
    const confirmMsg = drv.isWebsiteUser
      ? `Are you sure you want to remove transport details for driver ${drv.name}? (User website account will be kept)`
      : `Are you sure you want to delete driver ${drv.name}?`;
    if (!window.confirm(confirmMsg)) return;

    const updated = drivers.filter(d => d.id !== driverId && d.userId !== driverId);
    setSaving(true);
    try {
      await setDoc(doc(db, 'transport_config', 'drivers'), {
        drivers: updated,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      if (drv.userId) {
        try {
          await setDoc(doc(db, 'users', drv.userId), {
            licenseNo: '',
            licenseExpiry: '',
            assignedBusId: null,
            experienceYears: 0,
            emergencyContact: ''
          }, { merge: true });
        } catch (e) {
          console.warn("Could not clear user fields:", e);
        }
      }

      showToast('Driver record deleted', 'success');
      if (selectedDriver?.id === driverId || selectedDriver?.userId === driverId) {
        setIsDriverModalOpen(false);
        setSelectedDriver(null);
      }
    } catch (err) {
      console.error('Error deleting driver:', err);
      alert('Failed to delete driver');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDriverStatus = async (driver, e) => {
    if (e) e.stopPropagation();
    const newStatus = driver.status === 'Active' ? 'Inactive' : 'Active';

    const existingIdx = drivers.findIndex(d => 
      (driver.userId && (d.userId === driver.userId || d.id === driver.userId)) ||
      (driver.id && (d.id === driver.id || d.userId === driver.id))
    );

    let updatedDrivers;
    if (existingIdx >= 0) {
      updatedDrivers = [...drivers];
      updatedDrivers[existingIdx] = { 
        ...updatedDrivers[existingIdx], 
        status: newStatus,
        updatedAt: new Date().toISOString()
      };
    } else {
      updatedDrivers = [
        ...drivers, 
        {
          id: driver.id || driver.userId || `DRV-${Date.now()}`,
          userId: driver.userId || null,
          name: driver.name,
          designation: driver.designation || 'Driver',
          phone: driver.phone || '',
          licenseNo: driver.licenseNo || '',
          licenseExpiry: driver.licenseExpiry || '',
          emergencyContact: driver.emergencyContact || '',
          experienceYears: Number(driver.experienceYears) || 0,
          assignedBusId: driver.assignedBusId || null,
          bloodGroup: driver.bloodGroup || '',
          status: newStatus,
          address: driver.address || '',
          updatedAt: new Date().toISOString()
        }
      ];
    }

    try {
      await setDoc(doc(db, 'transport_config', 'drivers'), {
        drivers: updatedDrivers,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      if (driver.userId) {
        try {
          await setDoc(doc(db, 'users', driver.userId), {
            isApproved: newStatus === 'Active',
            status: newStatus
          }, { merge: true });
        } catch (uErr) {
          console.warn('Could not update user doc status:', uErr);
        }
      }

      showToast(`${driver.name} is now marked ${newStatus}`);
    } catch (err) {
      console.error('Error toggling driver status:', err);
      alert('Failed to update driver status');
    }
  };

  // Helper lookup functions
  const getDriverName = (driverId) => {
    if (!driverId) return 'Unassigned';
    const drv = unifiedDrivers.find(d => d.id === driverId || d.userId === driverId);
    return drv ? drv.name : 'Unknown';
  };

  const getRouteName = (routeId) => {
    if (!routeId) return 'Unassigned';
    const rt = routes.find(r => r.id === routeId);
    return rt ? `${rt.code} - ${rt.name}` : 'Unknown';
  };

  const getBusNumber = (busId) => {
    if (!busId) return 'Unassigned';
    const bus = buses.find(b => b.id === busId);
    return bus ? `${bus.busNo} (${bus.regNo || 'No Reg'})` : 'Unknown';
  };

  // Expiry status check
  const checkExpiryStatus = (dateStr) => {
    if (!dateStr) return { label: 'Not Set', color: 'bg-zinc-100 text-zinc-600' };
    const expiry = new Date(dateStr);
    const today = new Date();
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: 'Expired', color: 'bg-red-100 text-red-700 border border-red-300' };
    if (diffDays <= 30) return { label: `Expiring (${diffDays}d)`, color: 'bg-amber-100 text-amber-800 border border-amber-300' };
    return { label: 'Valid', color: 'bg-emerald-100 text-emerald-800 border border-emerald-300' };
  };

  const tabButtons = [
    { id: 'fleet', label: 'Bus Fleet', icon: Bus },
    { id: 'routes', label: 'Route & Stages', icon: RouteIcon },
    { id: 'drivers', label: 'Driver Database', icon: Users },
  ];

  return (
    <Layout title="Transport Configuration">
      {/* Toast Alert Notification */}
      {toast.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border transition-all animate-in fade-in slide-in-from-top-4 ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-red-50 text-red-900 border-red-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertCircle size={18} className="text-red-600" />}
          <span className="font-bold text-xs">{toast.message}</span>
        </div>
      )}

      <div className="w-full px-2 sm:px-4 md:px-6 py-3 space-y-6">
        {/* Top Header Bar Directly Below App Navbar: Left has breadcrumbs/title, Right has the 3 pill buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-zinc-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                Transport Module
              </span>
              <span className="text-xs text-zinc-400 font-medium">•</span>
              <span className="text-xs font-semibold text-zinc-500">
                {activeTab === 'fleet' && 'Fleet Management & Vehicle Health'}
                {activeTab === 'routes' && 'Route Stops, Distance & Fee Slabs'}
                {activeTab === 'drivers' && 'Driver Records & License Compliance'}
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-zinc-900 mt-1 flex items-center gap-2">
              Transport Configuration
            </h1>
          </div>

          {/* Top Right Navigation Buttons (Pill Tab Bar Styled Exactly Like Fee Operations Reference) */}
          <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-xl border border-zinc-200 shadow-sm w-fit self-start sm:self-auto">
            {tabButtons.map(btn => {
              const Icon = btn.icon;
              const isActive = activeTab === btn.id;
              return (
                <button
                  key={btn.id}
                  onClick={() => handleTabChange(btn.id)}
                  className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                    isActive 
                      ? "bg-white text-[#120c7a] shadow-sm ring-1 ring-black/5" 
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
                  }`}
                >
                  <Icon size={14} className={isActive ? "text-[#120c7a]" : "text-zinc-500"} />
                  <span>{btn.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ============================================================== */}
        {/* TAB 1: BUS FLEET VIEW                                          */}
        {/* ============================================================== */}
        {activeTab === 'fleet' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* KPI Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Fleet</p>
                  <p className="text-2xl font-black text-zinc-900 mt-0.5">{busStats.total}</p>
                  <p className="text-[11px] font-semibold text-zinc-500">Registered Vehicles</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                  <Bus size={22} />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Active Buses</p>
                  <p className="text-2xl font-black text-emerald-700 mt-0.5">{busStats.active}</p>
                  <p className="text-[11px] font-semibold text-emerald-600/80">Ready on routes</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <CheckCircle2 size={22} />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Maintenance</p>
                  <p className="text-2xl font-black text-amber-700 mt-0.5">{busStats.maintenance}</p>
                  <p className="text-[11px] font-semibold text-amber-600/80">Workshop / Service</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                  <AlertTriangle size={22} />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Total Seats</p>
                  <p className="text-2xl font-black text-purple-700 mt-0.5">{busStats.totalCapacity}</p>
                  <p className="text-[11px] font-semibold text-purple-600/80">Passenger Capacity</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                  <Users size={22} />
                </div>
              </div>
            </div>

            {/* Controls Bar: Search, Filters, Add Bus Button */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={busSearch}
                    onChange={(e) => setBusSearch(e.target.value)}
                    placeholder="Search by Bus No, Reg No, Make..."
                    className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                  {busSearch && (
                    <button onClick={() => setBusSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                      <X size={14} />
                    </button>
                  )}
                </div>

                <select
                  value={busStatusFilter}
                  onChange={(e) => setBusStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Inactive">Inactive</option>
                </select>

                <select
                  value={busTypeFilter}
                  onChange={(e) => setBusTypeFilter(e.target.value)}
                  className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">All Types</option>
                  <option value="Standard">Standard</option>
                  <option value="Deluxe">Deluxe</option>
                  <option value="AC">AC</option>
                  <option value="Non-AC">Non-AC</option>
                </select>

                {(busSearch || busStatusFilter !== 'all' || busTypeFilter !== 'all') && (
                  <button
                    onClick={() => { setBusSearch(''); setBusStatusFilter('all'); setBusTypeFilter('all'); }}
                    className="px-2.5 py-1.5 text-xs font-bold text-zinc-400 hover:text-zinc-700"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              <button
                onClick={handleOpenAddBus}
                className="px-4 py-2 bg-[#120c7a] hover:bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
              >
                <Plus size={15} /> Add Bus
              </button>
            </div>

            {/* Bus Fleet Table */}
            <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/75 border-b border-zinc-200 text-[11px] font-black uppercase tracking-wider text-zinc-500">
                      <th className="px-4 py-3">Bus Number</th>
                      <th className="px-4 py-3">Registration No</th>
                      <th className="px-4 py-3">Capacity</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Assigned Route</th>
                      <th className="px-4 py-3">Assigned Driver</th>
                      <th className="px-4 py-3">Fitness Expiry</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-xs font-medium text-zinc-700">
                    {filteredBuses.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-zinc-400 font-semibold">
                          <Bus size={36} className="mx-auto mb-2 text-zinc-300" />
                          No buses found matching the current filter.
                        </td>
                      </tr>
                    ) : (
                      filteredBuses.map((bus) => {
                        const fitnessStatus = checkExpiryStatus(bus.fitnessExpiry);
                        return (
                          <tr key={bus.id} className="hover:bg-blue-50/40 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-blue-100/70 text-blue-800 flex items-center justify-center font-bold text-xs">
                                  <Bus size={14} />
                                </div>
                                <span className="font-bold text-zinc-900">{bus.busNo}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono font-bold text-zinc-800">
                              {bus.regNo || '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 font-bold text-zinc-700">
                                {bus.capacity} seats
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-200">
                                {bus.busType || 'Standard'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-semibold text-zinc-800">
                                {getRouteName(bus.routeId)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-semibold text-zinc-800">
                                {getDriverName(bus.driverId)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${fitnessStatus.color}`}>
                                  {fitnessStatus.label}
                                </span>
                                {bus.fitnessExpiry && <span className="text-[11px] text-zinc-500">{bus.fitnessExpiry}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 ${
                                bus.status === 'Active' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                                bus.status === 'Maintenance' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                'bg-zinc-100 text-zinc-600 border border-zinc-300'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${bus.status === 'Active' ? 'bg-emerald-500 animate-pulse' : bus.status === 'Maintenance' ? 'bg-amber-500' : 'bg-zinc-400'}`}></span>
                                {bus.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleOpenEditBus(bus)}
                                  className="p-1.5 text-zinc-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Edit Bus"
                                >
                                  <Edit3 size={15} />
                                </button>
                                <button
                                  onClick={() => handleDeleteBus(bus.id)}
                                  className="p-1.5 text-zinc-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete Bus"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: ROUTE & STAGES VIEW                                     */}
        {/* ============================================================== */}
        {activeTab === 'routes' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* KPI Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Routes</p>
                  <p className="text-2xl font-black text-zinc-900 mt-0.5">{routeStats.totalRoutes}</p>
                  <p className="text-[11px] font-semibold text-zinc-500">Scheduled Transits</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                  <RouteIcon size={22} />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Total Stops / Stages</p>
                  <p className="text-2xl font-black text-emerald-700 mt-0.5">{routeStats.totalStages}</p>
                  <p className="text-[11px] font-semibold text-emerald-600/80">Designated Pickups</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <MapPin size={22} />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Longest Distance</p>
                  <p className="text-2xl font-black text-purple-700 mt-0.5">{routeStats.totalMaxKm} KM</p>
                  <p className="text-[11px] font-semibold text-purple-600/80">Max Stage Radius</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                  <Clock size={22} />
                </div>
              </div>
            </div>

            {/* Route Control Bar */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={routeSearch}
                  onChange={(e) => setRouteSearch(e.target.value)}
                  placeholder="Search routes by code, name..."
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>

              <button
                onClick={handleOpenAddRoute}
                className="px-4 py-2 bg-[#120c7a] hover:bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
              >
                <Plus size={15} /> Add Route
              </button>
            </div>

            {/* Split Screen Master-Detail Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Route List Column */}
              <div className="lg:col-span-5 space-y-3">
                <h2 className="text-xs font-black uppercase tracking-wider text-zinc-500 px-1">
                  Routes Directory ({filteredRoutes.length})
                </h2>

                {filteredRoutes.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl border border-zinc-200/80 text-center text-zinc-400">
                    <RouteIcon size={32} className="mx-auto mb-2 text-zinc-300" />
                    <p className="text-xs font-semibold">No routes created yet.</p>
                  </div>
                ) : (
                  filteredRoutes.map((route) => {
                    const isSelected = selectedRoute?.id === route.id;
                    const stageCount = route.stages?.length || 0;
                    return (
                      <div
                        key={route.id}
                        onClick={() => setSelectedRouteId(route.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-blue-50/60 border-blue-300 shadow-sm ring-1 ring-blue-300"
                            : "bg-white border-zinc-200/80 hover:border-zinc-300 hover:shadow-xs"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <span className="px-2.5 py-1 bg-[#120c7a] text-white rounded-lg text-xs font-black font-mono">
                              {route.code}
                            </span>
                            <div>
                              <h3 className="font-bold text-sm text-zinc-900">{route.name}</h3>
                              <p className="text-xs text-zinc-500 line-clamp-1">{route.description || 'No description'}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOpenEditRoute(route); }}
                              className="p-1.5 text-zinc-400 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
                              title="Edit Route Info"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteRoute(route.id); }}
                              className="p-1.5 text-zinc-400 hover:text-red-700 hover:bg-red-100 rounded-lg transition-colors"
                              title="Delete Route"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-zinc-200/50 flex items-center justify-between text-xs text-zinc-500">
                          <span className="font-semibold flex items-center gap-1">
                            <MapPin size={13} className="text-zinc-400" /> {stageCount} {stageCount === 1 ? 'stage' : 'stages'}
                          </span>
                          <span className="text-[11px] font-bold text-blue-700 flex items-center gap-0.5">
                            Manage Stages <ArrowRight size={12} />
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Selected Route Stages Breakdown Column */}
              <div className="lg:col-span-7">
                {selectedRoute ? (
                  <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-zinc-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-black font-mono">
                            {selectedRoute.code}
                          </span>
                          <h3 className="font-black text-base text-zinc-900">{selectedRoute.name}</h3>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">{selectedRoute.description || 'Stage stops and fee configuration for this route'}</p>
                      </div>

                      <button
                        onClick={handleOpenAddStage}
                        className="px-3.5 py-1.5 bg-[#120c7a] hover:bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all self-start sm:self-auto"
                      >
                        <Plus size={14} /> Add Stage
                      </button>
                    </div>

                    {/* Stages Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            <th className="px-3 py-2.5">#</th>
                            <th className="px-3 py-2.5">Stage / Stop Name</th>
                            <th className="px-3 py-2.5">Distance</th>
                            <th className="px-3 py-2.5">Timings (AM / PM)</th>
                            <th className="px-3 py-2.5">Monthly Fee</th>
                            <th className="px-3 py-2.5">Semester Fee</th>
                            <th className="px-3 py-2.5">Annual Fee</th>
                            <th className="px-3 py-2.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 text-xs text-zinc-700">
                          {(!selectedRoute.stages || selectedRoute.stages.length === 0) ? (
                            <tr>
                              <td colSpan={8} className="px-3 py-10 text-center text-zinc-400 font-semibold">
                                <MapPin size={28} className="mx-auto mb-1 text-zinc-300" />
                                No stages added to this route yet. Click "Add Stage" above to begin.
                              </td>
                            </tr>
                          ) : (
                            selectedRoute.stages.map((stage, idx) => (
                              <tr key={stage.id || idx} className="hover:bg-zinc-50/60">
                                <td className="px-3 py-2.5 font-bold text-zinc-400">{idx + 1}</td>
                                <td className="px-3 py-2.5 font-bold text-zinc-900 flex items-center gap-1.5">
                                  <MapPin size={13} className="text-blue-600" /> {stage.stageName}
                                </td>
                                <td className="px-3 py-2.5 font-semibold text-zinc-600">
                                  {stage.km} KM
                                </td>
                                <td className="px-3 py-2.5 text-zinc-600 text-[11px] font-mono">
                                  {stage.morningTime || '—'} / {stage.eveningTime || '—'}
                                </td>
                                <td className="px-3 py-2.5 font-bold text-zinc-800">
                                  ₹{Number(stage.monthlyFee || 0).toLocaleString()}
                                </td>
                                <td className="px-3 py-2.5 font-bold text-zinc-800">
                                  ₹{Number(stage.semesterFee || 0).toLocaleString()}
                                </td>
                                <td className="px-3 py-2.5 font-black text-[#120c7a]">
                                  ₹{Number(stage.annualFee || 0).toLocaleString()}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => handleOpenEditStage(stage, idx)}
                                      className="p-1 text-zinc-400 hover:text-blue-700 hover:bg-blue-50 rounded"
                                      title="Edit Stage"
                                    >
                                      <Edit3 size={14} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteStage(idx)}
                                      className="p-1 text-zinc-400 hover:text-red-700 hover:bg-red-50 rounded"
                                      title="Delete Stage"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-zinc-200/80 p-12 text-center text-zinc-400">
                    <RouteIcon size={40} className="mx-auto mb-2 text-zinc-300" />
                    <p className="font-bold text-sm text-zinc-600">Select or create a route</p>
                    <p className="text-xs text-zinc-400 mt-1">Select any route from the left list to view and configure its stages and fee breakdown.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: DRIVER DATABASE VIEW                                    */}
        {/* ============================================================== */}
        {activeTab === 'drivers' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* KPI Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Drivers</p>
                  <p className="text-2xl font-black text-zinc-900 mt-0.5">{driverStats.total}</p>
                  <p className="text-[11px] font-semibold text-zinc-500">Personnel Roster</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                  <Users size={22} />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Active Drivers</p>
                  <p className="text-2xl font-black text-emerald-700 mt-0.5">{driverStats.active}</p>
                  <p className="text-[11px] font-semibold text-emerald-600/80">Duty Ready</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <CheckCircle2 size={22} />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Assigned</p>
                  <p className="text-2xl font-black text-purple-700 mt-0.5">{driverStats.assigned}</p>
                  <p className="text-[11px] font-semibold text-purple-600/80">Driving Fleet</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                  <Bus size={22} />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Standby</p>
                  <p className="text-2xl font-black text-amber-700 mt-0.5">{driverStats.unassigned}</p>
                  <p className="text-[11px] font-semibold text-amber-600/80">Available Relief</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                  <ShieldCheck size={22} />
                </div>
              </div>
            </div>

            {/* Controls Bar: Search & Add Driver Button */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={driverSearch}
                    onChange={(e) => setDriverSearch(e.target.value)}
                    placeholder="Search by driver name, license, phone..."
                    className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                  {driverSearch && (
                    <button onClick={() => setDriverSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                      <X size={14} />
                    </button>
                  )}
                </div>

                <select
                  value={driverStatusFilter}
                  onChange={(e) => setDriverStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <button
                onClick={handleOpenAddDriver}
                className="px-4 py-2 bg-[#120c7a] hover:bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
              >
                <Plus size={15} /> Add Driver
              </button>
            </div>

            {/* Driver Information Callout */}
            <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2.5 text-blue-950">
                <Users size={16} className="text-[#120c7a] shrink-0" />
                <span>
                  <strong>Driver Roster:</strong> Auto-synced with college drivers. Use the edit icon in the actions column to configure license, vehicle assignment, and contact records.
                </span>
              </div>
            </div>

            {/* Drivers Table */}
            <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/75 border-b border-zinc-200 text-[11px] font-black uppercase tracking-wider text-zinc-500">
                      <th className="px-4 py-3">Driver Name</th>
                      <th className="px-4 py-3">License Number</th>
                      <th className="px-4 py-3">License Expiry</th>
                      <th className="px-4 py-3">Phone & Emergency</th>
                      <th className="px-4 py-3">Experience</th>
                      <th className="px-4 py-3">Assigned Bus</th>
                      <th className="px-4 py-3">Blood Group</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-xs font-medium text-zinc-700">
                    {filteredDrivers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-zinc-400 font-semibold">
                          <Users size={36} className="mx-auto mb-2 text-zinc-300" />
                          No driver records found matching the criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredDrivers.map((driver) => {
                        const expiryStatus = checkExpiryStatus(driver.licenseExpiry);
                        return (
                          <tr key={driver.id} className="hover:bg-blue-50/40 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-[#120c7a] flex items-center justify-center font-black text-xs shrink-0 border border-indigo-200">
                                  {driver.name ? driver.name.charAt(0).toUpperCase() : 'D'}
                                </div>
                                <div>
                                  <span className="font-bold text-zinc-900 text-sm block">{driver.name}</span>
                                  {driver.email && (
                                    <p className="text-[11px] text-zinc-400 mt-0.5">{driver.email}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {driver.licenseNo ? (
                                <span className="font-mono font-bold text-zinc-800">{driver.licenseNo}</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  Not Configured
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {driver.licenseExpiry ? (
                                <div className="flex items-center gap-1.5">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${expiryStatus.color}`}>
                                    {expiryStatus.label}
                                  </span>
                                  <span className="text-[11px] text-zinc-500">{driver.licenseExpiry}</span>
                                </div>
                              ) : (
                                <span className="text-zinc-400 italic text-[11px]">Not set</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {driver.phone ? (
                                <div>
                                  <span className="font-semibold text-zinc-800 flex items-center gap-1">
                                    <Phone size={12} className="text-zinc-400" /> {driver.phone}
                                  </span>
                                  {driver.emergencyContact && (
                                    <span className="text-[10px] text-zinc-400 block mt-0.5">
                                      Alt: {driver.emergencyContact}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-zinc-400 italic text-[11px]">No phone</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-bold text-zinc-700">{driver.experienceYears ? `${driver.experienceYears} Yrs` : '—'}</span>
                            </td>
                            <td className="px-4 py-3">
                              {driver.assignedBusId ? (
                                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200 inline-flex items-center gap-1 shadow-2xs">
                                  <Bus size={12} /> {getBusNumber(driver.assignedBusId)}
                                </span>
                              ) : (
                                <span className="text-zinc-400 italic text-[11px]">Unassigned</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {driver.bloodGroup ? (
                                <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 font-mono font-bold text-[11px]">
                                  {driver.bloodGroup}
                                </span>
                              ) : (
                                <span className="text-zinc-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={(e) => handleToggleDriverStatus(driver, e)}
                                className={`group px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:shadow-xs hover:scale-105 active:scale-95 select-none ${
                                  driver.status === 'Active'
                                    ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 hover:border-emerald-400'
                                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border border-zinc-300 hover:border-zinc-400'
                                }`}
                                title={`Click to mark as ${driver.status === 'Active' ? 'Inactive' : 'Active'}`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full transition-transform group-hover:scale-125 ${
                                    driver.status === 'Active' ? 'bg-emerald-500' : 'bg-zinc-400'
                                  }`}
                                ></span>
                                <span>{driver.status}</span>
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleOpenEditDriver(driver)}
                                  className="p-1.5 text-zinc-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                  title="Edit Driver Details"
                                >
                                  <Edit3 size={15} />
                                </button>
                                <button
                                  onClick={() => handleDeleteDriver(driver.id)}
                                  className="p-1.5 text-zinc-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Driver"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODAL: ADD / EDIT BUS                                         */}
        {/* ============================================================== */}
        {isBusModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#120c7a] flex items-center justify-center font-bold">
                    <Bus size={18} />
                  </div>
                  <h3 className="text-base font-black text-zinc-900">
                    {selectedBus ? `Edit Bus (${selectedBus.busNo})` : 'Register New Bus'}
                  </h3>
                </div>
                <button onClick={() => setIsBusModalOpen(false)} className="text-zinc-400 hover:text-zinc-700 p-1">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveBus} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Bus Number / Code *</label>
                    <input
                      type="text"
                      required
                      value={busFormData.busNo || ''}
                      onChange={(e) => setBusFormData({ ...busFormData, busNo: e.target.value })}
                      placeholder="e.g. BUS #1 or BUS-A"
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Registration Number *</label>
                    <input
                      type="text"
                      required
                      value={busFormData.regNo || ''}
                      onChange={(e) => setBusFormData({ ...busFormData, regNo: e.target.value.toUpperCase() })}
                      placeholder="e.g. TN 31 AB 1234"
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold uppercase font-mono focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Seating Capacity *</label>
                    <input
                      type="number"
                      required
                      min={10}
                      max={100}
                      value={busFormData.capacity || ''}
                      onChange={(e) => setBusFormData({ ...busFormData, capacity: e.target.value })}
                      placeholder="e.g. 52"
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Bus Type</label>
                    <select
                      value={busFormData.busType || 'Standard'}
                      onChange={(e) => setBusFormData({ ...busFormData, busType: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    >
                      <option value="Standard">Standard</option>
                      <option value="Deluxe">Deluxe</option>
                      <option value="AC">AC</option>
                      <option value="Non-AC">Non-AC</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Assigned Route</label>
                    <select
                      value={busFormData.routeId || ''}
                      onChange={(e) => setBusFormData({ ...busFormData, routeId: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    >
                      <option value="">-- No Route Assigned --</option>
                      {routes.map(r => (
                        <option key={r.id} value={r.id}>{r.code} - {r.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Assigned Driver</label>
                    <select
                      value={busFormData.driverId || ''}
                      onChange={(e) => setBusFormData({ ...busFormData, driverId: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    >
                      <option value="">-- No Driver Assigned --</option>
                      {unifiedDrivers.map(d => {
                        const labelParts = [d.name];
                        if (d.licenseNo) labelParts.push(`(${d.licenseNo})`);
                        else if (d.phone) labelParts.push(`(${d.phone})`);
                        return (
                          <option key={d.id || d.userId} value={d.id || d.userId}>
                            {labelParts.join(' ')}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Status</label>
                    <select
                      value={busFormData.status || 'Active'}
                      onChange={(e) => setBusFormData({ ...busFormData, status: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    >
                      <option value="Active">Active</option>
                      <option value="Maintenance">Maintenance</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Manufacturer / Chassis</label>
                    <input
                      type="text"
                      value={busFormData.manufacturer || ''}
                      onChange={(e) => setBusFormData({ ...busFormData, manufacturer: e.target.value })}
                      placeholder="e.g. Ashok Leyland, Tata, Eicher"
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Fitness Certificate Expiry</label>
                    <input
                      type="date"
                      value={busFormData.fitnessExpiry || ''}
                      onChange={(e) => setBusFormData({ ...busFormData, fitnessExpiry: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Insurance Expiry</label>
                    <input
                      type="date"
                      value={busFormData.insuranceExpiry || ''}
                      onChange={(e) => setBusFormData({ ...busFormData, insuranceExpiry: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setIsBusModalOpen(false)}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-[#120c7a] hover:bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Save size={15} /> {saving ? 'Saving...' : (selectedBus ? 'Update Bus' : 'Register Bus')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODAL: ADD / EDIT ROUTE                                       */}
        {/* ============================================================== */}
        {isRouteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#120c7a] flex items-center justify-center font-bold">
                    <RouteIcon size={18} />
                  </div>
                  <h3 className="text-base font-black text-zinc-900">
                    {routeFormData.id && routes.some(r => r.id === routeFormData.id) ? 'Edit Route' : 'Add New Route'}
                  </h3>
                </div>
                <button onClick={() => setIsRouteModalOpen(false)} className="text-zinc-400 hover:text-zinc-700 p-1">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveRoute} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-zinc-700 mb-1 block">Route Code *</label>
                  <input
                    type="text"
                    required
                    value={routeFormData.code || ''}
                    onChange={(e) => setRouteFormData({ ...routeFormData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. R101, R102, RT-NEYVELI"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold font-mono uppercase focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-700 mb-1 block">Route Name *</label>
                  <input
                    type="text"
                    required
                    value={routeFormData.name || ''}
                    onChange={(e) => setRouteFormData({ ...routeFormData, name: e.target.value })}
                    placeholder="e.g. Cuddalore OT - Vadalur - Neyveli"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-700 mb-1 block">Description / Notes</label>
                  <textarea
                    rows={2}
                    value={routeFormData.description || ''}
                    onChange={(e) => setRouteFormData({ ...routeFormData, description: e.target.value })}
                    placeholder="e.g. Primary morning route via Panruti Main Road"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setIsRouteModalOpen(false)}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-[#120c7a] hover:bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Save size={15} /> {saving ? 'Saving...' : 'Save Route'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODAL: ADD / EDIT STAGE                                       */}
        {/* ============================================================== */}
        {isStageModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#120c7a] flex items-center justify-center font-bold">
                    <MapPin size={18} />
                  </div>
                  <h3 className="text-base font-black text-zinc-900">
                    {editingStageIndex !== null ? 'Edit Stage & Fee' : `Add Stage to ${selectedRoute?.code}`}
                  </h3>
                </div>
                <button onClick={() => setIsStageModalOpen(false)} className="text-zinc-400 hover:text-zinc-700 p-1">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveStage} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-zinc-700 mb-1 block">Stage / Stop Name *</label>
                  <input
                    type="text"
                    required
                    value={stageFormData.stageName || ''}
                    onChange={(e) => setStageFormData({ ...stageFormData, stageName: e.target.value })}
                    placeholder="e.g. Vadalur Bus Stand, Panruti Four Roads"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Distance (KM)</label>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      value={stageFormData.km || ''}
                      onChange={(e) => setStageFormData({ ...stageFormData, km: e.target.value })}
                      placeholder="e.g. 15"
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Pickup (AM)</label>
                    <input
                      type="time"
                      value={stageFormData.morningTime || '07:30'}
                      onChange={(e) => setStageFormData({ ...stageFormData, morningTime: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Drop (PM)</label>
                    <input
                      type="time"
                      value={stageFormData.eveningTime || '17:30'}
                      onChange={(e) => setStageFormData({ ...stageFormData, eveningTime: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>
                </div>

                <div className="p-3 bg-blue-50/60 rounded-2xl border border-blue-200/80 space-y-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-blue-900">
                    Fee Slabs for this Stage
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-zinc-700 mb-1 block">Monthly (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={stageFormData.monthlyFee || ''}
                        onChange={(e) => setStageFormData({ ...stageFormData, monthlyFee: e.target.value })}
                        placeholder="1200"
                        className="w-full px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-200 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-zinc-700 mb-1 block">Semester (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={stageFormData.semesterFee || ''}
                        onChange={(e) => setStageFormData({ ...stageFormData, semesterFee: e.target.value })}
                        placeholder="6000"
                        className="w-full px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-200 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-zinc-700 mb-1 block">Annual (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={stageFormData.annualFee || ''}
                        onChange={(e) => setStageFormData({ ...stageFormData, annualFee: e.target.value })}
                        placeholder="12000"
                        className="w-full px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-200 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setIsStageModalOpen(false)}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-[#120c7a] hover:bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Save size={15} /> {saving ? 'Saving...' : 'Save Stage'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODAL: ADD / EDIT DRIVER                                      */}
        {/* ============================================================== */}
        {isDriverModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#120c7a] flex items-center justify-center font-bold">
                    <Users size={18} />
                  </div>
                  <h3 className="text-base font-black text-zinc-900">
                    {selectedDriver ? `Edit Driver (${selectedDriver.name})` : 'Register New Driver'}
                  </h3>
                </div>
                <button onClick={() => setIsDriverModalOpen(false)} className="text-zinc-400 hover:text-zinc-700 p-1">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveDriver} className="space-y-4">
                {driverFormData.isWebsiteUser && (
                  <div className="p-3 bg-blue-50/70 rounded-2xl border border-blue-200/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <Users size={16} className="text-[#120c7a] shrink-0" />
                      <div>
                        <p className="font-bold text-zinc-900">Website Staff Account: {driverFormData.name}</p>
                        <p className="text-zinc-500 text-[11px]">{driverFormData.email || 'Registered Staff'}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Staff Account
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={driverFormData.name || ''}
                      onChange={(e) => setDriverFormData({ ...driverFormData, name: e.target.value })}
                      placeholder="e.g. S. Murugan"
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">License Number *</label>
                    <input
                      type="text"
                      required
                      value={driverFormData.licenseNo || ''}
                      onChange={(e) => setDriverFormData({ ...driverFormData, licenseNo: e.target.value.toUpperCase() })}
                      placeholder="e.g. TN31 20180004523"
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold uppercase font-mono focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Primary Phone Number *</label>
                    <input
                      type="tel"
                      required
                      value={driverFormData.phone || ''}
                      onChange={(e) => setDriverFormData({ ...driverFormData, phone: e.target.value })}
                      placeholder="e.g. +91 9876543210"
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Emergency / Alt Contact</label>
                    <input
                      type="tel"
                      value={driverFormData.emergencyContact || ''}
                      onChange={(e) => setDriverFormData({ ...driverFormData, emergencyContact: e.target.value })}
                      placeholder="e.g. +91 9876543211"
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Experience (Years)</label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={driverFormData.experienceYears || ''}
                      onChange={(e) => setDriverFormData({ ...driverFormData, experienceYears: e.target.value })}
                      placeholder="e.g. 8"
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Driving License Expiry</label>
                    <input
                      type="date"
                      value={driverFormData.licenseExpiry || ''}
                      onChange={(e) => setDriverFormData({ ...driverFormData, licenseExpiry: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Assigned Bus</label>
                    <select
                      value={driverFormData.assignedBusId || ''}
                      onChange={(e) => setDriverFormData({ ...driverFormData, assignedBusId: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    >
                      <option value="">-- Standby / No Bus Assigned --</option>
                      {buses.map(b => (
                        <option key={b.id} value={b.id}>{b.busNo} ({b.regNo || 'No Reg'})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Blood Group</label>
                    <select
                      value={driverFormData.bloodGroup || 'B+'}
                      onChange={(e) => setDriverFormData({ ...driverFormData, bloodGroup: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    >
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 mb-1 block">Employment Status</label>
                    <select
                      value={driverFormData.status || 'Active'}
                      onChange={(e) => setDriverFormData({ ...driverFormData, status: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-700 mb-1 block">Residential Address</label>
                  <textarea
                    rows={2}
                    value={driverFormData.address || ''}
                    onChange={(e) => setDriverFormData({ ...driverFormData, address: e.target.value })}
                    placeholder="e.g. 14, Kamarajar Street, Cuddalore"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setIsDriverModalOpen(false)}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-[#120c7a] hover:bg-blue-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Save size={15} /> {saving ? 'Saving...' : (selectedDriver ? 'Update Driver' : 'Save Driver')}
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
