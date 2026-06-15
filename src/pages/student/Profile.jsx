import { useState, useEffect, useRef } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { User, GraduationCap, Mail, Calendar, Edit3, Check, Upload, Trash2, Loader2, X } from "lucide-react";

export default function StudentProfile() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editSig, setEditSig] = useState(false);
  const [sigUrl, setSigUrl] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) setUserData(snap.data());
        } catch (err) { console.error(err); }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSigUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 102400) { alert("Max 100KB"); return; }
    const reader = new FileReader();
    reader.onloadend = () => setSigUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSaveSig = async () => {
    if (!auth.currentUser) return;
    await setDoc(doc(db, "users", auth.currentUser.uid), { signatureUrl: sigUrl }, { merge: true });
    setUserData(prev => ({ ...prev, signatureUrl: sigUrl }));
    setEditSig(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-emerald-600" size={40} /></div>
  );

  if (!userData) return (
    <div className="min-h-screen flex items-center justify-center text-zinc-500">Please login.</div>
  );

  const infoRows = [
    { label: "Register Number", value: userData.regNo, icon: GraduationCap },
    { label: "Student Name", value: userData.studentName, icon: User },
    { label: "Programme", value: userData.programme, icon: GraduationCap },
    { label: "Department", value: userData.department, icon: GraduationCap },
    { label: "Batch", value: userData.batch, icon: Calendar },
    { label: "Email", value: userData.email, icon: Mail },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-500 rounded-2xl p-8 text-white mb-8 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center border border-white/30">
            <span className="text-2xl font-bold">
              {userData.studentName?.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || 'S'}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">{userData.studentName}</h1>
            <p className="text-emerald-100 text-sm mt-1">{userData.regNo}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-zinc-100 p-6">
          <h2 className="text-base font-bold text-zinc-700 mb-4 flex items-center gap-2">
            <User size={18} className="text-emerald-600" /> Personal Details
          </h2>
          <div className="space-y-4">
            {infoRows.map((row, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center">
                  <row.icon size={14} className="text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{row.label}</p>
                  <p className="text-sm font-semibold text-zinc-700 truncate">{row.value || '--'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-zinc-100 p-6">
          <h2 className="text-base font-bold text-zinc-700 mb-4 flex items-center gap-2">
            <Edit3 size={18} className="text-emerald-600" /> Digital Signature
          </h2>
          {editSig ? (
            <div className="space-y-3">
              <input type="file" accept="image/*" className="hidden" ref={fileRef} onChange={handleSigUpload} />
              <div onClick={() => fileRef.current.click()} className="border-2 border-dashed border-zinc-200 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-all">
                {sigUrl || userData.signatureUrl ? (
                  <img src={sigUrl || userData.signatureUrl} alt="Signature" className="max-h-16 object-contain" />
                ) : (
                  <div className="text-zinc-400 flex flex-col items-center">
                    <Upload size={24} />
                    <span className="text-xs font-medium mt-1">Upload Signature</span>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 italic">Max 100KB, PNG with transparent background</p>
              <div className="flex gap-2">
                <button onClick={handleSaveSig} className="flex-1 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1">
                  <Check size={14} /> Save
                </button>
                <button onClick={() => { setEditSig(false); setSigUrl(""); }} className="flex-1 py-2 bg-zinc-100 text-zinc-600 text-xs font-bold rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1">
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-zinc-50 rounded-xl p-4 flex items-center justify-center min-h-[80px] border border-zinc-100">
                {userData.signatureUrl ? (
                  <img src={userData.signatureUrl} alt="Signature" className="max-h-14 object-contain" />
                ) : (
                  <p className="text-xs text-zinc-400 italic">No signature uploaded</p>
                )}
              </div>
              <button onClick={() => { setEditSig(true); setSigUrl(userData.signatureUrl || ""); }} className="w-full py-2 bg-zinc-100 text-zinc-600 text-xs font-bold rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1">
                <Edit3 size={14} /> Update Signature
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}