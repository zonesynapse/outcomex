/**
 * Utility to convert cloud document links (OneDrive, SharePoint, Google Drive, Dropbox)
 * into clean, in-app embeddable preview URLs for iframes.
 *
 * This ensures that when external setters or reviewers view Syllabus / Question Banks,
 * they only see the clean embedded document without exposing raw URLs or cloud UI bars.
 */

export function getEmbeddableDocumentUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  // 1. SharePoint / OneDrive for Business (e.g., https://ckcet-my.sharepoint.com/:b:/g/personal/...)
  if (trimmed.includes("sharepoint.com") || trimmed.includes("-my.sharepoint.com")) {
    try {
      const urlObj = new URL(trimmed);
      urlObj.searchParams.delete("download");
      urlObj.searchParams.set("action", "embedview");
      return urlObj.toString();
    } catch {
      const separator = trimmed.includes("?") ? "&" : "?";
      return `${trimmed}${separator}action=embedview`;
    }
  }

  // 2. Personal OneDrive (e.g., https://1drv.ms/b/... or https://onedrive.live.com/...)
  if (trimmed.includes("1drv.ms") || trimmed.includes("onedrive.live.com")) {
    if (trimmed.includes("/embed?") || trimmed.includes("action=embedview")) {
      return trimmed;
    }
    try {
      // Microsoft Graph shares endpoint accepts standard URL-safe base64
      const base64Url = btoa(unescape(encodeURIComponent(trimmed)))
        .replace(/=/g, "")
        .replace(/\//g, "_")
        .replace(/\+/g, "-");
      return `https://api.onedrive.com/v1.0/shares/u!${base64Url}/root/content`;
    } catch {
      return trimmed;
    }
  }

  // 3. Google Drive
  if (trimmed.includes("drive.google.com")) {
    if (trimmed.includes("/view")) {
      return trimmed.replace(/\/view(\?.*)?$/, "/preview");
    }
    return trimmed;
  }

  // 4. Dropbox
  if (trimmed.includes("dropbox.com")) {
    return trimmed.replace("dl=0", "raw=1");
  }

  return trimmed;
}
