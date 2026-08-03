import { ref, uploadBytes, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../firebase";

/**
 * Upload a File or Blob to Firebase Storage.
 * @param {string} path - Storage path (e.g. "signatures/{uid}_abc.jpg")
 * @param {File|Blob} file - The file/blob to upload
 * @param {string} [contentType] - MIME type override
 * @returns {Promise<string>} Download URL
 */
export async function uploadFile(path, file, contentType) {
  const storageRef = ref(storage, path);
  const metadata = contentType ? { contentType } : {};
  const snapshot = await uploadBytes(storageRef, file, metadata);
  return getDownloadURL(snapshot.ref);
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
  const ts = Date.now();
  const safe = (fileName || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .toLowerCase();
  return `${category}/${uid}_${ts}_${safe}`;
}
