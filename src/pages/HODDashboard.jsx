import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { onValue, ref, get, update } from "firebase/database";
import { 
  Eye, 
  Loader2, 
  ClipboardList, 
  User, 
  X, 
  FileText, 
  Download,
  CheckCircle2,
  Edit2
} from "lucide-react";

import Layout from "../components/Layout";
import { auth, rtdb } from "../firebase";
import { getQuestionPaperHTML } from '../utils/questionPaperUtils';
import { useRegulations } from "../hooks/useRegulations";
import { sanitizeKey, formatProgrammeKey } from "../lib/utils";

export default function HODDashboard() {
  const navigate = useNavigate();
  const { getRegulationForBatch } = useRegulations();
  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid || null);

  const [usersMap, setUsersMap] = useState({});
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  
  // Modal & Preview States
  const [selectedQP, setSelectedQP] = useState(null);
  const [showQPModal, setShowQPModal] = useState(false);
  const [currentHodSignature, setCurrentHodSignature] = useState(''); // Current HOD's signature
  const [facultySignatureForQP, setFacultySignatureForQP] = useState('');
  const [selectedQPHodSignature, setSelectedQPHodSignature] = useState(''); // HOD signature already on the QP
  const [modalCourseOutcomes, setModalCourseOutcomes] = useState([]);
  const [ciaConfigs, setCiaConfigs] = useState({});
  const [showRecorrectModal, setShowRecorrectModal] = useState(false);
  const [recorrectComments, setRecorrectComments] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 5000);
  };

  // Fetch CIA Configs for exam name mapping
  useEffect(() => {
    const ciaRef = ref(rtdb, 'cia_configs');
    const unsubscribe = onValue(ciaRef, (snapshot) => {
      if (snapshot.exists()) {
        setCiaConfigs(snapshot.val());
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || null);
      if (user) {
        const userRef = ref(rtdb, `users/${user.uid}`);
        get(userRef).then(snap => {
          if (snap.exists()) {
            setCurrentHodSignature(snap.val().signatureUrl || '');
          }
        });
      } else {
        setCurrentHodSignature('');
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const usersRef = ref(rtdb, "users");
    const unsub = onValue(
      usersRef,
      (snapshot) => {
        setUsersMap(snapshot.val() || {});
      },
      () => setUsersMap({})
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUid) {
      setTasks([]);
      setTasksLoading(false);
      return;
    }

    setTasksLoading(true);
    const qpRef = ref(rtdb, "generated_qps");
    const unsub = onValue(
      qpRef,
      (snapshot) => {
        const data = snapshot.val() || {};
        const all = [];
        Object.entries(data).forEach(([compositeKey, versions]) => {
          Object.entries(versions || {}).forEach(([id, qp]) => {
            all.push({ ...(qp || {}), id, compositeKey });
          });
        });

        const forwarded = all
          .filter((qp) => qp?.status === "forwarded" && qp?.forwarded_to === currentUid)
          .sort((a, b) => {
            const at = new Date(a.forwarded_at || a.saved_at || 0).getTime();
            const bt = new Date(b.forwarded_at || b.saved_at || 0).getTime();
            return bt - at;
          });

        setTasks(forwarded);
        setTasksLoading(false);
      },
      () => {
        setTasks([]);
        setTasksLoading(false);
      }
    );

    return () => unsub();
  }, [currentUid]);

  const taskCount = useMemo(() => tasks.length, [tasks]);

  // Fetch COs and Signatures for selected QP
  useEffect(() => {
    const fetchDetails = async () => {
      if (!selectedQP) {
        setModalCourseOutcomes([]);
        setFacultySignatureForQP('');
        setSelectedQPHodSignature('');
        return;
      }

      // 1. Fetch COs
      const progKey = formatProgrammeKey(selectedQP.programme);
      const regulation = getRegulationForBatch(progKey, selectedQP.batch);
      if (regulation) {
        const coKey = `${sanitizeKey(selectedQP.department)}_${sanitizeKey(regulation)}_${sanitizeKey(selectedQP.subject)}_${sanitizeKey(selectedQP.academic_year)}`;
        const coSnap = await get(ref(rtdb, `course_outcomes/${coKey}`));
        if (coSnap.exists()) {
          const data = coSnap.val();
          const loadedCOs = Object.entries(data)
            .map(([code, val]) => ({ code, description: typeof val === 'object' && val !== null ? val.description : val }))
            .sort((a, b) => (parseInt(a.code.replace(/\D/g, '')) || 0) - (parseInt(b.code.replace(/\D/g, '')) || 0));
          setModalCourseOutcomes(loadedCOs);
        }
      }

      // 2. Fetch Signatures
      if (selectedQP.forwarded_by) {
        const userRef = ref(rtdb, `users/${selectedQP.forwarded_by}`);
        const snap = await get(userRef);
        if (snap.exists()) setFacultySignatureForQP(snap.val().signatureUrl || '');
      }
      setSelectedQPHodSignature(selectedQP.hod_signature_url || '');
    };
    fetchDetails();
  }, [selectedQP, getRegulationForBatch]);

  const resolveExamDisplay = (qp) => {
    if (!qp) return "-";
    // Prefer explicit exam_name if it looks like a human label
    const examName = (qp.exam_name || "").toString().trim();
    const qpaperName = (qp.qpaper_name || "").toString().trim();

    const looksLikePushKey = (s) => /[A-Za-z0-9_-]{16,}/.test(s);

    if (examName && !looksLikePushKey(examName)) return examName;

    // If qpaper_name is an id present in ciaConfigs, return its examName
    if (qpaperName && ciaConfigs && ciaConfigs[qpaperName] && ciaConfigs[qpaperName].examName) {
      return ciaConfigs[qpaperName].examName;
    }

    // As a fallback, if examName maps in ciaConfigs, use that
    if (examName && ciaConfigs && ciaConfigs[examName] && ciaConfigs[examName].examName) {
      return ciaConfigs[examName].examName;
    }

    // Otherwise show whichever field exists (prefer qpaperName)
    return qpaperName || examName || '-';
  };

  const resolveForwardedByName = (uid) => {
    if (!uid) return "-";
    const u = usersMap?.[uid];
    return u?.facultyName || u?.displayName || u?.email || uid;
  };

  const renderQuestionPaper = useCallback((qp) => {
    if (!qp) return "";
    return getQuestionPaperHTML(
      qp,
      modalCourseOutcomes,
      facultySignatureForQP,
      selectedQPHodSignature, // Use the HOD signature from the QP itself
      ciaConfigs
    );
  }, [modalCourseOutcomes, facultySignatureForQP, selectedQPHodSignature, ciaConfigs]);

  const handleRecorrect = async () => {
    if (!selectedQP || !recorrectComments.trim()) {
      showToast("Please provide comments for recorrection.", "error");
      return;
    }

    try {
      const qpRef = ref(rtdb, `generated_qps/${selectedQP.compositeKey}/${selectedQP.id}`);
      await update(qpRef, {
        status: 'recorrected',
        forwarded_to: selectedQP.forwarded_by, // Send back to original faculty
        forwarded_by: null, // Clear HOD's forwarding
        hod_comments: recorrectComments.trim(),
        hod_signature_url: null, // Clear HOD signature on recorrect
        updated_at: new Date().toISOString()
      });
      showToast("Question paper sent back for recorrection.", "success");
      setShowRecorrectModal(false);
      setShowQPModal(false);
      setRecorrectComments('');
    } catch (error) {
      console.error("Error recorrecting paper:", error);
      showToast("Failed to send paper back for recorrection.", "error");
    }
  };

  const handleApproveByHOD = async () => {
    if (!selectedQP) return;
    if (!currentHodSignature) {
      showToast("Please upload your digital signature in your profile before approving.", "error");
      return;
    }

    try {
      const qpRef = ref(rtdb, `generated_qps/${selectedQP.compositeKey}/${selectedQP.id}`);
      await update(qpRef, {
        status: 'approved_by_hod',
        hod_signature_url: currentHodSignature,
        approved_at: new Date().toISOString(),
        forwarded_to: null, // Clear HOD's forwarding
        hod_comments: null, // Clear any previous comments
        updated_at: new Date().toISOString()
      });
      showToast("Question paper approved and forwarded to COE.", "success");
      setShowQPModal(false);
    } catch (error) {
      console.error("Error approving paper:", error);
      showToast("Failed to approve question paper.", "error");
    }
  };

  const handleDownloadQP = useCallback((qp) => {
    try {
      const content = renderQuestionPaper(qp);
      const wordHTML = `
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
    <meta charset='utf-8'>
    <title>Question Paper Review</title>
    <style>
        @page { size: A4; margin: 0.75in; }
        body { font-family: Arial, sans-serif; font-size: 11px; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
        th, td { border: 1px solid #333; padding: 4px; text-align: center; }
        th { background-color: #f2f2f2; }
        .logo-img { max-width: 100%; height: 70px !important; }
    </style>
</head>
<body>
    ${content}
</body>
</html>`;

      const blob = new Blob(['\ufeff', wordHTML], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const examName = qp.exam_name || (ciaConfigs[qp.qpaper_name]?.examName || qp.qpaper_name);
      link.download = `${examName}_${qp.subject}_Review.doc`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        if (link.parentNode) link.parentNode.removeChild(link);
      }, 1000);
    } catch (err) {
      console.error('Word export failed:', err);
    }
  }, [renderQuestionPaper, ciaConfigs]);

  const getSemesterLabel = (semNum) => {
    const labels = {
      "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V", "6": "VI", "7": "VII", "8": "VIII", "9": "IX", "10": "X"
    };
    return labels[String(semNum)] || semNum;
  };

  return (
    <Layout title="HOD Dashboard">
      {toast.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[110] px-8 py-3 rounded-xl shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-green-100 border border-green-200 text-green-800' : 'bg-red-100 border border-red-200 text-red-800'}`}>
          <span className="font-bold">{toast.message}</span>
        </div>
      )}
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold text-[#120c7a] flex items-center gap-3">
              <div className="w-2 h-8 bg-blue-600 rounded-full"></div>
              Forwarded Question Papers (Tasks)
            </h2>
            <div className="text-xs font-black bg-blue-100 text-blue-700 px-3 py-1 rounded-full uppercase tracking-widest">
              {taskCount} Task(s)
            </div>
          </div>

          {tasksLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-500 gap-3">
              <Loader2 className="animate-spin" size={18} />
              Loading forwarded papers...
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-10 text-center text-slate-400 font-medium">
              No forwarded question papers right now.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Forwarded By</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Subject</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Exam</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Batch</th>
                    <th className="text-left p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Academic Year</th>
                    <th className="text-center p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Semester</th>
                    <th className="text-center p-4 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((qp) => (
                    <tr
                      key={`${qp.compositeKey}-${qp.id}`}
                      className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-slate-700 font-semibold">
                          <User size={16} className="text-blue-600" />
                          <span className="truncate max-w-[240px]">{resolveForwardedByName(qp.forwarded_by)}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-800">{qp.subject}</span>
                          <span className="text-xs text-slate-500 truncate max-w-[260px]">{qp.subject_name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-700 font-medium">{resolveExamDisplay(qp)}</td>
                      <td className="p-4 text-slate-700 font-medium">{qp.batch}</td>
                      <td className="p-4 text-slate-600">{qp.academic_year}</td>
                      <td className="p-4 text-center">
                        <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-bold">{qp.semester}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex justify-center gap-2">
                        <button
                            onClick={() => {
                              setSelectedQP(qp);
                              setShowQPModal(true);
                            }}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#120c7a] text-white rounded-xl text-xs font-bold hover:bg-[#0e0960] transition-all"
                            title="Review Paper Template"
                        >
                          <Eye size={16} />
                          Review
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex items-center gap-2 text-xs text-slate-500 font-medium">
            <ClipboardList size={14} />
            Papers forwarded to you will show here as tasks.
          </div>
        </div>

        {/* Question Paper Review Modal */}
        {showQPModal && selectedQP && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
              <div className="bg-zinc-50 px-8 py-4 border-b border-zinc-100 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-800 leading-tight">{resolveExamDisplay(selectedQP)}</h3>
                    <p className="text-xs text-zinc-500">{selectedQP.subject} • {selectedQP.subject_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleApproveByHOD}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"
                    title="Approve and Forward to COE"
                  >
                    <CheckCircle2 size={16} />
                    Forward to COE
                  </button>
                  <button
                    onClick={() => setShowRecorrectModal(true)}
                    className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"
                    title="Send back to Faculty for Recorrection"
                  >
                    <Edit2 size={16} />
                    Recorrect
                  </button>
                  {/* Removed Download Word button as per request */}
                  {/* <button 
                    onClick={() => handleDownloadQP(selectedQP)}
                    className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"
                  > <Download size={16} /> Download Word </button> */}
                  <button 
                    onClick={() => setShowQPModal(false)}
                    className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-all"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 bg-zinc-50">
                <style>{`
                  .qp-print-wrapper table { border-collapse: collapse; width: 100%; border-color: #000 !important; }
                  .qp-print-wrapper td, .qp-print-wrapper th { border: 1px solid #000 !important; padding: 6px; font-family: 'Times New Roman', serif; }
                  .qp-print-wrapper .logo-img { max-width: 100%; height: 70px !important; }
                  .qp-print-wrapper p { margin: 0 0 5px 0; }
                `}</style>
                <div 
                  className="bg-white shadow-2xl mx-auto qp-print-wrapper" 
                  style={{ width: '210mm', minHeight: '297mm', padding: '15mm', boxSizing: 'border-box' }}
                >
                  <div dangerouslySetInnerHTML={{ __html: renderQuestionPaper(selectedQP) }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recorrect Modal */}
        {showRecorrectModal && (
          <div className="fixed inset-0 bg-black/60 z-[101] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
              <div className="bg-zinc-50 px-8 py-4 border-b border-zinc-100 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
                    <Edit2 size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-800 leading-tight">Recorrect Question Paper</h3>
                    <p className="text-xs text-zinc-500">Provide feedback to the faculty</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowRecorrectModal(false)}
                  className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-all"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <textarea
                  className="w-full h-32 p-4 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none transition-all resize-none"
                  placeholder="Enter your suggestions/corrections for the faculty..."
                  value={recorrectComments}
                  onChange={(e) => setRecorrectComments(e.target.value)}
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowRecorrectModal(false)}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-sm font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRecorrect}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm"
                    disabled={!recorrectComments.trim()}
                  >
                    Send for Recorrection
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
