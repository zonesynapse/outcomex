import { useState, useEffect } from "react";
import { rtdb } from "../firebase";
import { ref, onValue, set, get } from "firebase/database";

export function useDepartments() {
  const [departments, setDepartments] = useState({});
  const [durations, setDurations] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const deptRef = ref(rtdb, "programme_departments");
    const durationRef = ref(rtdb, "programme_durations");

    const unsubDepts = onValue(deptRef, (snapshot) => {
      const data = snapshot.val();
      setDepartments(data || {});
    });

    const unsubDurations = onValue(durationRef, (snapshot) => {
      const data = snapshot.val();
      setDurations(data || {});
      setLoading(false);
    });

    return () => {
      unsubDepts();
      unsubDurations();
    };
  }, []);

  const addDepartment = async (programme, newDept) => {
    if (!programme || !newDept) return;
    const currentDepts = departments[programme] || [];
    if (currentDepts.includes(newDept)) return;

    const updatedDepts = [...currentDepts, newDept];
    const deptRef = ref(rtdb, `programme_departments/${programme}`);
    await set(deptRef, updatedDepts);
  };

  const removeDepartment = async (programme, deptToRemove) => {
    if (!programme || !deptToRemove) return;
    const currentDepts = departments[programme] || [];
    const updatedDepts = currentDepts.filter(d => d !== deptToRemove);
    await set(ref(rtdb, `programme_departments/${programme}`), updatedDepts);
  };

  const removeProgram = async (programme) => {
    if (!programme) return;
    await set(ref(rtdb, `programme_departments/${programme}`), null);
    await set(ref(rtdb, `programme_durations/${programme}`), null);
  };

  const renameProgram = async (oldProgramme, newProgramme) => {
    if (!oldProgramme || !newProgramme || oldProgramme === newProgramme) return;

    const currentDeptsSnap = await get(ref(rtdb, `programme_departments/${oldProgramme}`));
    const currentDurationSnap = await get(ref(rtdb, `programme_durations/${oldProgramme}`));
    const currentDepts = currentDeptsSnap.exists() ? currentDeptsSnap.val() : [];
    const currentDuration = currentDurationSnap.exists() ? currentDurationSnap.val() : 4;

    await set(ref(rtdb, `programme_departments/${newProgramme}`), currentDepts);
    await set(ref(rtdb, `programme_durations/${newProgramme}`), currentDuration);
    await set(ref(rtdb, `programme_departments/${oldProgramme}`), null);
    await set(ref(rtdb, `programme_durations/${oldProgramme}`), null);
  };

  const renameDepartment = async (programme, oldDept, newDept) => {
    if (!programme || !oldDept || !newDept || oldDept === newDept) return;
    const currentDepts = departments[programme] || [];
    const updatedDepts = currentDepts.map(d => (d === oldDept ? newDept : d));
    await set(ref(rtdb, `programme_departments/${programme}`), updatedDepts);
  };

  const setDuration = async (programme, duration) => {
    if (!programme) return;
    await set(ref(rtdb, `programme_durations/${programme}`), parseInt(duration) || 4);
  };

  return { departments, durations, addDepartment, removeDepartment, removeProgram, renameProgram, renameDepartment, setDuration, loading };
}
