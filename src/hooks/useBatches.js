import { useState, useEffect, useCallback } from "react";
import { rtdb } from "../firebase";
import { ref, onValue, set, update } from "firebase/database";
import { getRecentBatches } from "../lib/utils";

export function useBatches(durations = {}) {
  const [batchStatus, setBatchStatus] = useState({});
  const [loading, setLoading] = useState(true);

  // Use JSON.stringify for durations to avoid infinite loops if durations object is recreated
  const durationsStr = JSON.stringify(durations);

  useEffect(() => {
    const parsedDurations = JSON.parse(durationsStr);
    const batchRef = ref(rtdb, "batch_status");
    const unsubscribe = onValue(batchRef, (snapshot) => {
      const data = snapshot.val() || {};
      setBatchStatus(data);
      setLoading(false);

      // Auto-creation logic
      Object.entries(parsedDurations).forEach(([progKey, duration]) => {
        const expectedBatches = getRecentBatches(duration);
        const currentProgBatches = data[progKey] || {};
        
        let updates = null;
        expectedBatches.forEach(batch => {
          if (currentProgBatches[batch] === undefined) {
            if (!updates) updates = {};
            updates[`${progKey}/${batch}`] = { isActive: true };
          }
        });

        if (updates) {
          update(ref(rtdb, "batch_status"), updates);
        }
      });
    });

    return () => unsubscribe();
  }, [durationsStr]);

  const toggleBatchStatus = useCallback(async (progKey, batchId, currentStatus) => {
    const statusRef = ref(rtdb, `batch_status/${progKey}/${batchId}/isActive`);
    await set(statusRef, !currentStatus);
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
