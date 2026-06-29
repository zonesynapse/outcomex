import { useState, useEffect } from "react";
import { listenPaymentRoles } from "../services/paymentRoleService";

export function usePaymentRoles() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsub = listenPaymentRoles(
      (data) => {
        setRoles(data);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  return { roles, loading, error };
}
