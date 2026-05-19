import { onValue, ref, remove, set, update } from "firebase/database";
import { rtdb } from "../firebase";

const COMMUNITIES_ROOT = "settings/communities";

export function getCommunitiesRealtime(onData, onError) {
  const commRef = ref(rtdb, COMMUNITIES_ROOT);
  return onValue(
    commRef,
    (snapshot) => {
      const data = snapshot.exists() ? snapshot.val() : {};
      const normalized = Object.keys(data).map(k => ({
        name: k,
        percentage: typeof data[k] === 'number' ? data[k] : 0
      }));
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
  await set(ref(rtdb, `${COMMUNITIES_ROOT}/${name}`), Number(percentage) || 0);
}

export async function deleteCommunity(name) {
  if (!name) return;
  await remove(ref(rtdb, `${COMMUNITIES_ROOT}/${name}`));
}
