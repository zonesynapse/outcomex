import { collection, doc, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";

const COMMUNITIES_ROOT = "settings_communities";

export function getCommunitiesRealtime(onData, onError) {
  const commRef = collection(db, COMMUNITIES_ROOT);
  return onSnapshot(
    commRef,
    (snapshot) => {
      const normalized = [];
      snapshot.forEach(docSnap => {
          normalized.push({
              name: docSnap.id,
              percentage: typeof docSnap.data().percentage === 'number' ? docSnap.data().percentage : 0
          });
      });
      onData(normalized);
    },
    (error) => {
      if (onError) onError(error);
      else console.error("Communities fetch error", error);
    }
  );
}

export async function saveCommunity(name, percentage = 0) {
  if (!name) return;
  await setDoc(doc(db, COMMUNITIES_ROOT, name), { percentage: Number(percentage) || 0 });
}

export async function deleteCommunity(name) {
  if (!name) return;
  await deleteDoc(doc(db, COMMUNITIES_ROOT, name));
}
