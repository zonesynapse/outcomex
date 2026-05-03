import { useState, useEffect } from "react";
import { rtdb } from "../firebase";
import { ref, onValue, set } from "firebase/database";

const DEFAULT_PROGRAMME_DEPARTMENTS = {
  "B.E.": ["CSE", "ECE", "EEE", "CIVIL", "MECH"],
  "B.Tech.": ["IT", "AIDS"],
  "M.E.": ["CSE", "ECE", "ECE", "EEE", "CIVIL", "MECH"],
  "M.Tech.": ["IT", "AIDS"]
};

export function useProgrammeDepartments() {
  const [programmeDepartments, setProgrammeDepartments] = useState(DEFAULT_PROGRAMME_DEPARTMENTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const configRef = ref(rtdb, "config/programme_departments");
    const unsubscribe = onValue(configRef, (snapshot) => {
      if (snapshot.exists()) {
        setProgrammeDepartments(snapshot.val());
      } else {
        // Initialize with defaults if not present
        set(configRef, DEFAULT_PROGRAMME_DEPARTMENTS);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const addDepartment = async (programme, newDept) => {
    if (!programme || !newDept) return;
    const currentDepts = programmeDepartments[programme] || [];
    if (currentDepts.includes(newDept)) return;

    const updatedDepts = [...currentDepts, newDept];
    const updatedConfig = {
      ...programmeDepartments,
      [programme]: updatedDepts
    };

    await set(ref(rtdb, "config/programme_departments"), updatedConfig);
  };

  return { programmeDepartments, addDepartment, loading };
}
