import { Navigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function ProtectedRoute({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const snap = await getDoc(doc(db, "users", currentUser.uid));
          setUserRole(snap.exists() ? snap.data().role : null);
        } catch {
          setUserRole(null);
        }
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-[#120c7a]"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isStudentRoute = location.pathname.startsWith("/student/");

  if (userRole === "Student" && !isStudentRoute) {
    return <Navigate to="/student/dashboard" replace />;
  }

  if (userRole !== "Student" && isStudentRoute) {
    if (userRole === "HOD") return <Navigate to="/hod-dashboard" replace />;
    if (userRole === "Principal") return <Navigate to="/principal-dashboard" replace />;
    if (userRole === "Faculty") return <Navigate to="/faculty-dashboard" replace />;
    return <Navigate to="/reports" replace />;
  }

  return children;
}
