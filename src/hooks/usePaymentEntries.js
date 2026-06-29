import { useState, useEffect } from "react";
import { listenPaymentEntries } from "../services/paymentEntryService";

export function usePaymentEntries() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsub = listenPaymentEntries(
      (data) => {
        setEntries(data);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  return { entries, loading, error };
}
