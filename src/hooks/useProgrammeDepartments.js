import { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, getDoc, setDoc } from "firebase/firestore";

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
    const unsub = onSnapshot(doc(db, "config", "programme_departments"), (snapshot) => {
      if (snapshot.exists()) {
        setProgrammeDepartments(snapshot.data()?.list || DEFAULT_PROGRAMME_DEPARTMENTS);
      } else {
        setDoc(doc(db, "config", "programme_departments"), { list: DEFAULT_PROGRAMME_DEPARTMENTS });
      }
      setLoading(false);
    });

    return () => unsub();
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

    await setDoc(doc(db, "config", "programme_departments"), { list: updatedConfig });
  };

  return { programmeDepartments, addDepartment, loading };
}
