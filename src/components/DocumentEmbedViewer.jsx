import React, { useState } from "react";
import { RefreshCw, AlertCircle, FileText, CheckCircle2 } from "lucide-react";
import {
  getEmbeddableDocumentUrl,
  extractUrlFromInput
} from "../utils/documentEmbedUtils";

/**
 * Universal In-App Document Embed Viewer - Pure Document Mode.
 *
 * Automatically crops out web app chrome so that ONLY the
 * pristine document pages are displayed to the user.
 */
export default function DocumentEmbedViewer({
  docUrl,
  rawLink,
  title = "Document Preview",
  fileName = "",
  minHeight = "650px"
}) {
  const effectiveUrl = extractUrlFromInput(rawLink || docUrl || "");
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

  // Use standard embeddable document URL (Google Drive /preview, SharePoint embedview, etc.)
  const currentEmbedUrl = getEmbeddableDocumentUrl(effectiveUrl);

  const handleReload = () => {
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  // Calibrated crop offset: 55px perfectly cuts out Google Docs / Gmail menu bars
  // (Title bar, Sign in, File, Edit, View, Tools, Help) while preserving 100% of the
  // college logo and institution title at the top of the document paper
  const cropTop = 55;

  return (
    <div className="flex-1 flex flex-col space-y-2.5 min-h-0 w-full">

      {/* Clean Document Top Header - Single Clean Option */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-2 px-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 bg-blue-50 text-[#120c7a] rounded-lg">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-black text-zinc-900 truncate">
              {title || fileName || "Official Course Document"}
            </h4>
          </div>
        </div>

        {/* Single Clean View Indicator & Refresh Button */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold shadow-2xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Document View</span>
          </span>

          <button
            type="button"
            onClick={handleReload}
            className="p-1.5 px-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold shrink-0"
            title="Reload Document"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-[#120c7a]" : "text-zinc-500"}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Embedded Iframe Container - Pure Document Viewport */}
      <div
        className="relative flex-1 border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-inner flex flex-col"
        style={{ minHeight }}
      >
        {isLoading && (
          <div className="absolute inset-0 bg-white/85 backdrop-blur-2xs flex flex-col items-center justify-center gap-2 z-10 pointer-events-none">
            <RefreshCw className="h-6 w-6 text-[#120c7a] animate-spin" />
            <span className="text-xs font-bold text-zinc-600">Loading document pages...</span>
          </div>
        )}

        {/* Viewport Frame with overflow-hidden to crop Google Docs chrome */}
        <div className="w-full h-full flex-1 relative overflow-hidden bg-white">
          <iframe
            key={iframeKey}
            src={currentEmbedUrl}
            title={title || fileName || "Document Preview"}
            onLoad={() => setIsLoading(false)}
            className="border-none bg-white transition-all duration-300 w-full"
            style={{
              position: "absolute",
              top: `-${cropTop}px`,
              left: "0px",
              width: "100%",
              height: `calc(100% + ${cropTop}px)`,
              minHeight: `calc(${minHeight} + ${cropTop}px)`,
            }}
            allow="autoplay; camera; microphone; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>

    </div>
  );
}
