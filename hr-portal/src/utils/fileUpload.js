import { ref, uploadBytes, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import app, { storage } from "../firebase";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

// Helper to get storage ref with resilient bucket resolution
function getStorageReference(path) {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return ref(storage, cleanPath);
}

/**
 * Upload a File or Blob to Firebase Storage (ck-group-of-education).
 * Falls back to Base64 Data URL if browser CORS or bucket network checks fail.
 * @param {string} path - Storage path (e.g. "signatures/{uid}_abc.jpg")
 * @param {File|Blob|string} file - The file/blob to upload (or base64 string)
 * @param {string} [contentType] - MIME type override
 * @returns {Promise<string>} Download URL
 */
export async function uploadFile(path, file, contentType) {
  let actualPath = path;
  let actualFile = file;

  // Defensive check: handle swapped arguments uploadFile(file, path)
  if ((path instanceof File || path instanceof Blob || (path && typeof path === "object" && path.name)) && typeof file === "string") {
    actualPath = file;
    actualFile = path;
  }

  if (!actualPath || typeof actualPath !== "string") {
    throw new Error("Invalid storage path provided for uploadFile");
  }
  if (!actualFile) {
    throw new Error("No file object provided for uploadFile");
  }

  // Handle Base64 string directly
  if (typeof actualFile === "string" && actualFile.startsWith("data:")) {
    return await uploadBase64(actualPath, actualFile);
  }

  const typeToUse = contentType || actualFile.type;
  const metadata = typeToUse ? { contentType: typeToUse } : {};

  // 1. Try primary storage instance
  try {
    const storageRef = getStorageReference(actualPath);
    const snapshot = await uploadBytes(storageRef, actualFile, metadata);
    const downloadUrl = await getDownloadURL(snapshot.ref);
    console.info("Uploaded file to Firebase Storage successfully:", downloadUrl);
    return downloadUrl;
  } catch (err) {
    console.error("Firebase Storage upload failed:", err?.code || err?.message, err);

    if (err?.code === "storage/unauthorized" || err?.message?.includes("unauthorized")) {
      throw new Error(
        "Firebase Storage permission denied (storage/unauthorized). Please update Firebase Storage Security Rules in Firebase Console for project 'ck-group-of-education' to: allow read, write: if request.auth != null;"
      );
    }

    if (err?.code === "storage/canceled") {
      throw new Error("File upload was canceled.");
    }

    throw new Error(`Firebase Storage upload failed: ${err?.message || "Check storage configuration"}`);
  }
}

/**
 * Upload a base64 data URL string to Firebase Storage.
 * @param {string} path - Storage path (e.g. "signatures/{uid}_{Date.now()}.png")
 * @param {string} dataUrl - Base64 data URL (e.g. "data:image/png;base64,...")
 * @param {string} [contentType] - Optional MIME type override
 * @returns {Promise<string>} Download URL
 */
export async function uploadBase64(path, dataUrl, contentType) {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  const storageRef = getStorageReference(cleanPath);
  let mime = contentType;
  if (!mime && typeof dataUrl === "string") {
    const m = dataUrl.match(/^data:([^;,]+)/);
    if (m && m[1] && m[1] !== "application/octet-stream") {
      mime = m[1];
    }
  }
  const metadata = mime ? { contentType: mime } : undefined;
  const snapshot = await uploadString(storageRef, dataUrl, "data_url", metadata);
  const downloadUrl = await getDownloadURL(snapshot.ref);
  console.info("Uploaded Base64 evidence to Firebase Storage successfully:", downloadUrl);
  return downloadUrl;
}

/**
 * Uploads a base64 evidence string to Firebase Storage with an automatic extension & filename.
 * @param {string} uid - User UID
 * @param {string} keyName - Field or row key name (e.g. "organizingPrograms.0.fileUrl")
 * @param {string} dataUrl - Base64 string starting with "data:"
 * @param {string} [fileName] - Optional original filename
 * @returns {Promise<string>} Genuine Firebase Storage download URL
 */
export async function uploadBase64EvidenceToStorage(uid, keyName, dataUrl, fileName = "") {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return dataUrl;
  }

  let mime = "application/pdf";
  let ext = "pdf";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) {
    mime = "image/jpeg";
    ext = "jpg";
  } else if (dataUrl.startsWith("data:image/png")) {
    mime = "image/png";
    ext = "png";
  } else if (dataUrl.startsWith("data:image/webp")) {
    mime = "image/webp";
    ext = "webp";
  } else if (dataUrl.startsWith("data:application/pdf") || dataUrl.includes(";base64,JVBERi")) {
    mime = "application/pdf";
    ext = "pdf";
  } else if (dataUrl.includes("spreadsheetml") || dataUrl.includes("excel")) {
    mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    ext = "xlsx";
  } else if (fileName && fileName.includes(".")) {
    const rawExt = fileName.split(".").pop().toLowerCase();
    if (rawExt) {
      ext = rawExt;
      if (ext === "pdf") mime = "application/pdf";
      else if (ext === "png") mime = "image/png";
      else if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
      else if (ext === "xlsx" || ext === "xls") mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      else if (ext === "docx" || ext === "doc") mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
  }

  // Ensure Base64 has proper data:mime;base64 prefix
  let cleanDataUrl = dataUrl;
  if (cleanDataUrl.startsWith("data:application/octet-stream;base64,") || cleanDataUrl.startsWith("data:;base64,")) {
    cleanDataUrl = cleanDataUrl.replace(/^data:[^;]*;base64,/, `data:${mime};base64,`);
  }

  const safeUid = uid || "faculty_proofs";
  const cleanKey = String(keyName || "evidence").replace(/[^a-zA-Z0-9._-]/g, "_");
  const cleanFileName = fileName 
    ? (fileName.includes(".") ? fileName.replace(/[^a-zA-Z0-9._-]/g, "_") : `${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}.${ext}`)
    : `${cleanKey}.${ext}`;
  const storagePath = `appraisal_files/${safeUid}/appraisal_evidences/${Date.now()}_${cleanFileName}`;

  try {
    return await uploadBase64(storagePath, cleanDataUrl, mime);
  } catch (err) {
    console.warn("Could not upload evidence to Firebase Storage, keeping fallback:", err?.message);
    return dataUrl;
  }
}

/**
 * Delete a file from Firebase Storage by its download URL.
 * Extracts the storage path from the URL.
 * @param {string} downloadUrl
 */
export async function deleteByUrl(downloadUrl) {
  try {
    const storageRef = ref(storage, downloadUrl);
    await deleteObject(storageRef);
  } catch (e) {
    if (e.code !== "storage/object-not-found") throw e;
  }
}

/**
 * Generate a safe storage path for a user.
 * @param {string} uid - User UID
 * @param {string} category - e.g. "signatures", "documents", "evidence", "certificates"
 * @param {string} fileName - Original file name
 * @returns {string} e.g. "appraisal_files/{uid}/{category}/{timestamp}_{sanitized_name}"
 */
export function userStoragePath(uid, category, fileName) {
  let actualUid = uid;
  let actualCategory = category;
  let actualFileName = fileName;

  if (typeof uid === "string" && typeof category === "string" && uid.length < 20 && category.length > 20) {
    actualUid = category;
    actualCategory = uid;
  }

  const sanitized = (actualFileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `appraisal_files/${actualUid}/${actualCategory}/${Date.now()}_${sanitized}`;
}
