import { ref, uploadBytes, uploadString, getDownloadURL, deleteObject, getStorage } from "firebase/storage";
import app, { storage } from "../firebase";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a File or Blob to Firebase Storage with multi-bucket fallback & Base64 fallback.
 * @param {string} path - Storage path (e.g. "signatures/{uid}_abc.jpg")
 * @param {File|Blob} file - The file/blob to upload
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

  const typeToUse = contentType || actualFile.type;
  const metadata = typeToUse ? { contentType: typeToUse } : {};

  // 1. Try primary storage instance
  try {
    const storageRef = ref(storage, actualPath);
    const snapshot = await uploadBytes(storageRef, actualFile, metadata);
    return await getDownloadURL(snapshot.ref);
  } catch (err) {
    console.warn("Primary Firebase Storage upload attempt failed:", err?.code || err?.message, err);

    // 2. Try alternative bucket domains (.appspot.com <-> .firebasestorage.app)
    if (err?.code === "storage/unknown" || err?.code === "storage/bucket-not-found" || err?.code === "storage/object-not-found") {
      try {
        const projId = app?.options?.projectId || "co-po-ckcet";
        const altBucket1 = `${projId}.appspot.com`;
        const altBucket2 = `${projId}.firebasestorage.app`;
        const currentBucket = app?.options?.storageBucket || "";
        const targetBucket = currentBucket.includes("firebasestorage.app") ? altBucket1 : altBucket2;

        const altStorage = getStorage(app, `gs://${targetBucket}`);
        const altRef = ref(altStorage, actualPath);
        const snapshot = await uploadBytes(altRef, actualFile, metadata);
        return await getDownloadURL(snapshot.ref);
      } catch (altErr) {
        console.warn("Alternative bucket upload failed:", altErr?.code || altErr?.message, altErr);
      }
    }

    // 3. Fallback to Base64 Data URL for files <= 2MB so upload process never blocks user
    if (actualFile && typeof FileReader !== "undefined" && actualFile.size <= 2 * 1024 * 1024) {
      try {
        console.info("Using Base64 Data URL fallback for evidence attachment");
        return await fileToBase64(actualFile);
      } catch (b64Err) {
        console.error("Base64 fallback failed:", b64Err);
      }
    }

    throw err;
  }
}

/**
 * Upload a base64 data URL string to Firebase Storage.
 * @param {string} path - Storage path (e.g. "signatures/{uid}_{Date.now()}.png")
 * @param {string} dataUrl - Base64 data URL (e.g. "data:image/png;base64,...")
 * @returns {Promise<string>} Download URL
 */
export async function uploadBase64(path, dataUrl) {
  const storageRef = ref(storage, path);
  const snapshot = await uploadString(storageRef, dataUrl, "data_url");
  return getDownloadURL(snapshot.ref);
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
 * @returns {string} e.g. "signatures/{uid}_{timestamp}_{sanitized_name}"
 */
export function userStoragePath(uid, category, fileName) {
  let actualUid = uid;
  let actualCategory = category;
  let actualFileName = fileName;

  if (typeof uid === "string" && typeof category === "string" && uid.length < 20 && category.length > 20) {
    actualUid = category;
    actualCategory = uid;
  }

  const ts = Date.now();
  const safe = (actualFileName || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .toLowerCase();
  return `${actualCategory}/${actualUid}_${ts}_${safe}`;
}
