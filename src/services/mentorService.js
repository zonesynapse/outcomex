import { db } from "../firebase";
import {
  doc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, query, where
} from "firebase/firestore";
import { sanitizeKey } from "../lib/utils";

const getAllocationKey = (prog, dept, batch, ay, sem, sec) => {
  const base = `${sanitizeKey(prog)}_${sanitizeKey(dept)}_${sanitizeKey(batch)}_${sanitizeKey(ay)}_${sanitizeKey(sem)}`;
  return sec ? `${base}_${sanitizeKey(sec)}` : base;
};

// --- Mentor Allocation ---

export function listenMentorAllocation(prog, dept, batch, ay, sem, sec, callback) {
  if (!prog || !dept || !batch || !ay || !sem) {
    callback({ mentors: {}, students: {} });
    return () => { };
  }
  const docKey = getAllocationKey(prog, dept, batch, ay, sem, sec);
  const ref = doc(db, "mentor_allocations", docKey);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        callback({
          mentors: data.mentors || {},
          students: data.students || {},
          ...data
        });
      } else {
        callback({ mentors: {}, students: {} });
      }
    },
    (err) => {
      console.error("listenMentorAllocation error:", err);
      callback({ mentors: {}, students: {} });
    }
  );
}

export async function saveMentorAllocation(prog, dept, batch, ay, sem, sec, data) {
  const docKey = getAllocationKey(prog, dept, batch, ay, sem, sec);
  const ref = doc(db, "mentor_allocations", docKey);
  await setDoc(ref, {
    programme: prog,
    department: dept,
    batch,
    academicYear: ay,
    semester: sem,
    section: sec || "",
    updatedAt: new Date().toISOString(),
    ...data
  }, { merge: true });
}

// --- Filtered Collection Listener Helper ---

function listenCollectionWithFilters(collName, filters, callback) {
  try {
    const collRef = collection(db, collName);
    const constraints = [];
    if (filters.programme) constraints.push(where("programme", "==", filters.programme));
    if (filters.department) constraints.push(where("department", "==", filters.department));
    if (filters.batch) constraints.push(where("batch", "==", filters.batch));
    if (filters.mentorUid) constraints.push(where("mentorUid", "==", filters.mentorUid));
    if (filters.studentReg) constraints.push(where("studentReg", "==", filters.studentReg));
    if (filters.type) constraints.push(where("type", "==", filters.type));
    if (filters.severity) constraints.push(where("severity", "==", filters.severity));

    const q = constraints.length > 0 ? query(collRef, ...constraints) : collRef;
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback(list);
      },
      (err) => {
        console.error(`listen ${collName} error:`, err);
        callback([]);
      }
    );
  } catch (err) {
    console.error(`listenCollectionWithFilters (${collName}) exception:`, err);
    callback([]);
    return () => { };
  }
}

// --- Meetings ---

export function listenMentorMeetings(filters, callback) {
  return listenCollectionWithFilters("mentor_meetings", filters, callback);
}

export async function addMentorMeeting(payload) {
  const ref = collection(db, "mentor_meetings");
  return await addDoc(ref, {
    createdAt: new Date().toISOString(),
    ...payload
  });
}

export async function updateMentorMeeting(id, payload) {
  const ref = doc(db, "mentor_meetings", id);
  return await updateDoc(ref, {
    updatedAt: new Date().toISOString(),
    ...payload
  });
}

export async function deleteMentorMeeting(id) {
  const ref = doc(db, "mentor_meetings", id);
  return await deleteDoc(ref);
}

// --- Observations ---

export function listenMentorObservations(filters, callback) {
  return listenCollectionWithFilters("mentor_observations", filters, callback);
}

export async function addMentorObservation(payload) {
  const ref = collection(db, "mentor_observations");
  return await addDoc(ref, {
    createdAt: new Date().toISOString(),
    ...payload
  });
}

export async function updateMentorObservation(id, payload) {
  const ref = doc(db, "mentor_observations", id);
  return await updateDoc(ref, {
    updatedAt: new Date().toISOString(),
    ...payload
  });
}

export async function deleteMentorObservation(id) {
  const ref = doc(db, "mentor_observations", id);
  return await deleteDoc(ref);
}

// --- Parent Interactions ---

export function listenParentInteractions(filters, callback) {
  return listenCollectionWithFilters("parent_interactions", filters, callback);
}

export async function addParentInteraction(payload) {
  const ref = collection(db, "parent_interactions");
  return await addDoc(ref, {
    createdAt: new Date().toISOString(),
    ...payload
  });
}

export async function updateParentInteraction(id, payload) {
  const ref = doc(db, "parent_interactions", id);
  return await updateDoc(ref, {
    updatedAt: new Date().toISOString(),
    ...payload
  });
}

export async function deleteParentInteraction(id) {
  const ref = doc(db, "parent_interactions", id);
  return await deleteDoc(ref);
}

// --- Risk Index ---

export function listenStudentRiskIndex(prog, dept, batch, ay, sem, callback) {
  try {
    const collRef = collection(db, "student_risk_index");
    const q = query(
      collRef,
      where("programme", "==", prog),
      where("department", "==", dept),
      where("batch", "==", batch)
    );
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback(list);
      },
      (err) => {
        console.error("listenStudentRiskIndex error:", err);
        callback([]);
      }
    );
  } catch (e) {
    console.error("listenStudentRiskIndex exception:", e);
    callback([]);
    return () => { };
  }
}

export async function saveStudentRiskIndex(prog, dept, batch, ay, sem, reg, data) {
  const docKey = `${sanitizeKey(prog)}_${sanitizeKey(dept)}_${sanitizeKey(batch)}_${sanitizeKey(ay)}_${sanitizeKey(sem)}_${sanitizeKey(reg)}`;
  const ref = doc(db, "student_risk_index", docKey);
  await setDoc(ref, {
    programme: prog,
    department: dept,
    batch,
    academicYear: ay,
    semester: sem,
    studentReg: reg,
    updatedAt: new Date().toISOString(),
    ...data
  }, { merge: true });
}

// --- Student Growth Index ---

export function listenStudentGrowthIndex(prog, dept, batch, ay, sem, callback) {
  try {
    const collRef = collection(db, "student_growth_index");
    const q = query(
      collRef,
      where("programme", "==", prog),
      where("department", "==", dept),
      where("batch", "==", batch)
    );
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback(list);
      },
      (err) => {
        console.error("listenStudentGrowthIndex error:", err);
        callback([]);
      }
    );
  } catch (e) {
    console.error("listenStudentGrowthIndex exception:", e);
    callback([]);
    return () => { };
  }
}

export async function saveStudentGrowthIndex(prog, dept, batch, ay, sem, reg, data) {
  const docKey = `${sanitizeKey(prog)}_${sanitizeKey(dept)}_${sanitizeKey(batch)}_${sanitizeKey(ay)}_${sanitizeKey(sem)}_${sanitizeKey(reg)}`;
  const ref = doc(db, "student_growth_index", docKey);
  await setDoc(ref, {
    programme: prog,
    department: dept,
    batch,
    academicYear: ay,
    semester: sem,
    studentReg: reg,
    updatedAt: new Date().toISOString(),
    ...data
  }, { merge: true });
}