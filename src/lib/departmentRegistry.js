import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

const STORAGE_KEY = "ckcet_department_registry_cache";

/**
 * In-memory department registry state.
 * Initialized immediately from localStorage if available (0ms cold start),
 * and synced in real-time with Firestore (department_metadata & programme_departments).
 */
let registryState = {
  deptToCode: {},      // normalizedDeptName -> CODE (e.g. "electronicsandcommunication" -> "ECE")
  codeToDept: {},      // normalizedCode -> Primary Display Name (e.g. "ece" -> "Electronics and Communication Engineering")
  allNames: new Set(), // Set of all known department names
  allCodes: new Set(), // Set of all known department codes
  initialized: false
};

// 1. Synchronously load cached registry from localStorage (instant 0ms boot)
try {
  if (typeof window !== "undefined" && window.localStorage) {
    const cached = window.localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed.deptToCode === "object") {
        registryState.deptToCode = parsed.deptToCode || {};
        registryState.codeToDept = parsed.codeToDept || {};
        registryState.allNames = new Set(parsed.allNames || []);
        registryState.allCodes = new Set(parsed.allCodes || []);
      }
    }
  }
} catch {
  // localStorage unavailable or parse error — proceed with empty cache
}

/**
 * Normalize department strings by removing academic degree prefixes,
 * numbers, punctuation, and whitespace for resilient matching.
 */
export function normalizeDept(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .replace(/^(department of\s+|dept of\s+|dept\.?\s+of\s+|be\s+|b\.?e\.?\s+|btech\s+|b\.?tech\.?\s+|me\s+|m\.?e\.?\s+|mtech\s+|m\.?tech\.?\s+|ug\s+|pg\s+|b_e_?|b_tech_?|m_e_?|m_tech_?)/gi, "")
    .replace(/^\d{2,4}\s*[-:_]\s*/, "") // Remove Anna University department code prefixes (e.g. "104 - ")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Dynamically extracts an acronym from any department or programme title.
 * Examples:
 *   "Electronics and Communication Engineering" -> "ece"
 *   "Computer Science and Engineering" -> "cse"
 *   "Artificial Intelligence and Data Science" -> "aids"
 *   "Robotics and Automation" -> "ra"
 *   "Computer Science and Business Systems" -> "csbs"
 */
export function extractAcronym(str) {
  if (!str) return "";
  const cleaned = String(str)
    .toLowerCase()
    .replace(/^(department of\s+|dept of\s+|be\s+|b\.?e\.?\s+|btech\s+|b\.?tech\.?\s+|me\s+|m\.?e\.?\s+|mtech\s+|m\.?tech\.?\s+|ug\s+|pg\s+|b_e_?|b_tech_?|m_e_?|m_tech_?)/gi, "")
    .replace(/^\d{2,4}\s*[-:_]\s*/, "");

  const words = cleaned
    .split(/[\s&/_\-]+/)
    .filter(w => !["and", "&", "of", "for", "the", "dept", "department", "in", "to", "studies"].includes(w) && w.length > 0);

  if (words.length <= 1) return "";
  return words.map(w => w[0]).join("");
}

/**
 * Persist the registry cache to localStorage.
 */
function persistRegistry() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        deptToCode: registryState.deptToCode,
        codeToDept: registryState.codeToDept,
        allNames: Array.from(registryState.allNames),
        allCodes: Array.from(registryState.allCodes)
      }));
    }
  } catch {
    // ignore quota errors
  }
}

/**
 * Register a department name and code pair dynamically.
 */
export function registerDepartmentPair(name, code) {
  if (!name && !code) return;
  const nameStr = String(name || "").trim();
  const codeStr = String(code || "").trim().toUpperCase();

  const normName = normalizeDept(nameStr);
  const normCode = normalizeDept(codeStr);
  const dynamicAcr = extractAcronym(nameStr);

  if (nameStr) registryState.allNames.add(nameStr);
  if (codeStr) registryState.allCodes.add(codeStr);

  if (normName && codeStr) {
    registryState.deptToCode[normName] = codeStr;
  }
  if (dynamicAcr && codeStr) {
    registryState.deptToCode[dynamicAcr] = codeStr;
  }
  if (normCode && nameStr) {
    registryState.codeToDept[normCode] = nameStr;
    registryState.deptToCode[normCode] = codeStr;
  }
}

let listenersStarted = false;

/**
 * Initializes real-time listeners for Firestore's department_metadata and programme_departments.
 * This runs automatically whenever Curriculum.jsx modifies departments/codes.
 */
export function initDepartmentRegistry() {
  if (listenersStarted) return;
  listenersStarted = true;

  try {
    // 1. Listen to department_metadata (stores { [deptName]: deptCode } configured in Curriculum.jsx)
    onSnapshot(collection(db, "department_metadata"), (snapshot) => {
      snapshot.forEach(docSnap => {
        const data = docSnap.data() || {};
        Object.entries(data).forEach(([deptName, deptCode]) => {
          if (deptName && deptCode && typeof deptCode === "string") {
            registerDepartmentPair(deptName, deptCode);
          }
        });
      });
      registryState.initialized = true;
      persistRegistry();
    }, (err) => {
      console.warn("[DepartmentRegistry] department_metadata listener error:", err);
    });

    // 2. Listen to programme_departments (stores list of departments under each programme)
    onSnapshot(collection(db, "programme_departments"), (snapshot) => {
      snapshot.forEach(docSnap => {
        const data = docSnap.data() || {};
        let list = [];
        if (Array.isArray(data.departments)) list = data.departments;
        else if (Array.isArray(data.list)) list = data.list;
        else if (typeof data.departments === "object" && data.departments !== null) list = Object.values(data.departments);

        list.forEach(item => {
          if (typeof item === "string") {
            const match = item.match(/^(\d{3,4})\s*[-:]\s*(.+)$/);
            if (match) {
              registerDepartmentPair(match[2], match[1]);
            } else {
              const acr = extractAcronym(item);
              if (acr) {
                registerDepartmentPair(item, acr.toUpperCase());
              }
            }
          }
        });
      });
      persistRegistry();
    }, (err) => {
      console.warn("[DepartmentRegistry] programme_departments listener error:", err);
    });
  } catch (err) {
    console.warn("[DepartmentRegistry] Failed to initialize listeners:", err);
  }
}

// Auto-initialize when loaded in browser environment
if (typeof window !== "undefined") {
  initDepartmentRegistry();
}

/**
 * Safely extracts the core department string from a composite document ID
 * (e.g. "UG_BE_Electronics_and_Communication_Engineering_2023-2027_2026-2027_7_Sec-A" -> "Electronics and Communication Engineering")
 */
export function extractDeptFromDocId(id) {
  if (!id) return "";
  const parts = String(id).split("_");
  if (parts.length <= 1) return id;
  let endIdx = parts.length;
  if (/^(sec|section)[-_]?[a-z0-9]*$/i.test(parts[endIdx - 1])) endIdx--;
  if (/^\d+$/.test(parts[endIdx - 1])) endIdx--;
  if (/^\d{4}[-_]\d{2,4}$/.test(parts[endIdx - 1])) endIdx--;
  if (/^\d{4}[-_]\d{2,4}$/.test(parts[endIdx - 1])) endIdx--;

  let startIdx = 0;
  if (/^(ug|pg)$/i.test(parts[0])) startIdx++;
  while (startIdx < endIdx && /^(be|btech|me|mtech|b|m|e|tech)$/i.test(parts[startIdx])) {
    startIdx++;
  }
  const extracted = parts.slice(startIdx, endIdx).join(" ").trim();
  return extracted || id;
}

/**
 * Resolves a department name, code, or composite doc ID to its canonical Firestore department code.
 * Matches directly against Firestore's live department_metadata & programme_departments.
 */
export function resolveCanonicalDeptFromFirestore(str) {
  if (!str) return "";
  const actualStr = String(str).includes("_") ? extractDeptFromDocId(str) : String(str);
  const sNorm = normalizeDept(actualStr);
  if (!sNorm) return "";

  // 1. Direct code or name lookup in Firestore registry
  if (registryState.deptToCode[sNorm]) {
    return registryState.deptToCode[sNorm];
  }

  // 2. Acronym lookup in Firestore registry
  const acr = extractAcronym(actualStr);
  if (acr && registryState.deptToCode[acr]) {
    return registryState.deptToCode[acr];
  }

  // 3. Match against known department names from Firestore (longest match first)
  const sortedNames = Array.from(registryState.allNames).sort((a, b) => b.length - a.length);
  for (const knownName of sortedNames) {
    const knownNorm = normalizeDept(knownName);
    if (knownNorm && knownNorm.length >= 4) {
      if (sNorm === knownNorm || sNorm.includes(knownNorm) || knownNorm.includes(sNorm)) {
        return registryState.deptToCode[knownNorm] || extractAcronym(knownName).toUpperCase();
      }
    }
  }

  // 4. Fallback to algorithmic acronym
  return acr ? acr.toUpperCase() : "";
}

/**
 * Returns the resolved department code for any department string.
 * Looks up in the Firestore dynamic registry first, falls back to dynamic acronym.
 */
export function getDepartmentCode(str) {
  return resolveCanonicalDeptFromFirestore(str);
}

/**
 * Universal, Zero-Hardcoded Department Matcher.
 * 
 * 100% Firestore-Driven:
 * Resolves departments dynamically from Curriculum.jsx collections (department_metadata & programme_departments).
 * Supports any current or future department created by administrators without touching code.
 * 
 * @param {string} docDept - Department string from doc ID or record
 * @param {string} targetDept - Target department string to match against
 * @returns {boolean}
 */
export function isDeptMatch(docDept, targetDept) {
  if (!targetDept) return true;
  if (!docDept) return true;

  const actualDocDept = String(docDept).includes("_") ? extractDeptFromDocId(docDept) : docDept;

  const norm1 = normalizeDept(actualDocDept);
  const norm2 = normalizeDept(targetDept);

  // 1. College general Administration staff must never match any academic department
  const isAdmin1 = (norm1 === "administration" || norm1 === "admin") && !norm1.includes("business");
  const isAdmin2 = (norm2 === "administration" || norm2 === "admin") && !norm2.includes("business");
  if (isAdmin1 && !isAdmin2) return false;
  if (isAdmin2 && !isAdmin1) return false;

  // 2. Direct equality of normalized strings
  if (norm1 === norm2) return true;

  // 3. Pure Firestore Database Resolution (Zero Hardcoding)
  // Authoritatively compares canonical codes fetched live from Firestore
  const code1 = resolveCanonicalDeptFromFirestore(docDept);
  const code2 = resolveCanonicalDeptFromFirestore(targetDept);

  if (code1 && code2) {
    return code1.toUpperCase() === code2.toUpperCase();
  }

  // 4. Normalized substring match if long enough
  if (norm1.length >= 6 && norm2.length >= 6) {
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
  }

  // 5. Exact core tokens subset comparison (Zero hardcoded branch words)
  const getTokens = (s) => String(s || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !["engineering", "technology", "department", "dept", "bachelor", "master", "science", "studies", "and", "the", "for"].includes(w));

  const t1 = getTokens(actualDocDept);
  const t2 = getTokens(targetDept);
  if (t1.length > 0 && t2.length > 0) {
    const commonCount = t1.filter(w => t2.includes(w)).length;
    return commonCount === t1.length && commonCount === t2.length;
  }

  return false;
}
