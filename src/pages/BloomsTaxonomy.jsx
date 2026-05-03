import { useState, useEffect } from "react";
import { rtdb, auth } from "../firebase";
import { ref, set, onValue, push, remove, get } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import { 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  BrainCircuit,
  Layers,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import Layout from "../components/Layout";

export default function BloomsTaxonomy() {
  const [domains, setDomains] = useState({});
  const [newDomainName, setNewDomainName] = useState("");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [expandedDomains, setExpandedDomains] = useState({});
  const [confirmDelete, setConfirmDelete] = useState({ show: false, domainId: null, domainName: "" });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = ref(rtdb, `users/${currentUser.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setUserData(snapshot.val());
        }
      }
    });

    const bloomsRef = ref(rtdb, "blooms_taxonomy");
    const unsubscribeData = onValue(bloomsRef, (snapshot) => {
      if (snapshot.exists()) {
        setDomains(snapshot.val());
      } else {
        setDomains({});
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeData();
    };
  }, []);

  const showToastMsg = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const handleAddDomain = async () => {
    if (!newDomainName.trim()) {
      showToastMsg("Please enter a domain name", "error");
      return;
    }

    try {
      const bloomsRef = ref(rtdb, "blooms_taxonomy");
      const newDomainRef = push(bloomsRef);
      await set(newDomainRef, {
        name: newDomainName.trim(),
        levels: []
      });
      setNewDomainName("");
      showToastMsg("Domain added successfully");
    } catch (error) {
      console.error("Error adding domain:", error);
      showToastMsg("Failed to add domain", "error");
    }
  };

  const handleDeleteDomain = async () => {
    if (!confirmDelete.domainId) return;
    try {
      await remove(ref(rtdb, `blooms_taxonomy/${confirmDelete.domainId}`));
      showToastMsg("Domain deleted successfully");
      setConfirmDelete({ show: false, domainId: null, domainName: "" });
    } catch (error) {
      console.error("Error deleting domain:", error);
      showToastMsg("Failed to delete domain", "error");
    }
  };

  const handleAddLevel = async (domainId) => {
    const domain = domains[domainId];
    const levels = Array.isArray(domain.levels) ? [...domain.levels] : [];
    
    levels.push({ name: "", code: "" });
    
    try {
      await set(ref(rtdb, `blooms_taxonomy/${domainId}/levels`), levels);
    } catch (error) {
      console.error("Error adding level:", error);
      showToastMsg("Failed to add level", "error");
    }
  };

  const handleUpdateLevel = async (domainId, levelIndex, field, value) => {
    const levels = [...domains[domainId].levels];
    levels[levelIndex] = { ...levels[levelIndex], [field]: value };
    
    try {
      await set(ref(rtdb, `blooms_taxonomy/${domainId}/levels`), levels);
    } catch (error) {
      console.error("Error updating level:", error);
    }
  };

  const handleDeleteLevel = async (domainId, levelIndex) => {
    const domain = domains[domainId];
    if (!domain || !Array.isArray(domain.levels)) return;
    
    const levels = [...domain.levels];
    levels.splice(levelIndex, 1);
    
    try {
      await set(ref(rtdb, `blooms_taxonomy/${domainId}/levels`), levels);
      showToastMsg("Level removed");
    } catch (error) {
      console.error("Error deleting level:", error);
    }
  };

  const toggleDomain = (domainId) => {
    setExpandedDomains(prev => ({
      ...prev,
      [domainId]: !prev[domainId]
    }));
  };

  if (loading) {
    return (
      <Layout title="Bloom's Taxonomy Configuration">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]"></div>
        </div>
      </Layout>
    );
  }

  const isAdmin = userData?.role === 'Admin' || user?.email === 'cselab2022@gmail.com';

  if (!isAdmin) {
    return (
      <Layout title="Bloom's Taxonomy Configuration">
        <div className="max-w-4xl mx-auto mt-10 p-8 bg-red-50 border border-red-200 rounded-2xl text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h2 className="text-2xl font-bold text-red-800 mb-2">Access Denied</h2>
          <p className="text-red-600">This page is restricted to Administrators only.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Bloom's Taxonomy Configuration">
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-zinc-100 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm">
                <BrainCircuit size={32} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-zinc-800">Taxonomy Domains</h1>
                <p className="text-zinc-500 text-sm mt-1">Configure Bloom&apos;s Taxonomy domains and their cognitive levels</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <input 
                type="text"
                placeholder="Enter Domain Name (e.g. Cognitive Domain)"
                className="flex-grow md:w-80 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                value={newDomainName}
                onChange={(e) => setNewDomainName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
              />
              <button 
                onClick={handleAddDomain}
                className="px-6 py-3 bg-[#120c7a] text-white rounded-xl font-bold hover:bg-blue-800 transition-all flex items-center gap-2 shadow-lg shadow-blue-900/20 active:scale-95"
              >
                <Plus size={20} />
                Add Domain
              </button>
            </div>
          </div>
        </div>

        {/* Domains List */}
        <div className="space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-zinc-500 font-medium">Loading taxonomy data...</p>
            </div>
          ) : Object.keys(domains).length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-zinc-200">
              <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-300">
                <Layers size={40} />
              </div>
              <h3 className="text-xl font-bold text-zinc-800">No Domains Configured</h3>
              <p className="text-zinc-500 mt-2 max-w-md mx-auto">Start by adding a taxonomy domain like &quot;Cognitive Domain&quot; or &quot;Affective Domain&quot; above.</p>
            </div>
          ) : (
            Object.entries(domains).map(([id, domain]) => (
              <div key={id} className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden transition-all hover:shadow-md">
                {/* Domain Header */}
                <div 
                  className={`p-5 flex items-center justify-between cursor-pointer transition-colors ${expandedDomains[id] ? 'bg-blue-50/50' : 'hover:bg-zinc-50'}`}
                  onClick={() => toggleDomain(id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${expandedDomains[id] ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                      <Layers size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-zinc-800">{domain.name}</h3>
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        {Array.isArray(domain.levels) ? domain.levels.length : 0} Levels Defined
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete({ 
                          show: true, 
                          domainId: id, 
                          domainName: domain.name 
                        });
                      }}
                      className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      title="Delete Domain"
                    >
                      <Trash2 size={18} />
                    </button>
                    <div className="w-px h-6 bg-zinc-200 mx-1"></div>
                    {expandedDomains[id] ? <ChevronUp size={20} className="text-zinc-400" /> : <ChevronDown size={20} className="text-zinc-400" />}
                  </div>
                </div>

                {/* Domain Content (Levels) */}
                {expandedDomains[id] && (
                  <div className="p-6 border-t border-zinc-100 bg-zinc-50/30">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Cognitive Levels</h4>
                      <button 
                        onClick={() => handleAddLevel(id)}
                        className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 transition-colors"
                      >
                        <Plus size={16} />
                        Add Level
                      </button>
                    </div>

                    <div className="space-y-3">
                      {Array.isArray(domain.levels) && domain.levels.length > 0 ? (
                        domain.levels.map((level, idx) => (
                          <div key={idx} className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm animate-in slide-in-from-top-2 duration-200">
                            <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Bloom&apos;s Level</label>
                                <input 
                                  type="text"
                                  placeholder="e.g. Remembering"
                                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-sm"
                                  value={level.name}
                                  onChange={(e) => handleUpdateLevel(id, idx, 'name', e.target.value)}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Denoted As</label>
                                <input 
                                  type="text"
                                  placeholder="e.g. L1"
                                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-sm text-blue-600"
                                  value={level.code}
                                  onChange={(e) => handleUpdateLevel(id, idx, 'code', e.target.value)}
                                />
                              </div>
                            </div>
                            <button 
                              onClick={() => handleDeleteLevel(id, idx)}
                              className="p-2.5 text-zinc-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all self-end md:self-center"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 bg-white rounded-2xl border border-dashed border-zinc-200">
                          <p className="text-zinc-400 text-sm italic">No levels added to this domain yet.</p>
                          <button 
                            onClick={() => handleAddLevel(id)}
                            className="mt-3 text-sm font-bold text-blue-600 hover:underline"
                          >
                            Add your first level
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Toast Notification */}
        {toast.show && (
          <div className={`fixed top-20 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 z-[1000] ${
            toast.type === 'success' ? 'bg-zinc-900 text-white' : 'bg-red-600 text-white'
          }`}>
            {toast.type === 'success' ? (
              <div className="bg-green-500 p-1 rounded-full">
                <CheckCircle2 size={18} />
              </div>
            ) : (
              <div className="bg-white/20 p-1 rounded-full">
                <AlertCircle size={18} />
              </div>
            )}
            <span className="font-bold text-sm">{toast.message}</span>
          </div>
        )}

        {/* Confirmation Modal */}
        {confirmDelete.show && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-6">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-xl font-bold text-zinc-800 mb-2">Delete Domain?</h3>
              <p className="text-zinc-500 mb-8">
                Are you sure you want to delete <span className="font-bold text-zinc-800">&quot;{confirmDelete.domainName}&quot;</span>? 
                This will permanently remove all cognitive levels associated with it.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmDelete({ show: false, domainId: null, domainName: "" })}
                  className="flex-1 py-3 bg-zinc-100 text-zinc-600 rounded-xl font-bold hover:bg-zinc-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteDomain}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                >
                  Delete Now
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
