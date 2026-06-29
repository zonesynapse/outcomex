import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

const COLLECTION = "payment_entries";

export function listenPaymentEntries(onData, onError) {
  const q = query(
    collection(db, COLLECTION),
    orderBy("createdAt", "desc")
  );
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
      else console.error("paymentEntries listener error", error);
    }
  );
}

export async function getPaymentEntry(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function addPaymentEntry(data) {
  const ref = doc(collection(db, COLLECTION));
  await setDoc(ref, {
    ...data,
    status: data.status || "Pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePaymentEntry(id, data) {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePaymentEntry(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

export async function checkDuplicateEntry(facultyId, subjectCode, roleId, exam) {
  const q = query(
    collection(db, COLLECTION),
    where("facultyId", "==", facultyId),
    where("subjectCode", "==", subjectCode),
    where("roleId", "==", roleId),
    where("exam", "==", exam)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function getPaymentEntriesByFaculty(facultyId) {
  const q = query(
    collection(db, COLLECTION),
    where("facultyId", "==", facultyId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPaymentEntriesByRole(roleId) {
  const q = query(
    collection(db, COLLECTION),
    where("roleId", "==", roleId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPaymentEntriesByDepartment(department) {
  const q = query(
    collection(db, COLLECTION),
    where("department", "==", department),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPaymentEntriesByExam(exam) {
  const q = query(
    collection(db, COLLECTION),
    where("exam", "==", exam),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addBulkPaymentEntries(entries) {
  const results = [];
  for (const entry of entries) {
    const ref = doc(collection(db, COLLECTION));
    await setDoc(ref, {
      ...entry,
      status: "Pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    results.push(ref.id);
  }
  return results;
}
