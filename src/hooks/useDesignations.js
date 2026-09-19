import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";

const DEFAULT_DESIGNATIONS = [
  "Assistant Professor",
  "Associate Professor",
  "Professor"
];

export function useDesignations() {
  const [designations, setDesignations] = useState(DEFAULT_DESIGNATIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "designations"),
      async (snapshot) => {
        if (snapshot.empty) {
          // Seed default static designations if Firestore collection is empty
          try {
            for (const des of DEFAULT_DESIGNATIONS) {
              await setDoc(doc(db, "designations", des), {
                name: des,
                createdAt: new Date().toISOString()
              });
            }
          } catch (err) {
            console.error("Error seeding default designations:", err);
          }
          setDesignations(DEFAULT_DESIGNATIONS);
        } else {
          const list = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const name = data.name || docSnap.id;
            if (name && !list.includes(name)) {
              list.push(name);
            }
          });
          setDesignations(list.length > 0 ? list : DEFAULT_DESIGNATIONS);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching designations:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const addDesignation = async (name) => {
    const trimmed = name?.trim();
    if (!trimmed) {
      return { success: false, message: "Designation name cannot be empty." };
    }

    if (designations.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      return { success: false, message: "Designation already exists." };
    }

    try {
      await setDoc(doc(db, "designations", trimmed), {
        name: trimmed,
        createdAt: new Date().toISOString()
      });
      return { success: true, message: `Designation "${trimmed}" added successfully.` };
    } catch (err) {
      console.error("Error adding designation:", err);
      return { success: false, message: "Failed to add designation." };
    }
  };

  const removeDesignation = async (name) => {
    if (!name) return { success: false, message: "Invalid designation name." };
    try {
      await deleteDoc(doc(db, "designations", name));
      return { success: true, message: `Designation "${name}" removed.` };
    } catch (err) {
      console.error("Error deleting designation:", err);
      return { success: false, message: "Failed to delete designation." };
    }
  };

  return {
    designations,
    loading,
    addDesignation,
    removeDesignation
  };
}
