import { collection, doc, onSnapshot, getDoc, setDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const COLLECTION = "payment_roles";

export function listenPaymentRoles(onData, onError) {
  const q = query(collection(db, COLLECTION), orderBy("roleName"));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      else console.error("paymentRoles listener error", error);
    }
  );
}

export async function getPaymentRole(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function addPaymentRole(data) {
  const ref = doc(collection(db, COLLECTION));
  await setDoc(ref, {
    ...data,
    status: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePaymentRole(id, data) {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePaymentRole(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

export async function isDuplicateRoleName(name, excludeId) {
  const snap = await getDoc(doc(db, COLLECTION, name));
  // Use roleName field, not doc ID
  const q = query(collection(db, COLLECTION));
  return new Promise((resolve) => {
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        unsub();
        const exists = snapshot.docs.some((d) => {
          const data = d.data();
          return (
            data.roleName?.toLowerCase() === name.toLowerCase() &&
            d.id !== excludeId
          );
        });
        resolve(exists);
      },
      () => resolve(false)
    );
  });
}
