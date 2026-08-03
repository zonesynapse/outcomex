import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, doc, getDoc, serverTimestamp, query, where, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import Layout from "../components/Layout";
import { sanitizeKey } from "../lib/utils";
import {
  ArrowLeft, Send, Save, X, Megaphone, Building2, Users,
  ScrollText, AlertTriangle, CheckCircle2, Loader2, Globe,
  Eye, FileText, ChevronDown, ChevronUp
} from "lucide-react";

const colorMap = {
  blue: { bg: "bg-blue-50", text: "text-blue-600", iconBg: "bg-blue-100", border: "border-blue-200" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", iconBg: "bg-emerald-100", border: "border-emerald-200" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", iconBg: "bg-amber-100", border: "border-amber-200" },
  violet: { bg: "bg-violet-50", text: "text-violet-600", iconBg: "bg-violet-100", border: "border-violet-200" },
  rose: { bg: "bg-rose-50", text: "text-rose-600", iconBg: "bg-rose-100", border: "border-rose-200" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600", iconBg: "bg-indigo-100", border: "border-indigo-200" },
};

export default function CircularCreate() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [circularType, setCircularType] = useState("institution");
  const [targetDepartment, setTargetDepartment] = useState("");
  const [departments, setDepartments] = useState([]);
  const [preview, setPreview] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            setUserData(snap.data());
          }
        } catch (e) { console.error(e); }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const isAdmin = userData?.role === "Admin";
  const isHod = userData?.role === "HOD";

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "department_metadata"), (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        Object.entries(data).forEach(([prog, depts]) => {
          if (typeof depts === "object" && depts !== null) {
            Object.keys(depts).forEach((deptName) => {
              list.push({ programme: prog, name: deptName });
            });
          }
        });
      });
      setDepartments(list);
    });
    return () => unsub();
  }, []);

  const userDepartment = userData?.department || userData?.assignedDepartment || "";
  const userProgramme = userData?.programme || "";

  const handleSubmit = async () => {
    if (!title.trim()) { showToast("Please enter a circular title", "error"); return; }
    if (!content.trim()) { showToast("Please enter circular content", "error"); return; }
    if (circularType === "department" && !targetDepartment) { showToast("Please select a target department", "error"); return; }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        type: circularType,
        status: circularType === "institution" ? "Principal_Pending" : "HOD_Pending",
        createdBy: currentUser?.uid || "",
        createdByName: userData?.facultyName || userData?.displayName || userData?.email || "Unknown",
        createdAt: new Date().toISOString(),
        department: circularType === "department" ? targetDepartment : "",
        departmentName: isHod ? (userDepartment || "") : "",
        programme: circularType === "department" ? (userProgramme || "") : "",
        hodApprovedBy: null,
        hodApprovedAt: null,
        hodComments: "",
        principalApprovedBy: null,
        principalApprovedAt: null,
        principalComments: "",
        returnComment: "",
        returnedBy: null,
        returnedAt: null,
        viewedBy: {},
      };

      await addDoc(collection(db, "circulars"), payload);
      showToast("Circular created and sent for approval!");
      setTimeout(() => navigate("/circulars"), 1200);
    } catch (err) {
      console.error("Error creating circular:", err);
      showToast("Failed to create circular", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Create Circular">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-2 border-[#120c7a] border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Create Circular">
      <div className="mx-auto max-w-4xl px-4 pb-10 pt-6 md:px-6">

        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#120c7a] via-[#1a12a8] to-[#0f0a66] p-6 md:p-8 mb-8 shadow-lg">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/10">
                <Megaphone size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Create Circular</h1>
                <p className="text-blue-200 text-sm">Draft and send circulars for approval</p>
              </div>
            </div>
            <button onClick={() => navigate("/circulars")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-all border border-white/10">
              <ArrowLeft size={16} /> Back to List
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          {/* Circular Type Selector */}
          <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
            <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-zinc-500">Circular Type</label>
            <div className="flex gap-3">
              <button
                onClick={() => { setCircularType("institution"); setTargetDepartment(""); }}
                className={`flex-1 p-4 rounded-xl border-2 transition-all text-left ${
                  circularType === "institution"
                    ? "border-indigo-500 bg-indigo-50 shadow-sm"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${circularType === "institution" ? "bg-indigo-100 text-indigo-700" : "bg-zinc-100 text-zinc-500"}`}>
                    <Globe size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900">Institution Level</p>
                    <p className="text-[11px] text-zinc-500">Sent directly to Principal for approval</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => setCircularType("department")}
                className={`flex-1 p-4 rounded-xl border-2 transition-all text-left ${
                  circularType === "department"
                    ? "border-indigo-500 bg-indigo-50 shadow-sm"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${circularType === "department" ? "bg-indigo-100 text-indigo-700" : "bg-zinc-100 text-zinc-500"}`}>
                    <Building2 size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900">Department Level</p>
                    <p className="text-[11px] text-zinc-500">Sent to HOD → Principal → Students</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Content Form */}
          <div className="p-6 space-y-5">
            {/* Department selector (for department level) */}
            {circularType === "department" && (
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Target Department
                </label>
                <select
                  value={targetDepartment}
                  onChange={(e) => setTargetDepartment(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Select Department</option>
                  {departments.map((d, i) => (
                    <option key={i} value={d.name}>{d.name} ({d.programme})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Circular Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Exam Schedule for Even Semester 2025-2026"
                className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* Content - textarea with character count */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Circular Content
                </label>
                <span className="text-[10px] font-semibold text-zinc-400">{content.length} characters</span>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                placeholder="Enter the full circular text here..."
                className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-y"
              />
            </div>

            {/* Preview Toggle */}
            {content.trim() && (
              <div className="border border-zinc-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setPreview(!preview)}
                  className="flex items-center justify-between w-full px-4 py-3 bg-zinc-50 hover:bg-zinc-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Eye size={16} className="text-zinc-500" />
                    <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                      {preview ? "Hide Preview" : "Show Preview"}
                    </span>
                  </div>
                  {preview ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                </button>
                {preview && (
                  <div className="p-6 bg-white border-t border-zinc-100">
                    <div className="max-w-2xl mx-auto">
                      <div className="border-b-2 border-[#120c7a] pb-3 mb-4">
                        <h3 className="text-lg font-bold text-[#120c7a]">{title || "Circular Title"}</h3>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-500">
                          <span className="flex items-center gap-1"><Megaphone size={12} /> {circularType === "institution" ? "Institution Level" : `Department: ${targetDepartment || "N/A"}`}</span>
                          <span>|</span>
                          <span>{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span>
                        </div>
                      </div>
                      <div className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
                        {content}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
              <button
                onClick={() => navigate("/circulars")}
                className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !title.trim() || !content.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#120c7a] to-[#0e095e] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <><Loader2 size={16} className="animate-spin" /> Sending...</>
                ) : (
                  <><Send size={16} /> Send for Approval</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {toast.show && (
        <div className={`fixed top-20 left-1/2 z-[130] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-2xl ${
          toast.type === "success" ? "bg-emerald-700" : "bg-red-600"
        }`}>
          {toast.message}
        </div>
      )}
    </Layout>
  );
}
