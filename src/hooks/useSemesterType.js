import { useState, useEffect } from 'react';
import { rtdb } from '../firebase';
import { ref, onValue } from 'firebase/database';

export function useSemesterType() {
  const [semesterType, setSemesterType] = useState('Both');

  useEffect(() => {
    const configRef = ref(rtdb, 'info_configuration/semesterType');
    const unsubscribe = onValue(configRef, (snapshot) => {
      if (snapshot.exists()) {
        setSemesterType(snapshot.val());
      } else {
        setSemesterType('Both');
      }
    });

    return () => unsubscribe();
  }, []);

  return semesterType;
}
