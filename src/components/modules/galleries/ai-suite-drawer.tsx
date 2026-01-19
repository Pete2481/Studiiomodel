"use client";

import React, { useEffect, useState } from "react";
import { 
  Zap, 
  Sun, 
  Moon, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Download,
  Sparkles,
  Wand2,
  ChevronDown,
  Sofa,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CameraLoader } from "@/components/ui/camera-loader";
import { AITaskType } from "@/app/actions/ai-edit";
import { saveAIResult } from "@/app/actions/storage";
import dynamic from "next/dynamic";
import { runAiSuiteRoomEditor } from "@/app/actions/ai-suite";

const DownloadManager = dynamic(() => import("./download-manager").then(m => m.DownloadManager), { ssr: false });

interface AISuiteDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  assetUrl: string;
  assetName: string;
  dbxPath?: string;
  tenantId?: string;
  isUnlocked: boolean;
  remainingEdits: number;
  onRequireUnlock?: () => void;
  onAiSuiteUpdate?: (aiSuite: { unlocked?: boolean; remainingEdits?: number; unlockBlockId?: string | null }) => void;
  onComplete?: (newUrl: string) => void;
  /** Optional: request a specific tool/preset from the parent toolbar. */
  requestedAction?: "day_to_dusk" | "remove_furniture" | "replace_furniture" | "advanced_prompt";
  /** Bump this when requestedAction changes to ensure the drawer reacts even if the action repeats. */
  requestedActionNonce?: number;
}

export function AISuiteDrawer({ 
  isOpen, 
  onClose, 
  galleryId,
  assetUrl, 
  assetName,
  dbxPath,
  tenantId,
  isUnlocked,
  remainingEdits,
  onRequireUnlock,
  onAiSuiteUpdate,
  onComplete,
  requestedAction,
  requestedActionNonce
}: AISuiteDrawerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<AITaskType | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showReplaceStyles, setShowReplaceStyles] = useState(false);
  // Single tool: prompt-only room editing with Nano-Banana
  const tool = {
    id: "room_editor" as AITaskType,
    name: "AI Room Editor",
    desc: "Remove or replace furniture with written instructions",
    icon: Wand2,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    placeholder:
      "Examples:\n- Remove all furniture, rugs/mats, decor, and wall art\n- Change all furniture style to rattan\n- Replace dining chairs with modern black chairs",
  };

  const runWithPrompt = async (nextPrompt: string) => {
    const finalPrompt = (nextPrompt || "").trim();
    if (!finalPrompt) {
      setError("Please type an instruction (e.g. “Remove all furniture”).");
      return;
    }
    if (!isUnlocked || remainingEdits <= 0) {
      onRequireUnlock?.();
      setError(remainingEdits <= 0 ? "AI Suite limit reached. Unlock another 15 edits to continue." : "Unlock AI Suite to run edits.");
      return;
    }
    if (!prompt.trim()) {
      // keep prompt state in sync if it was empty; otherwise we may be running from a preset
    }
    setIsProcessing(true);
    setError(null);
    setActiveTask(tool.id);

    try {
      const result = await runAiSuiteRoomEditor({
        galleryId,
        assetUrl,
        prompt: finalPrompt,
        dbxPath,
      });
      if (result.success && result.outputUrl) {
        setResultUrl(result.outputUrl);
        onAiSuiteUpdate?.(result.aiSuite as any);
      } else {
        if (result.error === "AI_DISABLED") {
          setError("AI Suite is currently disabled for this studio. Please ask the platform admin to enable AI for your workspace.");
        } else if (result.error === "AI_SUITE_LOCKED" || result.error === "AI_SUITE_LIMIT") {
          onAiSuiteUpdate?.((result as any).aiSuite);
          onRequireUnlock?.();
        }
        if (result.error !== "AI_DISABLED") {
          setError((result as any).error || "AI processing failed. Please try again.");
        }
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRun = async () => runWithPrompt(prompt);

  const presetPrompts = {
    dayToDusk:
      "Transform this photo into a beautiful early dusk / golden hour scene. Keep it bright and clear (not too dark). Make interior/exterior lights glow softly and warmly where appropriate. Preserve the building/room structure exactly. Photorealistic.",
    skyReplacement:
      "Replace the sky with a perfect, beautiful clear blue sunny sky with soft wispy white clouds. Preserve the house/building, trees, and all architecture exactly. Keep lighting realistic and consistent. Photorealistic.",
    removeAllFurniture:
      "Remove ALL furniture and ALL movable items from this room (couches, chairs, tables, rugs/mats, lamps, plants, decor, wall art/frames, clutter). Leave the room completely empty. Do not change the room itself. Photorealistic.",
  } as const;

  const furnitureStyles = [
    { id: "rattan", label: "Rattan", prompt: "Replace ALL furniture with high-end rattan furniture (coastal luxury). Keep room unchanged otherwise. Photorealistic." },
    { id: "modern", label: "Modern", prompt: "Replace ALL furniture with modern luxury furniture (clean lines, neutral tones). Keep room unchanged otherwise. Photorealistic." },
    { id: "scandi", label: "Scandinavian", prompt: "Replace ALL furniture with Scandinavian style furniture (light woods, minimal, cozy). Keep room unchanged otherwise. Photorealistic." },
    { id: "coastal", label: "Coastal", prompt: "Replace ALL furniture with coastal style furniture (airy, light, natural textures). Keep room unchanged otherwise. Photorealistic." },
    { id: "minimal", label: "Minimal", prompt: "Replace ALL furniture with minimal style furniture (very clean, sparse, premium). Keep room unchanged otherwise. Photorealistic." },
  ] as const;

  const runPreset = async (p: string) => {
    setPrompt(p);
    setShowAdvanced(false);
    setShowReplaceStyles(false);
    await runWithPrompt(p);
  };

  // Allow parent toolbar buttons to deep-link into a specific preset/mode.
  useEffect(() => {
    if (!isOpen) return;
    if (!requestedAction) return;
    // If locked, trigger the same unlock flow used elsewhere.
    if (!isUnlocked || remainingEdits <= 0) {
      onRequireUnlock?.();
      return;
    }
    if (requestedAction === "day_to_dusk") {
      void runPreset(presetPrompts.dayToDusk);
      return;
    }
    if (requestedAction === "remove_furniture") {
      void runPreset(presetPrompts.removeAllFurniture);
      return;
    }
    if (requestedAction === "replace_furniture") {
      setShowAdvanced(false);
      setShowReplaceStyles(true);
      return;
    }
    if (requestedAction === "advanced_prompt") {
      setShowReplaceStyles(false);
      setShowAdvanced(true);
      return;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, requestedAction, requestedActionNonce, isUnlocked, remainingEdits]);

  const handleSaveToStorage = async () => {
    if (!resultUrl || !dbxPath || !tenantId || !activeTask) return;

    setIsSaving(true);
    setSaveStatus("idle");

    try {
      const result = await saveAIResult({
        tenantId,
        resultUrl,
        originalPathOrId: dbxPath,
        taskType: activeTask,
        // Since we don't have storageProvider here, we'll let saveAIResult handle the lookup
        // but for better efficiency we should ideally pass it. 
        // For now, let's keep it simple.
      });

      if (result.success) {
        setSaveStatus("success");
        if (onComplete) onComplete(resultUrl);
      } else {
        setSaveStatus("error");
        setError(result.error || "Failed to save to cloud storage.");
      }
    } catch (err) {
      setSaveStatus("error");
      setError("An unexpected error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!resultUrl) return;
    setIsDownloadOpen(true);
  };

  const handleReset = () => {
    setResultUrl(null);
    setError(null);
    setActiveTask(null);
    setPrompt("");
    setShowAdvanced(false);
    setShowReplaceStyles(false);
  };

  return (
    <>
      <div 
        className={cn(
          "fixed inset-0 z-[120] bg-transparent transition-all duration-500 pointer-events-none",
          isOpen ? "opacity-100 visible" : "opacity-0 invisible"
        )}
        onClick={onClose}
      />
      
      <div className={cn(
        "fixed inset-y-0 right-0 z-[121] w-full max-w-[480px] bg-slate-950 shadow-2xl flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] text-white border-l border-white/10 pointer-events-auto",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="px-8 py-8 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
              <Zap className="h-5 w-5 fill-current" />
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-tight">Studiio AI Suite</h3>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{assetName}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {error && (
            <div className="mx-8 mt-8 p-6 rounded-[32px] bg-rose-500/10 border border-rose-500/20 flex flex-col gap-3 text-rose-500 animate-in zoom-in-95">
              <div className="flex items-center gap-3 font-bold text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error.includes("credit") ? "Account Credit Required" : error.includes("scope") ? "Dropbox Permissions Required" : "Processing Error"}
              </div>
              <p className="text-[10px] leading-relaxed opacity-80 font-medium ml-7">
                {error}
              </p>
              {error.includes("credit") && (
                <a 
                  href="https://replicate.com/account/billing" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="ml-7 text-[10px] font-bold uppercase tracking-widest underline hover:opacity-80"
                >
                  Go to Replicate Billing →
                </a>
              )}
              {error.includes("scope") && (
                <p className="ml-7 text-[10px] font-bold text-white/40 leading-relaxed italic">
                  Tip: Go to your Dropbox App Console and enable 'files.content.write' scope, then reconnect your account.
                </p>
              )}
            </div>
          )}

          {!resultUrl ? (
            <div className="p-8 space-y-8">
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex items-center gap-4 mb-2">
                  <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center shrink-0", tool.bg, tool.color)}>
                    <tool.icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                      {tool.name}
                    </p>
                    <h4 className="text-sm font-bold text-white/90">
                      {tool.desc}
                    </h4>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                      isUnlocked && remainingEdits > 0
                        ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-200 border-rose-500/20"
                    )}>
                      {isUnlocked ? `${Math.max(0, remainingEdits)} / 15` : "Locked"}
                    </span>
                  </div>
                </div>

                <div className="p-6 bg-white/5 rounded-[32px] border border-white/10 space-y-4">
                  {!isUnlocked && (
                    <div className="p-4 rounded-2xl border border-white/10 bg-white/5">
                      <p className="text-xs font-bold text-white/80">
                        Premium feature: unlock AI Suite for <span className="font-black">$50</span> (includes <span className="font-black">15 edits</span>).
                      </p>
                      <button
                        type="button"
                        onClick={() => onRequireUnlock?.()}
                        className="mt-3 w-full h-10 rounded-2xl bg-primary text-white font-bold text-[10px] uppercase tracking-widest"
                      >
                        Unlock AI Suite
                      </button>
                    </div>
                  )}
                  {isUnlocked && remainingEdits <= 0 && (
                    <div className="p-4 rounded-2xl border border-white/10 bg-white/5">
                      <p className="text-xs font-bold text-white/80">
                        You’ve used all <span className="font-black">15 edits</span> for this gallery.
                      </p>
                      <button
                        type="button"
                        onClick={() => onRequireUnlock?.()}
                        className="mt-3 w-full h-10 rounded-2xl bg-primary text-white font-bold text-[10px] uppercase tracking-widest"
                      >
                        Unlock another 15 edits ($50)
                      </button>
                    </div>
                  )}

                  {/* Presets (one-press) */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      disabled={isProcessing || !isUnlocked || remainingEdits <= 0}
                      onClick={() => runPreset(presetPrompts.dayToDusk)}
                      className="h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      <Moon className="h-4 w-4" />
                      Day to Dusk
                    </button>
                    <button
                      disabled={isProcessing || !isUnlocked || remainingEdits <= 0}
                      onClick={() => runPreset(presetPrompts.skyReplacement)}
                      className="h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      <Sun className="h-4 w-4" />
                      Sky Replace
                    </button>
                    <button
                      disabled={isProcessing || !isUnlocked || remainingEdits <= 0}
                      onClick={() => runPreset(presetPrompts.removeAllFurniture)}
                      className="h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 col-span-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove ALL Furniture
                    </button>
                    <button
                      disabled={isProcessing || !isUnlocked || remainingEdits <= 0}
                      onClick={() => setShowReplaceStyles(v => !v)}
                      className="h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 col-span-2"
                    >
                      <Sofa className="h-4 w-4" />
                      Replace ALL Furniture
                      <ChevronDown className={cn("h-4 w-4 transition-transform", showReplaceStyles && "rotate-180")} />
                    </button>
                  </div>

                  {showReplaceStyles && (
                    <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-200">
                      {furnitureStyles.map((s) => (
                        <button
                          key={s.id}
                          disabled={isProcessing || !isUnlocked || remainingEdits <= 0}
                          onClick={() => runPreset(s.prompt)}
                          className="h-11 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-100 font-black text-[10px] uppercase tracking-widest flex items-center justify-center transition-all disabled:opacity-50"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Advanced prompt (hidden by default) */}
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(v => !v)}
                    className="w-full h-10 rounded-2xl bg-white/0 hover:bg-white/5 border border-white/10 text-white/70 font-black text-[9px] uppercase tracking-widest transition-all"
                  >
                    {showAdvanced ? "Hide Advanced" : "Advanced"}
                  </button>

                  {showAdvanced && (
                    <div className="space-y-3 animate-in fade-in duration-200">
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={tool.placeholder}
                        className="w-full bg-transparent border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 resize-none h-32 font-medium leading-relaxed"
                      />
                      <button
                        onClick={handleRun}
                        disabled={isProcessing || !isUnlocked || remainingEdits <= 0}
                        className="w-full h-12 rounded-2xl bg-primary text-white font-bold text-xs uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <Sparkles className="h-4 w-4" />
                        Run AI (Advanced)
                      </button>
                    </div>
                  )}

                  {isProcessing && (
                    <div className="p-8 text-center space-y-4">
                      <CameraLoader size="lg" className="text-primary mx-auto" />
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        Running Nano-Banana…
                      </p>
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-white/35 leading-relaxed">
                  Tip: “Remove all furniture” is best-effort without masking. If you want extremely precise removal later, we can add auto-masking — but per your request this version is prompt-only.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-8 space-y-8 animate-in fade-in duration-500">
              {/* Result Preview */}
              <div className="space-y-4">
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3" />
                  AI Enhancement Complete
                </p>
                <div className="relative aspect-[4/3] rounded-[40px] overflow-hidden border border-white/10 bg-slate-900 shadow-2xl shadow-primary/10">
                  <img src={resultUrl} alt="AI Result" className="h-full w-full object-cover" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={handleDownload}
                  className="w-full h-14 rounded-2xl bg-white text-slate-950 font-bold flex items-center justify-center gap-3 hover:bg-slate-100 transition-all shadow-lg shadow-white/5"
                >
                  <Download className="h-5 w-5" />
                  Download (Print / Web / Social)
                </button>
                
                <button 
                  onClick={handleReset}
                  className="h-14 rounded-2xl bg-white/5 text-white/60 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-all border border-white/5"
                >
                  Try Another
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Loading Overlay */}
        {(isProcessing || isSaving) && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-12 text-center">
            <CameraLoader size="lg" className="text-primary mb-8" />
            <h4 className="text-2xl font-bold tracking-tight mb-2 uppercase">
              {isSaving ? "Saving to Dropbox..." : "AI Reimagining..."}
            </h4>
            <p className="text-xs font-medium text-white/40 max-w-[240px] leading-relaxed">
              {isSaving 
                ? "We're pushing the enhanced version back to your production folder. This will be available instantly."
                : "We're communicating with the neural engines to transform your production assets. This usually takes 10-20 seconds."}
            </p>
          </div>
        )}

        {/* Footer info */}
        <div className="px-8 py-6 border-t border-white/5 bg-white/[0.02] text-center">
          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">
            Powered by Replicate & Studiio Neural Engines
          </p>
        </div>
      </div>

      {isDownloadOpen && resultUrl && (
        <DownloadManager
          galleryId={galleryId}
          assets={[
            {
              name: `AI-${assetName}`,
              url: resultUrl,
            },
          ]}
          aiSaveToDropbox={
            tenantId && dbxPath && assetName && resultUrl
              ? {
                  tenantId,
                  galleryId,
                  originalPath: dbxPath,
                  originalName: assetName,
                  resultUrl,
                }
              : null
          }
          onClose={() => setIsDownloadOpen(false)}
        />
      )}
    </>
  );
}
