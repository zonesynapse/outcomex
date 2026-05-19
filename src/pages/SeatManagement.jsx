import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import { getSeatConfigurationsRealtime, getStudentsRealtime, saveSeatConfiguration } from '../services/seatService';
import { getCommunitiesRealtime, saveCommunity, deleteCommunity } from '../services/configService';
import { Users, BookOpen, AlertCircle, CheckCircle, Edit, Save, X, Plus } from 'lucide-react';

export default function SeatManagement() {
  const [seatConfigs, setSeatConfigs] = useState({});
  const [students, setStudents] = useState({});
  const [globalCommunities, setGlobalCommunities] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDeptInput, setNewDeptInput] = useState('');

  const [showAddQuotaModal, setShowAddQuotaModal] = useState(false);
  const [newQuotaInput, setNewQuotaInput] = useState('');
  const [isSplitCommunity, setIsSplitCommunity] = useState(false);

  const [showAddCommunityModal, setShowAddCommunityModal] = useState(false);
  const [newCommunityInput, setNewCommunityInput] = useState('');

  useEffect(() => {
    // 1. Fetch seat configurations
    const unsubscribeConfigs = getSeatConfigurationsRealtime(
      (data) => {
        const normalizedData = {};
        Object.keys(data || {}).forEach(dept => {
           let config = data[dept];
           let quotas = config.quotas || {};
           
           // Migrate legacy fields locally
           if (config.governmentQuota !== undefined) {
             quotas['Govt Quota'] = { OC: config.governmentQuota }; // Govt Quota is split
             delete config.governmentQuota;
           }
           if (config.managementQuota !== undefined) {
             quotas['Mgmt Quota'] = config.managementQuota; // Mgmt Quota is global
             delete config.managementQuota;
           }
           if (config.lateralEntry !== undefined) {
             quotas['Lateral Entry'] = config.lateralEntry; // Lateral Entry is global
             delete config.lateralEntry;
           }
           
           normalizedData[dept] = { ...config, quotas };
        });

        setSeatConfigs(normalizedData);
        if (!isEditing) {
          setEditFormData(normalizedData);
        }
      },
      (err) => console.error(err)
    );

    // 2. Fetch students for filled seats calculation
    const unsubscribeStudents = getStudentsRealtime(
      (data) => {
        setStudents(data || {});
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );

    // 3. Fetch communities
    const unsubscribeCommunities = getCommunitiesRealtime(
      (data) => {
        setGlobalCommunities(data || []);
      },
      (err) => console.error(err)
    );

    return () => {
      unsubscribeConfigs();
      unsubscribeStudents();
      unsubscribeCommunities();
    };
  }, [isEditing]);

  // Calculate filled seats from students
  const filledSeatsByDept = useMemo(() => {
    const counts = {};
    Object.values(students).forEach(student => {
       const dept = student.department;
       if (dept) {
         counts[dept] = (counts[dept] || 0) + 1;
       }
    });
    return counts;
  }, [students]);

  // Derived state for the UI
  const departments = Object.keys(seatConfigs);
  
  let globalTotal = 0;
  let globalFilled = 0;

  departments.forEach(dept => {
     globalTotal += Number(seatConfigs[dept].totalIntake) || 0;
     globalFilled += filledSeatsByDept[dept] || 0;
  });

  const globalAvailable = Math.max(0, globalTotal - globalFilled);

  const isQuotaSplit = (colName) => {
    const sourceData = isEditing ? editFormData : seatConfigs;
    for (const dept of Object.values(sourceData)) {
       if (dept.quotas && typeof dept.quotas[colName] === 'object' && dept.quotas[colName] !== null) {
          return true;
       }
    }
    return false;
  };

  const quotaColumns = useMemo(() => {
    const columns = new Set();
    const sourceData = isEditing ? editFormData : seatConfigs;
    Object.values(sourceData).forEach(config => {
      if (config.quotas) {
        Object.keys(config.quotas).forEach(k => columns.add(k));
      }
    });
    return Array.from(columns);
  }, [seatConfigs, editFormData, isEditing]);

  const handleEditChange = (dept, field, value) => {
    setEditFormData(prev => ({
      ...prev,
      [dept]: {
        ...prev[dept],
        [field]: value
      }
    }));
  };

  const handleQuotaEditChange = (dept, quotaName, communityName, value) => {
    setEditFormData(prev => {
      const prevQuotas = prev[dept]?.quotas || {};
      const prevQuotaValue = prevQuotas[quotaName];
      
      let newQuotaValue;
      if (communityName !== null) {
         newQuotaValue = {
           ...(typeof prevQuotaValue === 'object' ? prevQuotaValue : {}),
           [communityName]: value
         };
         // We do NOT auto-update total. The total represents the Quota limit.
      } else {
         newQuotaValue = value;
      }

      return {
        ...prev,
        [dept]: {
          ...prev[dept],
          quotas: {
            ...prevQuotas,
            [quotaName]: newQuotaValue
          }
        }
      };
    });
  };

  const handleQuotaTotalChange = (dept, quotaName, value) => {
    const total = Number(value) || 0;
    
    setEditFormData(prev => {
      const prevQuotas = prev[dept]?.quotas || {};
      const newQuotaValue = { total };

      // Distribute seats using percentage 
      let distributedSoFar = 0;
      globalCommunities.forEach((comm, idx) => {
         const seatForComm = Math.round((total * comm.percentage) / 100);
         newQuotaValue[comm.name] = seatForComm;
         distributedSoFar += seatForComm;
      });
      // Optionally adjust last one? We leave it as is so user can manually tweak if needed.

      return {
         ...prev,
         [dept]: {
           ...prev[dept],
           quotas: {
             ...prevQuotas,
             [quotaName]: newQuotaValue
           }
         }
      }
    });
  };

  const handleSave = async () => {
    try {
      // Loop and save each
      await Promise.all(
        Object.keys(editFormData).map(dept => saveSeatConfiguration(dept, editFormData[dept]))
      );
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save", err);
      alert("Failed to save. Check console for details.");
    }
  };

  const handleAddDepartment = () => {
    setShowAddModal(true);
  };

  const submitAddDepartment = () => {
    const newDept = newDeptInput.trim().toUpperCase();
    if (newDept && !editFormData[newDept]) {
      setEditFormData(prev => ({
        ...prev,
        [newDept]: { totalIntake: 0, quotas: {} }
      }));
    }
    setShowAddModal(false);
    setNewDeptInput('');
  };

  const handleAddQuota = () => {
    setShowAddQuotaModal(true);
  };

  const submitAddQuota = () => {
    const newQuota = newQuotaInput.trim();
    if (newQuota) {
       setEditFormData(prev => {
         const next = { ...prev };
         Object.keys(next).forEach(dept => {
            next[dept] = {
              ...next[dept],
              quotas: {
                ...(next[dept].quotas || {}),
                [newQuota]: isSplitCommunity ? {} : 0
              }
            };
         });
         return next;
       });
    }
    setShowAddQuotaModal(false);
    setNewQuotaInput('');
    setIsSplitCommunity(false);
  };

  const handleAddCommunity = () => {
    setShowAddCommunityModal(true);
  };

  const [newCommunityPercent, setNewCommunityPercent] = useState('');

  const submitAddCommunity = async () => {
    const newComm = newCommunityInput.trim().toUpperCase();
    const percent = Number(newCommunityPercent) || 0;
    if (newComm) {
      try {
        await saveCommunity(newComm, percent);
        setNewCommunityInput('');
        setNewCommunityPercent('');
      } catch(err) {
        console.error("Failed to add community", err);
      }
    }
  };

  const renderStatus = (filled, total) => {
    if (total === 0) return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">Not Set</span>;
    const ratio = filled / total;
    if (ratio >= 1) return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">Full</span>;
    if (ratio >= 0.8) return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium">Nearly Full</span>;
    return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">Open</span>;
  };

  if (loading) {
    return <Layout title="Seat Management"><div className="p-8 text-center text-gray-500">Loading seat configurations...</div></Layout>;
  }

  return (
    <Layout title="Seat Management">
      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-8 bg-zinc-50/30 min-h-screen">
        
        {/* Header */}
        <div className="flex justify-end items-center gap-6">
          
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
             {!isEditing ? (
              <button 
                onClick={() => setIsEditing(true)}
                className="flex flex-1 lg:flex-none justify-center items-center gap-2 bg-[#120c7a] hover:bg-[#1a148a] shadow-md hover:shadow-xl hover:-translate-y-0.5 text-white px-5 py-2.5 rounded-xl transition-all font-medium text-sm"
              >
                <Edit size={16} /> <span className="whitespace-nowrap">Edit Intake</span>
              </button>
            ) : (
               <div className="flex flex-wrap w-full lg:w-auto gap-3 items-center bg-white p-2 sm:p-2 rounded-2xl shadow-sm border border-zinc-200">
                <button 
                  onClick={handleAddDepartment}
                  className="flex flex-1 sm:flex-none justify-center items-center gap-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 px-4 py-2 rounded-xl transition-colors font-medium text-sm border border-zinc-200/50"
                >
                  <Plus size={16} /> <span className="whitespace-nowrap">Add Dept</span>
                </button>
                <button 
                  onClick={handleAddQuota}
                  className="flex flex-1 sm:flex-none justify-center items-center gap-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 px-4 py-2 rounded-xl transition-colors font-medium text-sm border border-zinc-200/50"
                >
                  <Plus size={16} /> <span className="whitespace-nowrap">Add Quota</span>
                </button>
                <button 
                  onClick={handleAddCommunity}
                  className="flex flex-1 sm:flex-none justify-center items-center gap-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 px-4 py-2 rounded-xl transition-colors font-medium text-sm border border-zinc-200/50"
                >
                  <Plus size={16} /> <span className="whitespace-nowrap">Add Community</span>
                </button>
                
                <div className="w-[1px] h-8 bg-zinc-200 hidden sm:block mx-1"></div>
                
                <button 
                  onClick={() => setIsEditing(false)}
                  className="flex flex-1 sm:flex-none justify-center items-center gap-2 bg-white hover:bg-zinc-50 text-zinc-600 px-4 py-2 rounded-xl transition-colors font-medium text-sm border border-zinc-200 shadow-sm"
                >
                  <X size={16} /> <span className="whitespace-nowrap">Cancel</span>
                </button>
                <button 
                  onClick={handleSave}
                  className="flex flex-1 sm:flex-none justify-center items-center gap-2 bg-[#120c7a] hover:bg-[#1a148a] text-white px-5 py-2 rounded-xl shadow-md transition-all font-medium text-sm"
                >
                  <Save size={16} /> <span className="whitespace-nowrap">Save</span>
                </button>
               </div>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
          <div className="bg-white p-6 rounded-2xl border border-zinc-200/60 shadow-sm hover:shadow-md transition-shadow flex items-center gap-5 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#120c7a]/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-14 h-14 bg-blue-50/80 text-[#120c7a] rounded-2xl flex items-center justify-center shrink-0 border border-blue-100/50">
              <Users size={28} />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-1">Total Seats</p>
              <h3 className="text-3xl font-extrabold text-zinc-900 tracking-tight">{globalTotal}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-zinc-200/60 shadow-sm hover:shadow-md transition-shadow flex items-center gap-5 relative overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
             <div className="w-14 h-14 bg-emerald-50/80 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100/50">
               <CheckCircle size={28} />
             </div>
             <div>
               <p className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-1">Filled Seats</p>
               <h3 className="text-3xl font-extrabold text-zinc-900 tracking-tight">{globalFilled}</h3>
             </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-zinc-200/60 shadow-sm hover:shadow-md transition-shadow flex items-center gap-5 relative overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
             <div className="w-14 h-14 bg-amber-50/80 text-amber-600 rounded-2xl flex items-center justify-center shrink-0 border border-amber-100/50">
               <AlertCircle size={28} />
             </div>
             <div>
               <p className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-1">Available Seats</p>
               <h3 className="text-3xl font-extrabold text-zinc-900 tracking-tight">{globalAvailable}</h3>
             </div>
          </div>
        </div>

        {/* Department Cards Grid */}
        <div className="space-y-5">
          <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Department Overview</h2>
          {(isEditing ? Object.keys(editFormData) : departments).length === 0 ? (
             <div className="text-center p-12 bg-white rounded-3xl border-2 border-dashed border-zinc-200 shadow-sm">
               <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4">
                 <BookOpen className="text-zinc-400" size={24} />
               </div>
               <p className="text-zinc-500 font-medium">No seat configurations found.</p>
               <p className="text-zinc-400 text-sm mt-1">Click <span className="font-semibold text-zinc-600">Edit Intake</span> to add some.</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              {(isEditing ? Object.keys(editFormData) : departments).map(dept => {
                const config = isEditing ? editFormData[dept] : seatConfigs[dept];
                const total = Number(config.totalIntake) || 0;
                const filled = filledSeatsByDept[dept] || 0;
                const available = Math.max(0, total - filled);
                const progress = total > 0 ? Math.min(100, (filled / total) * 100) : 0;
                const isFull = progress >= 100;
                const isNearlyFull = progress >= 80 && progress < 100;

                return (
                  <div key={dept} className="bg-white p-6 rounded-2xl border border-zinc-200/60 shadow-sm hover:shadow-md transition-shadow space-y-5 relative overflow-hidden group">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h3 className="font-extrabold text-zinc-900 text-xl tracking-tight">{dept}</h3>
                        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Department</p>
                      </div>
                      {renderStatus(filled, total)}
                    </div>
                    
                    <div className="flex justify-between text-sm items-end bg-zinc-50/50 p-3 rounded-xl">
                      <div className="text-zinc-500">
                        <div className="text-2xl font-bold text-zinc-900">{filled}</div>
                        <div className="text-xs uppercase tracking-wider font-semibold">Filled</div>
                      </div>
                      <div className="text-zinc-400 font-medium">/ {total}</div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${available > 0 ? 'text-[#120c7a]' : 'text-rose-600'}`}>{available}</div>
                        <div className="text-xs uppercase tracking-wider font-semibold text-zinc-500">Available</div>
                      </div>
                    </div>

                    <div className="w-full bg-zinc-100 h-2.5 rounded-full overflow-hidden shrink-0">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ease-out ${isFull ? 'bg-rose-500' : isNearlyFull ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Seat Matrix Table */}
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-lg overflow-hidden ring-1 ring-zinc-900/5">
           <div className="px-6 py-5 border-b border-zinc-200/80 flex justify-between items-center bg-zinc-50/50">
             <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-3 tracking-tight">
               <div className="p-2 bg-white rounded-lg border border-zinc-200 shadow-sm">
                 <BookOpen size={16} className="text-[#120c7a]"/>
               </div>
               Seat Matrix
             </h2>
           </div>
           
           <div className="overflow-x-auto custom-scrollbar">
             <table className="w-full text-sm text-left">
               <thead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider bg-zinc-50 border-b border-zinc-200/80">
                  <tr>
                   <th rowSpan={2} className="px-5 py-4 font-bold border-r border-zinc-200/80 bg-zinc-100/50">Department</th>
                   <th rowSpan={2} className="px-5 py-4 font-bold text-center border-r border-zinc-200/80 bg-zinc-100/50">Total Intake</th>
                   {quotaColumns.map(col => {
                     const isSplit = isQuotaSplit(col);
                     return (
                       <th key={col} colSpan={isSplit ? Math.max(1, globalCommunities.length) + 1 : 1} rowSpan={isSplit ? 1 : 2} className="px-4 py-3 font-bold text-center border-r border-zinc-200/80 bg-zinc-100/30">
                         {col}
                       </th>
                     );
                   })}
                   <th rowSpan={2} className="px-5 py-4 font-bold text-center border-r border-zinc-200/80 bg-zinc-100/50">Filled</th>
                   <th rowSpan={2} className="px-5 py-4 font-bold text-center bg-zinc-100/50">Available</th>
                 </tr>
                 {globalCommunities.length > 0 && quotaColumns.length > 0 && quotaColumns.some(col => isQuotaSplit(col)) && (
                   <tr>
                     {quotaColumns.map((col, idx) => {
                        const isSplit = isQuotaSplit(col);
                        if (!isSplit) return null;
                        return (
                          <React.Fragment key={`sub-${col}`}>
                            <th className="px-3 py-2 font-bold text-center border-t border-zinc-200/80 text-[10px] bg-zinc-50/80 border-r border-zinc-200/50">Total</th>
                            {globalCommunities.map((comm, cIdx) => (
                              <th key={`${col}-${comm.name}`} className={`px-2 py-2 font-bold text-center border-t border-zinc-200/80 text-[10px] bg-zinc-50/80 ${cIdx === globalCommunities.length - 1 ? 'border-r border-zinc-200/80' : 'border-r border-zinc-200/50 border-r-zinc-300/30'}`}>
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
                 {(isEditing ? Object.keys(editFormData) : departments).length === 0 ? (
                    <tr>
                      <td colSpan={4 + quotaColumns.length} className="px-6 py-12 text-center text-zinc-500 bg-zinc-50/50">No departments configured</td>
                    </tr>
                 ) : (
                   (isEditing ? Object.keys(editFormData) : departments).map((dept) => {
                     const config = isEditing ? editFormData[dept] : seatConfigs[dept];
                     const filled = filledSeatsByDept[dept] || 0;
                     const total = Number(config.totalIntake) || 0;
                     const available = Math.max(0, total - filled);

                     return (
                       <tr key={dept} className="hover:bg-zinc-50/50 transition-colors group">
                         <td className="px-5 py-4 text-zinc-900 border-r border-zinc-200/80 font-bold">{dept}</td>
                         <td className="px-5 py-4 text-center border-r border-zinc-200/80 bg-zinc-50/30 group-hover:bg-transparent">
                           {isEditing ? (
                             <input 
                               type="number" 
                               value={config.totalIntake || ''} 
                               onChange={(e) => handleEditChange(dept, 'totalIntake', e.target.value)}
                               className="w-20 text-center border border-zinc-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#120c7a] outline-none shadow-sm transition-shadow"
                             />
                           ) : (
                             <span className="font-bold text-zinc-800 text-base">{config.totalIntake || 0}</span>
                           )}
                         </td>
                         {quotaColumns.map(col => {
                           const isSplit = isQuotaSplit(col);
                           const quotaVal = config.quotas?.[col];

                           if (!isSplit) {
                              const v = typeof quotaVal === 'object' ? 0 : (quotaVal || 0);
                              return (
                                <td key={col} className="px-4 py-4 text-center text-zinc-600 border-r border-zinc-200/80">
                                  {isEditing ? (
                                    <input 
                                      type="number" 
                                      value={v || ''} 
                                      onChange={(e) => handleQuotaEditChange(dept, col, null, e.target.value)}
                                      className="w-20 text-center border border-zinc-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#120c7a] outline-none shadow-sm transition-shadow"
                                    />
                                  ) : (v || 0)}
                                </td>
                              );
                           }

                           const quotaObj = typeof quotaVal === 'object' && quotaVal !== null ? quotaVal : {};
                           if (globalCommunities.length === 0) {
                              return <td key={col} className="px-4 py-4 text-center text-zinc-400 border-r border-zinc-200/80">-</td>;
                           }
                           
                           return (
                             <React.Fragment key={`td-${col}`}>
                               {/* Total column */}
                               <td className="px-3 py-4 text-center text-zinc-600 border-r border-zinc-200/50 bg-[#120c7a]/[0.02]">
                                 {isEditing ? (
                                   <input 
                                     type="number" 
                                     value={quotaObj.total || ''} 
                                     onChange={(e) => handleQuotaTotalChange(dept, col, e.target.value)}
                                     placeholder="Total"
                                     className="w-16 text-center border border-zinc-300 rounded-md px-1 py-1 text-sm focus:ring-2 focus:ring-[#120c7a] outline-none shadow-sm transition-shadow font-bold text-[#120c7a]"
                                   />
                                 ) : (
                                   <span className="font-bold text-[#120c7a]">{quotaObj.total || 0}</span>
                                 )}
                               </td>
                               {/* Communities */}
                               {globalCommunities.map((comm, cIdx) => {
                                 const v = quotaObj[comm.name] || 0;
                                 return (
                                   <td key={`${col}-${comm.name}`} className={`px-2 py-4 text-center text-zinc-600 ${cIdx === globalCommunities.length - 1 ? 'border-r border-zinc-200/80' : 'border-r border-zinc-200/50 border-r-zinc-300/30'}`}>
                                     {isEditing ? (
                                       <input 
                                         type="number" 
                                         value={v || ''} 
                                         onChange={(e) => handleQuotaEditChange(dept, col, comm.name, e.target.value)}
                                         className="w-12 text-center border border-zinc-300 rounded-md px-1 py-1 text-sm focus:ring-2 focus:ring-[#120c7a] outline-none shadow-sm transition-shadow"
                                       />
                                     ) : (v || 0)}
                                   </td>
                                 );
                               })}
                             </React.Fragment>
                           );
                         })}
                         <td className="px-5 py-4 text-center border-r border-zinc-200/80 bg-zinc-50/30 group-hover:bg-transparent">
                           <span className="font-bold text-zinc-900 text-base">{filled}</span>
                         </td>
                         <td className="px-5 py-4 text-center bg-zinc-50/30 group-hover:bg-transparent">
                           <span className={`font-bold text-base ${available > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{available}</span>
                         </td>
                       </tr>
                     );
                   })
                 )}
               </tbody>
             </table>
           </div>
        </div>

        {/* Add Department Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-md">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-zinc-900/5 animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-5 border-b border-zinc-100 flex justify-between items-center bg-white">
                <h3 className="font-bold text-zinc-900 text-lg tracking-tight">Add Department</h3>
                <button 
                  onClick={() => { setShowAddModal(false); setNewDeptInput(''); }}
                  className="text-zinc-400 hover:text-zinc-700 bg-zinc-50 hover:bg-zinc-100 p-2 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">
                    Department Code
                  </label>
                  <input
                    type="text"
                    value={newDeptInput}
                    onChange={(e) => setNewDeptInput(e.target.value)}
                    placeholder="e.g., CIVIL, MECH, CSE"
                    className="w-full px-4 py-3 border border-zinc-300/80 rounded-xl focus:ring-2 focus:ring-[#120c7a] focus:border-[#120c7a] outline-none transition-all shadow-sm font-medium"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitAddDepartment();
                    }}
                  />
                </div>
              </div>
              <div className="px-6 py-5 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                <button
                  onClick={() => { setShowAddModal(false); setNewDeptInput(''); }}
                  className="px-5 py-2.5 text-sm font-bold text-zinc-600 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 hover:text-zinc-900 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={submitAddDepartment}
                  disabled={!newDeptInput.trim()}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-[#120c7a] rounded-xl hover:bg-[#1a148a] transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  Add Department
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Quota Modal */}
        {showAddQuotaModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-md">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-zinc-900/5 animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-5 border-b border-zinc-100 flex justify-between items-center bg-white">
                <h3 className="font-bold text-zinc-900 text-lg tracking-tight">Add Quota</h3>
                <button 
                  onClick={() => { setShowAddQuotaModal(false); setNewQuotaInput(''); setIsSplitCommunity(false); }}
                  className="text-zinc-400 hover:text-zinc-700 bg-zinc-50 hover:bg-zinc-100 p-2 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">
                    Quota Name
                  </label>
                  <input
                    type="text"
                    value={newQuotaInput}
                    onChange={(e) => setNewQuotaInput(e.target.value)}
                    placeholder="e.g., First Graduate, Sports Quota"
                    className="w-full px-4 py-3 border border-zinc-300/80 rounded-xl focus:ring-2 focus:ring-[#120c7a] focus:border-[#120c7a] outline-none transition-all shadow-sm font-medium"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitAddQuota();
                    }}
                  />
                </div>
                <div className="flex items-center gap-3 bg-zinc-50 p-4 rounded-xl border border-zinc-200/60">
                  <input
                    type="checkbox"
                    id="splitByCommunity"
                    checked={isSplitCommunity}
                    onChange={(e) => setIsSplitCommunity(e.target.checked)}
                    className="rounded border-zinc-300 text-[#120c7a] focus:ring-[#120c7a] w-5 h-5 cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <label htmlFor="splitByCommunity" className="text-sm font-bold text-zinc-900 cursor-pointer">
                      Split by Community
                    </label>
                    <p className="text-xs text-zinc-500 font-medium">Create separate inputs for each community option.</p>
                  </div>
                </div>
              </div>
              <div className="px-6 py-5 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
                <button
                  onClick={() => { setShowAddQuotaModal(false); setNewQuotaInput(''); setIsSplitCommunity(false); }}
                  className="px-5 py-2.5 text-sm font-bold text-zinc-600 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 hover:text-zinc-900 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={submitAddQuota}
                  disabled={!newQuotaInput.trim()}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-[#120c7a] rounded-xl hover:bg-[#1a148a] transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  Add Quota
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manage Communities Modal */}
        {showAddCommunityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-md">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-zinc-900/5 animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-5 border-b border-zinc-100 flex justify-between items-center bg-white">
                <h3 className="font-bold text-zinc-900 text-lg tracking-tight">Manage Communities</h3>
                <button 
                  onClick={() => { setShowAddCommunityModal(false); setNewCommunityInput(''); setNewCommunityPercent(''); }}
                  className="text-zinc-400 hover:text-zinc-700 bg-zinc-50 hover:bg-zinc-100 p-2 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6">
                <div className="space-y-3 mb-6 max-h-48 overflow-y-auto custom-scrollbar">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Existing Communities</h4>
                  {globalCommunities.length === 0 ? (
                    <p className="text-sm text-zinc-400 italic">No communities configured.</p>
                  ) : (
                    globalCommunities.map(comm => (
                      <div key={comm.name} className="flex items-center justify-between bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-zinc-700">{comm.name}</span>
                          <span className="text-xs font-medium bg-[#120c7a]/10 text-[#120c7a] px-2 py-0.5 rounded-full">{comm.percentage}%</span>
                        </div>
                        <button 
                           onClick={() => deleteCommunity(comm.name)}
                           className="text-rose-400 hover:text-rose-600 bg-white hover:bg-rose-50 p-1.5 rounded-lg border border-transparent hover:border-rose-100 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-5 border-t border-zinc-100 space-y-4">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Add New</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                        Name
                      </label>
                      <input
                        type="text"
                        value={newCommunityInput}
                        onChange={(e) => setNewCommunityInput(e.target.value)}
                        placeholder="e.g. OC, BC"
                        className="w-full px-3 py-2 border border-zinc-300/80 rounded-xl focus:ring-2 focus:ring-[#120c7a] focus:border-[#120c7a] outline-none transition-all shadow-sm font-medium text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitAddCommunity();
                        }}
                      />
                    </div>
                    <div className="col-span-1">
                       <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                        Percent (%)
                      </label>
                      <input
                        type="number"
                        value={newCommunityPercent}
                        onChange={(e) => setNewCommunityPercent(e.target.value)}
                        placeholder="e.g. 31"
                        className="w-full px-3 py-2 border border-zinc-300/80 rounded-xl focus:ring-2 focus:ring-[#120c7a] focus:border-[#120c7a] outline-none transition-all shadow-sm font-medium text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitAddCommunity();
                        }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={submitAddCommunity}
                    disabled={!newCommunityInput.trim()}
                    className="w-full flex justify-center items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#120c7a] rounded-xl hover:bg-[#1a148a] transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={16} /> Add Community
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
