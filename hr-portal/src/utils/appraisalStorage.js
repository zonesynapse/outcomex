import { doc, setDoc, getDoc } from "firebase/firestore";

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
function rehydrateBase64Evidences(obj, evidenceMap) {
  if (!obj || typeof obj !== "object" || !evidenceMap) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => rehydrateBase64Evidences(item, evidenceMap));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && value.startsWith("__EVIDENCE_REF__:")) {
      const refPath = value.replace("__EVIDENCE_REF__:", "");
      result[key] = evidenceMap[refPath] || evidenceMap[key] || value;
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
  if (cleanPayload.formData) {
    cleanPayload.formData = extractBase64Evidences(cleanPayload.formData, "", evidenceMap);
  }

  const hasEvidences = Object.keys(evidenceMap).length > 0;
  const evidenceCollection = `${collectionName}_evidences`;

  if (hasEvidences) {
    try {
      await setDoc(doc(db, evidenceCollection, docId), {
        docId,
        updatedAt: new Date().toISOString(),
        evidences: evidenceMap
      });
    } catch (evErr) {
      console.warn(`Failed to write to ${evidenceCollection} collection:`, evErr);
    }
  }

  await setDoc(doc(db, collectionName, docId), cleanPayload);
}

/**
 * Generic helper to load and rehydrate evidence files for an appraisal document.
 */
export async function loadAppraisalEvidences(db, collectionName, docId, appraisalData) {
  if (!appraisalData || !appraisalData.formData) return appraisalData;

  try {
    const evidenceCollection = `${collectionName}_evidences`;
    const evidenceSnap = await getDoc(doc(db, evidenceCollection, docId));
    if (evidenceSnap.exists()) {
      const evidenceData = evidenceSnap.data();
      const evidenceMap = evidenceData.evidences || {};
      const rehydratedFormData = rehydrateBase64Evidences(appraisalData.formData, evidenceMap);
      return {
        ...appraisalData,
        formData: rehydratedFormData
      };
    }
  } catch (err) {
    console.warn(`Could not load ${collectionName}_evidences sub-document:`, err);
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
