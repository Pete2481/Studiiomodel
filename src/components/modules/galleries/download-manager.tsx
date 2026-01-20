"use client";

import React, { useState, useEffect } from "react";
import { Download, Loader2, CheckCircle2, X, AlertCircle, HardDrive, LayoutGrid, Smartphone, Monitor, ChevronRight, CloudUpload } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { cn } from "@/lib/utils";
import { saveAIResultSiblingToDropbox } from "@/app/actions/dropbox";

interface DownloadManagerProps {
  galleryId: string;
  tenantId?: string;
  assets: any[];
  onClose: () => void;
  sharedLink?: string;
  clientBranding?: {
    url: string;
    settings: any;
  } | null;
  /**
   * When provided, show a V2-only "Save to Dropbox" toggle for single AI result downloads.
   * Saving always uses the original AI result bytes (not resized).
   */
  aiSaveToDropbox?: {
    tenantId: string;
    galleryId?: string;
    originalPath: string;
    originalName: string;
    resultUrl: string;
  } | null;
}

type DownloadResolution = "original" | "web" | "social";

export function DownloadManager({
  galleryId,
  tenantId,
  assets,
  onClose,
  sharedLink,
  clientBranding,
  aiSaveToDropbox,
}: DownloadManagerProps) {
  const [status, setStatus] = useState<'idle' | 'processing' | 'zipping' | 'complete' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [applyBranding, setApplyBranding] = useState(false);
  const [saveToDropbox, setSaveToDropbox] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savePath, setSavePath] = useState<string | null>(null);
  const [saveReconnectUrl, setSaveReconnectUrl] = useState<string | null>(null);

  const runSaveToDropbox = React.useCallback(async () => {
    if (!saveToDropbox || assets.length !== 1) return null;
    if (saveStatus === "saving" || saveStatus === "saved") return null;

    setSaveStatus("saving");
    setSaveError(null);
    setSavePath(null);
    setSaveReconnectUrl(null);

    try {
      const asset = assets[0];

      // Markup save path: upload the generated blob back to Dropbox next to original.
      const originalPath = String(asset?.originalPath || asset?.path || "");
      const originalName = String(asset?.originalName || asset?.name || "");

      if (asset?.isMarkup && asset?.markupBlob && originalPath && tenantId) {
        const fd = new FormData();
        fd.set("tenantId", String(tenantId));
        fd.set("originalPath", originalPath);
        fd.set("originalName", originalName);
        fd.set("file", new File([asset.markupBlob], String(asset.name || "Markup.jpg"), { type: "image/jpeg" }));

        const res = await fetch(`/api/dropbox/upload-markup-sibling/${galleryId}`, {
          method: "POST",
          body: fd,
        });
        const json: any = await res.json().catch(() => null);
        if (res.ok && json?.success) {
          setSaveStatus("saved");
          setSavePath(String(json?.path || json?.name || ""));
          return json;
        }
        setSaveStatus("error");
        setSaveError(String(json?.error || "Save failed"));
        return json;
      }

      // AI save path (existing behavior)
      if (asset?.isAiResult && tenantId && originalPath && typeof asset?.url === "string" && asset.url.startsWith("http")) {
        const res: any = await saveAIResultSiblingToDropbox({
          tenantId: String(tenantId),
          galleryId,
          resultUrl: String(asset.url),
          originalPath,
          originalName,
        });
        if (res?.success) {
          setSaveStatus("saved");
          setSavePath(String(res?.path || res?.name || ""));
          return res;
        }
        setSaveStatus("error");
        setSaveError(String(res?.error || "Save failed"));
        if (String(res?.code || "") === "MISSING_SCOPE") {
          setSaveReconnectUrl("/api/auth/dropbox");
        }
        return res;
      }

      if (!aiSaveToDropbox) return null;
      const res: any = await saveAIResultSiblingToDropbox({
        tenantId: aiSaveToDropbox.tenantId,
        galleryId: aiSaveToDropbox.galleryId,
        resultUrl: aiSaveToDropbox.resultUrl,
        originalPath: aiSaveToDropbox.originalPath,
        originalName: aiSaveToDropbox.originalName,
      });

      if (res?.success) {
        setSaveStatus("saved");
        setSavePath(String(res?.path || res?.name || ""));
        return res;
      }

      setSaveStatus("error");
      setSaveError(String(res?.error || "Save failed"));
      if (String(res?.code || "") === "MISSING_SCOPE") {
        setSaveReconnectUrl("/api/auth/dropbox");
      }
      return res;
    } catch (e: any) {
      setSaveStatus("error");
      setSaveError(String(e?.message || "Save failed"));
      return null;
    }
  }, [aiSaveToDropbox, assets, galleryId, saveStatus, saveToDropbox, tenantId]);

  const startDownload = async (resolution: DownloadResolution) => {
    setStatus('processing');
    setProgress(0);
    setError(null);

    const zip = new JSZip();
    const folder = zip.folder(`studiio-${resolution}-assets`);

    try {
      // Optional: Save result back to Dropbox (single asset only), without blocking download.
      if (saveToDropbox && assets.length === 1) {
        // fire-and-forget
        void runSaveToDropbox();
      }

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        setCurrentFile(asset.name);
        
        let blob: Blob;

        // If it's a client-side markup, use the blob directly
        if (asset.isMarkup && asset.markupBlob) {
          blob = asset.markupBlob;
        } else {
          // If this is an external (AI) URL without a Dropbox path, proxy it through our server
          const isExternalUrl = typeof asset.url === "string" && asset.url.startsWith("http") && !asset.path;
          const downloadUrl = isExternalUrl
            ? `/api/external-image?url=${encodeURIComponent(asset.url)}${resolution === "original" ? "&profile=print" : ""}`
            : `/api/dropbox/download/${galleryId}?path=${encodeURIComponent(asset.path)}&sharedLink=${encodeURIComponent(sharedLink || "")}&applyBranding=${applyBranding}`;

          const response = await fetch(downloadUrl);

          if (!response.ok) throw new Error(`Failed to download ${asset.name}`);
          blob = await response.blob();
        }

        // 1. Logic for Resizing (Web/Social)
        // If resolution is not 'original', we use a hidden canvas to resize
        if (resolution !== 'original') {
          blob = await resizeImage(blob, resolution === 'web' ? 2500 : 1080);
        }

        folder?.file(asset.name, blob);
        setProgress(Math.round(((i + 1) / assets.length) * 100));
      }

      setStatus('zipping');
      const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
        // Zip progress (0-100)
        // We can optionally use this, but usually zipping is fast after downloading
      });

      saveAs(content, `studiio-gallery-${galleryId}-${resolution}.zip`);
      setStatus('complete');
      
      // Auto-close after 3 seconds
      setTimeout(onClose, 3000);

    } catch (err: any) {
      console.error("ZIP ERROR:", err);
      setError(err.message || "An unexpected error occurred during download.");
      setStatus('error');
    }
  };

  /**
   * Client-side resizing logic using Canvas
   * Scalable & doesn't hit server CPU
   */
  const resizeImage = (blob: Blob, maxWidth: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(blob);

      const cleanup = () => {
        try {
          URL.revokeObjectURL(objUrl);
        } catch {
          // ignore
        }
      };

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          return reject("Canvas context error");
        }

        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (b) => {
            cleanup();
            if (!b) return reject("Failed to encode image");
            resolve(b);
          },
          "image/jpeg",
          0.85,
        );
      };

      img.onerror = () => {
        cleanup();
        reject("Failed to load image for resize");
      };

      img.src = objUrl;
    });
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div 
        className="w-full max-w-lg bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-primary uppercase tracking-widest">PRODUCTION VAULT</p>
            <h3 className="text-xl font-bold text-slate-900 tracking-tight">Download Collection</h3>
          </div>
          <button 
            onClick={onClose}
            className="h-10 w-10 rounded-full hover:bg-slate-50 flex items-center justify-center text-slate-400 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-10">
          {status === 'idle' ? (
            <div className="space-y-6">
              <p className="text-sm text-slate-500 leading-relaxed">
                Select your preferred resolution. We'll package all <span className="font-bold text-slate-900">{assets.length} images</span> into a single high-speed ZIP archive for you.
              </p>

              {/* Client Branding Toggle */}
              {clientBranding && (
                <div className="p-5 rounded-[24px] bg-emerald-50/50 border border-emerald-100 flex items-center justify-between group cursor-pointer" onClick={() => setApplyBranding(!applyBranding)}>
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                      applyBranding ? "bg-emerald-500 text-white" : "bg-white text-slate-400 border border-slate-100"
                    )}>
                      <LayoutGrid className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">Agency Branding</p>
                      <p className="text-xs font-bold text-slate-900">Apply my custom logo to all downloads</p>
                    </div>
                  </div>
                  <div className={cn(
                    "w-10 h-5 rounded-full transition-colors relative shrink-0",
                    applyBranding ? "bg-emerald-500" : "bg-slate-200"
                  )}>
                    <div className={cn(
                      "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform",
                      applyBranding ? "translate-x-5" : "translate-x-0"
                    )} />
                  </div>
                </div>
              )}

              {/* Save to Dropbox Toggle (single AI result only) */}
              {(assets.length === 1 && (
                (!!aiSaveToDropbox) ||
                (!!tenantId && !!assets[0]?.isMarkup && !!assets[0]?.markupBlob && !!(assets[0]?.originalPath || assets[0]?.path)) ||
                (!!tenantId && !!assets[0]?.isAiResult && !!(assets[0]?.originalPath || assets[0]?.path) && typeof assets[0]?.url === "string" && assets[0].url.startsWith("http"))
              )) && (
                <div
                  className="p-5 rounded-[24px] bg-sky-50/50 border border-sky-100 flex items-center justify-between group cursor-pointer"
                  onClick={() => setSaveToDropbox(!saveToDropbox)}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                        saveToDropbox ? "bg-sky-500 text-white" : "bg-white text-slate-400 border border-slate-100",
                      )}
                    >
                      <CloudUpload className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-sky-600 uppercase tracking-widest">Save to Dropbox</p>
                      <p className="text-xs font-bold text-slate-900">
                        Save back into the folder (Original only)
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-1">
                        {saveStatus === "saved"
                          ? (savePath ? `Saved ✓ (${savePath})` : "Saved ✓")
                          : saveStatus === "saving"
                            ? "Saving…"
                            : saveStatus === "error"
                              ? (saveError ? `Save failed: ${saveError}` : "Save failed (download will still work)")
                              : "Optional"}
                      </p>
                      {saveReconnectUrl && (
                        <a
                          href={saveReconnectUrl}
                          className="inline-block mt-2 text-[10px] font-black text-sky-700 uppercase tracking-widest hover:underline"
                        >
                          Reconnect Dropbox to enable saving
                        </a>
                      )}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "w-10 h-5 rounded-full transition-colors relative shrink-0",
                      saveToDropbox ? "bg-sky-500" : "bg-slate-200",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform",
                        saveToDropbox ? "translate-x-5" : "translate-x-0",
                      )}
                    />
                  </div>
                </div>
              )}

              {/* Save Only button (single AI result + toggle enabled) */}
              {(assets.length === 1 && (
                (!!aiSaveToDropbox) ||
                (!!tenantId && !!assets[0]?.isMarkup && !!assets[0]?.markupBlob && !!(assets[0]?.originalPath || assets[0]?.path)) ||
                (!!tenantId && !!assets[0]?.isAiResult && !!(assets[0]?.originalPath || assets[0]?.path) && typeof assets[0]?.url === "string" && assets[0].url.startsWith("http"))
              )) && saveToDropbox && (
                <button
                  onClick={async () => {
                    await runSaveToDropbox();
                  }}
                  disabled={saveStatus === "saving" || saveStatus === "saved"}
                  className={cn(
                    "w-full h-12 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all active:scale-[0.99] border",
                    saveStatus === "saved"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default"
                      : saveStatus === "saving"
                        ? "bg-slate-50 text-slate-400 border-slate-200 cursor-wait"
                        : "bg-sky-600 text-white border-sky-600 hover:bg-sky-700",
                  )}
                >
                  {saveStatus === "saved"
                    ? "Saved to Dropbox"
                    : saveStatus === "saving"
                      ? "Saving to Dropbox…"
                      : "Save Only to Dropbox (no download)"}
                </button>
              )}

              <div className="grid grid-cols-1 gap-3">
                <ResolutionButton 
                  icon={<HardDrive className="h-5 w-5" />}
                  label="Original Resolution"
                  sub="Best for print and high-end marketing"
                  onClick={() => startDownload('original')}
                />
                <ResolutionButton 
                  icon={<Monitor className="h-5 w-5" />}
                  label="Web Optimized"
                  sub="2500px - Perfect for MLS and Portals"
                  onClick={() => startDownload('web')}
                />
                <ResolutionButton 
                  icon={<Smartphone className="h-5 w-5" />}
                  label="Social Ready"
                  sub="1080px - Optimized for mobile & sharing"
                  onClick={() => startDownload('social')}
                />
              </div>
            </div>
          ) : (
            <div className="py-6 space-y-8">
              {/* Progress UI */}
              <div className="flex flex-col items-center text-center space-y-4">
                {status === 'processing' && (
                  <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center animate-pulse">
                    <Download className="h-8 w-8" />
                  </div>
                )}
                {status === 'zipping' && (
                  <div className="h-16 w-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                )}
                {status === 'complete' && (
                  <div className="h-16 w-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                )}
                {status === 'error' && (
                  <div className="h-16 w-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center">
                    <AlertCircle className="h-8 w-8" />
                  </div>
                )}

                <div className="space-y-1">
                  <h4 className="text-lg font-bold text-slate-900">
                    {status === 'processing' && `Preparing Assets... ${progress}%`}
                    {status === 'zipping' && "Creating High-Speed Archive..."}
                    {status === 'complete' && "Download Ready!"}
                    {status === 'error' && "Download Failed"}
                  </h4>
                  <p className="text-xs font-medium text-slate-400 truncate max-w-[300px]">
                    {status === 'processing' && `Fetching: ${currentFile}`}
                    {status === 'zipping' && "Optimizing file compression"}
                    {status === 'complete' && "Your files have been sent to your browser."}
                    {status === 'error' && error}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-50">
                  <div 
                    className={cn(
                      "h-full transition-all duration-500",
                      status === 'error' ? "bg-rose-500" : "bg-primary"
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span>{status === 'complete' ? assets.length : Math.round((progress/100) * assets.length)} files</span>
                  <span>{assets.length} total</span>
                </div>
              </div>

              {status === 'error' && (
                <button 
                  onClick={() => setStatus('idle')}
                  className="w-full h-12 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-all"
                >
                  Try Again
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-10 py-6 bg-slate-50/50 border-t border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 text-center uppercase tracking-widest">
            Powered by Studiio High-Speed Delivery &bull; {assets.length} Assets
          </p>
        </div>
      </div>
    </div>
  );
}

function ResolutionButton({ icon, label, sub, onClick }: { icon: React.ReactNode, label: string, sub: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="group w-full p-5 rounded-[24px] border border-slate-100 bg-white hover:border-primary hover:shadow-xl hover:shadow-primary/5 transition-all flex items-center gap-5 text-left"
    >
      <div className="h-12 w-12 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary flex items-center justify-center transition-colors shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-slate-900">{label}</p>
        <p className="text-xs font-medium text-slate-400 mt-0.5">{sub}</p>
      </div>
      <div className="ml-auto h-8 w-8 rounded-full border border-slate-100 flex items-center justify-center text-slate-300 group-hover:border-primary group-hover:text-primary transition-all">
        <ChevronRight className="h-4 w-4" />
      </div>
    </button>
  );
}

