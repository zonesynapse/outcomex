import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";

const DEFAULT_DEPARTMENTS = [
  "Computer Science",
  "Information Technology",
  "Electrical & Electronics",
  "Mechanical Engineering",
  "Civil Engineering",
  "Science & Humanities"
];

export function useDepartments() {
  const [departments, setDepartments] = useState(DEFAULT_DEPARTMENTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "departments"),
      async (snapshot) => {
        if (snapshot.empty) {
          try {
            for (const dept of DEFAULT_DEPARTMENTS) {
              await setDoc(doc(db, "departments", dept), {
                name: dept,
                createdAt: new Date().toISOString()
              });
            }
          } catch (err) {
            console.error("Error seeding default departments:", err);
          }
          setDepartments(DEFAULT_DEPARTMENTS);
        } else {
          const list = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const name = data.name || docSnap.id;
            if (name && !list.includes(name)) {
              list.push(name);
            }
          });
          setDepartments(list.length > 0 ? list : DEFAULT_DEPARTMENTS);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching departments:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const addDepartment = async (name) => {
    const trimmed = name?.trim();
    if (!trimmed) {
      return { success: false, message: "Department name cannot be empty." };
    }

    if (departments.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      return { success: false, message: "Department already exists." };
    }

    try {
      await setDoc(doc(db, "departments", trimmed), {
        name: trimmed,
        createdAt: new Date().toISOString()
      });
      return { success: true, message: `Department "${trimmed}" added successfully.` };
    } catch (err) {
      console.error("Error adding department:", err);
      return { success: false, message: "Failed to add department." };
    }
  };

  const removeDepartment = async (name) => {
    if (!name) return { success: false, message: "Invalid department name." };
    try {
      await deleteDoc(doc(db, "departments", name));
      return { success: true, message: `Department "${name}" removed.` };
    } catch (err) {
      console.error("Error deleting department:", err);
      return { success: false, message: "Failed to delete department." };
    }
  };

  return {
    departments,
    loading,
    addDepartment,
    removeDepartment
  };
}
