import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import FacultyDashboard from "./FacultyDashboard";
import HODDashboard from "./HODDashboard";
import Dashboard from "./Dashboard";

export default function DashboardRouter() {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          setRole(userSnap.data()?.role || null);
        } else {
          setRole(null);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        setRole(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-[#120c7a]"></div>
      </div>
    );
  }

  if (role === "Faculty") return <FacultyDashboard />;
  if (role === "HOD") return <HODDashboard />;

  return <Dashboard />;
}