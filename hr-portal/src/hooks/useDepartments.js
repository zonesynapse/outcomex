import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { normalizeInstitution } from "../utils/appraisalScore";

const DEFAULT_DEPARTMENTS = [
  "Computer Science",
  "Information Technology",
  "Electrical & Electronics",
  "Mechanical Engineering",
  "Civil Engineering",
  "Science & Humanities"
];

export function useDepartments(targetInst = null) {
  const [departments, setDepartments] = useState([]);
  const [rawDepartments, setRawDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  const filterDepts = (rawList, inst) => {
    if (!inst) {
      const unique = Array.from(new Set(rawList.map(r => r.name)));
      return unique.length > 0 ? unique : DEFAULT_DEPARTMENTS;
    }

    const norm = normalizeInstitution(inst);

    // Find departments tagged for this institution
    const instDepts = rawList.filter(d => normalizeInstitution(d.institution) === norm);
    if (instDepts.length > 0) {
      return Array.from(new Set(instDepts.map(d => d.name)));
    }

    // Special rule for CKCOE: if no institution-specific departments created yet, return empty list
    if (norm === "CKCOE") {
      return [];
    }

    // Fallback for other institutions if no specific departments exist yet
    const defaultDepts = rawList.filter(d => !d.institution || d.institution === "ALL" || normalizeInstitution(d.institution) === "ALL");
    const names = Array.from(new Set(defaultDepts.map(d => d.name)));
    return names.length > 0 ? names : DEFAULT_DEPARTMENTS;
  };

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "departments"),
      async (snapshot) => {
        if (snapshot.empty) {
          try {
            for (const dept of DEFAULT_DEPARTMENTS) {
              const docId = `${dept}_ALL`;
              await setDoc(doc(db, "departments", docId), {
                name: dept,
                institution: "ALL",
                createdAt: new Date().toISOString()
              });
            }
          } catch (err) {
            console.error("Error seeding default departments:", err);
          }
          const seeded = DEFAULT_DEPARTMENTS.map(d => ({ id: `${d}_ALL`, name: d, institution: "ALL" }));
          setRawDepartments(seeded);
          setDepartments(filterDepts(seeded, targetInst));
        } else {
          const rawList = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const name = data.name || docSnap.id;
            const inst = data.institution || "ALL";
            if (name) {
              rawList.push({
                id: docSnap.id,
                name,
                institution: inst
              });
            }
          });
          setRawDepartments(rawList);
          setDepartments(filterDepts(rawList, targetInst));
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching departments:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [targetInst]);

  const getDepartmentsForInstitution = (inst) => {
    return filterDepts(rawDepartments, inst);
  };

  const addDepartment = async (name, institution = "ALL") => {
    const trimmed = name?.trim();
    if (!trimmed) {
      return { success: false, message: "Department name cannot be empty." };
    }

    const normInst = institution || "ALL";
    const normCode = normalizeInstitution(normInst);

    const existing = rawDepartments.find(
      (d) => d.name.toLowerCase() === trimmed.toLowerCase() && normalizeInstitution(d.institution) === normCode
    );
    if (existing) {
      return { success: false, message: `Department "${trimmed}" already exists for this institution.` };
    }

    try {
      const sanitizedName = trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
      const docId = `${sanitizedName}_${normCode}`;
      await setDoc(doc(db, "departments", docId), {
        name: trimmed,
        institution: normInst,
        createdAt: new Date().toISOString()
      });
      return { success: true, message: `Department "${trimmed}" added successfully.` };
    } catch (err) {
      console.error("Error adding department:", err);
      return { success: false, message: "Failed to add department." };
    }
  };

  const removeDepartment = async (name, institution) => {
    if (!name) return { success: false, message: "Invalid department name." };
    try {
      const normCode = institution ? normalizeInstitution(institution) : null;
      const item = rawDepartments.find(d => 
        d.name.toLowerCase() === name.toLowerCase() &&
        (!normCode || normalizeInstitution(d.institution) === normCode)
      );
      const docId = item ? item.id : name;
      await deleteDoc(doc(db, "departments", docId));
      return { success: true, message: `Department "${name}" removed.` };
    } catch (err) {
      console.error("Error deleting department:", err);
      return { success: false, message: "Failed to delete department." };
    }
  };

  return {
    departments,
    rawDepartments,
    loading,
    addDepartment,
    removeDepartment,
    getDepartmentsForInstitution
  };
}
