import { useState, useEffect, useCallback } from "react";
import { rtdb } from "../firebase";
import { ref, onValue, set } from "firebase/database";

export function useRegulations() {
  const [regulations, setRegulations] = useState([]);
  const [batchRegulations, setBatchRegulations] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const regRef = ref(rtdb, "regulations");
    const unsubscribeReg = onValue(regRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRegulations(data);
      } else {
        setRegulations(["R2017", "R2021"]); // defaults
      }
    });

    const batchRegRef = ref(rtdb, "batch_regulations");
    const unsubscribeBatchReg = onValue(batchRegRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setBatchRegulations(data);
      } else {
        setBatchRegulations({});
      }
      setLoading(false);
    });

    return () => {
      unsubscribeReg();
      unsubscribeBatchReg();
    };
  }, []);

  const addRegulation = async (newReg) => {
    if (!newReg) return;
    if (regulations.includes(newReg)) return;
    const updatedRegs = [...regulations, newReg];
    await set(ref(rtdb, "regulations"), updatedRegs);
  };

  const mapBatchToRegulation = useCallback(async (programme, batch, regulation) => {
    if (!programme || !batch || !regulation) return;
    const updatedMapping = {
      ...batchRegulations,
      [programme]: {
        ...(batchRegulations[programme] || {}),
        [batch]: regulation
      }
    };
    await set(ref(rtdb, "batch_regulations"), updatedMapping);
  }, [batchRegulations]);

  const getRegulationForBatch = useCallback((programme, batch) => {
    if (!programme || !batch) return "";
    if (batchRegulations[programme] && batchRegulations[programme][batch]) {
      return batchRegulations[programme][batch];
    }
    return "";
  }, [batchRegulations]);

  return { regulations, batchRegulations, addRegulation, mapBatchToRegulation, getRegulationForBatch, loading };
}
