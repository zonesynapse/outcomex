import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { uploadBase64EvidenceToStorage } from "./fileUpload";

/**
 * Resolves dot-notation, array index notation, or flat keys inside an evidence map.
 */
export function resolvePath(obj, path) {
  if (!obj || !path) return undefined;

  const extractUrl = (val) => {
    if (!val) return undefined;
    if (typeof val === "string" && (val.startsWith("data:") || val.startsWith("http") || val.startsWith("blob:"))) {
      return val;
    }
    if (typeof val === "object") {
      const u = val.fileUrl || val.url || val.downloadUrl || val.dataUrl || val.src;
      if (typeof u === "string" && (u.startsWith("data:") || u.startsWith("http") || u.startsWith("blob:"))) {
        return u;
      }
    }
    return undefined;
  };

  // 1. Exact match on object key
  const direct = extractUrl(obj[path]);
  if (direct) return direct;

  // 2. Try underscore variation: "organizingPrograms_0_fileUrl"
  const underKey = path.replace(/\./g, "_");
  const under = extractUrl(obj[underKey]);
  if (under) return under;

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
  const fromCur = extractUrl(cur);
  if (fromCur) return fromCur;

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

  // 4. Exact normalized alphanumeric match of full path
  const normTarget = refPath.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [k, v] of Object.entries(map)) {
    const normK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normK === normTarget) {
      if (typeof v === "string" && (v.startsWith("data:") || v.startsWith("http") || v.startsWith("blob:"))) return v;
      if (v && typeof v === "object") {
        const u = v.fileUrl || v.url || v.downloadUrl;
        if (u) return u;
      }
    }
  }

  // 5. Fallback relaxed partial matching on row & field components
  // E.g. target is "onlinecourses.0.fileurl", match key having both "onlinecourses" and "0"
  // Uses token-boundary matching so index "0" never matches inside "10"/"20" (wrong-document bug).
  const ignoredTokens = new Set(["fileurl", "formdata", "file", "url", "downloadurl", "dataurl", "src", "proof"]);
  const parts = refPath.toLowerCase().split(/[._]/).filter(p => p && !ignoredTokens.has(p));
  if (parts.length > 0) {
    const tokenMatch = (lk, p) => lk.split(/[^a-z0-9]+/).includes(p);
    let best = undefined;
    let bestScore = -1;
    for (const [k, v] of Object.entries(map)) {
      const lk = k.toLowerCase();
      if (!parts.every(p => tokenMatch(lk, p))) continue;
      // Prefer the key with the most exact token overlap (avoids cross-row picks)
      const score = lk.split(/[^a-z0-9]+/).filter(t => parts.includes(t)).length;
      if (score > bestScore) {
        const u = typeof v === "string"
          ? (v.startsWith("data:") || v.startsWith("http") || v.startsWith("blob:") ? v : undefined)
          : (v && typeof v === "object" ? (v.fileUrl || v.url || v.downloadUrl) : undefined);
        if (u) {
          best = u;
          bestScore = score;
        }
      }
    }
    if (best) return best;
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
 * Recursively walk an object/array and upload all base64 data URLs to Firebase Storage.
 * Replaces base64 strings directly with genuine Firebase Storage download URLs.
 */
export async function uploadAllBase64EvidencesToStorage(obj, uid, currentPath = "") {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    const newArr = [];
    for (let index = 0; index < obj.length; index++) {
      const item = obj[index];
      const itemPath = currentPath ? `${currentPath}.${index}` : `${index}`;
      newArr.push(await uploadAllBase64EvidencesToStorage(item, uid, itemPath));
    }
    return newArr;
  }

  const result = { ...obj };
  for (const [key, value] of Object.entries(obj)) {
    const propPath = currentPath ? `${currentPath}.${key}` : key;
    if (typeof value === "string" && value.startsWith("data:")) {
      try {
        const fileName = obj.fileName || obj.name || "";
        const storageUrl = await uploadBase64EvidenceToStorage(uid, propPath, value, fileName);
        result[key] = storageUrl;
      } catch (err) {
        console.warn(`Failed to upload ${propPath} to Firebase Storage:`, err);
        result[key] = value;
      }
    } else if (value && typeof value === "object") {
      result[key] = await uploadAllBase64EvidencesToStorage(value, uid, propPath);
    }
  }
  return result;
}

/**
 * Generic helper to save an appraisal document to Firestore.
 * Uploads all attached evidence files to Firebase Storage first, producing permanent HTTPS download URLs.
 * Preserves all previously attached evidences so new saves never wipe out files.
 * Keeps real Firebase Storage URLs in formData and evidences, keeping Firestore docs tiny (<30KB).
 */
export async function saveAppraisalDoc(db, collectionName, docId, rawPayload) {
  const cleanPayload = JSON.parse(
    JSON.stringify(rawPayload, (key, value) => (value === undefined ? null : value))
  );

  const uidToUse = cleanPayload.uid || rawPayload.uid || docId;

  // 1. Upload ALL Base64 evidences in formData directly to Firebase Storage
  if (cleanPayload.formData) {
    cleanPayload.formData = await uploadAllBase64EvidencesToStorage(cleanPayload.formData, uidToUse);
  }

  // 2. Preserve existing evidences from cleanPayload so new saves NEVER overwrite old attachments
  const evidenceMap = {
    ...(cleanPayload.evidences || {}),
    ...(cleanPayload.formData?.evidences || {})
  };

  // 3. Also check localStorage cache for previously saved evidences
  try {
    const cached = localStorage.getItem(`evidences_${docId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      Object.assign(evidenceMap, parsed?.evidences || parsed);
    }
  } catch (e) {}

  // 4. Convert any Base64 strings in evidenceMap to Firebase Storage download URLs
  for (const [k, v] of Object.entries(evidenceMap)) {
    if (typeof v === "string" && v.startsWith("data:")) {
      try {
        const storageUrl = await uploadBase64EvidenceToStorage(uidToUse, k, v);
        evidenceMap[k] = storageUrl;
      } catch (e) {
        console.warn(`Could not upload evidenceMap[${k}] to Storage:`, e);
      }
    }
  }

  // 5. Rehydrate any __EVIDENCE_REF__ markers in formData with real Firebase Storage URLs
  if (cleanPayload.formData && Object.keys(evidenceMap).length > 0) {
    cleanPayload.formData = rehydrateBase64Evidences(cleanPayload.formData, evidenceMap);
  }

  // Cache updated evidenceMap with real Firebase Storage URLs in localStorage
  try {
    localStorage.setItem(`evidences_${docId}`, JSON.stringify(evidenceMap));
    if (uidToUse) {
      localStorage.setItem(`evidences_${uidToUse}`, JSON.stringify(evidenceMap));
    }
  } catch (lsErr) {}

  // Evidences are stored strictly as Firebase Storage URLs in cleanPayload.evidences and formData.
  // No separate Firestore evidence collection is created, keeping Firestore lean and clean.

  // Since all files are genuine Firebase Storage URLs, cleanPayload is tiny (<30KB)
  // Store real URLs directly inside formData and evidences for instantaneous viewing!
  if (Object.keys(evidenceMap).length > 0) {
    cleanPayload.evidences = evidenceMap;
  }

  await setDoc(doc(db, collectionName, docId), cleanPayload);
}

/**
 * Generic helper to load and rehydrate evidence files for an appraisal document.
 * Automatically migrates any legacy Base64 evidence strings to Firebase Storage.
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

  // 2. Query Firestore evidence sub-document strictly for THIS appraisal's sub-collection
  const primaryColl = `${collectionName}_evidences`;
  const ayVariants = (ay) => {
    if (!ay) return [];
    const m = String(ay).match(/(20\d{2})\s*[-/]\s*(\d{2,4})/);
    if (!m) return [String(ay)];
    const start = m[1];
    const endRaw = m[2];
    const end = endRaw.length === 2 ? start.slice(0, 2) + endRaw : endRaw;
    return Array.from(new Set([`${start}-${end}`, `${start}-${end.slice(2)}`, `${start}/${end}`, `${start}/${end.slice(2)}`]));
  };
  const ayList = ayVariants(appraisalData.academicYear);
  const uidBaseIds = [];
  if (appraisalData.uid) {
    uidBaseIds.push(`appraisal_${appraisalData.uid}_${appraisalData.academicYear}`);
    for (const ay of ayList) uidBaseIds.push(`appraisal_${appraisalData.uid}_${ay}`);
    uidBaseIds.push(appraisalData.uid);
  }
  const targetDocIds = Array.from(new Set([
    docId,
    appraisalData.id,
    ...uidBaseIds
  ])).filter(Boolean);

  // Fetch candidate doc ids
  try {
    const fetchPromises = targetDocIds.map(async (cId) => {
      try {
        const snap = await getDoc(doc(db, primaryColl, cId));
        if (snap.exists()) {
          const evidenceData = snap.data();
          if (evidenceData.evidences && typeof evidenceData.evidences === "object") {
            Object.assign(combinedEvidenceMap, evidenceData.evidences);
          }
          Object.entries(evidenceData).forEach(([k, v]) => {
            if (!["docId", "uid", "academicYear", "updatedAt", "id", "evidences"].includes(k)) {
              if (typeof v === "string" && (v.startsWith("data:") || v.startsWith("http") || v.startsWith("blob:"))) {
                combinedEvidenceMap[k] = v;
              } else if (typeof v === "object" && v !== null) {
                const u = v.fileUrl || v.url || v.downloadUrl;
                if (u) combinedEvidenceMap[k] = u;
                else combinedEvidenceMap[k] = v;
              }
            }
          });
        }
      } catch (e) {
        console.warn(`Could not load ${primaryColl}/${cId}:`, e?.message);
      }
    });

    await Promise.race([
      Promise.all(fetchPromises),
      new Promise(resolve => setTimeout(resolve, 4000))
    ]);
  } catch (err) {
    console.warn("Error fetching evidences:", err);
  }

  // 3. Fallback: check localStorage STRICTLY for THIS appraisal/user
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
        }
      }
    } catch (e) {}
  }

  // Rehydrate formData so every __EVIDENCE_REF__ is replaced with actual URL
  let rehydratedFormData = rehydrateBase64Evidences(appraisalData.formData, combinedEvidenceMap);

  // If any evidences are still Base64 strings, auto-upload to Firebase Storage & update Firestore!
  const hasBase64 = JSON.stringify(rehydratedFormData).includes('"data:');
  const uidForStorage = appraisalData.uid || docId;
  if (hasBase64 && uidForStorage) {
    try {
      rehydratedFormData = await uploadAllBase64EvidencesToStorage(rehydratedFormData, uidForStorage);
      for (const [k, v] of Object.entries(combinedEvidenceMap)) {
        if (typeof v === "string" && v.startsWith("data:")) {
          try {
            combinedEvidenceMap[k] = await uploadBase64EvidenceToStorage(uidForStorage, k, v);
          } catch (e) {}
        }
      }
      updateDoc(doc(db, collectionName, docId), {
        formData: rehydratedFormData,
        evidences: combinedEvidenceMap,
        updatedAt: new Date().toISOString()
      }).catch(err => console.warn("Background Storage URL migration update failed:", err));

      const evidenceColl = `${collectionName}_evidences`;
      setDoc(doc(db, evidenceColl, docId), {
        docId,
        uid: uidForStorage,
        academicYear: appraisalData.academicYear || "",
        updatedAt: new Date().toISOString(),
        evidences: combinedEvidenceMap
      }, { merge: true }).catch(err => console.warn("Background Storage URL evidence subcollection migration update failed:", err));
    } catch (e) {
      console.warn("Auto-migration to Storage failed:", e);
    }
  }

  return {
    ...appraisalData,
    formData: rehydratedFormData,
    evidences: combinedEvidenceMap
  };
}

// Aliases for faculty appraisals
export async function saveFacultyAppraisal(db, docId, rawPayload) {
  return saveAppraisalDoc(db, "faculty_appraisals", docId, rawPayload);
}

export async function loadFacultyAppraisalEvidences(db, docId, appraisalData) {
  return loadAppraisalEvidences(db, "faculty_appraisals", docId, appraisalData);
}

/**
 * Detects MIME type and file classification (PDF, Image, Other) from a URL and/or fileName.
 * Handles data URLs (with base64 magic byte sniffing), Firebase Storage URLs, standard URLs, and file names.
 */
export function detectFileTypeAndMime(url, fileName = "") {
  let mime = "";
  let isPdf = false;
  let isImage = false;
  const cleanUrl = typeof url === "string" ? url : "";
  const cleanName = typeof fileName === "string" ? fileName : "";

  // 1. Inspect fileName extension if present
  const nameExtMatch = cleanName.match(/\.([a-zA-Z0-9]+)(\?.*)?$/);
  if (nameExtMatch) {
    const ext = nameExtMatch[1].toLowerCase();
    if (ext === "pdf") {
      mime = "application/pdf";
      isPdf = true;
    } else if (["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp"].includes(ext)) {
      mime = `image/${ext === "jpg" ? "jpeg" : ext === "svg" ? "svg+xml" : ext}`;
      isImage = true;
    }
  }

  // 2. Inspect URL string (Firebase Storage URL path or standard HTTP URL)
  if (!isPdf && !isImage && cleanUrl) {
    try {
      const decodedUrl = decodeURIComponent(cleanUrl.split("?")[0].toLowerCase());
      if (decodedUrl.endsWith(".pdf") || decodedUrl.includes(".pdf")) {
        mime = "application/pdf";
        isPdf = true;
      } else if (/\.(jpg|jpeg|png|webp|gif|svg|bmp)($|\/)/i.test(decodedUrl)) {
        const match = decodedUrl.match(/\.(jpg|jpeg|png|webp|gif|svg|bmp)/i);
        if (match) {
          const ext = match[1].toLowerCase();
          mime = `image/${ext === "jpg" ? "jpeg" : ext === "svg" ? "svg+xml" : ext}`;
          isImage = true;
        }
      }
    } catch (e) {}
  }

  // 3. Inspect Data URL prefix & Base64 Magic Header
  if (cleanUrl.startsWith("data:")) {
    const dataMatch = cleanUrl.match(/^data:([^;,]+)(?:;base64)?,/);
    if (dataMatch && dataMatch[1] && dataMatch[1] !== "application/octet-stream") {
      mime = dataMatch[1].toLowerCase();
      if (mime === "application/pdf") isPdf = true;
      if (mime.startsWith("image/")) isImage = true;
    }

    // Inspect Base64 magic bytes if still undetermined or generic
    if (!isPdf && !isImage) {
      const commaIdx = cleanUrl.indexOf(",");
      if (commaIdx !== -1) {
        const b64Prefix = cleanUrl.slice(commaIdx + 1, commaIdx + 30).trim();
        if (b64Prefix.startsWith("JVBERi")) {
          // %PDF-
          mime = "application/pdf";
          isPdf = true;
        } else if (b64Prefix.startsWith("/9j/")) {
          // JPEG
          mime = "image/jpeg";
          isImage = true;
        } else if (b64Prefix.startsWith("iVBORw0KGgo")) {
          // PNG
          mime = "image/png";
          isImage = true;
        } else if (b64Prefix.startsWith("R0lGOD")) {
          // GIF
          mime = "image/gif";
          isImage = true;
        } else if (b64Prefix.startsWith("UklGR")) {
          // WEBP
          mime = "image/webp";
          isImage = true;
        } else if (b64Prefix.startsWith("PHN2Zy") || b64Prefix.startsWith("PD94bWw")) {
          // SVG
          mime = "image/svg+xml";
          isImage = true;
        }
      }
    }
  }

  // 4. Default fallback: in academic appraisals, attached proofs without image signatures are PDFs
  if (!isPdf && !isImage && cleanUrl) {
    mime = mime || "application/pdf";
    isPdf = true;
  }

  return { mime, isPdf, isImage, fileName: cleanName };
}

/**
 * Converts a Base64 data URL to a Blob URL (e.g. `blob:http://...`).
 * Avoids browser CSP & security blocks that prevent opening or framing `data:` URLs.
 */
export function convertDataUrlToBlobUrl(dataUrl, preferredMime = "") {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return { url: dataUrl, blob: null, mime: preferredMime };
  }

  try {
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx === -1) return { url: dataUrl, blob: null, mime: preferredMime };

    const header = dataUrl.substring(0, commaIdx);
    const b64Data = dataUrl.substring(commaIdx + 1).replace(/\s/g, "");

    let mime = preferredMime;
    if (!mime) {
      const mimeMatch = header.match(/^data:([^;]+);/);
      mime = mimeMatch ? mimeMatch[1] : "";
    }
    if (!mime || mime === "application/octet-stream") {
      if (b64Data.startsWith("JVBERi")) mime = "application/pdf";
      else if (b64Data.startsWith("/9j/")) mime = "image/jpeg";
      else if (b64Data.startsWith("iVBORw0KGgo")) mime = "image/png";
      else if (b64Data.startsWith("R0lGOD")) mime = "image/gif";
      else if (b64Data.startsWith("UklGR")) mime = "image/webp";
      else mime = "application/pdf";
    }

    // Decode base64 in safe chunks to avoid browser call stack overflow on large files
    const byteCharacters = atob(b64Data);
    const sliceSize = 1024;
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }

    const blob = new Blob(byteArrays, { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    return { url: blobUrl, blob, mime };
  } catch (err) {
    console.warn("Base64 to blob conversion failed, using raw data url:", err);
    return { url: dataUrl, blob: null, mime: preferredMime };
  }
}

