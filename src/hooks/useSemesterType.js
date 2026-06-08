import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export function useSemesterType() {
  const [semesterType, setSemesterType] = useState('Both');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'info_configuration', 'semesterType'), (snapshot) => {
      if (snapshot.exists()) {
        setSemesterType(snapshot.data()?.value || 'Both');
      } else {
        setSemesterType('Both');
      }
    });

    return () => unsub();
  }, []);

  return semesterType;
}
