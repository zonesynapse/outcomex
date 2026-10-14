/**
 * Utility to convert cloud document links (OneDrive, SharePoint, Google Drive, Dropbox)
 * into clean, in-app embeddable preview URLs for iframes and multi-engine viewers.
 *
 * This ensures external setters or reviewers can view Syllabus / Question Banks smoothly,
 * bypassing third-party cookie restrictions (Safari / Chrome) via multi-engine fallback.
 */

/**
 * Extracts clean URL if user pasted an entire <iframe src="..."> embed snippet from SharePoint/OneDrive.
 */
export function extractUrlFromInput(input) {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();
  const iframeMatch = trimmed.match(/src=["']([^"']+)["']/i);
  if (iframeMatch && iframeMatch[1]) {
    return iframeMatch[1];
  }
  return trimmed;
}

/**
 * Generates direct download URL suitable for unauthenticated viewer proxies (Office Online & Google Docs Viewer).
 */
export function getDirectDownloadUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const cleaned = extractUrlFromInput(rawUrl);

  // SharePoint / OneDrive for Business
  if (cleaned.includes("sharepoint.com") || cleaned.includes("-my.sharepoint.com")) {
    try {
      const urlObj = new URL(cleaned);
      urlObj.searchParams.delete("action");
      urlObj.searchParams.set("download", "1");
      return urlObj.toString();
    } catch {
      const sep = cleaned.includes("?") ? "&" : "?";
      return `${cleaned}${sep}download=1`;
    }
  }

  // Personal OneDrive
  if (cleaned.includes("1drv.ms") || cleaned.includes("onedrive.live.com")) {
    try {
      const base64Url = btoa(unescape(encodeURIComponent(cleaned)))
        .replace(/=/g, "")
        .replace(/\//g, "_")
        .replace(/\+/g, "-");
      return `https://api.onedrive.com/v1.0/shares/u!${base64Url}/root/content`;
    } catch {
      return cleaned;
    }
  }

  // Google Drive
  if (cleaned.includes("drive.google.com")) {
    const idMatch = cleaned.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
      return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
    }
    return cleaned;
  }

  // Dropbox
  if (cleaned.includes("dropbox.com")) {
    return cleaned.replace("dl=0", "dl=1");
  }

  return cleaned;
}

/**
 * Microsoft Office Online Viewer proxy (Works without third-party cookies for Word, Excel, PPTX, PDF).
 */
export function getOfficeAppsViewerUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const downloadUrl = getDirectDownloadUrl(rawUrl);
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(downloadUrl)}`;
}

/**
 * Google Docs Viewer proxy (Renders documents without any Microsoft authentication).
 */
export function getGoogleDocsViewerUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const downloadUrl = getDirectDownloadUrl(rawUrl);
  return `https://docs.google.com/viewer?url=${encodeURIComponent(downloadUrl)}&embedded=true`;
}

/**
 * SharePoint Native Embed View URL.
 */
export function getSharePointEmbedUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const cleaned = extractUrlFromInput(rawUrl);

  if (cleaned.includes("sharepoint.com") || cleaned.includes("-my.sharepoint.com")) {
    try {
      const urlObj = new URL(cleaned);
      urlObj.searchParams.delete("download");
      urlObj.searchParams.set("action", "embedview");
      urlObj.searchParams.set("wdAllowInteractivity", "True");
      return urlObj.toString();
    } catch {
      const sep = cleaned.includes("?") ? "&" : "?";
      return `${cleaned}${sep}action=embedview&wdAllowInteractivity=True`;
    }
  }
  return cleaned;
}

/**
 * Master Resolver for in-app document embedding.
 * engine: "native" | "office" | "google" | "auto"
 */
export function getEmbeddableDocumentUrl(rawUrl, engine = "auto") {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const cleaned = extractUrlFromInput(rawUrl);
  if (!cleaned) return "";

  if (engine === "google") {
    return getGoogleDocsViewerUrl(cleaned);
  }
  if (engine === "office") {
    return getOfficeAppsViewerUrl(cleaned);
  }
  if (engine === "native") {
    return getSharePointEmbedUrl(cleaned);
  }

  // Default "auto": For SharePoint / OneDrive, use native embedview with fallbacks
  if (cleaned.includes("sharepoint.com") || cleaned.includes("-my.sharepoint.com")) {
    return getSharePointEmbedUrl(cleaned);
  }

  if (cleaned.includes("1drv.ms") || cleaned.includes("onedrive.live.com")) {
    if (cleaned.includes("/embed?") || cleaned.includes("action=embedview")) {
      return cleaned;
    }
    return getDirectDownloadUrl(cleaned);
  }

  if (cleaned.includes("drive.google.com")) {
    if (cleaned.includes("/view")) {
      return cleaned.replace(/\/view(\?.*)?$/, "/preview");
    }
    return cleaned;
  }

  if (cleaned.includes("dropbox.com")) {
    return cleaned.replace("dl=0", "raw=1");
  }

  return cleaned;
}
