import { useState, useEffect, useCallback } from "react";
import { db } from "../firebase";
import { doc, collection, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { getRecentBatches } from "../lib/utils";

export function useBatches(durations = {}) {
  const [batchStatus, setBatchStatus] = useState({});
  const [loading, setLoading] = useState(true);

  const durationsStr = JSON.stringify(durations);

  useEffect(() => {
    const parsedDurations = JSON.parse(durationsStr);
    const unsub = onSnapshot(collection(db, "batch_status"), (snapshot) => {
      const data = {};
      snapshot.forEach(d => { data[d.id] = d.data(); });
      setBatchStatus(data);
      setLoading(false);

      Object.entries(parsedDurations).forEach(([progKey, duration]) => {
        const expectedBatches = getRecentBatches(duration);
        const currentProgBatches = data[progKey] || {};

        const missingBatches = expectedBatches.filter(batch => currentProgBatches[batch] === undefined);
        if (missingBatches.length > 0) {
          const payload = {};
          missingBatches.forEach(batch => { payload[batch] = { isActive: true }; });
          setDoc(doc(db, "batch_status", progKey), payload, { merge: true });
        }
      });
    });

    return () => unsub();
  }, [durationsStr]);

  const toggleBatchStatus = useCallback(async (progKey, batchId, currentStatus) => {
    await updateDoc(doc(db, "batch_status", progKey), {
      [`${batchId}.isActive`]: !currentStatus
    });
  }, []);

  const getActiveBatches = useCallback((progKey) => {
    const progBatches = batchStatus[progKey] || {};
    return Object.entries(progBatches)
      .filter(([, status]) => status.isActive)
      .map(([batchId]) => batchId)
      .sort((a, b) => b.localeCompare(a));
  }, [batchStatus]);

  return { batchStatus, toggleBatchStatus, getActiveBatches, loading };
}
