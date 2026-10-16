import React, { useState } from "react";
import { RefreshCw, AlertCircle, FileText, CheckCircle2, Sliders, Eye } from "lucide-react";
import {
  getSharePointEmbedUrl,
  extractUrlFromInput
} from "../utils/documentEmbedUtils";

/**
 * Universal In-App Document Embed Viewer - Pure Document Mode.
 *
 * Automatically crops out Microsoft 365 web app chrome (File/Edit/View menu bar,
 * Request edit access header, and left "Document tabs" pane) so that ONLY the
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

  // Focus Mode: "pure" (Default: hide top menus and left tabs) | "full" (raw window)
  const [viewMode, setViewMode] = useState("pure");

  // Calibrated crop offsets:
  // - Top: 76px (cuts out top header + File/Edit/View/Tools/Help menu)
  // - Left: 145px (cuts out left Document tabs sidebar in typical drawer width)
  const [cropTop, setCropTop] = useState(76);
  const [cropLeft, setCropLeft] = useState(145);

  if (!effectiveUrl) {
    return (
      <div className="py-16 text-center text-zinc-400 text-xs font-semibold flex flex-col items-center justify-center gap-2">
        <AlertCircle className="h-8 w-8 text-zinc-300" />
        <p>No document URL provided for preview.</p>
      </div>
    );
  }

  // Always use direct in-app embed URL
  const currentEmbedUrl = getSharePointEmbedUrl(effectiveUrl);

  const handleReload = () => {
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  return (
    <div className="flex-1 flex flex-col space-y-2.5 min-h-0 w-full">

      {/* Clean Document Top Header */}
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

        {/* Focus Mode & Crop Controls */}
        <div className="flex items-center gap-2">
          {/* Mode Switch: Pure Document vs Full View */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("pure")}
              className={`px-3 py-1 rounded-lg font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "pure"
                  ? "bg-[#120c7a] text-white shadow-2xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
              title="Show only the document pages without any menus or side tabs"
            >
              <CheckCircle2 className={`h-3.5 w-3.5 ${viewMode === "pure" ? "text-emerald-400" : "text-zinc-400"}`} />
              <span>Pure Document</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("full")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === "full"
                  ? "bg-[#120c7a] text-white shadow-2xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
              title="Show complete web window with tabs"
            >
              <span>Full View</span>
            </button>
          </div>

          {/* Quick Width Presets when in Pure Document Mode */}
          {viewMode === "pure" && (
            <div className="hidden sm:flex items-center gap-1 bg-zinc-50 border border-zinc-200 px-1 py-0.5 rounded-xl text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setCropLeft(145)}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  cropLeft === 145 ? "bg-zinc-200 text-zinc-900 font-black" : "text-zinc-500 hover:text-zinc-800"
                }`}
                title="Default crop for drawer view"
              >
                Auto (145px)
              </button>
              <button
                type="button"
                onClick={() => setCropLeft(240)}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  cropLeft === 240 ? "bg-zinc-200 text-zinc-900 font-black" : "text-zinc-500 hover:text-zinc-800"
                }`}
                title="Expanded crop for wide screen navigation pane"
              >
                Wide (240px)
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleReload}
            className="p-1.5 px-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold shrink-0"
            title="Reload Preview"
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

        {/* Viewport Clipping Frame */}
        <div className="w-full h-full flex-1 relative overflow-hidden bg-white">
          <iframe
            key={iframeKey}
            src={currentEmbedUrl}
            title={title || fileName || "Document Preview"}
            onLoad={() => setIsLoading(false)}
            className="border-none bg-white transition-all duration-300"
            style={{
              position: viewMode === "pure" ? "absolute" : "relative",
              top: viewMode === "pure" ? `-${cropTop}px` : "0px",
              left: viewMode === "pure" ? `-${cropLeft}px` : "0px",
              width: viewMode === "pure" ? `calc(100% + ${cropLeft}px)` : "100%",
              height: viewMode === "pure" ? `calc(100% + ${cropTop}px)` : "100%",
              minHeight: viewMode === "pure" ? `calc(${minHeight} + ${cropTop}px)` : minHeight,
            }}
            allow="autoplay; camera; microphone; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>

    </div>
  );
}
