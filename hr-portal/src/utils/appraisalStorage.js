import { doc, setDoc, getDoc } from "firebase/firestore";

/**
 * Resolves dot-notation, array index notation, or flat keys inside an evidence map.
 */
export function resolvePath(obj, path) {
  if (!obj || !path) return undefined;

  // 1. Exact match on object key
  if (obj[path] !== undefined && typeof obj[path] === "string" && (obj[path].startsWith("data:") || obj[path].startsWith("http") || obj[path].startsWith("blob:"))) {
    return obj[path];
  }

  // 2. Try underscore variation: "organizingPrograms_0_fileUrl"
  const underKey = path.replace(/\./g, "_");
  if (obj[underKey] !== undefined && typeof obj[underKey] === "string" && (obj[underKey].startsWith("data:") || obj[underKey].startsWith("http") || obj[underKey].startsWith("blob:"))) {
    return obj[underKey];
  }

  // 3. Try nested traversal with dot / bracket notation (e.g. organizingPrograms.0.fileUrl)
  const parts = path.replace(/\[(\w+)\]/g, ".$1").split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) {
      cur = undefined;
      break;
    }
    cur = cur[part];
  }
  if (cur !== undefined && typeof cur === "string" && (cur.startsWith("data:") || cur.startsWith("http") || cur.startsWith("blob:"))) {
    return cur;
  }

  return undefined;
}

/**
 * Robustly search for an evidence string across a map (flat, nested, or inner `.evidences`).
 */
export function findEvidenceInMap(map, refPath) {
  if (!map || typeof map !== "object" || !refPath) return undefined;

  // 1. Direct path / nested resolution
  const direct = resolvePath(map, refPath);
  if (direct) return direct;

  // 2. If map contains an inner .evidences container, search inside it
  if (map.evidences && typeof map.evidences === "object") {
    const fromInner = findEvidenceInMap(map.evidences, refPath);
    if (fromInner) return fromInner;
  }

  // 3. Prefix matching: strip leading "formData." or add "formData."
  if (refPath.startsWith("formData.")) {
    const stripped = refPath.replace(/^formData\./, "");
    const fromStripped = resolvePath(map, stripped) || (map.evidences && resolvePath(map.evidences, stripped));
    if (fromStripped) return fromStripped;
  } else {
    const withFormData = `formData.${refPath}`;
    const fromWithFormData = resolvePath(map, withFormData) || (map.evidences && resolvePath(map.evidences, withFormData));
    if (fromWithFormData) return fromWithFormData;
  }

  // 4. Exact normalized alphanumeric match of full path (strictly equal, never substring)
  const normTarget = refPath.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "string" && (v.startsWith("data:") || v.startsWith("http") || v.startsWith("blob:"))) {
      const normK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normK === normTarget) {
        return v;
      }
    }
  }

  return undefined;
}

/**
 * Recursively walk an object/array and extract base64 data URLs into an evidence map.
 * Replaces base64 strings with marker strings `__EVIDENCE_REF__:<pathKey>`.
 */
function extractBase64Evidences(obj, currentPath = "", evidenceMap = {}) {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item, index) =>
      extractBase64Evidences(item, currentPath ? `${currentPath}.${index}` : `${index}`, evidenceMap)
    );
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const propPath = currentPath ? `${currentPath}.${key}` : key;
    if (typeof value === "string" && value.startsWith("data:")) {
      // Base64 string found — extract it
      evidenceMap[propPath] = value;
      result[key] = `__EVIDENCE_REF__:${propPath}`;
    } else if (value && typeof value === "object") {
      result[key] = extractBase64Evidences(value, propPath, evidenceMap);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Recursively walk an object/array and rehydrate `__EVIDENCE_REF__:<pathKey>` markers with base64 strings.
 */
export function rehydrateBase64Evidences(obj, evidenceMap) {
  if (!obj || typeof obj !== "object" || !evidenceMap) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => rehydrateBase64Evidences(item, evidenceMap));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && value.startsWith("__EVIDENCE_REF__:")) {
      const refPath = value.replace("__EVIDENCE_REF__:", "");
      const resolved = findEvidenceInMap(evidenceMap, refPath);
      result[key] = resolved || value;
    } else if (value && typeof value === "object") {
      result[key] = rehydrateBase64Evidences(value, evidenceMap);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Generic helper to save an appraisal document to Firestore.
 * Offloads heavy base64 data URLs to a separate evidence document (`<collectionName>_evidences`)
 * to prevent exceeding Firestore's 1 MB per document limit.
 */
export async function saveAppraisalDoc(db, collectionName, docId, rawPayload) {
  const cleanPayload = JSON.parse(
    JSON.stringify(rawPayload, (key, value) => (value === undefined ? null : value))
  );

  const evidenceMap = {};
  let extractedFormData = null;
  if (cleanPayload.formData) {
    extractedFormData = extractBase64Evidences(cleanPayload.formData, "", evidenceMap);
  }

  const hasEvidences = Object.keys(evidenceMap).length > 0;
  const evidenceCollection = `${collectionName}_evidences`;

  if (hasEvidences) {
    // 1. Resilient offline/client localStorage caching
    try {
      localStorage.setItem(`evidences_${docId}`, JSON.stringify(evidenceMap));
      if (rawPayload.uid) {
        localStorage.setItem(`evidences_${rawPayload.uid}`, JSON.stringify(evidenceMap));
      }
    } catch (lsErr) {
      console.warn("Could not cache evidences in localStorage:", lsErr);
    }

    // 2. Persist to Firestore evidence sub-document
    let savedToEvidenceColl = false;
    try {
      await setDoc(doc(db, evidenceCollection, docId), {
        docId,
        uid: rawPayload.uid || "",
        academicYear: rawPayload.academicYear || "",
        updatedAt: new Date().toISOString(),
        evidences: evidenceMap
      });
      savedToEvidenceColl = true;
    } catch (evErr) {
      console.warn(`Failed to write to ${evidenceCollection} collection:`, evErr);
    }

    // 3. Always embed evidences in the primary document when within size limits (<850KB)
    // so any reviewer on any computer receives proofs instantly without sub-document latency.
    cleanPayload.formData = extractedFormData;
    const testPayload = { ...cleanPayload, evidences: evidenceMap };
    const payloadSize = JSON.stringify(testPayload).length;
    if (payloadSize < 850 * 1024) {
      cleanPayload.evidences = evidenceMap;
    }
  }

  await setDoc(doc(db, collectionName, docId), cleanPayload);
}

/**
 * Generic helper to load and rehydrate evidence files for an appraisal document.
 */
export async function loadAppraisalEvidences(db, collectionName, docId, appraisalData) {
  if (!appraisalData || !appraisalData.formData) return appraisalData;

  const combinedEvidenceMap = {};

  // 1. Check if evidence data is already embedded in the appraisal itself
  if (appraisalData.evidences && typeof appraisalData.evidences === "object") {
    Object.assign(combinedEvidenceMap, appraisalData.evidences);
  }
  if (appraisalData.formData?.evidences && typeof appraisalData.formData.evidences === "object") {
    Object.assign(combinedEvidenceMap, appraisalData.formData.evidences);
  }

  // 2. Query Firestore evidence sub-document across candidate keys strictly for THIS appraisal
  const primaryColl = `${collectionName}_evidences`;
  const allColls = Array.from(new Set([
    primaryColl,
    "faculty_appraisals_evidences",
    "teacher_appraisals_evidences",
    "non_teaching_appraisals_evidences",
    "hod_appraisals_evidences"
  ]));

  const candidateDocIds = Array.from(new Set([
    docId,
    appraisalData.id,
    appraisalData.docId,
    appraisalData.uid ? `appraisal_${appraisalData.uid}_${appraisalData.academicYear}` : null,
    appraisalData.formData?.uid ? `appraisal_${appraisalData.formData.uid}_${appraisalData.academicYear}` : null,
    appraisalData.uid ? `appraisal_${appraisalData.uid}_2024-2025` : null,
    appraisalData.uid ? `appraisal_${appraisalData.uid}_2025-2026` : null,
    appraisalData.uid ? `appraisal_${appraisalData.uid}_2024-25` : null,
    appraisalData.uid ? `appraisal_${appraisalData.uid}_2025-26` : null,
    appraisalData.uid ? `appraisal_${appraisalData.uid}` : null,
    appraisalData.uid || null
  ])).filter(Boolean);

  for (const collName of allColls) {
    if (Object.keys(combinedEvidenceMap).length > 0) break;
    for (const cId of candidateDocIds) {
      try {
        const evidenceSnap = await getDoc(doc(db, collName, cId));
        if (evidenceSnap.exists()) {
          const evidenceData = evidenceSnap.data();
          if (evidenceData.evidences && typeof evidenceData.evidences === "object") {
            Object.assign(combinedEvidenceMap, evidenceData.evidences);
          }
          Object.entries(evidenceData).forEach(([k, v]) => {
            if (!["docId", "uid", "academicYear", "updatedAt", "id", "evidences"].includes(k)) {
              if (typeof v === "string" && (v.startsWith("data:") || v.startsWith("http") || v.startsWith("blob:"))) {
                combinedEvidenceMap[k] = v;
              } else if (typeof v === "object" && v !== null) {
                combinedEvidenceMap[k] = v;
              }
            }
          });
          if (Object.keys(combinedEvidenceMap).length > 0) break;
        }
      } catch (err) {
        console.warn(`Could not load ${collName}/${cId}:`, err);
      }
    }
  }

  // 3. Fallback: check localStorage STRICTLY for THIS appraisal/user (NEVER blindly iterate other users' caches)
  if (Object.keys(combinedEvidenceMap).length === 0) {
    const localKeys = Array.from(new Set([
      `evidences_${docId}`,
      appraisalData.id ? `evidences_${appraisalData.id}` : null,
      appraisalData.uid ? `evidences_${appraisalData.uid}` : null,
      appraisalData.uid ? `evidences_${appraisalData.uid}_${appraisalData.academicYear}` : null,
      `appraisal_evidences_${docId}`,
      appraisalData.id ? `appraisal_evidences_${appraisalData.id}` : null,
      appraisalData.uid ? `appraisal_evidences_${appraisalData.uid}` : null
    ])).filter(Boolean);

    for (const lk of localKeys) {
      try {
        const raw = localStorage.getItem(lk);
        if (raw) {
          const item = JSON.parse(raw);
          if (item && typeof item === "object") {
            Object.assign(combinedEvidenceMap, item.evidences || item);
            if (Object.keys(combinedEvidenceMap).length > 0) break;
          }
        }
      } catch (e) {}
    }
  }

  if (Object.keys(combinedEvidenceMap).length > 0) {
    const rehydratedFormData = rehydrateBase64Evidences(appraisalData.formData, combinedEvidenceMap);
    return {
      ...appraisalData,
      formData: rehydratedFormData,
      evidences: combinedEvidenceMap
    };
  }

  return appraisalData;
}

// Aliases for faculty appraisals
export async function saveFacultyAppraisal(db, docId, rawPayload) {
  return saveAppraisalDoc(db, "faculty_appraisals", docId, rawPayload);
}

export async function loadFacultyAppraisalEvidences(db, docId, appraisalData) {
  return loadAppraisalEvidences(db, "faculty_appraisals", docId, appraisalData);
}
