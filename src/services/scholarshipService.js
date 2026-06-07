import { collection, doc, onSnapshot, setDoc, deleteDoc, getDocs, addDoc } from "firebase/firestore";
import { db } from "../firebase";

const SCHOLARSHIP_COLLECTION = "scholarships";

export function getScholarshipsRealtime(onData, onError) {
  const ref = collection(db, SCHOLARSHIP_COLLECTION);
  return onSnapshot(
    ref,
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(list);
    },
    onError
  );
}

export async function addScholarship(name, quota) {
  const ref = collection(db, SCHOLARSHIP_COLLECTION);
  await addDoc(ref, { name: name.trim(), quota: quota || "", createdAt: new Date().toISOString() });
}

export async function deleteScholarship(id) {
  await deleteDoc(doc(db, SCHOLARSHIP_COLLECTION, id));
}
