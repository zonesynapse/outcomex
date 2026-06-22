import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Loader2, AlertCircle, CheckCircle2, ChevronDown, Eye, EyeOff, GraduationCap } from "lucide-react";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";

import { formatProgDisplay, formatProgrammeKey, sanitizeKey } from "../lib/utils";

// Utility functions for input validation and sanitization
const isValidEmail = (email) => {
  // RFC 5322 simplified email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;
  if (email.length > 254) return false; // RFC 5321
  const [local] = email.split('@');
  if (local.length > 64) return false; // RFC 5321
  return true;
};

const sanitizeText = (text, maxLength = 100) => {
  if (!text || typeof text !== 'string') return '';
  // Remove leading/trailing whitespace
  let clean = text.trim();
  // Limit length
  clean = clean.substring(0, maxLength);
  // Remove HTML/special characters that could be used for injection
  clean = clean.replace(/[<>\"'`]/g, '');
  return clean;
};

const sanitizeFacultyId = (id) => {
  if (!id || typeof id !== 'string') return '';
  // Allow alphanumeric and hyphens only
  let clean = id.trim().substring(0, 50);
  clean = clean.replace(/[^a-zA-Z0-9-]/g, '');
  return clean;
};

// Helper to remove undefined values from an object before sending to Firestore
const removeUndefined = (obj) => {
  const newObj = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      newObj[key] = obj[key];
    }
  }
  return newObj;
};

export default function Auth() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(location.pathname === "/signup");
  
  // Form States
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [regRole, setRegRole] = useState("faculty"); // "faculty" or "student"
  
  const [regTitle, setRegTitle] = useState("Mr.");
  const [regFacultyName, setRegFacultyName] = useState("");
  const [regFacultyId, setRegFacultyId] = useState("");
  const [regDateOfJoining, setRegDateOfJoining] = useState("");
  const [regProgramme, setRegProgramme] = useState("");
  const [regDepartment, setRegDepartment] = useState("");
  const [regDesignation, setRegDesignation] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);

  const [studentRegNo, setStudentRegNo] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentProgramme, setStudentProgramme] = useState("");
  const [studentBatch, setStudentBatch] = useState("");
  const [studentDepartment, setStudentDepartment] = useState("unknown");
  const [matchingStatus, setMatchingStatus] = useState("");
  
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { getActiveBatches, batchStatus } = useBatches(durations);

  const activeStudentBatches = useMemo(() => {
    if (!studentProgramme) return [];
    return getActiveBatches(formatProgrammeKey(studentProgramme));
  }, [studentProgramme, getActiveBatches]);
  const defaultAdminEmail = import.meta.env.VITE_DEFAULT_ADMIN_EMAIL;
  const masterAdminEmail = import.meta.env.VITE_MASTER_ADMIN_EMAIL;
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    setIsActive(location.pathname === "/signup");
    setError("");
    setMessage("");
  }, [location.pathname]);



  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return;
        const role = snap.data().role;
        if (role === "Student") {
          navigate("/student/dashboard", { replace: true });
        } else if (role === "HOD") {
          navigate("/hod-dashboard", { replace: true });
        } else if (role === "Principal") {
          navigate("/principal-dashboard", { replace: true });
        } else if (role === "Faculty") {
          navigate("/faculty-dashboard", { replace: true });
        } else {
          navigate("/reports", { replace: true });
        }
      } catch (err) {
        console.error(err);
      }
    });
    return unsub;
  }, [navigate]);

  const handleToggle = (toSignup) => {
    setIsActive(toSignup);
    navigate(toSignup ? "/signup" : "/login", { replace: true });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    
    // Validate email format
    const trimmedEmail = loginEmail.trim();
    if (!isValidEmail(trimmedEmail)) {
      setError("Please enter a valid email address.");
      setLoading(false);
      return;
    }
    
    // Validate password length
    if (!loginPassword || loginPassword.length < 6) { // Firebase minimum password length is 6
      setError("Please enter a valid password.");
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, loginPassword);
      const user = userCredential.user;

      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (!userSnap.exists()) {
        await signOut(auth);
        setError("User profile not found. Please register again.");
        setLoading(false);
        return;
      }
      const userProfile = userSnap.data();
      if (userProfile.role !== "Student") {
        if (!userProfile.isApproved && 
            user.email?.toLowerCase() !== defaultAdminEmail?.toLowerCase() && 
            user.email?.toLowerCase() !== masterAdminEmail?.toLowerCase()) {
          await signOut(auth);
          setError("Your account is pending admin approval.");
          setLoading(false);
          return;
        }
      }

      setIsNavigating(true);
      if (userProfile.role === "Student") {
        navigate("/student/dashboard");
      } else if (userProfile.role === "HOD") {
        navigate("/hod-dashboard");
      } else if (userProfile.role === "Principal") {
        navigate("/principal-dashboard");
      } else if (userProfile.role === "Faculty") {
        navigate("/faculty-dashboard");
      } else {
        navigate("/reports");
      }
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError("Email/Password login is not enabled in Firebase Console. Please enable it in the Authentication tab.");
      } else if (err.code === 'auth/invalid-credential') {
        setError("Invalid email or password.");
      } else {
        setError("Invalid email or password.");
      }
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");

    if (regRole === "student") {
      const sanitizedRegNo = studentRegNo.trim();
      const sanitizedSName = ""; // Empty initially, will auto-fetch on post-login StudentLayout load
      const trimmedEmail = regEmail.trim();

      if (!studentProgramme) { setError("Programme is required."); return; }
      if (!studentBatch) { setError("Batch is required."); return; }
      if (!sanitizedRegNo) { setError("Reg No./ Admission No. is required."); return; }
      if (!trimmedEmail) { setError("Email is required."); return; }
      if (!isValidEmail(trimmedEmail)) { setError("Please enter a valid email address."); return; }
      if (regPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (regPassword.length > 128) { setError("Password is too long."); return; }

      setLoading(true);
      const studentEmail = trimmedEmail;
      let createdUser = null;

      try {
        // Step 1: Create auth user first (so we're authenticated for subsequent reads)
        const userCredential = await createUserWithEmailAndPassword(auth, studentEmail, regPassword);
        createdUser = userCredential.user;
        await updateProfile(createdUser, { displayName: sanitizedSName });

        // Step 2: Check if register number is already taken by another account
        const existingUsersQuery = query(collection(db, "users"), where("regNo", "==", sanitizedRegNo));
        const existingUsersSnap = await getDocs(existingUsersQuery);
        if (!existingUsersSnap.empty) {
          await createdUser.delete();
          setError("This Reg No./ Admission No. is already registered. Please login.");
          setLoading(false);
          return;
        }

        // Step 3: Validate regNo/admissionNo exists in student_index
        const idxRef = doc(db, 'student_index', sanitizeKey(sanitizedRegNo));
        const idxSnap = await getDoc(idxRef);
        if (!idxSnap.exists()) {
          await createdUser.delete();
          setError("Invalid Reg No./Admission No. This number is not found in our records. Please contact admin.");
          setLoading(false);
          return;
        }
        const idxData = idxSnap.data();
        if (idxData.batch && idxData.batch !== studentBatch) {
          await createdUser.delete();
          setError(`This number belongs to batch ${idxData.batch}, not ${studentBatch}.`);
          setLoading(false);
          return;
        }

        // Step 4: Write user doc with isApproved immediately
        await setDoc(doc(db, "users", createdUser.uid), {
          uid: createdUser.uid,
          email: studentEmail,
          regNo: sanitizedRegNo,
          studentName: sanitizedSName,
          displayName: sanitizedSName,
          programme: studentProgramme,
          department: studentDepartment || "unknown",
          batch: studentBatch,
          role: "Student",
          isApproved: true,
          createdAt: new Date().toISOString()
        }, { merge: true });

        setIsNavigating(true);
        navigate("/student/dashboard");
      } catch (err) {
        console.error(err);
        // Cleanup auth user if creation succeeded but validation failed
        if (createdUser) {
          try { await createdUser.delete(); } catch (_) {}
        }
        if (err.code === 'auth/email-already-in-use') {
          setError("This Email is already registered. Please login or use a different email.");
        } else {
          setError(err.message || "Failed to create account.");
        }
        setLoading(false);
      }
      return;
    }
    
    // Validate all required fields
    if (!regFacultyName.trim()) {
      setError("Faculty name is required.");
      return;
    }
    if (!regFacultyId.trim()) {
      setError("Faculty ID is required.");
      return;
    }
    if (!regDateOfJoining) {
      setError("Date of joining is required.");
      return;
    }
    if (!regProgramme) {
      setError("Programme is required.");
      return;
    }
    if (!regDepartment) {
      setError("Department is required.");
      return;
    }
    if (!regDesignation) {
      setError("Designation is required.");
      return;
    }
    
    // Validate email format
    const trimmedEmail = regEmail.trim();
    if (!isValidEmail(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    
    // Validate password
    if (regPassword.length < 6) { // Align with Firebase minimum password length
      setError("Password must be at least 8 characters.");
      return;
    }
    if (regPassword.length > 128) {
      setError("Password is too long.");
      return;
    }
    
    // Sanitize text inputs to prevent injection attacks
    const sanitizedFacultyName = sanitizeText(regFacultyName, 100);
    const sanitizedFacultyId = sanitizeFacultyId(regFacultyId);
    
    if (!sanitizedFacultyName) {
      setError("Faculty name contains invalid characters.");
      return;
    }
    if (!sanitizedFacultyId) {
      setError("Faculty ID contains invalid characters.");
      return;
    }
    
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, regPassword);
      const user = userCredential.user;
      const fullDisplayName = `${regTitle} ${sanitizedFacultyName}`;
      await updateProfile(user, { displayName: fullDisplayName });
      
      // Save user profile to Firestore (sanitized data)
      const isDefaultAdmin = user.email === defaultAdminEmail || user.email === masterAdminEmail;
      try {
        const userDataToSave = removeUndefined({
          uid: user.uid,
          email: user.email,
          title: regTitle,
          facultyName: sanitizedFacultyName,
          displayName: fullDisplayName,
          facultyId: sanitizedFacultyId,
          dateOfJoining: regDateOfJoining,
          programme: regProgramme,
          department: regDepartment,
          designation: regDesignation,
          role: isDefaultAdmin ? 'Admin' : 'Faculty',
          isApproved: isDefaultAdmin ? true : false,
          createdAt: new Date().toISOString()
        });
        
        // Firestore-ல் சேமித்தல்
        await setDoc(doc(db, "users", user.uid), userDataToSave, { merge: true });
        
      } catch (fsErr) {
        console.error("Failed to save profile to Firestore:", fsErr);
        
        // Firestore-ல் சேமிக்க முடியவில்லை என்றால் Auth பயனரை நீக்கிவிடுவது நல்லது 
        // அப்போதுதான் அவர்கள் மீண்டும் அதே மின்னஞ்சலில் பதிவு செய்ய முடியும்.
        try { await user.delete(); } catch (delErr) { console.error(delErr); }
        
        setError("Failed to save profile. " + (fsErr.code === 'permission-denied' ? "Permission denied. Check Firestore Rules." : "Please contact admin."));
        setLoading(false);
        return;
      }
      
      if (!isDefaultAdmin) {
        setMessage("Registration successful! Please wait for admin approval to login.");
        setIsActive(false); // Switch to login tab
        setLoading(false);
        await signOut(auth);
        return;
      }

      setIsNavigating(true);
      navigate("/reports");
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError("Email/Password registration is not enabled in Firebase Console.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError("Email already in use. Please login instead.");
      } else {
        setError(err.message || "Failed to create account.");
      }
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = loginEmail.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address in the email field first.");
      return;
    }
    
    if (!isValidEmail(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setError("");
    setMessage("");
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setMessage("Password reset email sent! Please check your inbox and spam folder.");
      setError("");
    } catch (err) {
      console.error("Password Reset Error:", err);
      if (err.code === 'auth/user-not-found') {
        setError("No account found with this email address.");
      } else if (err.code === 'auth/too-many-requests') {
        setError("Too many requests. Please try again later.");
      } else if (err.code === 'auth/invalid-email') {
        setError("The email address is badly formatted.");
      } else if (err.code === 'auth/network-request-failed') {
        setError("Network error. Please check your internet connection.");
      } else {
        setError(err.message || "Failed to send reset email. Please try again.");
      }
      setMessage("");
    } finally {
      setLoading(false);
    }
  };

  // Show loading screen while navigating
  if (isNavigating) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB]">
        <div className="bg-white rounded-lg p-8 shadow-lg flex flex-col items-center">
          <Loader2 className="animate-spin text-[#120c7a]" size={40} />
          <p className="mt-4 text-gray-600">Please wait...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex justify-center items-center bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB] p-5">
      <div className={`relative w-[850px] max-w-[calc(100%-40px)] h-[700px] bg-white rounded-[30px] shadow-[0_0_30px_rgba(0,0,0,0.2)] overflow-hidden ${isActive ? 'active' : ''}`}>
        
        {/* Login Form */}
        <div className="absolute right-0 w-full md:w-1/2 h-full bg-white flex items-center text-center p-10 z-[1] transition-all duration-300 ease-in-out form-box login">
          <form onSubmit={handleLogin} className="w-full">
            <h1 className="text-4xl font-bold -mt-2.5 mb-2 text-zinc-800">Login</h1>
            
            {error && !isActive && (
              <div className="my-3 flex items-center gap-2 rounded-lg bg-red-50 p-2 text-xs font-medium text-red-600 border border-red-100">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            {message && !isActive && (
              <div className="my-3 flex items-center gap-2 rounded-lg bg-green-50 p-2 text-xs font-medium text-green-600 border border-green-100">
                <CheckCircle2 size={14} /> {message}
              </div>
            )}

            <div className="relative my-7 input-box">
              <input
                type="email"
                placeholder="Email"
                maxLength="254"
                className="w-full py-3.5 pl-5 pr-12 bg-[#eee] rounded-lg border-none outline-none text-base font-medium text-zinc-800 placeholder:text-zinc-400 placeholder:font-normal focus:ring-2 focus:ring-[#120c7a]"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
              <i className='bx bxs-envelope absolute right-5 top-1/2 -translate-y-1/2 text-zinc-800 text-xl pointer-events-none'></i>
            </div>

            <div className="relative my-7 input-box">
              <input
                type={showLoginPassword ? "text" : "password"}
                placeholder="Password"
                maxLength="128"
                autoComplete="off"
                className="w-full py-3.5 pl-5 pr-12 bg-[#eee] rounded-lg border-none outline-none text-base font-medium text-zinc-800 placeholder:text-zinc-400 placeholder:font-normal focus:ring-2 focus:ring-[#120c7a]"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
              <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-800 hover:text-[#120c7a] transition-colors" tabIndex={-1}>
                {showLoginPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            <div className="text-center -mt-4 mb-4 forgot-link">
              <button type="button" onClick={handleForgotPassword} className="text-sm text-zinc-700 hover:text-[#120c7a] transition-colors">
                Forgot Password?
              </button>
            </div>

            <button type="submit" disabled={loading} className="w-full h-12 bg-[#120c7a] rounded-full shadow-[0_0_10px_rgba(0,0,0,0.1)] border-none cursor-pointer text-base text-white font-semibold hover:bg-blue-600 transition-all flex items-center justify-center gap-2">
              {loading ? <Loader2 className="animate-spin" size={20} /> : "Login"}
            </button>
            <p className="mt-5 text-[10px] text-zinc-400">Students: Use your Reg No. / Admission No. with @student.ckcet.edu (e.g. 420722104001@student.ckcet.edu)</p>
          </form>
        </div>

        {/* Register Form */}
        <div className="absolute left-0 w-full md:w-1/2 h-full bg-white flex items-center text-center px-8 py-6 z-[1] transition-all duration-300 ease-in-out form-box register overflow-y-auto">
          <form onSubmit={handleSignup} className="w-full py-4">
            <h1 className="text-3xl font-bold mb-4 text-zinc-800">Registration</h1>
            
            {error && isActive && (
              <div className="my-3 flex items-center gap-2 rounded-lg bg-red-50 p-2 text-xs font-medium text-red-600 border border-red-100">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {/* Role Toggle */}
            <div className="flex border border-zinc-200 rounded-lg overflow-hidden mb-4">
              <button type="button" className={`flex-1 py-2.5 text-sm font-bold transition-all ${regRole === 'faculty' ? 'bg-[#120c7a] text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50'}`} onClick={() => setRegRole('faculty')}>
                <i className='bx bxs-graduation mr-1'></i> Faculty
              </button>
              <button type="button" className={`flex-1 py-2.5 text-sm font-bold transition-all ${regRole === 'student' ? 'bg-[#120c7a] text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50'}`} onClick={() => setRegRole('student')}>
                <GraduationCap size={16} className="inline mr-1" /> Student
              </button>
            </div>

            {regRole === "student" ? (
              <div className="space-y-4 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <select
                      value={studentProgramme}
                      onChange={(e) => {
                        setStudentProgramme(e.target.value);
                        setStudentBatch("");
                      }}
                      className="w-full h-[50px] pl-4 pr-8 bg-[#eee] rounded-lg border-none outline-none text-sm font-medium text-zinc-800 appearance-none focus:ring-2 focus:ring-[#120c7a]"
                      required
                    >
                      <option value="">Programme</option>
                      {Object.keys(PROGRAMME_DEPARTMENTS).map(prog => (
                        <option key={prog} value={prog}>{formatProgDisplay(prog)}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={16} />
                  </div>
                  <div className="relative">
                    <select
                      value={studentBatch}
                      onChange={(e) => setStudentBatch(e.target.value)}
                      disabled={!studentProgramme}
                      className="w-full h-[50px] pl-4 pr-8 bg-[#eee] rounded-lg border-none outline-none text-sm font-medium text-zinc-800 appearance-none focus:ring-2 focus:ring-[#120c7a] disabled:opacity-50"
                      required
                    >
                      <option value="">Batch</option>
                      {activeStudentBatches.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={16} />
                  </div>
                </div>
                <div className="relative">
                  <input type="text" placeholder="Reg No. / Admission No." maxLength="50" className="w-full h-[50px] pl-4 pr-4 bg-[#eee] rounded-lg border-none outline-none text-sm font-medium text-zinc-800 placeholder:text-zinc-400 focus:ring-2 focus:ring-[#120c7a]" value={studentRegNo} onChange={e => setStudentRegNo(e.target.value)} required />
                </div>
              </div>
            ) : (
            <><div className="flex gap-3 mb-4">
              <div className="relative w-1/3">
                <select
                  value={regTitle}
                  onChange={(e) => setRegTitle(e.target.value)}
                  className="w-full h-[50px] pl-4 pr-8 bg-[#eee] rounded-lg border-none outline-none text-sm font-medium text-zinc-800 appearance-none focus:ring-2 focus:ring-[#120c7a]"
                  required
                >
                  <option value="Mr.">Mr.</option>
                  <option value="Mrs.">Mrs.</option>
                  <option value="Ms.">Ms.</option>
                  <option value="Dr.">Dr.</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={16} />
              </div>
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Faculty Name"
                  maxLength="100"
                  className="w-full h-[50px] pl-4 pr-4 bg-[#eee] rounded-lg border-none outline-none text-sm font-medium text-zinc-800 placeholder:text-zinc-400 focus:ring-2 focus:ring-[#120c7a]"
                  value={regFacultyName}
                  onChange={(e) => setRegFacultyName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Faculty ID"
                  maxLength="50"
                  className="w-full h-[50px] pl-4 pr-4 bg-[#eee] rounded-lg border-none outline-none text-sm font-medium text-zinc-800 placeholder:text-zinc-400 focus:ring-2 focus:ring-[#120c7a]"
                  value={regFacultyId}
                  onChange={(e) => setRegFacultyId(e.target.value)}
                  required
                />
              </div>
              <div className="relative">
                <input
                  type="date"
                  className="w-full h-[50px] pl-4 pr-4 bg-[#eee] rounded-lg border-none outline-none text-sm font-medium text-zinc-800 focus:ring-2 focus:ring-[#120c7a]"
                  value={regDateOfJoining}
                  onChange={(e) => setRegDateOfJoining(e.target.value)}
                  required
                />
                <span className="absolute -top-4 left-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Date of Joining</span>
              </div>
            </div>

            <div className="relative mb-6">
              <select
                value={regDesignation}
                onChange={(e) => setRegDesignation(e.target.value)}
                className="w-full h-[50px] pl-4 pr-8 bg-[#eee] rounded-lg border-none outline-none text-sm font-medium text-zinc-800 appearance-none focus:ring-2 focus:ring-[#120c7a]"
                required
              >
                <option value="">Select Designation</option>
                <option value="Assistant Professor">Assistant Professor</option>
                <option value="Associate Professor">Associate Professor</option>
                <option value="Professor">Professor</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={16} />
              <span className="absolute -top-4 left-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Designation</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="relative">
                <select
                  value={regProgramme}
                  onChange={(e) => {
                    setRegProgramme(e.target.value);
                    setRegDepartment("");
                  }}
                  className="w-full h-[50px] pl-4 pr-8 bg-[#eee] rounded-lg border-none outline-none text-sm font-medium text-zinc-800 appearance-none focus:ring-2 focus:ring-[#120c7a]"
                  required
                >
                  <option value="">Programme</option>
                  {Object.keys(PROGRAMME_DEPARTMENTS).map(prog => (
                    <option key={prog} value={prog}>{formatProgDisplay(prog)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={16} />
              </div>
              <div className="relative">
                <select
                  value={regDepartment}
                  onChange={(e) => setRegDepartment(e.target.value)}
                  disabled={!regProgramme}
                  className="w-full h-[50px] pl-4 pr-8 bg-[#eee] rounded-lg border-none outline-none text-sm font-medium text-zinc-800 appearance-none focus:ring-2 focus:ring-[#120c7a] disabled:opacity-50"
                  required
                >
                  <option value="">Department</option>
                  {regProgramme && PROGRAMME_DEPARTMENTS[regProgramme]?.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={16} />
              </div>
            </div>

            </>)}

            <div className="relative mb-4">
              <input type="email" placeholder="Email" maxLength="254" className="w-full h-[50px] pl-4 pr-4 bg-[#eee] rounded-lg border-none outline-none text-sm font-medium text-zinc-800 placeholder:text-zinc-400 focus:ring-2 focus:ring-[#120c7a]" value={regEmail} onChange={e => setRegEmail(e.target.value)} required />
            </div>

            <div className="relative mb-6">
              <input type={showRegPassword ? "text" : "password"} placeholder="Password" maxLength="128" autoComplete="off" className="w-full h-[50px] pl-4 pr-12 bg-[#eee] rounded-lg border-none outline-none text-sm font-medium text-zinc-800 placeholder:text-zinc-400 focus:ring-2 focus:ring-[#120c7a]" value={regPassword} onChange={e => setRegPassword(e.target.value)} required />
              <button type="button" onClick={() => setShowRegPassword(!showRegPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-800 hover:text-[#120c7a] transition-colors" tabIndex={-1}>
                {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button type="submit" disabled={loading} className="w-full h-12 bg-[#120c7a] rounded-full shadow-[0_0_10px_rgba(0,0,0,0.1)] border-none cursor-pointer text-base text-white font-semibold hover:bg-blue-600 transition-all flex items-center justify-center gap-2">
              {loading ? <Loader2 className="animate-spin" size={20} /> : (regRole === "student" ? "Register as Student" : "Register")}
            </button>
          </form>
        </div>

        {/* Toggle Box */}
        <div className="absolute w-full h-full toggle-box pointer-events-none">
          <div className={`toggle-bg absolute left-[-250%] w-[300%] h-full bg-[#120c7a] rounded-[150px] z-[2] transition-all duration-1000 ease-in-out ${isActive ? 'left-[50%]' : ''}`}></div>
          
          <div className="relative w-full h-full z-[2] toggle-panels">
            {/* Left Panel - Shown when Login is active */}
            <div className={`absolute w-full md:w-1/2 h-full text-white flex flex-col justify-center items-center toggle-panel toggle-left ${isActive ? 'pointer-events-none' : 'pointer-events-auto'}`}>
              <h1 className="text-4xl font-bold mb-4">Hello, Welcome!</h1>
              <p className="mb-6 text-sm">Don&apos;t have an account?</p>
              <button onClick={() => handleToggle(true)} className="w-40 h-11 bg-transparent border-2 border-white rounded-full font-semibold text-base hover:bg-white/10 transition-colors">
                Register
              </button>
            </div>

            {/* Right Panel - Shown when Register is active */}
            <div className={`absolute w-full md:w-1/2 h-full text-white flex flex-col justify-center items-center toggle-panel toggle-right ${isActive ? 'pointer-events-auto' : 'pointer-events-none'}`}>
              <h1 className="text-4xl font-bold mb-4">Welcome Back!</h1>
              <p className="mb-6 text-sm">Already have an account?</p>
              <button onClick={() => handleToggle(false)} className="w-40 h-11 bg-transparent border-2 border-white rounded-full font-semibold text-base hover:bg-white/10 transition-colors">
                Login
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Toggle Buttons */}
        <div className="md:hidden absolute bottom-0 left-0 w-full flex border-t border-zinc-200 bg-white z-10">
          <button 
            onClick={() => handleToggle(false)} 
            className={`flex-1 py-3 text-sm font-bold transition-colors ${!isActive ? "text-[#120c7a] border-b-2 border-[#120c7a]" : "text-zinc-500"}`}
          >
            Login
          </button>
          <button 
            onClick={() => handleToggle(true)} 
            className={`flex-1 py-3 text-sm font-bold transition-colors ${isActive ? "text-[#120c7a] border-b-2 border-[#120c7a]" : "text-zinc-500"}`}
          >
            Register
          </button>
        </div>
      </div>

      {/* Global Styles for animations and responsive behavior */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');
        
        * {
          font-family: "Poppins", sans-serif;
        }

        /* Fix for input fields */
        input, button {
          font-family: "Poppins", sans-serif;
        }
        
        .input-box i {
          pointer-events: none;
        }

        /* Desktop Styles */
        @media screen and (min-width: 768px) {
          .form-box.login {
            right: 0;
            transition: all .6s ease-in-out .3s;
          }
          .active .form-box.login {
            right: 0;
            opacity: 0;
            visibility: hidden;
            transition: all .6s ease-in-out;
          }
          .form-box.register {
            left: 0;
            visibility: hidden;
            opacity: 0;
            transition: all .6s ease-in-out;
          }
          .active .form-box.register {
            left: 0;
            visibility: visible;
            opacity: 1;
            transition: all .6s ease-in-out .3s;
          }

          .toggle-panel {
            transition: all .6s ease-in-out;
          }
          .toggle-panel.toggle-left {
            left: 0;
            opacity: 1;
            transition-delay: .4s;
          }
          .active .toggle-panel.toggle-left {
            left: -50%;
            opacity: 0;
            transition-delay: 0s;
          }
          .toggle-panel.toggle-right {
            right: -50%;
            opacity: 0;
            transition-delay: 0s;
          }
          .active .toggle-panel.toggle-right {
            right: 0;
            opacity: 1;
            transition-delay: .4s;
          }

          .toggle-bg {
            transition: 1s ease-in-out;
          }
        }

        /* Mobile Styles */
        @media screen and (max-width: 767px) {
          .w-\\[850px\\] {
            height: calc(100vh - 40px);
            min-height: 700px;
          }
          .form-box {
            position: absolute;
            bottom: 0;
            width: 100% !important;
            height: 70% !important;
            padding: 20px !important;
            transition: all .6s ease-in-out;
          }
          .form-box.login {
            opacity: 1;
            visibility: visible;
            transition-delay: .3s;
          }
          .active .form-box.login {
            opacity: 0;
            visibility: hidden;
            transition-delay: 0s;
            bottom: 30%;
          }
          .form-box.register {
            opacity: 0;
            visibility: hidden;
            transition-delay: 0s;
            bottom: -30%;
          }
          .active .form-box.register {
            opacity: 1;
            visibility: visible;
            transition-delay: .3s;
            bottom: 0;
          }
          .toggle-bg {
            left: 0 !important;
            top: -270%;
            width: 100% !important;
            height: 300%;
            border-radius: 20vw !important;
          }
          .active .toggle-bg {
            left: 0 !important;
            top: 70%;
          }
          .toggle-panel {
            width: 100%;
            height: 30%;
            transition: all .6s ease-in-out;
          }
          .toggle-panel.toggle-left {
            top: 0;
            left: 0 !important;
            opacity: 1;
            transition-delay: .4s;
          }
          .active .toggle-panel.toggle-left {
            left: 0 !important;
            top: -30%;
            opacity: 0;
            transition-delay: 0s;
          }
          .toggle-panel.toggle-right {
            right: 0 !important;
            bottom: -30%;
            opacity: 0;
            transition-delay: 0s;
          }
          .active .toggle-panel.toggle-right {
            bottom: 0;
            opacity: 1;
            transition-delay: .4s;
          }
        }
      `}</style>
    </div>
  );
}