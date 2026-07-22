import { db } from "../firebase";
import {
  doc, setDoc, getDoc, getDocs, deleteDoc,
  collection, onSnapshot, query, where, orderBy, limit,
  serverTimestamp, writeBatch
} from "firebase/firestore";

// ─── Helpers ────────────────────────────────────────────────────────────────────
const sanitizeKey = (key) => String(key || '').replace(/[.#$[\]/ ]/g, '_');

const compositeKey = (prog, dept, batch, ay, sem, section) => {
  const base = `${sanitizeKey(prog)}_${sanitizeKey(dept)}_${sanitizeKey(batch)}_${sanitizeKey(ay)}_${sem}`;
  return section ? `${base}_${sanitizeKey(section)}` : base;
};

// ─── Mentor Allocation ──────────────────────────────────────────────────────────
// Collection: mentor_allocation
// Doc ID: {progKey}_{deptKey}_{batch}_{ay}_{sem}[_Sec-{section}]
// Data: { mentors: { uid: { name, students: ["reg1","reg2"] } }, students: { reg: { mentorUid, mentorName } } }

export function listenMentorAllocation(prog, dept, batch, ay, sem, section, callback) {
  const docId = compositeKey(prog, dept, batch, ay, sem, section);
  return onSnapshot(doc(db, "mentor_allocation", docId), (snap) => {
    callback(snap.exists() ? snap.data() : { mentors: {}, students: {} });
  });
}

export async function saveMentorAllocation(prog, dept, batch, ay, sem, section, data) {
  const docId = compositeKey(prog, dept, batch, ay, sem, section);
  await setDoc(doc(db, "mentor_allocation", docId), {
    ...data,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function getMentorAllocation(prog, dept, batch, ay, sem, section) {
  const docId = compositeKey(prog, dept, batch, ay, sem, section);
  const snap = await getDoc(doc(db, "mentor_allocation", docId));
  return snap.exists() ? snap.data() : { mentors: {}, students: {} };
}

// ─── Mentor Meetings ────────────────────────────────────────────────────────────
// Collection: mentor_meetings
// Doc ID: auto-generated
// Data: { mentorUid, mentorName, type, studentReg, studentName, programme, department, batch, ay, sem, date, topic, notes, actionItems, status }

export function listenMentorMeetings(filters, callback) {
  let q = collection(db, "mentor_meetings");
  const constraints = [orderBy("date", "desc"), limit(filters.maxLimit || 500)];
  q = query(q, ...constraints);
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const filtered = all.filter(d => {
      if (filters.mentorUid && d.mentorUid !== filters.mentorUid) return false;
      if (filters.programme && d.programme !== filters.programme) return false;
      if (filters.department && d.department !== filters.department) return false;
      if (filters.batch && d.batch !== filters.batch) return false;
      if (filters.type && d.type !== filters.type) return false;
      return true;
    });
    callback(filtered);
  });
}

export async function addMentorMeeting(data) {
  const ref = doc(collection(db, "mentor_meetings"));
  await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateMentorMeeting(id, data) {
  await setDoc(doc(db, "mentor_meetings", id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteMentorMeeting(id) {
  await deleteDoc(doc(db, "mentor_meetings", id));
}

// ─── Mentor Observations ────────────────────────────────────────────────────────
// Collection: mentor_observations
// Doc ID: auto-generated
// Data: { mentorUid, mentorName, studentReg, studentName, programme, department, batch, category, severity, notes, date }

export function listenMentorObservations(filters, callback) {
  let q = collection(db, "mentor_observations");
  const constraints = [orderBy("date", "desc"), limit(filters.maxLimit || 500)];
  q = query(q, ...constraints);
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const filtered = all.filter(d => {
      if (filters.mentorUid && d.mentorUid !== filters.mentorUid) return false;
      if (filters.studentReg && d.studentReg !== filters.studentReg) return false;
      if (filters.programme && d.programme !== filters.programme) return false;
      if (filters.department && d.department !== filters.department) return false;
      if (filters.batch && d.batch !== filters.batch) return false;
      if (filters.severity && d.severity !== filters.severity) return false;
      return true;
    });
    callback(filtered);
  });
}

export async function addMentorObservation(data) {
  const ref = doc(collection(db, "mentor_observations"));
  await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateMentorObservation(id, data) {
  await setDoc(doc(db, "mentor_observations", id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteMentorObservation(id) {
  await deleteDoc(doc(db, "mentor_observations", id));
}

// ─── Parent Interactions ────────────────────────────────────────────────────────
// Collection: parent_interactions
// Doc ID: auto-generated
// Data: { mentorUid, studentReg, studentName, programme, department, batch, parentName, parentMobile, interactionType, date, notes, followUp }

export function listenParentInteractions(filters, callback) {
  let q = collection(db, "parent_interactions");
  const constraints = [orderBy("date", "desc"), limit(filters.maxLimit || 500)];
  q = query(q, ...constraints);
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const filtered = all.filter(d => {
      if (filters.mentorUid && d.mentorUid !== filters.mentorUid) return false;
      if (filters.studentReg && d.studentReg !== filters.studentReg) return false;
      if (filters.programme && d.programme !== filters.programme) return false;
      if (filters.department && d.department !== filters.department) return false;
      if (filters.batch && d.batch !== filters.batch) return false;
      return true;
    });
    callback(filtered);
  });
}

export async function addParentInteraction(data) {
  const ref = doc(collection(db, "parent_interactions"));
  await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateParentInteraction(id, data) {
  await setDoc(doc(db, "parent_interactions", id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteParentInteraction(id) {
  await deleteDoc(doc(db, "parent_interactions", id));
}

// ─── Student Risk Index ─────────────────────────────────────────────────────────
// Collection: student_risk_index
// Doc ID: {progKey}_{deptKey}_{batch}_{ay}_{sem}_{regNo}
// Data: { riskLevel, factors, assessedAt, mentorUid }

export async function saveStudentRiskIndex(prog, dept, batch, ay, sem, regNo, data) {
  const docId = `${compositeKey(prog, dept, batch, ay, sem)}_${sanitizeKey(regNo)}`;
  await setDoc(doc(db, "student_risk_index", docId), {
    ...data,
    assessedAt: serverTimestamp()
  }, { merge: true });
}

export async function getStudentRiskIndex(prog, dept, batch, ay, sem, regNo) {
  const docId = `${compositeKey(prog, dept, batch, ay, sem)}_${sanitizeKey(regNo)}`;
  const snap = await getDoc(doc(db, "student_risk_index", docId));
  return snap.exists() ? snap.data() : null;
}

export function listenStudentRiskIndex(prog, dept, batch, ay, sem, callback) {
  const prefix = compositeKey(prog, dept, batch, ay, sem);
  const q = query(collection(db, "student_risk_index"), where("__name__", ">=", prefix), where("__name__", "<", prefix + "\uf8ff"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─── Student Growth Index ───────────────────────────────────────────────────────
// Collection: student_growth_index
// Doc ID: {progKey}_{deptKey}_{batch}_{ay}_{sem}_{regNo}
// Data: { academicPerformance, attendance, feeRegularity, cocurricular, extracurricular, placementReadiness, mentorAssessment, certifications, totalSGI, calculatedAt }

export async function saveStudentGrowthIndex(prog, dept, batch, ay, sem, regNo, data) {
  const docId = `${compositeKey(prog, dept, batch, ay, sem)}_${sanitizeKey(regNo)}`;
  await setDoc(doc(db, "student_growth_index", docId), {
    ...data,
    calculatedAt: serverTimestamp()
  }, { merge: true });
}

export async function getStudentGrowthIndex(prog, dept, batch, ay, sem, regNo) {
  const docId = `${compositeKey(prog, dept, batch, ay, sem)}_${sanitizeKey(regNo)}`;
  const snap = await getDoc(doc(db, "student_growth_index", docId));
  return snap.exists() ? snap.data() : null;
}

export function listenStudentGrowthIndex(prog, dept, batch, ay, sem, callback) {
  const prefix = compositeKey(prog, dept, batch, ay, sem);
  const q = query(collection(db, "student_growth_index"), where("__name__", ">=", prefix), where("__name__", "<", prefix + "\uf8ff"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─── Co-curricular Activities ───────────────────────────────────────────────────
// Collection: student_cocurricular
// Doc ID: auto-generated
// Data: { studentReg, studentName, programme, department, batch, activityType, title, date, description, evidence, mentorUid }

export function listenCocurricularActivities(filters, callback) {
  let q = collection(db, "student_cocurricular");
  const constraints = [];
  if (filters.studentReg) constraints.push(where("studentReg", "==", filters.studentReg));
  if (filters.programme) constraints.push(where("programme", "==", filters.programme));
  if (filters.department) constraints.push(where("department", "==", filters.department));
  if (filters.batch) constraints.push(where("batch", "==", filters.batch));
  constraints.push(orderBy("date", "desc"));
  q = query(q, ...constraints);
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function addCocurricularActivity(data) {
  const ref = doc(collection(db, "student_cocurricular"));
  await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

// ─── Extra-curricular Activities ────────────────────────────────────────────────
// Collection: student_extracurricular
// Doc ID: auto-generated
// Data: { studentReg, studentName, programme, department, batch, activityType, title, date, description, evidence, mentorUid }

export function listenExtracurricularActivities(filters, callback) {
  let q = collection(db, "student_extracurricular");
  const constraints = [];
  if (filters.studentReg) constraints.push(where("studentReg", "==", filters.studentReg));
  if (filters.programme) constraints.push(where("programme", "==", filters.programme));
  if (filters.department) constraints.push(where("department", "==", filters.department));
  if (filters.batch) constraints.push(where("batch", "==", filters.batch));
  constraints.push(orderBy("date", "desc"));
  q = query(q, ...constraints);
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function addExtracurricularActivity(data) {
  const ref = doc(collection(db, "student_extracurricular"));
  await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  return ref.id;
}
