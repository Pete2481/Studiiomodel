"use client";

import React, { useMemo, useState } from "react";
import { X, Film, Trash2, Undo2, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SocialVideoPick = {
  id?: string;
  name?: string;
  url: string;
  path?: string;
  type?: string;
};

export function AISocialVideoPicker({
  isOpen,
  onClose,
  images,
  getThumbUrl,
  onGenerate,
  isGenerating,
  error,
  min = 3,
  max = 5,
}: {
  isOpen: boolean;
  onClose: () => void;
  images: SocialVideoPick[];
  getThumbUrl: (url: string) => string;
  onGenerate: (ordered: SocialVideoPick[], opts: { durationSeconds: 5 | 10 }) => Promise<void>;
  isGenerating: boolean;
  error: string | null;
  min?: number;
  max?: number;
}) {
  const [orderedKeys, setOrderedKeys] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<5 | 10>(10);

  const byKey = useMemo(() => {
    const map = new Map<string, SocialVideoPick>();
    for (const img of images) {
      const key = String(img.id || img.path || img.url);
      map.set(key, img);
    }
    return map;
  }, [images]);

  const ordered = useMemo(() => orderedKeys.map((k) => byKey.get(k)).filter(Boolean) as SocialVideoPick[], [orderedKeys, byKey]);

  const toggle = (key: string) => {
    setLocalError(null);
    setOrderedKeys((prev) => {
      const idx = prev.indexOf(key);
      if (idx >= 0) {
        const next = prev.slice();
        next.splice(idx, 1);
        return next;
      }
      if (prev.length >= max) {
        setLocalError(`Max ${max} images for AI Social Video.`);
        return prev;
      }
      return [...prev, key];
    });
  };

  const removeLast = () => {
    setLocalError(null);
    setOrderedKeys((prev) => prev.slice(0, -1));
  };

  const clear = () => {
    setLocalError(null);
    setOrderedKeys([]);
  };

  if (!isOpen) return null;

  const canGenerate = ordered.length >= min && ordered.length <= max && !isGenerating;

  return (
    <div className="fixed inset-0 z-[240] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="relative w-full max-w-5xl bg-white rounded-[48px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
              <Film className="h-6 w-6" />
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-black text-primary uppercase tracking-widest">AI Social Video</p>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Pick 3–5 images (order matters)</h3>
              <p className="text-[11px] font-bold text-slate-500">
                Clip order = the order you click. Default output: <span className="text-slate-900">Vertical (9:16)</span>.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="h-12 w-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 transition-all active:scale-95"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {(error || localError) && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold">
              {error || localError}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {images.map((img) => {
              const key = String(img.id || img.path || img.url);
              const idx = orderedKeys.indexOf(key);
              const isSelected = idx >= 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  disabled={isGenerating}
                  className={cn(
                    "group relative aspect-[4/3] rounded-3xl overflow-hidden border transition-all",
                    isSelected ? "border-primary ring-2 ring-primary/20" : "border-slate-100 hover:border-slate-200",
                    isGenerating && "opacity-70 cursor-wait"
                  )}
                  title={img.name || "Image"}
                >
                  <img
                    src={getThumbUrl(img.url)}
                    alt={img.name || "Selected image"}
                    className={cn("h-full w-full object-cover transition-transform duration-300", isSelected ? "scale-[1.02]" : "group-hover:scale-[1.03]")}
                  />

                  {/* Selection badge */}
                  {isSelected && (
                    <div className="absolute top-3 left-3 h-9 w-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-black shadow-xl">
                      {idx + 1}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-700">
                Selected: {ordered.length}
              </span>
              <div className="hidden sm:flex items-center gap-2 ml-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Length</span>
                <div className="flex bg-white p-1 rounded-full border border-slate-200">
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setDurationSeconds(5)}
                    className={cn(
                      "h-8 px-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                      durationSeconds === 5 ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    5s
                  </button>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setDurationSeconds(10)}
                    className={cn(
                      "h-8 px-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                      durationSeconds === 10 ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    10s
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={clear}
                disabled={ordered.length === 0 || isGenerating}
                className="h-10 px-4 rounded-2xl bg-white border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </button>
              <button
                type="button"
                onClick={removeLast}
                disabled={ordered.length === 0 || isGenerating}
                className="h-10 px-4 rounded-2xl bg-white border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <Undo2 className="h-4 w-4" />
                Remove last
              </button>
            </div>

            <button
              type="button"
              disabled={!canGenerate}
              onClick={async () => {
                setLocalError(null);
                if (ordered.length < min) {
                  setLocalError(`Select at least ${min} images.`);
                  return;
                }
                await onGenerate(ordered, { durationSeconds });
              }}
              className={cn(
                "h-12 px-6 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-2",
                canGenerate ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-200 text-slate-400"
              )}
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating ? "Generating…" : "Generate video"}
            </button>
          </div>

          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
            Tip: Select exterior hero shots first, then interiors for best pacing.
          </p>
        </div>
      </div>
    </div>
  );
}


