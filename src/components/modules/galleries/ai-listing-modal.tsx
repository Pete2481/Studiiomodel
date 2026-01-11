"use client";

import React, { useState, useEffect } from "react";
import { 
  X, 
  Sparkles, 
  Save, 
  AlertCircle,
  Layout,
  Clock,
  Wand2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CameraLoader } from "@/components/ui/camera-loader";
import { generateListingCopy, updateListingSelection } from "@/app/actions/listing-copy";

interface AIListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  galleryTitle: string;
  initialCopy?: string;
  isPublished?: boolean;
}

export function AIListingModal({ 
  isOpen, 
  onClose, 
  galleryId, 
  galleryTitle,
  initialCopy = "",
  isPublished = false
}: AIListingModalProps) {
  const [variants, setVariants] = useState<{ signature: string; standard: string; extended: string }>(() => ({
    signature: initialCopy || "",
    standard: "",
    extended: "",
  }));
  const [selectedVariant, setSelectedVariant] = useState<"signature" | "standard" | "extended">("signature");
  const [editorText, setEditorText] = useState(initialCopy || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<number>(0);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasDownloaded, setHasDownloaded] = useState(false);

  // Selection states for Smart Edit
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [isSmartEditing, setIsSmartEditing] = useState(false);
  const [smartEditPrompt, setSmartEditPrompt] = useState("");

  const steps = [
    "Analyzing floor plans for exact specs...",
    "Scanning exterior shots for architectural style...",
    "Extracting lifestyle features and vibe...",
    "Weaving high-end copy in your Byron voice..."
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      setGenerationStep(0);
      interval = setInterval(() => {
        setGenerationStep(prev => (prev < steps.length - 1 ? prev + 1 : prev));
      }, 30000); // Progress roughly every 30s for a 2-4 min window
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  const handleTextSelection = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const text = target.value.substring(start, end);

    if (text && text.trim().length > 5) {
      setSelection({ start, end, text });
    } else {
      setSelection(null);
    }
  };

  const handleSmartEdit = async () => {
    if (!selection || !smartEditPrompt) return;
    
    setIsGenerating(true);
    setIsSmartEditing(false);
    setError(null);
    setGenerationStep(3); // Go straight to the "Weaving copy" step visual

    try {
      const result = await updateListingSelection(
        galleryId,
        editorText,
        selection.text,
        smartEditPrompt
      );

      if (result.success && result.updatedText) {
        setEditorText(result.updatedText);
        setVariants(prev => ({ ...prev, [selectedVariant]: result.updatedText }));
        setSelection(null);
        setSmartEditPrompt("");
      } else {
        setError(result.error || "Failed to update selection.");
      }
    } catch (err) {
      setError("An unexpected error occurred during smart edit.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setStatus("idle");
    setHasDownloaded(false);

    try {
      const result = await generateListingCopy(galleryId);
      if (result.success && (result as any).variants) {
        const v = (result as any).variants as { signature: string; standard: string; extended: string };
        setVariants(v);
        setSelectedVariant("signature");
        setEditorText(v.signature || "");
      } else {
        setError(result.error || "Failed to generate copy.");
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadTxt = (label: string, text: string) => {
    const safeTitle = (galleryTitle || "listing")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const filename = `${safeTitle || "listing"}-${safeLabel}.txt`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    setHasDownloaded(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300"
        onClick={() => {
          if (!hasDownloaded && editorText) return;
          onClose();
        }}
      />
      
      <div className="relative w-full max-w-4xl bg-white rounded-[40px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
        {/* Header */}
        <div className="px-8 py-8 border-b border-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/10 shadow-inner">
              <Sparkles className="h-6 w-6 fill-current" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">AI Listing Genius</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{galleryTitle}</p>
            </div>
          </div>
          <button 
            onClick={() => {
              if (!hasDownloaded && editorText) return;
              onClose();
            }}
            className="h-10 w-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all border border-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          {/* Main Workspace */}
          <div className="flex-1 flex flex-col p-8 gap-6 overflow-hidden relative">
            {isGenerating && (
              <div className="absolute inset-0 bg-white flex flex-col items-center justify-center p-4 text-center animate-in fade-in duration-500 z-[100]">
                <div className="flex flex-col items-center gap-6">
                  <div className="relative h-24 w-24 flex items-center justify-center">
                    <CameraLoader size="sm" className="text-primary scale-[1.4]" />
                    <div className="absolute -inset-8 bg-primary/5 rounded-full animate-pulse -z-10" />
                  </div>
                  
                  <div className="max-w-[400px] space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-xl font-black text-slate-900 tracking-tight">AI Deep Dive in Progress</h4>
                      <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] animate-pulse">
                        {steps[generationStep]}
                      </p>
                    </div>
                    
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex items-center gap-2.5 px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl shadow-sm">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Usually takes 2-4 minutes
                        </p>
                      </div>

                      <div className="w-[220px] h-1 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <div 
                          className="h-full bg-primary transition-all duration-1000 ease-in-out shadow-[0_0_10px_rgba(var(--primary),0.3)]"
                          style={{ width: `${((generationStep + 1) / steps.length) * 100}%` }}
                        />
                      </div>
                      <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">
                        Step {generationStep + 1} of {steps.length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!editorText && !isGenerating ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
                <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-200">
                  <Layout className="h-10 w-10" />
                </div>
                <div className="max-w-md space-y-2">
                  <h4 className="text-lg font-bold text-slate-900 tracking-tight">Generate Professional Copy</h4>
                  <p className="text-sm font-medium text-slate-400">
                    Our AI will analyze your gallery images, floor plans, and property address to write a high-end listing mirrored after your best Byron Bay copy.
                  </p>
                </div>
                <button
                  onClick={handleGenerate}
                  className="h-14 px-8 rounded-2xl bg-slate-900 text-white font-black uppercase text-[11px] tracking-widest hover:scale-105 transition-all shadow-xl flex items-center gap-3 active:scale-95"
                >
                  <Sparkles className="h-4 w-4 fill-current text-primary" />
                  Launch Engine
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4 min-h-0">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Listing Draft</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => downloadTxt(
                        selectedVariant === "signature" ? "Signature" : selectedVariant === "standard" ? "Standard" : "Extended",
                        editorText
                      )}
                      className="h-8 px-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all border border-slate-900"
                    >
                      <Save className="h-3 w-3 text-primary" />
                      Download .txt
                    </button>
                  </div>
                </div>

                {/* Variant Picker */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { key: "signature", label: "Signature", desc: "Balanced, Byron relaxed-luxury" },
                    { key: "standard", label: "Standard", desc: "Executive premium (your standard format)" },
                    { key: "extended", label: "Extended", desc: "Long-form, emotive, persuasive" },
                  ] as const).map((v) => {
                    const text = variants[v.key] || "";
                    const isActive = selectedVariant === v.key;
                    return (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => {
                          setSelectedVariant(v.key);
                          setEditorText(text);
                          setSelection(null);
                          setIsSmartEditing(false);
                        }}
                        className={cn(
                          "p-4 rounded-2xl border text-left transition-all",
                          isActive ? "border-primary bg-primary/5" : "border-slate-100 bg-white hover:bg-slate-50"
                        )}
                      >
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-900">{v.label}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1">{v.desc}</p>
                        <p className="mt-3 text-[10px] font-medium text-slate-500 line-clamp-2">
                          {text ? text.replace(/\s+/g, " ").slice(0, 140) : "Not generated yet"}
                        </p>
                      </button>
                    );
                  })}
                </div>
                
                <div className="flex-1 relative border border-slate-100 rounded-[32px] overflow-hidden bg-slate-50/30">
                  <textarea
                    id="copy-editor"
                    value={editorText}
                    onChange={(e) => {
                      setEditorText(e.target.value);
                      setVariants(prev => ({ ...prev, [selectedVariant]: e.target.value }));
                    }}
                    onSelect={handleTextSelection}
                    className="w-full h-full p-8 text-sm font-medium text-slate-700 bg-transparent border-none focus:ring-0 resize-none leading-relaxed custom-scrollbar"
                    placeholder="AI writing magic..."
                  />

                  {/* Smart AI Selection Toolbar */}
                  {selection && !isGenerating && !isSmartEditing && (
                    <div 
                      className="absolute left-1/2 -translate-x-1/2 bottom-8 z-20 animate-in slide-in-from-bottom-4 duration-300"
                    >
                      <button
                        onClick={() => setIsSmartEditing(true)}
                        className="h-12 px-6 rounded-2xl bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest flex items-center gap-2.5 shadow-2xl hover:scale-105 active:scale-95 transition-all border border-slate-700"
                      >
                        <Wand2 className="h-3.5 w-3.5 text-primary" />
                        Smart AI Update
                      </button>
                    </div>
                  )}

                  {/* Smart Edit Input Panel */}
                  {isSmartEditing && (
                    <div className="absolute inset-x-0 bottom-0 p-8 z-30 animate-in slide-in-from-bottom-full duration-500">
                      <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 p-6 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rewriting Highlighted Section</p>
                          </div>
                          <button 
                            onClick={() => {
                              setIsSmartEditing(false);
                              setSmartEditPrompt("");
                            }}
                            className="text-[10px] font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest transition-colors"
                          >
                            Cancel
                          </button>
                        </div>

                        <div className="flex gap-3">
                          <input
                            autoFocus
                            value={smartEditPrompt}
                            onChange={(e) => setSmartEditPrompt(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && smartEditPrompt) handleSmartEdit();
                            }}
                            placeholder="e.g. 'Make this more punchy', 'Add detail about the stone benches'..."
                            className="flex-1 h-12 bg-slate-50 border border-slate-100 rounded-xl px-4 text-xs font-medium focus:ring-2 focus:ring-primary/20 transition-all"
                          />
                          <button
                            onClick={handleSmartEdit}
                            disabled={!smartEditPrompt || isGenerating}
                            className="h-12 px-6 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all disabled:opacity-50"
                          >
                            Rewrite
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 flex items-center gap-3 text-rose-500 animate-in zoom-in-95">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="text-[10px] font-bold uppercase tracking-widest">{error}</p>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-8 border-t border-slate-50 bg-slate-50/50 flex items-center justify-between shrink-0">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="h-12 px-6 rounded-xl text-slate-400 hover:text-slate-900 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Regenerate
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  // Explicit discard to allow closing without download
                  setHasDownloaded(true);
                  onClose();
                }}
                className="h-12 px-6 rounded-2xl bg-white text-rose-500 font-black uppercase text-[10px] tracking-widest hover:bg-rose-50 transition-all border border-rose-100 flex items-center gap-2 shadow-sm"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                No, I don't want the copy
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


