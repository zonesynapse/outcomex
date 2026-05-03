import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../firebase';

export function useSemesterType() {
  const [semesterType, setSemesterType] = useState("Odd");

  useEffect(() => {
    const settingsRef = ref(rtdb, 'academic_settings/semesterType');
    const unsubscribe = onValue(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        setSemesterType(snapshot.val());
      }
    });

    return () => unsubscribe();
  }, []);

  return semesterType;
}
