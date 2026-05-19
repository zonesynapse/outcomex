import { get, onValue, ref, remove, set, update } from "firebase/database";
import { rtdb } from "../firebase";

const SEAT_CONFIG_ROOT = "seatConfigurations";
const STUDENTS_ROOT = "students"; // For calculating filled seats

export function getSeatConfigurationsRealtime(onData, onError) {
  const seatConfigRef = ref(rtdb, SEAT_CONFIG_ROOT);

  return onValue(
    seatConfigRef,
    (snapshot) => {
      const data = snapshot.exists() ? snapshot.val() : {};
      onData(data);
    },
    (error) => {
      if (onError) onError(error);
      else console.error("Seat configurations fetch error:", error);
    }
  );
}

export function getStudentsRealtime(onData, onError) {
  const studentsRef = ref(rtdb, STUDENTS_ROOT);

  return onValue(
    studentsRef,
    (snapshot) => {
      const data = snapshot.exists() ? snapshot.val() : {};
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

  await set(ref(rtdb, `${SEAT_CONFIG_ROOT}/${department}`), dataToSave);
}

export async function updateSeatConfiguration(department, updates) {
  await update(ref(rtdb, `${SEAT_CONFIG_ROOT}/${department}`), updates);
}

export async function deleteSeatConfiguration(department) {
  await remove(ref(rtdb, `${SEAT_CONFIG_ROOT}/${department}`));
}
