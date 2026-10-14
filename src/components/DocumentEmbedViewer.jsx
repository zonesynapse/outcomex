import React, { useState } from "react";
import {
  ExternalLink, Download, RefreshCw, AlertCircle, Eye, Globe, Building2, Layers
} from "lucide-react";
import {
  getEmbeddableDocumentUrl,
  getDirectDownloadUrl,
  getOfficeAppsViewerUrl,
  getGoogleDocsViewerUrl,
  getSharePointEmbedUrl,
  extractUrlFromInput
} from "../utils/documentEmbedUtils";

/**
 * Universal In-App Document Embed Viewer with multi-engine fallback.
 *
 * Solves the Microsoft 365 "Please sign in to view this file" roadblock caused by
 * Safari / Chrome cross-site tracking and third-party cookie blocking inside iframes.
 */
export default function DocumentEmbedViewer({
  docUrl,
  rawLink,
  title = "Document Preview",
  fileName = "",
  minHeight = "550px"
}) {
  const effectiveUrl = extractUrlFromInput(docUrl || rawLink || "");

  // Determine initial engine: for SharePoint/OneDrive links, default to Google Docs Viewer
  // or Office Online which proxies without third-party cookie restrictions
  const isSharePointOrOneDrive = effectiveUrl.includes("sharepoint.com") ||
    effectiveUrl.includes("-my.sharepoint.com") ||
    effectiveUrl.includes("1drv.ms") ||
    effectiveUrl.includes("onedrive.live.com");

  const [activeEngine, setActiveEngine] = useState(isSharePointOrOneDrive ? "google" : "native");
  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  if (!effectiveUrl) {
    return (
      <div className="py-16 text-center text-zinc-400 text-xs font-semibold flex flex-col items-center justify-center gap-2">
        <AlertCircle className="h-8 w-8 text-zinc-300" />
        <p>No document URL provided for preview.</p>
      </div>
    );
  }

  // Resolve current iframe URL based on active engine
  let currentEmbedUrl = effectiveUrl;
  if (activeEngine === "google") {
    currentEmbedUrl = getGoogleDocsViewerUrl(effectiveUrl);
  } else if (activeEngine === "office") {
    currentEmbedUrl = getOfficeAppsViewerUrl(effectiveUrl);
  } else {
    currentEmbedUrl = getSharePointEmbedUrl(effectiveUrl);
  }

  const handleOpenReaderWindow = () => {
    // Opening in a top-level window bypasses Safari/Chrome cross-site iframe cookie blocks
    // so Microsoft 365 "Anyone with the link" permissions work seamlessly without login!
    window.open(effectiveUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownload = () => {
    const downloadUrl = getDirectDownloadUrl(effectiveUrl);
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  };

  const handleSwitchEngine = (engine) => {
    setActiveEngine(engine);
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  return (
    <div className="flex-1 flex flex-col space-y-2 min-h-0 w-full">

      {/* Top Viewer Control Bar */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        
        {/* Engine Switcher Tabs */}
        <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 px-2 flex items-center gap-1">
            <Eye className="h-3 w-3" /> Viewer Engine:
          </span>

          <button
            type="button"
            onClick={() => handleSwitchEngine("google")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeEngine === "google"
                ? "bg-[#120c7a] text-white shadow-2xs"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
            }`}
            title="Google Docs Viewer (Recommended for Safari - Bypasses Microsoft cookie sign-in roadblock)"
          >
            <Globe className="h-3 w-3" />
            <span>Google Viewer</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchEngine("office")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeEngine === "office"
                ? "bg-[#120c7a] text-white shadow-2xs"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
            }`}
            title="Office Online Web Viewer proxy"
          >
            <Building2 className="h-3 w-3" />
            <span>Office Online</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchEngine("native")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeEngine === "native"
                ? "bg-[#120c7a] text-white shadow-2xs"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
            }`}
            title="Direct SharePoint EmbedView"
          >
            <Layers className="h-3 w-3" />
            <span>SharePoint</span>
          </button>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setIframeKey((prev) => prev + 1);
            }}
            className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors cursor-pointer"
            title="Reload Preview"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
            title="Download original document file"
          >
            <Download className="h-3.5 w-3.5 text-zinc-500" />
            <span className="hidden sm:inline">Download</span>
          </button>

          <button
            type="button"
            onClick={handleOpenReaderWindow}
            className="px-3.5 py-1.5 rounded-xl bg-[#120c7a] hover:bg-[#0e0a60] text-white font-black text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
            title="Open in dedicated reader tab/window (Guaranteed to bypass Microsoft login screen)"
          >
            <ExternalLink className="h-3.5 w-3.5 text-amber-300" />
            <span>Open Reader Window</span>
          </button>
        </div>
      </div>

      {/* Embedded Iframe Container */}
      <div className="relative flex-1 border border-zinc-200 rounded-2xl overflow-hidden bg-zinc-100 shadow-inner flex flex-col" style={{ minHeight }}>
        {isLoading && (
          <div className="absolute inset-0 bg-white/75 backdrop-blur-2xs flex flex-col items-center justify-center gap-2 z-10 pointer-events-none">
            <RefreshCw className="h-6 w-6 text-[#120c7a] animate-spin" />
            <span className="text-xs font-bold text-zinc-600">Loading document preview...</span>
          </div>
        )}

        <iframe
          key={iframeKey}
          src={currentEmbedUrl}
          title={title || fileName || "Document Preview"}
          onLoad={() => setIsLoading(false)}
          className="w-full h-full flex-1 border-none"
          style={{ minHeight }}
          allow="autoplay; camera; microphone; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>

      {/* Helpful Safari / Chrome Cookie Bypass Banner */}
      <div className="p-3 rounded-xl bg-blue-50/90 border border-blue-200 text-blue-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
        <div className="flex items-start sm:items-center gap-2">
          <AlertCircle className="h-4 w-4 text-blue-700 shrink-0 mt-0.5 sm:mt-0" />
          <span className="leading-snug">
            <strong>Bypass Microsoft Sign-in:</strong> Safari & Chrome block cross-site cookies in iframes. If Microsoft asks to sign in, click <strong>"Open Reader Window"</strong> or switch to <strong>"Google Viewer"</strong> above to view immediately without logging in.
          </span>
        </div>
        <button
          type="button"
          onClick={handleOpenReaderWindow}
          className="px-3 py-1 rounded-lg bg-white border border-blue-300 text-[#120c7a] font-extrabold text-xs shadow-2xs hover:bg-blue-100 transition-all cursor-pointer whitespace-nowrap shrink-0 self-end sm:self-auto"
        >
          Open Reader Tab →
        </button>
      </div>

    </div>
  );
}
