import { useState, useEffect } from "react";
import { rtdb, auth } from "../firebase";
import { ref, onValue, set, get } from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import { 
  Trash2,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";

import Layout from "../components/Layout";

export default function InfoConfiguration() {
  const [collegeName, setCollegeName] = useState("");
  const [visions, setVisions] = useState([""]);
  const [missions, setMissions] = useState([""]);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [modal, setModal] = useState({
    show: false,
    type: 'confirm',
    title: '',
    message: '',
    onConfirm: null
  });

  const showAlert = (title, message) => {
    setModal({ show: true, type: 'alert', title, message, onConfirm: null });
  };

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
      setLoading(false);
    });

    const infoRef = ref(rtdb, `info_configuration`);
    const unsubscribeData = onValue(infoRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setCollegeName(data.collegeName || "");
        setVisions(data.vision || [""]);
        setMissions(data.mission || [""]);
      } else {
        setCollegeName("");
        setVisions([""]);
        setMissions([""]);
      }
    }, (error) => {
      console.error("Fetch Error:", error);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeData();
    };
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!collegeName.trim()) {
      showAlert("Required", "Please enter the college name");
      return;
    }

    const infoRef = ref(rtdb, `info_configuration`);
    try {
      await set(infoRef, {
        collegeName: collegeName.trim(),
        vision: visions.filter(v => v.trim() !== ""),
        mission: missions.filter(m => m.trim() !== "")
      });
      setSuccessMessage("Info Configuration saved successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Save Error:", error);
      showAlert("Error", "Failed to save. Check your database rules.");
    }
  };

  const addVision = () => setVisions([...visions, ""]);
  const addMission = () => setMissions([...missions, ""]);

  const updateVision = (index, value) => {
    const newVisions = [...visions];
    newVisions[index] = value;
    setVisions(newVisions);
  };

  const updateMission = (index, value) => {
    const newMissions = [...missions];
    newMissions[index] = value;
    setMissions(newMissions);
  };

  const removeVision = (index) => {
    if (visions.length > 1) {
      setVisions(visions.filter((_, i) => i !== index));
    } else {
      setVisions([""]);
    }
  };

  const removeMission = (index) => {
    if (missions.length > 1) {
      setMissions(missions.filter((_, i) => i !== index));
    } else {
      setMissions([""]);
    }
  };

  if (loading) {
    return (
      <Layout title="Info Configuration">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#120c7a]"></div>
        </div>
      </Layout>
    );
  }

  const isAdmin = userData?.role === 'Admin' || user?.email === 'cselab2022@gmail.com';

  if (!isAdmin) {
    return (
      <Layout title="Info Configuration">
        <div className="max-w-4xl mx-auto mt-10 p-8 bg-red-50 border border-red-200 rounded-2xl text-center">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h2 className="text-2xl font-bold text-red-800 mb-2">Access Denied</h2>
          <p className="text-red-600">This page is restricted to Administrators only.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Info Configuration">
      <style>{`
        .bottom-space {
          margin-top: 40px;
        }
        .form-label {
          font-weight: 600;
          color: #333;
          margin-bottom: 0.5rem;
        }
        .form-control, .form-select {
          border-radius: 8px;
          border: 1px solid #ced4da;
          padding: 0.75rem 1rem;
          font-size: 1rem;
          transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
        }
        .form-control:focus, .form-select:focus {
          border-color: #80bdff;
          box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
        }
        .trash-btn {
          color: #dc3545;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          transition: color 0.2s;
        }
        .trash-btn:hover {
          color: #a71d2a;
        }
      `}</style>
      <div className="container-fluid p-4">
        <div className="card shadow-sm border-0 rounded-3">
          <div className="card-body p-4 p-md-5">
            <h2 className="card-title mb-4 font-bold text-2xl text-zinc-800">College Info Configuration</h2>
            
            <form onSubmit={handleSave}>
              <div className="mb-4">
                <label className="form-label">College Name *</label>
                <input 
                  type="text"
                  className="form-control w-full" 
                  placeholder="Enter College Name"
                  value={collegeName}
                  onChange={(e) => setCollegeName(e.target.value)}
                  required
                />
              </div>

              <div className="mb-4">
                <label className="form-label">College Vision Statement</label>
                <div className="space-y-3">
                  {visions.map((v, i) => (
                    <div key={i} className="relative group">
                      <textarea 
                        className="form-control" 
                        rows="3" 
                        placeholder="Enter Vision Statement"
                        value={v}
                        onChange={(e) => updateVision(i, e.target.value)}
                      />
                      <button 
                        type="button"
                        className="absolute right-3 bottom-3 trash-btn z-10"
                        onClick={() => removeVision(i)}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label">College Mission Statement</label>
                <div className="space-y-3">
                  {missions.map((m, i) => (
                    <div key={i} className="relative group">
                      <textarea 
                        className="form-control" 
                        rows="3" 
                        placeholder="Enter Mission Statement"
                        value={m}
                        onChange={(e) => updateMission(i, e.target.value)}
                      />
                      <button 
                        type="button"
                        className="absolute right-3 bottom-3 trash-btn z-10"
                        onClick={() => removeMission(i)}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mt-5">
                <button 
                  type="button" 
                  className="btn btn-primary px-4 py-2 rounded-lg font-bold"
                  onClick={addVision}
                  style={{ backgroundColor: '#120c7a', border: 'none' }}
                >
                  Add Vision
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary px-4 py-2 rounded-lg font-bold"
                  onClick={addMission}
                  style={{ backgroundColor: '#120c7a', border: 'none' }}
                >
                  Add Mission
                </button>
                <button 
                  type="submit" 
                  className="btn btn-success px-5 py-2 rounded-lg font-bold"
                  style={{ backgroundColor: '#28a745', border: 'none' }}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Success Toast */}
        {showSuccess && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 z-[1000]">
            <div className="bg-green-500 p-1 rounded-full">
              <CheckCircle2 size={18} />
            </div>
            <span className="font-semibold">{successMessage}</span>
          </div>
        )}
        {/* Modal UI */}
        {modal.show && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6">
                <h3 className="text-xl font-bold text-zinc-800 mb-2">{modal.title}</h3>
                <p className="text-zinc-600">{modal.message}</p>
              </div>
              <div className="bg-zinc-50 px-6 py-4 flex justify-end gap-3">
                {modal.type === 'confirm' && (
                  <button 
                    className="px-4 py-2 text-zinc-600 font-semibold hover:bg-zinc-100 rounded-xl transition-colors"
                    onClick={() => setModal({ ...modal, show: false })}
                  >
                    Cancel
                  </button>
                )}
                <button 
                  className="px-6 py-2 bg-[#120c7a] text-white font-semibold rounded-xl hover:bg-opacity-90 transition-all shadow-lg shadow-blue-900/20"
                  onClick={async () => {
                    if (modal.onConfirm) {
                      await modal.onConfirm();
                    }
                    setModal({ ...modal, show: false });
                  }}
                >
                  {modal.type === 'confirm' ? 'Confirm' : 'OK'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
