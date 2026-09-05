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
    // 1. Check explicit batch_regulations mapping
    if (batchRegulations[programme] && batchRegulations[programme][batch]) {
      return batchRegulations[programme][batch];
    }
    // 2. Derive regulation from batch start year (e.g. "25 Batch (2025-29)" → 2025 → "AU - R2025")
    // Use closest regulation year <= batch start year (so 23 Batch (2023-27) maps to R2021, not empty)
    const yearMatch = batch.match(/\((\d{4})/) || String(batch).match(/(19|20)\d{2}/);
    if (yearMatch) {
      const batchStartYear = parseInt(yearMatch[1] || yearMatch[0], 10);
      if (!isNaN(batchStartYear) && regulations.length > 0) {
        const regWithYear = regulations.map(r => {
          const m = String(r).match(/R\s*(\d{4})/i) || String(r).match(/(19|20)\d{2}/);
          return { reg: r, year: m ? parseInt(m[1] || m[0], 10) : null };
        }).filter(x => x.year !== null);
        if (regWithYear.length > 0) {
          // Best match: largest reg year <= batchStartYear
          const candidates = regWithYear.filter(x => x.year <= batchStartYear).sort((a, b) => b.year - a.year);
          if (candidates.length > 0) return candidates[0].reg;
          // Fallback: smallest reg year (oldest) if batch is older than all regs
          regWithYear.sort((a, b) => a.year - b.year);
          return regWithYear[0].reg;
        }
        // Fallback: simple includes check
        const match = regulations.find(r => String(r).includes(String(batchStartYear)));
        if (match) return match;
      }
    }
    // 3. If there's exactly one registered regulation, return it
    if (regulations.length === 1) return regulations[0];
    return "";
  }, [batchRegulations, regulations]);

  return { regulations, batchRegulations, addRegulation, mapBatchToRegulation, getRegulationForBatch, loading };
}
