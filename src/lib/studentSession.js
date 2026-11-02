import { doc, getDoc, getDocs, collection, query, where, documentId } from "firebase/firestore";
import { sanitizeKey, cleanStudentId } from "./utils";

const MEMORY_CACHE = {
  profile: null,
  syllabus: {},
  regulations: {},
  facultyNames: {},
  studentIndex: {}
};

/**
 * Returns cached student user data from memory or sessionStorage for instant 0ms mount.
 */
export function getCachedStudentProfile(uid) {
  if (MEMORY_CACHE.profile && (!uid || MEMORY_CACHE.profile.uid === uid)) {
    return MEMORY_CACHE.profile;
  }
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      const stored = window.sessionStorage.getItem(uid ? `ckcet_student_${uid}` : "ckcet_student_profile");
      if (stored) {
        const parsed = JSON.parse(stored);
        MEMORY_CACHE.profile = parsed;
        return parsed;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Persists student profile to memory and sessionStorage.
 */
export function setCachedStudentProfile(uid, data) {
  if (!data) return;
  const enriched = { ...data, uid: uid || data.uid };
  MEMORY_CACHE.profile = enriched;
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      window.sessionStorage.setItem("ckcet_student_profile", JSON.stringify(enriched));
      if (uid) window.sessionStorage.setItem(`ckcet_student_${uid}`, JSON.stringify(enriched));
    } catch {
      // ignore
    }
  }
}

/**
 * Resolves student canonical ID & section from student_index with session caching.
 */
export async function getCachedStudentIndex(db, studentKey) {
  if (!studentKey) return null;
  const cleanKey = sanitizeKey(studentKey);
  if (MEMORY_CACHE.studentIndex[cleanKey]) {
    return MEMORY_CACHE.studentIndex[cleanKey];
  }
  try {
    const snap = await getDoc(doc(db, "student_index", cleanKey));
    if (snap.exists()) {
      const data = snap.data();
      MEMORY_CACHE.studentIndex[cleanKey] = data;
      return data;
    }
  } catch (err) {
    console.debug("[StudentSession] student_index fetch error:", err);
  }
  return null;
}

/**
 * High-performance scoped attendance fetcher:
 * Queries Firestore using documentId range on the student's batch prefix.
 * Downloads ONLY the 10-25 docs belonging to this batch, not all 50,000 college docs!
 * Falls back to full collection only if prefix query returns empty.
 */
export async function fetchScopedAttendanceDocs(db, { progKey, deptKey, batchKey }) {
  if (!progKey || !deptKey || !batchKey) {
    return getDocs(collection(db, "attendance"));
  }

  const primaryPrefix = `${progKey}_${deptKey}_${batchKey}`;
  const prefixes = [primaryPrefix];

  // Also try non-BE or BE variations if department prefix differs
  if (deptKey.startsWith("BE_")) {
    prefixes.push(`${progKey}_${deptKey.replace(/^BE_/, "")}_${batchKey}`);
  } else {
    prefixes.push(`${progKey}_BE_${deptKey}_${batchKey}`);
  }

  try {
    for (const prefix of prefixes) {
      const q = query(
        collection(db, "attendance"),
        where(documentId(), ">=", prefix),
        where(documentId(), "<=", `${prefix}\uf8ff`)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap;
      }
    }
  } catch (err) {
    console.warn("[StudentSession] Scoped attendance query failed, falling back:", err);
  }

  // Safety fallback: returns full collection if prefix query is empty or failed
  return getDocs(collection(db, "attendance"));
}

/**
 * High-performance scoped timetable allocations fetcher:
 * Queries by prefix matching the student's programme, department, and batch.
 */
export async function fetchScopedTimetableDocs(db, { progKey, deptKey, batchKey }) {
  if (!progKey || !deptKey || !batchKey) {
    return getDocs(collection(db, "timetable_allocations")).catch(() => null);
  }

  const prefix = `${progKey}_${deptKey}_${batchKey}`;
  try {
    const q = query(
      collection(db, "timetable_allocations"),
      where(documentId(), ">=", prefix),
      where(documentId(), "<=", `${prefix}\uf8ff`)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap;
    }
  } catch (err) {
    console.debug("[StudentSession] Scoped timetable fetch failed, falling back:", err);
  }

  return getDocs(collection(db, "timetable_allocations")).catch(() => null);
}

/**
 * High-performance scoped subject assignments fetcher:
 * Queries by prefix matching the student's programme, department, and batch.
 */
export async function fetchScopedAssignmentDocs(db, { progKey, deptKey, batchKey }) {
  if (!progKey || !deptKey || !batchKey) {
    return getDocs(collection(db, "subject_assignments")).catch(() => null);
  }

  const prefix = `${progKey}_${deptKey}_${batchKey}`;
  try {
    const q = query(
      collection(db, "subject_assignments"),
      where(documentId(), ">=", prefix),
      where(documentId(), "<=", `${prefix}\uf8ff`)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap;
    }
  } catch (err) {
    console.debug("[StudentSession] Scoped assignment fetch failed, falling back:", err);
  }

  return getDocs(collection(db, "subject_assignments")).catch(() => null);
}

/**
 * High-performance scoped marks fetcher:
 * Queries marks by prefix matching programme, department, and batch.
 */
export async function fetchScopedMarksDocs(db, { progKey, deptKey, batchKey }) {
  if (!progKey || !deptKey || !batchKey) {
    return getDocs(collection(db, "marks"));
  }

  const primaryPrefix = `${progKey}_${deptKey}_${batchKey}`;
  const prefixes = [primaryPrefix];

  if (deptKey.startsWith("BE_")) {
    prefixes.push(`${progKey}_${deptKey.replace(/^BE_/, "")}_${batchKey}`);
  } else {
    prefixes.push(`${progKey}_BE_${deptKey}_${batchKey}`);
  }

  try {
    for (const prefix of prefixes) {
      const q = query(
        collection(db, "marks"),
        where(documentId(), ">=", prefix),
        where(documentId(), "<=", `${prefix}\uf8ff`)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap;
      }
    }
  } catch (err) {
    console.debug("[StudentSession] Scoped marks fetch failed, falling back:", err);
  }

  return getDocs(collection(db, "marks"));
}

/**
 * Targeted Faculty Name Resolver:
 * Resolves only the specific 5-10 faculty members assigned to this student's courses.
 * NEVER downloads all thousands of users across the entire college.
 */
export async function fetchTargetedFacultyNames(db, facultyUids) {
  const result = { ...MEMORY_CACHE.facultyNames };
  const missingUids = Array.from(new Set(facultyUids.filter(Boolean))).filter(uid => !result[uid]);

  if (missingUids.length === 0) {
    return result;
  }

  try {
    const docs = await Promise.all(
      missingUids.map(uid => getDoc(doc(db, "users", uid)).catch(() => null))
    );
    docs.forEach(d => {
      if (d && d.exists()) {
        const u = d.data() || {};
        const name = u.facultyName || u.displayName || u.name || u.email || "";
        result[d.id] = name;
        MEMORY_CACHE.facultyNames[d.id] = name;
      }
    });
  } catch (err) {
    console.warn("[StudentSession] Failed to fetch targeted faculty names:", err);
  }

  return result;
}

/**
 * Cached Syllabus fetcher.
 */
export async function getCachedSyllabus(db, progKey, deptKey, regulation) {
  const key = `${progKey}_${deptKey}_${sanitizeKey(regulation)}`;
  if (MEMORY_CACHE.syllabus[key]) {
    return MEMORY_CACHE.syllabus[key];
  }
  try {
    const snap = await getDoc(doc(db, "syllabus_data", key));
    if (snap.exists()) {
      const data = snap.data();
      MEMORY_CACHE.syllabus[key] = data;
      return data;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Cached Regulation fetcher.
 */
export async function getCachedRegulation(db, progKey, batch) {
  if (MEMORY_CACHE.regulations[progKey]) {
    const regData = MEMORY_CACHE.regulations[progKey];
    return regData[batch] || regData[Object.keys(regData)[0]] || "";
  }
  try {
    const snap = await getDoc(doc(db, "batch_regulations", progKey));
    if (snap.exists()) {
      const regData = snap.data();
      MEMORY_CACHE.regulations[progKey] = regData;
      return regData[batch] || regData[Object.keys(regData)[0]] || "";
    }
  } catch {
    // ignore
  }
  return "";
}
