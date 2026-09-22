import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Loader2 } from "lucide-react";

import Auth from "./pages/Auth";
import FacultyAppraisal from "./pages/FacultyAppraisal";
import TeacherAppraisal from "./pages/TeacherAppraisal";
import NonTeachingAppraisal from "./pages/NonTeachingAppraisal";
import HODAppraisal from "./pages/HODAppraisal";
import AppraisalReviews from "./pages/AppraisalReviews";
import AppraisalSettings from "./pages/AppraisalSettings";
import UserManagement from "./pages/UserManagement";

function ProtectedRoute({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-900">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
        <p className="text-slate-700 text-sm font-medium">Verifying Session...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}

function HomeRedirect() {
  const [targetPath, setTargetPath] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const checkUserRole = async () => {
      try {
        let role = "";
        let designation = "";
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const d = userDoc.data();
          role = d.role || "";
          designation = d.designation || "";
        } else {
          const localStr = localStorage.getItem(`user_profile_${user.uid}`);
          if (localStr) {
            const p = JSON.parse(localStr);
            role = p.role || "";
            designation = p.designation || "";
          }
        }

        const r = (String(role) + " " + String(designation)).toLowerCase();

        if (r.includes("coordinator") || r.includes("hod") || r.includes("head")) {
          setTargetPath("/coordinator-appraisal");
        } else if (r.includes("principal") || r.includes("hr") || r.includes("admin")) {
          setTargetPath("/reviews");
        } else if (r.includes("non-teaching") || r.includes("staff")) {
          setTargetPath("/non-teaching-appraisal");
        } else {
          setTargetPath("/teacher-appraisal");
        }
      } catch (err) {
        console.error("HomeRedirect role check error:", err);
        setTargetPath("/coordinator-appraisal");
      } finally {
        setLoading(false);
      }
    };

    checkUserRole();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-900">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
        <p className="text-slate-700 text-sm font-medium">Directing to Dashboard...</p>
      </div>
    );
  }

  if (!auth.currentUser) return <Navigate to="/auth" replace />;

  return <Navigate to={targetPath || "/coordinator-appraisal"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <HomeRedirect />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/appraisal" 
          element={
            <ProtectedRoute>
              <FacultyAppraisal />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/teacher-appraisal" 
          element={
            <ProtectedRoute>
              <TeacherAppraisal />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/non-teaching-appraisal" 
          element={
            <ProtectedRoute>
              <NonTeachingAppraisal />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/coordinator-appraisal" 
          element={
            <ProtectedRoute>
              <HODAppraisal />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/reviews" 
          element={
            <ProtectedRoute>
              <AppraisalReviews />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/settings" 
          element={
            <ProtectedRoute>
              <AppraisalSettings />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/users" 
          element={
            <ProtectedRoute>
              <UserManagement />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/user-management" 
          element={
            <ProtectedRoute>
              <UserManagement />
            </ProtectedRoute>
          } 
        />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
