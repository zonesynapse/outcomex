import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { onValue, ref } from "firebase/database";

import { auth, rtdb } from "../firebase";
import Dashboard from "./Dashboard";
import FacultyDashboard from "./FacultyDashboard";
import HODDashboard from "./HODDashboard";

export default function DashboardRouter() {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUser = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeUser();

      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const userRef = ref(rtdb, `users/${user.uid}`);
      unsubscribeUser = onValue(
        userRef,
        (snapshot) => {
          setRole(snapshot.val()?.role || null);
          setLoading(false);
        },
        () => {
          setRole(null);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeUser();
    };
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
