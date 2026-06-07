import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";

const SEAT_CONFIG_ROOT = "seatConfigurations";
const STUDENTS_ROOT = "students"; // For calculating filled seats

export const sanitizeKey = (key) => {
  if (!key) return key;
  return String(key).replace(/\./g, '%2E').replace(/#/g, '%23').replace(/\$/g, '%24').replace(/\[/g, '%5B').replace(/\]/g, '%5D');
};

export const desanitizeKey = (key) => {
  if (!key) return key;
  return String(key).replace(/%2E/g, '.').replace(/%23/g, '#').replace(/%24/g, '$').replace(/%5B/g, '[').replace(/%5D/g, ']');
};

export function getSeatConfigurationsRealtime(onData, onError) {
  const seatConfigRef = collection(db, SEAT_CONFIG_ROOT);

  return onSnapshot(
    seatConfigRef,
    (snapshot) => {
      const desanitizedData = {};
      snapshot.forEach(docSnap => {
        desanitizedData[desanitizeKey(docSnap.id)] = docSnap.data();
      });
      onData(desanitizedData);
    },
    (error) => {
      if (onError) onError(error);
      else console.error("Seat configurations fetch error:", error);
    }
  );
}

export function getStudentsRealtime(onData, onError) {
  const studentsRef = collection(db, STUDENTS_ROOT);

  return onSnapshot(
    studentsRef,
    (snapshot) => {
      const data = {};
      snapshot.forEach(docSnap => {
          data[docSnap.id] = docSnap.data();
      });
      onData(data);
    },
    (error) => {
      if (onError) onError(error);
      else console.error("Students fetch error:", error);
    }
  );
}

export async function saveSeatConfiguration(department, config) {
  const dataToSave = {
    totalIntake: Number(config.totalIntake) || 0,
    quotas: config.quotas || {}
  };
  
  // Clean up any empty quotas or convert to number
  Object.keys(dataToSave.quotas).forEach(q => {
    if (typeof dataToSave.quotas[q] === 'object' && dataToSave.quotas[q] !== null) {
      Object.keys(dataToSave.quotas[q]).forEach(comm => {
        dataToSave.quotas[q][comm] = Number(dataToSave.quotas[q][comm]) || 0;
      });
    } else {
      dataToSave.quotas[q] = Number(dataToSave.quotas[q]) || 0;
    }
  });

  await setDoc(doc(db, SEAT_CONFIG_ROOT, sanitizeKey(department)), dataToSave);
}

export async function updateSeatConfiguration(department, updates) {
  await updateDoc(doc(db, SEAT_CONFIG_ROOT, sanitizeKey(department)), updates);
}

export async function deleteSeatConfiguration(department) {
  await deleteDoc(doc(db, SEAT_CONFIG_ROOT, sanitizeKey(department)));
}
