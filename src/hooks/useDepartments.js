import { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, collection, onSnapshot, getDoc, setDoc, deleteDoc } from "firebase/firestore";

export function useDepartments() {
  const [departments, setDepartments] = useState({});
  const [durations, setDurations] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubDepts = onSnapshot(collection(db, "programme_departments"), (snapshot) => {
      const data = {};
      snapshot.forEach(d => {
        const docData = d.data();
        let depts = [];
        if (docData) {
          if (Array.isArray(docData.departments)) {
            depts = docData.departments;
          } else if (typeof docData.departments === 'object' && docData.departments !== null) {
            depts = Object.values(docData.departments).filter(v => typeof v === 'string');
          } else if (Array.isArray(docData.list)) {
            depts = docData.list;
          } else if (Array.isArray(docData.value)) {
            depts = docData.value;
          } else if (typeof docData.value === 'object' && docData.value !== null) {
            depts = Object.values(docData.value).filter(v => typeof v === 'string');
          } else {
            depts = Object.values(docData).filter(v => typeof v === 'string');
          }
        }
        data[d.id] = depts;
      });
      setDepartments(data);
    });

    const unsubDurations = onSnapshot(collection(db, "programme_durations"), (snapshot) => {
      const data = {};
      snapshot.forEach(d => {
        const docData = d.data();
        data[d.id] = docData?.duration || docData?.value || 4;
      });
      setDurations(data);
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
    await setDoc(doc(db, "programme_departments", programme), { departments: updatedDepts });
  };

  const removeDepartment = async (programme, deptToRemove) => {
    if (!programme || !deptToRemove) return;
    const currentDepts = departments[programme] || [];
    const updatedDepts = currentDepts.filter(d => d !== deptToRemove);
    await setDoc(doc(db, "programme_departments", programme), { departments: updatedDepts });
  };

  const removeProgram = async (programme) => {
    if (!programme) return;
    await deleteDoc(doc(db, "programme_departments", programme));
    await deleteDoc(doc(db, "programme_durations", programme));
  };

  const renameProgram = async (oldProgramme, newProgramme) => {
    if (!oldProgramme || !newProgramme || oldProgramme === newProgramme) return;

    const currentDeptsSnap = await getDoc(doc(db, "programme_departments", oldProgramme));
    const currentDurationSnap = await getDoc(doc(db, "programme_durations", oldProgramme));
    const currentDeptsData = currentDeptsSnap.exists() ? currentDeptsSnap.data() : null;
    let currentDepts = [];
    if (currentDeptsData) {
      if (Array.isArray(currentDeptsData.departments)) {
        currentDepts = currentDeptsData.departments;
      } else if (typeof currentDeptsData.departments === 'object' && currentDeptsData.departments !== null) {
        currentDepts = Object.values(currentDeptsData.departments).filter(v => typeof v === 'string');
      } else if (Array.isArray(currentDeptsData.list)) {
        currentDepts = currentDeptsData.list;
      } else if (Array.isArray(currentDeptsData.value)) {
        currentDepts = currentDeptsData.value;
      } else if (typeof currentDeptsData.value === 'object' && currentDeptsData.value !== null) {
        currentDepts = Object.values(currentDeptsData.value).filter(v => typeof v === 'string');
      } else {
        currentDepts = Object.values(currentDeptsData).filter(v => typeof v === 'string');
      }
    }
    const currentDuration = currentDurationSnap.exists() ? (currentDurationSnap.data()?.duration || currentDurationSnap.data()?.value || 4) : 4;

    await setDoc(doc(db, "programme_departments", newProgramme), { departments: currentDepts });
    await setDoc(doc(db, "programme_durations", newProgramme), { duration: currentDuration });
    await deleteDoc(doc(db, "programme_departments", oldProgramme));
    await deleteDoc(doc(db, "programme_durations", oldProgramme));
  };

  const renameDepartment = async (programme, oldDept, newDept) => {
    if (!programme || !oldDept || !newDept || oldDept === newDept) return;
    const currentDepts = departments[programme] || [];
    const updatedDepts = currentDepts.map(d => (d === oldDept ? newDept : d));
    await setDoc(doc(db, "programme_departments", programme), { departments: updatedDepts });
  };

  const setDuration = async (programme, duration) => {
    if (!programme) return;
    await setDoc(doc(db, "programme_durations", programme), { duration: parseInt(duration) || 4 });
  };

  return { departments, durations, addDepartment, removeDepartment, removeProgram, renameProgram, renameDepartment, setDuration, loading };
}
