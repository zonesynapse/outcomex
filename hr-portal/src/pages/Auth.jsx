import { useState } from "react";
import { auth, db } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  User, Mail, Lock, IdCard, Building2, UserCheck,
  ArrowRight, ShieldCheck, Sparkles, AlertCircle, Loader2
} from "lucide-react";
import { useDepartments } from "../hooks/useDepartments";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    empId: "",
    email: "",
    password: "",
    confirmPassword: "",
    institution: "CKSPK (Matric)",
    role: "Staff / Non-Teaching",
    department: ""
  });

  const { departments } = useDepartments(formData.institution);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError("");
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (!formData.name.trim()) return setError("Please enter Teacher / Staff Name.");
    if (!formData.empId.trim()) return setError("Please enter Emp ID.");
    if (!formData.email.trim()) return setError("Please enter a valid email address.");
    if (formData.password.length < 6) return setError("Password must be at least 6 characters long.");
    if (formData.password !== formData.confirmPassword) return setError("Passwords do not match.");

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email.trim(),
        formData.password
      );
      const user = userCredential.user;

      const profileData = {
        uid: user.uid,
        name: formData.name.trim(),
        empId: formData.empId.trim().toUpperCase(),
        email: formData.email.trim().toLowerCase(),
        institution: formData.institution,
        role: formData.role,
        department: formData.department
      };

      // Always save to local storage fallback
      try {
        localStorage.setItem(`user_profile_${user.uid}`, JSON.stringify(profileData));
      } catch (e) {
        console.warn("LocalStorage save error:", e);
      }

      // Update Firebase Auth Display Name
      try {
        await updateProfile(user, { displayName: formData.name.trim() });
      } catch (pErr) {
        console.warn("Auth profile update warning:", pErr);
      }

      // Save user profile to Firestore with fallback
      try {
        await setDoc(doc(db, "users", user.uid), {
          ...profileData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (fsErr) {
        console.warn("Firestore user document write notice:", fsErr);
      }

      navigate("/");
    } catch (err) {
      console.error("Registration error:", err);
      if (err.code === "auth/email-already-in-use") {
        setError("This email address is already registered. Please sign in instead.");
      } else {
        setError(err.message || "Failed to register account.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");

    if (!formData.email.trim()) return setError("Please enter your email.");
    if (!formData.password) return setError("Please enter your password.");

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, formData.email.trim(), formData.password);
      navigate("/");
    } catch (err) {
      console.error("Sign-in error:", err);
      if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        setError("Invalid email or password. Please try again.");
      } else {
        setError(err.message || "Failed to log in.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background Soft Accents */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-lg z-10">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3.5 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/20 mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold font-heading text-slate-900 tracking-tight">
            CK Group of Institutions
          </h1>
          <p className="text-slate-600 text-sm font-medium mt-1">
            Human Resources & Appraisal Portal
          </p>
        </div>

        {/* Auth Box */}
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200/80">
          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6 border border-slate-200/80">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setError(""); }}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-200 cursor-pointer ${isLogin
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setError(""); }}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-200 cursor-pointer ${!isLogin
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {isLogin ? (
            /* LOGIN FORM */
            <form onSubmit={handleSignIn} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="e.g. staff@ck.ac.in"
                    autoComplete="email"
                    className="w-full bg-white border border-slate-300 pl-11 pr-4 py-3 rounded-xl text-slate-900 placeholder-slate-400 text-sm transition-all outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full bg-white border border-slate-300 pl-11 pr-4 py-3 rounded-xl text-slate-900 placeholder-slate-400 text-sm transition-all outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all duration-200 flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer border-0"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    Sign In to Portal
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* REGISTER FORM */
            <form onSubmit={handleRegister} className="space-y-4">
              {/* Institution & Role Selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                    Institution / School
                  </label>
                  <select
                    name="institution"
                    value={formData.institution}
                    onChange={(e) => {
                      const newInst = e.target.value;
                      let newRole = formData.role;
                      if (newInst === "CKCOE") {
                        if (newRole !== "Staff / Non-Teaching" && newRole !== "Principal / HR") {
                          newRole = "Staff / Non-Teaching";
                        }
                      }
                      setFormData(prev => ({ ...prev, institution: newInst, role: newRole, department: "" }));
                      if (error) setError("");
                    }}
                    className="w-full bg-white border border-slate-300 px-3 py-2.5 rounded-xl text-slate-900 text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 font-medium"
                  >
                    <option value="CKSPK (Matric)">CKSPK (Matric)</option>
                    <option value="CKSPE (CBSE)">CKSPE (CBSE)</option>
                    <option value="CKCOE">CKCOE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                    User Role
                  </label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    className="w-full bg-white border border-slate-300 px-3 py-2.5 rounded-xl text-slate-900 text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 font-medium"
                  >
                    {formData.institution === "CKCOE" ? (
                      <>
                        <option value="Staff / Non-Teaching">Staff / Non-Teaching</option>
                        <option value="Principal / HR">Principal / HR</option>
                      </>
                    ) : (
                      <>
                        <option value="Staff / Non-Teaching">Staff / Non-Teaching</option>
                        <option value="Coordinator">Coordinator</option>
                        <option value="Principal / HR">Principal / HR</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Department Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Department
                </label>
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  className="w-full bg-white border border-slate-300 px-3 py-2.5 rounded-xl text-slate-900 text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 font-medium"
                >
                  <option value="">-- Select Department --</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {/* Teacher / Staff Name */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Teacher / Staff Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g. Dr. K. Raman"
                    className="w-full bg-white border border-slate-300 pl-10 pr-3 py-2.5 rounded-xl text-slate-900 placeholder-slate-400 text-sm transition-all outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
                    required
                  />
                </div>
              </div>

              {/* Emp ID / Staff ID */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Emp ID / Staff ID
                </label>
                <div className="relative">
                  <IdCard className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    name="empId"
                    value={formData.empId}
                    onChange={handleChange}
                    placeholder="EMP-1024"
                    className="w-full bg-white border border-slate-300 pl-10 pr-3 py-2.5 rounded-xl text-slate-900 placeholder-slate-400 text-sm transition-all outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Mail (Email Address)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="staff@ck.ac.in"
                    className="w-full bg-white border border-slate-300 pl-10 pr-3 py-2.5 rounded-xl text-slate-900 placeholder-slate-400 text-sm transition-all outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
                    required
                  />
                </div>
              </div>

              {/* Password & Confirm Password */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="••••••••"
                      className="w-full bg-white border border-slate-300 pl-9 pr-3 py-2.5 rounded-xl text-slate-900 placeholder-slate-400 text-sm transition-all outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="••••••••"
                      className="w-full bg-white border border-slate-300 pl-9 pr-3 py-2.5 rounded-xl text-slate-900 placeholder-slate-400 text-sm transition-all outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
                      required
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all duration-200 flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer border-0"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating Profile...
                  </>
                ) : (
                  <>
                    Create Account & Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer info */}
        <p className="text-center text-xs font-medium text-slate-500 mt-6">
          © {new Date().getFullYear()} CK Group of Institutions HR Portal • Powered by OutcomeX
        </p>
      </div>
    </div>
  );
}
