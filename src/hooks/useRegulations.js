import { useState, useEffect, useCallback } from "react";
import { db } from "../firebase";
import { doc, collection, onSnapshot, setDoc } from "firebase/firestore";

export function useRegulations() {
  const [regulations, setRegulations] = useState([]);
  const [batchRegulations, setBatchRegulations] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubReg = onSnapshot(collection(db, "regulations"), (snapshot) => {
      const extracted = [];
      snapshot.forEach(d => {
        const docData = d.data();
        if (d.id === "list" && Array.isArray(docData.list)) {
          docData.list.forEach(r => { if (!extracted.includes(r)) extracted.push(r); });
        } else if (typeof docData.value === 'string') {
          if (!extracted.includes(docData.value)) extracted.push(docData.value);
        }
      });
      if (extracted.length > 0) {
        setRegulations(extracted);
      }
    });

    const unsubBatch = onSnapshot(collection(db, "batch_regulations"), (snapshot) => {
      const data = {};
      snapshot.forEach(d => { data[d.id] = d.data(); });
      setBatchRegulations(data);
      setLoading(false);
    });

    return () => {
      unsubReg();
      unsubBatch();
    };
  }, []);

  const addRegulation = async (newReg) => {
    if (!newReg) return;
    if (regulations.includes(newReg)) return;
    const updatedRegs = [...regulations, newReg];
    await setDoc(doc(db, "regulations", "list"), { list: updatedRegs });
  };

  const mapBatchToRegulation = useCallback(async (programme, batch, regulation) => {
    if (!programme || !batch || !regulation) return;
    await setDoc(doc(db, "batch_regulations", programme), {
      [batch]: regulation
    }, { merge: true });
  }, []);

  const getRegulationForBatch = useCallback((programme, batch) => {
    if (!programme || !batch) return "";
    if (batchRegulations[programme] && batchRegulations[programme][batch]) {
      return batchRegulations[programme][batch];
    }
    return "";
  }, [batchRegulations]);

  return { regulations, batchRegulations, addRegulation, mapBatchToRegulation, getRegulationForBatch, loading };
}
