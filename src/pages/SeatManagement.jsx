import React, { useState, useEffect, useMemo, useRef } from "react";
import Layout from "../components/Layout";
import { auth, db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { isMasterOrAdmin } from "../lib/utils";
import {
  getSeatConfigurationsRealtime,
  saveSeatConfiguration,
} from "../services/seatService";
import { getEnquiriesRealtime } from "../services/enquiryService";
import { getScholarshipsRealtime, addScholarship, deleteScholarship } from "../services/scholarshipService";
import {
  getCommunitiesRealtime,
  saveCommunity,
  deleteCommunity,
} from "../services/configService";
import { useDepartments } from "../hooks/useDepartments";
import {
  Users,
  BookOpen,
  AlertCircle,
  CheckCircle,
  Edit,
  Save,
  X,
  Plus,
} from "lucide-react";

export default function SeatManagement() {
  const { departments: programDepartments } = useDepartments();
  const [seatConfigs, setSeatConfigs] = useState({});
  const [enquiries, setEnquiries] = useState([]);
  const [globalCommunities, setGlobalCommunities] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);

  const [showAddQuotaModal, setShowAddQuotaModal] = useState(false);
  const [newQuotaInput, setNewQuotaInput] = useState("");
  const [isSplitCommunity, setIsSplitCommunity] = useState(false);

  const [showAddCommunityModal, setShowAddCommunityModal] = useState(false);
  const [newCommunityInput, setNewCommunityInput] = useState("");

  const [showAddScholarshipModal, setShowAddScholarshipModal] = useState(false);
  const [newScholarshipInput, setNewScholarshipInput] = useState("");
  const [scholarshipQuota, setScholarshipQuota] = useState("");
  const [scholarships, setScholarships] = useState([]);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferDept, setTransferDept] = useState("");
  const [sourceQuota, setSourceQuota] = useState("");
  const [sourceCommunity, setSourceCommunity] = useState("");
  const [destQuota, setDestQuota] = useState("");
  const [destCommunity, setDestCommunity] = useState("");
  const [transferCount, setTransferCount] = useState("");

  const isEditingRef = useRef(isEditing);
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    // Fetch current user data for role check
    let unsubscribeUser = () => {};
    if (auth.currentUser) {
      unsubscribeUser = onSnapshot(doc(db, "users", auth.currentUser.uid), (snap) => {
        if (snap.exists()) {
          setUserData(snap.data());
        }
      });
    }

    // 1. Fetch seat configurations
    const unsubscribeConfigs = getSeatConfigurationsRealtime(
      (data) => {
        const normalizedData = {};
        Object.keys(data || {}).forEach((dept) => {
          let config = data[dept];
          let quotas = config.quotas || {};

          // Migrate legacy fields locally
          if (config.governmentQuota !== undefined) {
            quotas["Govt Quota"] = { OC: config.governmentQuota }; // Govt Quota is split
            delete config.governmentQuota;
          }
          if (config.managementQuota !== undefined) {
            quotas["Mgmt Quota"] = config.managementQuota; // Mgmt Quota is global
            delete config.managementQuota;
          }
          if (config.lateralEntry !== undefined) {
            quotas["Lateral Entry"] = config.lateralEntry; // Lateral Entry is global
            delete config.lateralEntry;
          }

          normalizedData[dept] = { ...config, quotas };
        });

        setSeatConfigs(normalizedData);
        if (!isEditingRef.current) {
          setEditFormData(normalizedData);
        }
      },
      (err) => console.error(err),
    );

    // 2. Fetch enquiries for filled seats calculation
    const unsubscribeEnquiries = getEnquiriesRealtime(
      (data) => {
        setEnquiries(data || []);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      },
    );

    // 3. Fetch communities
    const unsubscribeCommunities = getCommunitiesRealtime(
      (data) => {
        setGlobalCommunities(data || []);
      },
      (err) => console.error(err),
    );

    // 4. Fetch scholarships
    const unsubscribeScholarships = getScholarshipsRealtime(
      (data) => setScholarships(data || []),
      (err) => console.error(err),
    );

    return () => {
      unsubscribeConfigs();
      unsubscribeEnquiries();
      unsubscribeCommunities();
      unsubscribeScholarships();
      unsubscribeUser();
    };
  }, []);

  const isAdmin = isMasterOrAdmin(userData?.role, auth.currentUser?.email);

  // Calculate filled seats from enquiries (only status === "Approved")
  const filledSeatsByDept = useMemo(() => {
    const counts = {};
    enquiries.forEach((enq) => {
      if (enq.status !== "Approved") return;

      const dept = enq.department;
      if (!dept) return;

      if (!counts[dept]) {
        counts[dept] = {
          total: 0,
          quotas: {},
        };
      }
      counts[dept].total += 1;

      const quota = enq.quotaAskedFor;
      const community = enq.community;

      if (quota) {
        if (!counts[dept].quotas[quota]) {
          counts[dept].quotas[quota] = { total: 0 };
        }
        counts[dept].quotas[quota].total += 1;

        if (community) {
          counts[dept].quotas[quota][community] =
            (counts[dept].quotas[quota][community] || 0) + 1;
        }
      }
    });
    return counts;
  }, [enquiries]);

  // Derived state for the UI
  const departments = useMemo(() => {
    return Array.from(
      new Set(
        Object.values(programDepartments || {})
          .flat()
          .filter(Boolean),
      ),
    );
  }, [programDepartments]);

  const calculateTotalIntake = (config) => {
    if (!config || !config.quotas) return Number(config?.totalIntake) || 0;
    let sum = 0;
    Object.values(config.quotas).forEach((q) => {
      if (typeof q === "object" && q !== null) {
        sum += Number(q.total) || 0;
      } else {
        sum += Number(q) || 0;
      }
    });
    return sum > 0 || Object.keys(config.quotas).length > 0
      ? sum
      : Number(config.totalIntake) || 0;
  };

  let globalTotal = 0;
  let globalFilled = 0;

  departments.forEach((dept) => {
    globalTotal += calculateTotalIntake(seatConfigs[dept]);
    globalFilled += filledSeatsByDept[dept]?.total || 0;
  });

  const globalAvailable = Math.max(0, globalTotal - globalFilled);

  const isQuotaSplit = (colName) => {
    const sourceData = isEditing ? editFormData : seatConfigs;
    for (const dept of departments) {
      const deptData = sourceData[dept] || {};
      if (
        deptData.quotas &&
        typeof deptData.quotas[colName] === "object" &&
        deptData.quotas[colName] !== null
      ) {
        return true;
      }
    }
    return false;
  };

  const quotaColumns = useMemo(() => {
    const columns = new Set();
    const sourceData = isEditing ? editFormData : seatConfigs;
    departments.forEach((dept) => {
      const config = sourceData[dept] || {};
      if (config.quotas) {
        Object.keys(config.quotas).forEach((k) => columns.add(k));
      }
    });
    return Array.from(columns);
  }, [seatConfigs, editFormData, isEditing, departments]);

  const handleQuotaEditChange = (dept, quotaName, communityName, value) => {
    setEditFormData((prev) => {
      const prevDept = prev[dept] || { totalIntake: 0, quotas: {} };
      const prevQuotas = prevDept.quotas || {};
      const prevQuotaValue = prevQuotas[quotaName];

      let newQuotaValue;
      if (communityName !== null) {
        newQuotaValue = {
          ...(typeof prevQuotaValue === "object" ? prevQuotaValue : {}),
          [communityName]: value,
        };
        // We do NOT auto-update total. The total represents the Quota limit.
      } else {
        newQuotaValue = value;
      }

      return {
        ...prev,
        [dept]: {
          ...prevDept,
          quotas: {
            ...prevQuotas,
            [quotaName]: newQuotaValue,
          },
        },
      };
    });
  };

  const handleQuotaTotalChange = (dept, quotaName, value) => {
    const total = Number(value) || 0;

    setEditFormData((prev) => {
      const prevDept = prev[dept] || { totalIntake: 0, quotas: {} };
      const prevQuotas = prevDept.quotas || {};
      const newQuotaValue = { total };

      // Distribute seats using percentage
      globalCommunities.forEach((comm) => {
        const seatForComm = Math.round((total * comm.percentage) / 100);
        newQuotaValue[comm.name] = seatForComm;
      });
      // Optionally adjust last one? We leave it as is so user can manually tweak if needed.

      return {
        ...prev,
        [dept]: {
          ...prevDept,
          quotas: {
            ...prevQuotas,
            [quotaName]: newQuotaValue,
          },
        },
      };
    });
  };

  const handleSave = async () => {
    try {
      // Loop and save each
      await Promise.all(
        Object.keys(editFormData).map((dept) => {
          const configToSave = {
            ...editFormData[dept],
            totalIntake: calculateTotalIntake(editFormData[dept]),
          };
          return saveSeatConfiguration(dept, configToSave);
        }),
      );
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save", err);
      alert("Failed to save. Check console for details.");
    }
  };

  const handleAddQuota = () => {
    setShowAddQuotaModal(true);
  };

  const submitAddQuota = () => {
    const newQuota = newQuotaInput.trim();
    if (newQuota) {
      setEditFormData((prev) => {
        const next = { ...prev };
        departments.forEach((dept) => {
          const prevDept = next[dept] || { totalIntake: 0, quotas: {} };
          next[dept] = {
            ...prevDept,
            quotas: {
              ...(prevDept.quotas || {}),
              [newQuota]: isSplitCommunity ? {} : 0,
            },
          };
        });
        return next;
      });
    }
    setShowAddQuotaModal(false);
    setNewQuotaInput("");
    setIsSplitCommunity(false);
  };

  const handleAddCommunity = () => {
    setShowAddCommunityModal(true);
  };

  const [newCommunityPercent, setNewCommunityPercent] = useState("");

  const submitAddCommunity = async () => {
    const newComm = newCommunityInput.trim().toUpperCase();
    const percent = Number(newCommunityPercent) || 0;
    if (newComm) {
      try {
        await saveCommunity(newComm, percent);
        setNewCommunityInput("");
        setNewCommunityPercent("");
      } catch (err) {
        console.error("Failed to add community", err);
      }
    }
  };

  const isQuotaSplitForDept = (dept, colName) => {
    const deptData = seatConfigs[dept] || {};
    return (
      deptData.quotas &&
      typeof deptData.quotas[colName] === "object" &&
      deptData.quotas[colName] !== null
    );
  };

  const getAvailableSourceCount = () => {
    if (!transferDept || !sourceQuota) return 0;
    const config = seatConfigs[transferDept] || {};
    const deptFilledData = filledSeatsByDept[transferDept] || {
      total: 0,
      quotas: {},
    };

    const isSplit = isQuotaSplitForDept(transferDept, sourceQuota);
    if (isSplit) {
      if (!sourceCommunity) return 0;
      const configLimit =
        Number(config.quotas?.[sourceQuota]?.[sourceCommunity]) || 0;
      const filledLimit =
        Number(deptFilledData.quotas?.[sourceQuota]?.[sourceCommunity]) || 0;
      return Math.max(0, configLimit - filledLimit);
    } else {
      const configLimit = Number(config.quotas?.[sourceQuota]) || 0;
      const filledLimit =
        Number(deptFilledData.quotas?.[sourceQuota]?.total) || 0;
      return Math.max(0, configLimit - filledLimit);
    }
  };

  const handleInitiateTransfer = (dept) => {
    setTransferDept(dept);
    setSourceQuota("");
    setSourceCommunity("");
    setDestQuota("");
    setDestCommunity("");
    setTransferCount("");
    setShowTransferModal(true);
  };

  const handleTransferSubmit = async () => {
    if (!transferDept || !sourceQuota || !destQuota) {
      alert("Please fill in all required fields.");
      return;
    }
    const isSourceSplit = isQuotaSplitForDept(transferDept, sourceQuota);
    const isDestSplit = isQuotaSplitForDept(transferDept, destQuota);

    if (isSourceSplit && !sourceCommunity) {
      alert("Please select a community for the source quota.");
      return;
    }
    if (isDestSplit && !destCommunity) {
      alert("Please select a community for the destination quota.");
      return;
    }

    if (
      sourceQuota === destQuota &&
      (!isSourceSplit || sourceCommunity === destCommunity)
    ) {
      alert("Source and destination must be different.");
      return;
    }

    const countToTransfer = Number(transferCount);
    if (isNaN(countToTransfer) || countToTransfer <= 0) {
      alert("Please enter a valid transfer count greater than 0.");
      return;
    }

    const availableSeats = getAvailableSourceCount();
    if (countToTransfer > availableSeats) {
      alert(
        `Cannot transfer more seats than are available. Only ${availableSeats} seats are available to move.`,
      );
      return;
    }

    try {
      const targetConfig = JSON.parse(
        JSON.stringify(seatConfigs[transferDept]),
      );
      if (!targetConfig.quotas) {
        targetConfig.quotas = {};
      }

      // Subtract from source
      if (isSourceSplit) {
        targetConfig.quotas[sourceQuota][sourceCommunity] =
          Number(targetConfig.quotas[sourceQuota][sourceCommunity]) -
          countToTransfer;
        targetConfig.quotas[sourceQuota].total =
          Number(targetConfig.quotas[sourceQuota].total) - countToTransfer;
      } else {
        targetConfig.quotas[sourceQuota] =
          Number(targetConfig.quotas[sourceQuota]) - countToTransfer;
      }

      // Add to destination
      if (isDestSplit) {
        if (!targetConfig.quotas[destQuota]) {
          targetConfig.quotas[destQuota] = { total: 0 };
        }
        targetConfig.quotas[destQuota][destCommunity] =
          (Number(targetConfig.quotas[destQuota][destCommunity]) || 0) +
          countToTransfer;
        targetConfig.quotas[destQuota].total =
          (Number(targetConfig.quotas[destQuota].total) || 0) + countToTransfer;
      } else {
        targetConfig.quotas[destQuota] =
          (Number(targetConfig.quotas[destQuota]) || 0) + countToTransfer;
      }

      // Re-calculate totalIntake
      targetConfig.totalIntake = calculateTotalIntake(targetConfig);

      // Save via service
      await saveSeatConfiguration(transferDept, targetConfig);

      // Close modal and reset
      setShowTransferModal(false);
      setTransferDept("");
      setSourceQuota("");
      setSourceCommunity("");
      setDestQuota("");
      setDestCommunity("");
      setTransferCount("");
    } catch (err) {
      console.error("Failed to transfer seats:", err);
      alert("Error setting new seat division. Check console for details.");
    }
  };

  const renderStatus = (filled, total) => {
    if (total === 0)
      return (
        <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
          Not Set
        </span>
      );
    const ratio = filled / total;
    if (ratio >= 1)
      return (
        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">
          Full
        </span>
      );
    if (ratio >= 0.8)
      return (
        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium">
          Nearly Full
        </span>
      );
    return (
      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
        Open
      </span>
    );
  };

  if (loading) {
    return (
      <Layout title="Seat Management">
        <div className="p-8 text-center text-gray-500">
          Loading seat configurations...
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Seat Management">
      <div className="p-4 sm:p-6 md:p-8 max-w-full xl:max-w-[95%] 2xl:max-w-[1600px] mx-auto space-y-8 bg-zinc-50/30 min-h-screen">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
          <div className="bg-white p-5 rounded-2xl border border-zinc-200/70 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#120c7a]/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-12 h-12 bg-blue-50 text-[#120c7a] rounded-xl flex items-center justify-center shrink-0 border border-blue-100/50">
              <Users size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">
                Total Seats
              </p>
              <h3 className="text-2xl font-bold text-zinc-800 tracking-tight">
                {globalTotal}
              </h3>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-zinc-200/70 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 border border-emerald-100/50">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">
                Filled Seats
              </p>
              <h3 className="text-2xl font-bold text-zinc-800 tracking-tight">
                {globalFilled}
              </h3>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-zinc-200/70 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0 border border-amber-100/50">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">
                Available Seats
              </p>
              <h3 className="text-2xl font-bold text-zinc-800 tracking-tight">
                {globalAvailable}
              </h3>
            </div>
          </div>
        </div>

        {/* Department Cards Grid */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-zinc-800 tracking-tight">
            Department Overview
          </h3>
          {departments.length === 0 ? (
            <div className="text-center p-12 bg-white rounded-3xl border-2 border-dashed border-zinc-200 shadow-sm">
              <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="text-zinc-400" size={24} />
              </div>
              <p className="text-zinc-500 font-medium">
                No seat configurations found.
              </p>
              <p className="text-zinc-400 text-sm mt-1">
                Click{" "}
                <span className="font-semibold text-zinc-600">Edit Intake</span>{" "}
                to add some.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              {departments.map((dept) => {
                  const config =
                    (isEditing ? editFormData[dept] : seatConfigs[dept]) || {};
                  const total = calculateTotalIntake(config);
                  const deptFilledData = filledSeatsByDept[dept] || {
                    total: 0,
                    quotas: {},
                  };
                  const filledAmount = deptFilledData.total;

                  return (
                    <div
                      key={dept}
                      className="bg-white p-5 rounded-2xl border border-zinc-200/70 shadow-sm hover:shadow-md transition-shadow space-y-4 relative overflow-hidden group"
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-0.5">
                          <h5 className="font-bold text-zinc-800 text-[17px] leading-tight">
                            {dept}
                          </h5>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                            Department
                          </p>
                        </div>
                        {renderStatus(filledAmount, total)}
                      </div>

                      <div className="bg-zinc-50/70 p-3 rounded-xl border border-zinc-100">
                        <div className="flex justify-between items-center mb-2.5">
                          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                            Total Filled
                          </div>
                          <div className="text-base font-bold text-zinc-800">
                            {filledAmount}
                          </div>
                        </div>
                        <div className="space-y-2.5 border-t border-zinc-200/80 pt-2.5">
                          {Object.entries(deptFilledData.quotas).map(
                            ([quota, qtData]) => (
                              <div key={quota} className="text-[13px]">
                                <div className="flex justify-between items-center font-semibold text-zinc-700 mb-1.5 border-b border-zinc-200/50 pb-1">
                                  <span>{quota}</span>
                                  <span className="text-[#120c7a] font-bold text-[14px]">
                                    {(qtData.total || 0)
                                      .toString()
                                      .padStart(2, "0")}
                                  </span>
                                </div>
                                <div className="pl-1.5 space-y-1">
                                  {globalCommunities.map((comm) => {
                                    const cCount = qtData[comm.name];
                                    if (!cCount) return null;
                                    return (
                                      <div
                                        key={comm.name}
                                        className="flex justify-between text-zinc-500 text-[12px] font-medium"
                                      >
                                        <span>{comm.name}</span>
                                        <span className="text-zinc-600">
                                          {cCount}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ),
                          )}
                          {Object.keys(deptFilledData.quotas).length === 0 && (
                            <div className="text-xs text-zinc-400 italic mb-1 text-center py-2">
                              No admissions yet
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </div>

        {/* Seat Matrix Table */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden ring-1 ring-zinc-900/[0.03]">
          <div className="px-5 py-4 border-b border-zinc-200/80 flex justify-between items-center bg-zinc-50/50 flex-wrap gap-4">
            <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2.5 tracking-tight">
              <div className="p-1.5 bg-white rounded-lg border border-zinc-200 shadow-sm">
                <BookOpen size={15} className="text-[#120c7a]" />
              </div>
              Seat Matrix
            </h2>
            <div className="flex flex-wrap items-center gap-3">
            {!isEditing && isAdmin ? (
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setEditFormData(seatConfigs);
                  }}
                  className="flex items-center gap-2 bg-[#120c7a] hover:bg-[#1a148a] shadow-sm hover:shadow-md text-white px-4 py-2 rounded-xl transition-all font-medium text-xs lg:text-sm"
                >
                  <Edit size={14} />{" "}
                  <span className="whitespace-nowrap">Edit Intake</span>
                </button>
              ) : (
                <div className="flex flex-wrap gap-2 items-center bg-white p-1.5 rounded-xl shadow-sm border border-zinc-200">
                  <button
                    onClick={handleAddQuota}
                    className="flex justify-center items-center gap-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 px-3 py-1.5 rounded-lg transition-colors font-medium text-xs border border-zinc-200/50"
                  >
                    <Plus size={14} />{" "}
                    <span className="whitespace-nowrap">Add Quota</span>
                  </button>
                  <button
                    onClick={handleAddCommunity}
                    className="flex justify-center items-center gap-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 px-3 py-1.5 rounded-lg transition-colors font-medium text-xs border border-zinc-200/50"
                  >
                    <Plus size={14} />{" "}
                    <span className="whitespace-nowrap">Add Community</span>
                  </button>
                  <button
                    onClick={() => setShowAddScholarshipModal(true)}
                    className="flex justify-center items-center gap-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 px-3 py-1.5 rounded-lg transition-colors font-medium text-xs border border-zinc-200/50"
                  >
                    <Plus size={14} />{" "}
                    <span className="whitespace-nowrap">Add Scholarship</span>
                  </button>

                  <div className="w-[1px] h-6 bg-zinc-200 hidden sm:block mx-1"></div>

                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditFormData(seatConfigs);
                    }}
                    className="flex justify-center items-center gap-1.5 bg-white hover:bg-zinc-50 text-zinc-600 px-3 py-1.5 rounded-lg transition-colors font-medium text-xs border border-zinc-200 shadow-sm"
                  >
                    <X size={14} />{" "}
                    <span className="whitespace-nowrap">Cancel</span>
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex justify-center items-center gap-1.5 bg-[#120c7a] hover:bg-[#1a148a] text-white px-4 py-1.5 rounded-lg shadow-sm transition-all font-medium text-xs"
                  >
                    <Save size={14} />{" "}
                    <span className="whitespace-nowrap">Save</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-zinc-50/80 border-b border-zinc-200/80">
                <tr>
                  <th
                    rowSpan={2}
                    className="px-3 py-2 border-r border-zinc-200/80 bg-zinc-100/50 font-semibold text-zinc-600 text-xs lg:text-sm"
                  >
                    Programme
                  </th>
                  <th
                    rowSpan={2}
                    className="px-3 py-2 border-r border-zinc-200/80 bg-zinc-100/50 font-semibold text-zinc-600 text-xs lg:text-sm"
                  >
                    Department
                  </th>
                  <th
                    rowSpan={2}
                    className="px-2 py-2 text-center border-r border-zinc-200/80 bg-zinc-100/50 font-semibold text-zinc-600 text-xs lg:text-sm"
                  >
                    Total Intake
                  </th>
                  {quotaColumns.map((col) => {
                    const isSplit = isQuotaSplit(col);
                    return (
                      <th
                        key={col}
                        colSpan={
                          isSplit
                            ? Math.max(1, globalCommunities.length) + 1
                            : 1
                        }
                        rowSpan={isSplit ? 1 : 2}
                        className="px-4 py-2.5 text-center border-r border-zinc-200/80 bg-zinc-100/30 font-semibold text-zinc-600"
                      >
                        {col}
                      </th>
                    );
                  })}
                  <th
                    rowSpan={2}
                    className="px-2 py-2 text-center border-r border-zinc-200/80 bg-zinc-100/50 font-semibold text-zinc-600 text-xs lg:text-sm"
                  >
                    Filled
                  </th>
                  <th
                    rowSpan={2}
                    className="px-2 py-2 text-center border-r border-zinc-200/80 bg-zinc-100/50 font-semibold text-zinc-600 text-xs lg:text-sm"
                  >
                    Available
                  </th>
                  <th
                    rowSpan={2}
                    className="px-2 py-2 text-center bg-zinc-100/50 font-semibold text-zinc-600 text-xs lg:text-sm"
                  >
                    Seat Transfer
                  </th>
                </tr>
                {globalCommunities.length > 0 &&
                  quotaColumns.length > 0 &&
                  quotaColumns.some((col) => isQuotaSplit(col)) && (
                    <tr>
                      {quotaColumns.map((col) => {
                        const isSplit = isQuotaSplit(col);
                        if (!isSplit) return null;
                        return (
                          <React.Fragment key={`sub-${col}`}>
                            <th className="px-1.5 py-1 text-center border-t border-zinc-200/80 text-[9px] font-semibold bg-zinc-50 border-r border-zinc-200/50">
                              Total
                            </th>
                            {globalCommunities.map((comm, cIdx) => (
                              <th
                                key={`${col}-${comm.name}`}
                                className={`px-1 py-1 text-center border-t border-zinc-200/80 text-[9px] font-semibold bg-zinc-50 ${cIdx === globalCommunities.length - 1 ? "border-r border-zinc-200/80" : "border-r border-zinc-200/50 border-r-zinc-300/30"}`}
                              >
                                {comm.name}
                              </th>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}
              </thead>
              <tbody className="divide-y divide-zinc-200/60 font-medium">
                {departments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4 + quotaColumns.length}
                      className="px-6 py-12 text-center text-zinc-500 bg-zinc-50/50"
                    >
                      No departments configured
                    </td>
                  </tr>
                ) : (
                  departments.map((dept) => {
                    const config =
                      (isEditing ? editFormData[dept] : seatConfigs[dept]) ||
                      {};
                    const deptFilledData = filledSeatsByDept[dept] || {
                      total: 0,
                      quotas: {},
                    };
                    const filledCount = deptFilledData.total;
                    const total = calculateTotalIntake(config);
                    const available = Math.max(0, total - filledCount);
                    const programme =
                      Object.keys(programDepartments || {}).find((prog) =>
                        programDepartments[prog]?.includes(dept),
                      ) || "-";

                    return (
                      <tr
                        key={dept}
                        className="hover:bg-zinc-50/40 transition-colors group"
                      >
                        <td className="px-3.5 py-2.5 text-zinc-600 border-r border-zinc-200/80 font-medium whitespace-nowrap text-xs lg:text-sm">
                          {programme}
                        </td>
                        <td className="px-3.5 py-2.5 text-zinc-800 border-r border-zinc-200/80 font-semibold whitespace-nowrap text-xs lg:text-sm">
                          {dept}
                        </td>
                        <td className="px-3 py-2.5 text-center border-r border-zinc-200/80 bg-zinc-50/30 group-hover:bg-transparent">
                          <span className="font-semibold text-zinc-700 text-[13px]">
                            {total}
                          </span>
                        </td>
                        {quotaColumns.map((col) => {
                          const isSplit = isQuotaSplit(col);
                          const quotaVal = config.quotas?.[col];

                          if (!isSplit) {
                            const v =
                              typeof quotaVal === "object" ? 0 : quotaVal || 0;
                            const filledVal =
                              deptFilledData.quotas?.[col]?.total || 0;
                            const rem = Math.max(0, v - filledVal);
                            return (
                              <td
                                key={col}
                                className="px-2.5 py-2 text-center text-zinc-600 border-r border-zinc-200/80"
                              >
                                {isEditing ? (
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={v || ""}
                                    onChange={(e) =>
                                      handleQuotaEditChange(
                                        dept,
                                        col,
                                        null,
                                        e.target.value.replace(/[^0-9]/g, ""),
                                      )
                                    }
                                    className="w-12 text-center border border-zinc-200 rounded-md px-1 py-1 text-[12px] font-medium focus:ring-2 focus:ring-[#120c7a] focus:border-[#120c7a] outline-none shadow-sm transition-all"
                                  />
                                ) : (
                                  <span
                                    className={
                                      rem > 0
                                        ? "text-emerald-600 font-semibold text-[13px]"
                                        : "text-zinc-400 font-medium text-[13px]"
                                    }
                                  >
                                    {rem}
                                  </span>
                                )}
                              </td>
                            );
                          }

                          const quotaObj =
                            typeof quotaVal === "object" && quotaVal !== null
                              ? quotaVal
                              : {};
                          if (globalCommunities.length === 0) {
                            return (
                              <td
                                key={col}
                                className="px-4 py-4 text-center text-zinc-400 border-r border-zinc-200/80"
                              >
                                -
                              </td>
                            );
                          }

                          const filledTotal =
                            deptFilledData.quotas?.[col]?.total || 0;
                          const remTotal = Math.max(
                            0,
                            (quotaObj.total || 0) - filledTotal,
                          );

                          return (
                            <React.Fragment key={`td-${col}`}>
                              {/* Total column */}
                              <td className="px-2 py-2 text-center text-zinc-600 border-r border-zinc-200/50 bg-[#120c7a]/[0.02]">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={quotaObj.total || ""}
                                    onChange={(e) =>
                                      handleQuotaTotalChange(
                                        dept,
                                        col,
                                        e.target.value.replace(/[^0-9]/g, ""),
                                      )
                                    }
                                    placeholder="Total"
                                    className="w-10 text-center border border-zinc-200 rounded-md px-0.5 py-1 text-[11px] focus:ring-2 focus:ring-[#120c7a] focus:border-[#120c7a] outline-none shadow-sm transition-all font-semibold text-[#120c7a]"
                                  />
                                ) : (
                                  <span
                                    className={`font-semibold text-[13px] ${remTotal > 0 ? "text-[#120c7a]" : "text-zinc-400 font-medium"}`}
                                  >
                                    {remTotal}
                                  </span>
                                )}
                              </td>
                              {/* Communities */}
                              {globalCommunities.map((comm, cIdx) => {
                                const v = quotaObj[comm.name] || 0;
                                const filledComm =
                                  deptFilledData.quotas?.[col]?.[comm.name] ||
                                  0;
                                const remComm = Math.max(0, v - filledComm);

                                return (
                                  <td
                                    key={`${col}-${comm.name}`}
                                    className={`px-1 py-1.5 text-center text-zinc-600 ${cIdx === globalCommunities.length - 1 ? "border-r border-zinc-200/80" : "border-r border-zinc-200/50 border-r-zinc-300/30"}`}
                                  >
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={v || ""}
                                        readOnly
                                        className="w-8 text-center border border-zinc-200 bg-zinc-50 rounded-md px-0.5 py-0.5 text-[11px] font-medium text-zinc-400 cursor-not-allowed outline-none hover:bg-zinc-100 transition-colors"
                                      />
                                    ) : (
                                      <span
                                        className={
                                          remComm > 0
                                            ? "text-zinc-700 font-medium text-[12px]"
                                            : "text-zinc-300 font-normal text-[12px]"
                                        }
                                      >
                                        {remComm}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                        <td className="px-2 py-2.5 text-center border-r border-zinc-200/80 bg-zinc-50/30 group-hover:bg-transparent">
                          <span className="font-semibold text-zinc-800 text-[13px]">
                            {filledCount}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center border-r border-zinc-200/80 bg-zinc-50/30 group-hover:bg-transparent">
                          <span
                            className={`font-semibold text-[13px] ${available > 0 ? "text-emerald-600" : "text-rose-500"}`}
                          >
                            {available}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 text-center bg-zinc-50/30 group-hover:bg-transparent">
                          {isAdmin && (
                            <button
                              onClick={() => handleInitiateTransfer(dept)}
                              className="px-2.5 py-1 bg-[#120c7a] hover:bg-[#1a148a] text-white text-[11px] font-semibold rounded-lg transition-all shadow-sm hover:shadow active:scale-95 whitespace-nowrap"
                            >
                              Transfer
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Seat Transfer Modal */}
        {showTransferModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-950/40 backdrop-blur-sm transition-all duration-300">
            <div className="bg-white rounded-2xl shadow-xl shadow-zinc-900/10 w-full max-w-[420px] flex flex-col max-h-[90dvh] overflow-hidden ring-1 ring-zinc-900/5 animate-in fade-in zoom-in-[0.98] duration-200">
              <div className="px-5 py-4 border-b border-zinc-100 flex justify-between items-center bg-white shrink-0">
                <div>
                  <h3 className="font-semibold text-zinc-900 text-base leading-tight">
                    Seat Transfer
                  </h3>
                  <p className="text-[11px] font-medium text-zinc-500 mt-0.5">
                    {transferDept}
                  </p>
                </div>
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 p-1.5 rounded-lg transition-colors"
                >
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-5 custom-scrollbar space-y-4">
                {/* Source Quota Selection */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-600">
                    From Quota
                  </label>
                  <select
                    value={sourceQuota}
                    onChange={(e) => {
                      setSourceQuota(e.target.value);
                      setSourceCommunity("");
                    }}
                    className="w-full px-3.5 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none text-sm text-zinc-900 shadow-sm appearance-none"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                      backgroundPosition: `right 0.75rem center`,
                      backgroundRepeat: `no-repeat`,
                      backgroundSize: `1em 1em`,
                      paddingRight: `2.5rem`
                    }}
                  >
                    <option value="">Select Quota</option>
                    {(seatConfigs[transferDept]?.quotas
                      ? Object.keys(seatConfigs[transferDept].quotas)
                      : []
                    ).map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Source Community Selection (if split) */}
                {sourceQuota &&
                  isQuotaSplitForDept(transferDept, sourceQuota) && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-zinc-600">
                        From Community
                      </label>
                      <select
                        value={sourceCommunity}
                        onChange={(e) => setSourceCommunity(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none text-sm text-zinc-900 shadow-sm appearance-none"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                          backgroundPosition: `right 0.75rem center`,
                          backgroundRepeat: `no-repeat`,
                          backgroundSize: `1em 1em`,
                          paddingRight: `2.5rem`
                        }}
                      >
                        <option value="">Select Community</option>
                        {globalCommunities.map((comm) => (
                          <option key={comm.name} value={comm.name}>
                            {comm.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                {/* Display Available Count from Source */}
                {sourceQuota &&
                  (!isQuotaSplitForDept(transferDept, sourceQuota) ||
                    sourceCommunity) && (
                    <div className="bg-zinc-50 py-2.5 px-3.5 rounded-lg border border-zinc-200/80 flex justify-between items-center shadow-sm">
                      <span className="text-xs font-medium text-zinc-600">
                        Available Seats in Source:
                      </span>
                      <span className="font-semibold text-[#120c7a] text-sm">
                        {getAvailableSourceCount()}
                      </span>
                    </div>
                  )}

                {/* Destination Quota Selection */}
                <div className="space-y-1.5 pt-2">
                  <label className="block text-xs font-medium text-zinc-600">
                    To Quota
                  </label>
                  <select
                    value={destQuota}
                    onChange={(e) => {
                      setDestQuota(e.target.value);
                      setDestCommunity("");
                    }}
                    className="w-full px-3.5 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none text-sm text-zinc-900 shadow-sm appearance-none"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                      backgroundPosition: `right 0.75rem center`,
                      backgroundRepeat: `no-repeat`,
                      backgroundSize: `1em 1em`,
                      paddingRight: `2.5rem`
                    }}
                  >
                    <option value="">Select Quota</option>
                    {(seatConfigs[transferDept]?.quotas
                      ? Object.keys(seatConfigs[transferDept].quotas)
                      : []
                    ).map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Destination Community Selection (if split) */}
                {destQuota && isQuotaSplitForDept(transferDept, destQuota) && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-zinc-600">
                      To Community
                    </label>
                    <select
                      value={destCommunity}
                      onChange={(e) => setDestCommunity(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none text-sm text-zinc-900 shadow-sm appearance-none"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                        backgroundPosition: `right 0.75rem center`,
                        backgroundRepeat: `no-repeat`,
                        backgroundSize: `1em 1em`,
                        paddingRight: `2.5rem`
                      }}
                    >
                      <option value="">Select Community</option>
                      {globalCommunities.map((comm) => (
                        <option key={comm.name} value={comm.name}>
                          {comm.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Transfer Count Input */}
                <div className="space-y-1.5 pt-2">
                  <label className="block text-xs font-medium text-zinc-600">
                    Number of Seats to Transfer
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={transferCount}
                    onChange={(e) =>
                      setTransferCount(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    placeholder="e.g. 5"
                    className="w-full px-3.5 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none transition-all placeholder:text-zinc-400 text-sm text-zinc-900 shadow-sm"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="px-5 py-4 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTransferSubmit}
                  disabled={
                    !sourceQuota ||
                    (isQuotaSplitForDept(transferDept, sourceQuota) &&
                      !sourceCommunity) ||
                    !destQuota ||
                    (isQuotaSplitForDept(transferDept, destQuota) &&
                      !destCommunity) ||
                    !transferCount ||
                    Number(transferCount) <= 0 ||
                    Number(transferCount) > getAvailableSourceCount()
                  }
                  className="px-4 py-2 text-sm font-medium text-white bg-[#120c7a] rounded-lg hover:bg-[#1a148a] transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed"
                >
                  Transfer Seats
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Quota Modal */}
        {showAddQuotaModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-950/40 backdrop-blur-sm transition-all duration-300">
            <div className="bg-white rounded-2xl shadow-xl shadow-zinc-900/10 w-full max-w-[420px] flex flex-col max-h-[90dvh] overflow-hidden ring-1 ring-zinc-900/5 animate-in fade-in zoom-in-[0.98] duration-200">
              <div className="px-5 py-4 border-b border-zinc-100 flex justify-between items-center bg-white shrink-0">
                <h3 className="font-semibold text-zinc-900 text-base">
                  Add Quota
                </h3>
                <button
                  onClick={() => {
                    setShowAddQuotaModal(false);
                    setNewQuotaInput("");
                    setIsSplitCommunity(false);
                  }}
                  className="text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 p-1.5 rounded-lg transition-colors"
                >
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-5 custom-scrollbar space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-600">
                    Quota Name
                  </label>
                  <input
                    type="text"
                    value={newQuotaInput}
                    onChange={(e) => setNewQuotaInput(e.target.value)}
                    placeholder="e.g. First Graduate, Sports Quota"
                    className="w-full px-3.5 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none transition-all placeholder:text-zinc-400 text-sm text-zinc-900 shadow-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitAddQuota();
                    }}
                  />
                </div>
                <div className="flex items-start gap-3 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200/80 shadow-sm">
                  <input
                    type="checkbox"
                    id="splitByCommunity"
                    checked={isSplitCommunity}
                    onChange={(e) => setIsSplitCommunity(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-300 text-[#120c7a] focus:ring-2 focus:ring-[#120c7a]/20 w-4 h-4 cursor-pointer"
                  />
                  <div className="flex flex-col gap-0.5">
                    <label
                      htmlFor="splitByCommunity"
                      className="text-sm font-medium text-zinc-800 cursor-pointer select-none"
                    >
                      Split by Community
                    </label>
                    <p className="text-xs text-zinc-500 leading-tight">
                      Create separate inputs for each community option.
                    </p>
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => {
                    setShowAddQuotaModal(false);
                    setNewQuotaInput("");
                    setIsSplitCommunity(false);
                  }}
                  className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={submitAddQuota}
                  disabled={!newQuotaInput.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#120c7a] rounded-lg hover:bg-[#1a148a] transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed"
                >
                  Add Quota
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manage Communities Modal */}
        {showAddCommunityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-950/40 backdrop-blur-sm transition-all duration-300">
            <div className="bg-white rounded-2xl shadow-xl shadow-zinc-900/10 w-full max-w-[420px] flex flex-col max-h-[90dvh] overflow-hidden ring-1 ring-zinc-900/5 animate-in fade-in zoom-in-[0.98] duration-200">
              <div className="px-5 py-4 border-b border-zinc-100 flex justify-between items-center bg-white shrink-0">
                <h3 className="font-semibold text-zinc-900 text-base">
                  Manage Communities
                </h3>
                <button
                  onClick={() => {
                    setShowAddCommunityModal(false);
                    setNewCommunityInput("");
                    setNewCommunityPercent("");
                  }}
                  className="text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 p-1.5 rounded-lg transition-colors"
                >
                  <X size={18} strokeWidth={2} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 p-5 custom-scrollbar">
                <div className="mb-6">
                  <h4 className="text-xs font-semibold text-zinc-900 mb-3">
                    Existing Communities
                  </h4>
                  {globalCommunities.length === 0 ? (
                    <div className="py-8 px-4 text-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50">
                      <p className="text-sm font-medium text-zinc-500">No communities yet</p>
                      <p className="text-xs text-zinc-400 mt-1">Add one below to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {globalCommunities.map((comm) => (
                        <div
                          key={comm.name}
                          className="group flex items-center justify-between bg-white p-3 rounded-xl border border-zinc-200/60 shadow-sm hover:border-zinc-300 transition-colors"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-zinc-800 text-sm leading-tight">
                              {comm.name}
                            </span>
                            <div className="flex items-center mt-0.5">
                              <span className="text-[11px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-md border border-zinc-200/80">
                                {comm.percentage}%
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => deleteCommunity(comm.name)}
                            className="text-zinc-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-colors opacity-100 sm:opacity-0 group-hover:opacity-100"
                            title="Remove community"
                          >
                            <X size={16} strokeWidth={2} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-5 border-t border-zinc-100">
                  <h4 className="text-xs font-semibold text-zinc-900 mb-4">
                    Add New
                  </h4>
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="col-span-2 space-y-1.5">
                      <label className="block text-xs font-medium text-zinc-600">
                        Name
                      </label>
                      <input
                        type="text"
                        value={newCommunityInput}
                        onChange={(e) => setNewCommunityInput(e.target.value)}
                        placeholder="e.g. OC, BC"
                        className="w-full px-3.5 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none transition-all placeholder:text-zinc-400 text-sm text-zinc-900 shadow-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitAddCommunity();
                        }}
                      />
                    </div>
                    <div className="col-span-1 space-y-1.5">
                      <label className="block text-xs font-medium text-zinc-600">
                        Percent (%)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newCommunityPercent}
                        onChange={(e) =>
                          setNewCommunityPercent(
                            e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*?)\..*/g, '$1'),
                          )
                        }
                        placeholder="e.g. 31"
                        className="w-full px-3.5 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none transition-all placeholder:text-zinc-400 text-sm text-zinc-900 shadow-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitAddCommunity();
                        }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={submitAddCommunity}
                    disabled={!newCommunityInput.trim()}
                    className="w-full flex justify-center items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#120c7a] rounded-lg hover:bg-[#1a148a] transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed"
                  >
                    <Plus size={16} strokeWidth={2.5} /> 
                    <span>Add Community</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Manage Scholarships Modal */}
        {showAddScholarshipModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-950/40 backdrop-blur-sm transition-all duration-300">
            <div className="bg-white rounded-2xl shadow-xl shadow-zinc-900/10 w-full max-w-[420px] flex flex-col max-h-[90dvh] overflow-hidden ring-1 ring-zinc-900/5 animate-in fade-in zoom-in-[0.98] duration-200">
              <div className="px-5 py-4 border-b border-zinc-100 flex justify-between items-center bg-white shrink-0">
                <h3 className="font-semibold text-zinc-900 text-base">
                  Manage Scholarships
                </h3>
                <button
                  onClick={() => {
                    setShowAddScholarshipModal(false);
                    setNewScholarshipInput("");
                    setScholarshipQuota("");
                  }}
                  className="text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 p-1.5 rounded-lg transition-colors"
                >
                  <X size={18} strokeWidth={2} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 p-5 custom-scrollbar">
                <div className="mb-6">
                  <h4 className="text-xs font-semibold text-zinc-900 mb-3">
                    Existing Scholarships
                  </h4>
                  {scholarships.length === 0 ? (
                    <div className="py-8 px-4 text-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50">
                      <p className="text-sm font-medium text-zinc-500">No scholarships yet</p>
                      <p className="text-xs text-zinc-400 mt-1">Add one below to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {scholarships.map((s) => (
                        <div key={s.id} className="group flex items-center justify-between bg-white p-3 rounded-xl border border-zinc-200/60 shadow-sm hover:border-zinc-300 transition-colors">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-zinc-800 text-sm leading-tight">{s.name}</span>
                            <div className="flex items-center">
                              {s.quota ? (
                                <span className="text-[11px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-md border border-zinc-200/80">{s.quota}</span>
                              ) : (
                                <span className="text-[11px] font-medium text-zinc-400">All Quotas</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => deleteScholarship(s.id)}
                            className="text-zinc-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-colors opacity-100 sm:opacity-0 group-hover:opacity-100"
                            title="Remove scholarship"
                          >
                            <X size={16} strokeWidth={2} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-5 border-t border-zinc-100">
                  <h4 className="text-xs font-semibold text-zinc-900 mb-4">Add New</h4>
                  
                  <div className="space-y-4 mb-5">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-zinc-600">Name</label>
                      <input
                        type="text"
                        value={newScholarshipInput}
                        onChange={(e) => setNewScholarshipInput(e.target.value)}
                        placeholder="e.g. Merit Scholarship"
                        className="w-full px-3.5 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none transition-all placeholder:text-zinc-400 text-sm text-zinc-900 shadow-sm"
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="flex items-center justify-between text-xs font-medium text-zinc-600">
                        <span>Applicable Quota</span>
                        <span className="text-[11px] text-zinc-400">Optional</span>
                      </label>
                      <select
                        value={scholarshipQuota}
                        onChange={(e) => setScholarshipQuota(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#120c7a]/20 focus:border-[#120c7a] outline-none transition-all text-sm text-zinc-900 shadow-sm appearance-none"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                          backgroundPosition: `right 0.75rem center`,
                          backgroundRepeat: `no-repeat`,
                          backgroundSize: `1em 1em`,
                          paddingRight: `2.5rem`
                        }}
                      >
                        <option value="">Apply to all quotas</option>
                        {quotaColumns.map((q) => <option key={q} value={q}>{q} Quota</option>)}
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (newScholarshipInput.trim()) {
                        addScholarship(newScholarshipInput, scholarshipQuota);
                        setNewScholarshipInput("");
                        setScholarshipQuota("");
                      }
                    }}
                    disabled={!newScholarshipInput.trim()}
                    className="w-full flex justify-center items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#120c7a] rounded-lg hover:bg-[#1a148a] transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed"
                  >
                    <Plus size={16} strokeWidth={2.5} /> 
                    <span>Add Scholarship</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
