import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Loader2 } from "lucide-react";

import Auth from "./pages/Auth";
import FacultyAppraisal from "./pages/FacultyAppraisal";
import NonTeachingAppraisal from "./pages/NonTeachingAppraisal";
import HODAppraisal from "./pages/HODAppraisal";
import AppraisalReviews from "./pages/AppraisalReviews";
import AppraisalSettings from "./pages/AppraisalSettings";

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
  const user = auth.currentUser;
  if (!user) return <Navigate to="/auth" replace />;

  const localStr = localStorage.getItem(`user_profile_${user.uid}`);
  const role = localStr ? JSON.parse(localStr)?.role : "";
  const r = String(role).toLowerCase();

  if (r.includes("coordinator")) {
    return <Navigate to="/coordinator-appraisal" replace />;
  }
  if (r.includes("principal") || r.includes("hr") || r.includes("admin")) {
    return <Navigate to="/reviews" replace />;
  }
  return <Navigate to="/appraisal" replace />;
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
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
