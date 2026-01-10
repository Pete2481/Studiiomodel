"use client";

import React, { useState } from "react";
import { 
  Zap, 
  Eraser, 
  Sofa, 
  Sun, 
  Moon, 
  X, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Download,
  Share2,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CameraLoader } from "@/components/ui/camera-loader";
import { processImageWithAI, AITaskType } from "@/app/actions/ai-edit";
import { saveAIResultToDropbox } from "@/app/actions/dropbox";
import { AI_STAGING_STYLES, AIStyleSuite, AI_FURNITURE_BUNDLES, AIFurnitureBundle } from "@/lib/ai-styles";

interface AISuiteDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  assetUrl: string;
  assetName: string;
  dbxPath?: string;
  tenantId?: string;
  onComplete?: (newUrl: string) => void;
  onStartPlacement?: () => void;
  maskData?: string | null;
}

export function AISuiteDrawer({ 
  isOpen, 
  onClose, 
  assetUrl, 
  assetName,
  dbxPath,
  tenantId,
  onComplete,
  onStartPlacement,
  maskData: externalMaskData
}: AISuiteDrawerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<AITaskType | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [stagingStep, setStagingStep] = useState<"select_style" | "room_type" | "select_furniture" | "placement" | "ready">("select_style");
  const [selectedStyle, setSelectedStyle] = useState<AIStyleSuite | null>(null);
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [selectedBundle, setSelectedBundle] = useState<AIFurnitureBundle | null>(null);
  const [maskData, setMaskData] = useState<string | null>(null);

  const roomTypes = [
    "Living Room", "Dining Room", "Bedroom", "Kitchen", "Home Office", "Media Room", "Outdoor / Patio"
  ];

  const tools = [
    { 
      id: "sky_replacement" as AITaskType, 
      name: "Blue Sky Swap", 
      icon: Sun, 
      desc: "Replace grey skies with perfect blue",
      color: "text-blue-500",
      bg: "bg-blue-500/10"
    },
    { 
      id: "day_to_dusk" as AITaskType, 
      name: "Day to Dusk", 
      icon: Moon, 
      desc: "Golden hour & soft twilight",
      color: "text-orange-400",
      bg: "bg-orange-400/10"
    },
    { 
      id: "object_removal" as AITaskType, 
      name: "Object Removal", 
      icon: Eraser, 
      desc: "Erase clutter & power lines",
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      needsPrompt: true,
      placeholder: "e.g. Remove the red trash can and power lines"
    },
    { 
      id: "virtual_staging" as AITaskType, 
      name: "Virtual Staging", 
      icon: Sofa, 
      desc: "Furnish empty rooms with AI",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      needsPrompt: false, // Handled via multi-step flow
      placeholder: "e.g. Modern luxury living room furniture"
    },
  ];

  const handleProcess = async (tool: typeof tools[0]) => {
    if (tool.needsPrompt && !prompt) {
      setError("Please describe what you want the AI to do.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setActiveTask(tool.id);

    try {
      let finalPrompt = prompt;
      if (tool.id === "virtual_staging" && selectedStyle) {
        const bundleContext = selectedBundle 
          ? `using this exact furniture set: ${selectedBundle.prompt}` 
          : selectedStyle.prompt;
        
        const roomContext = selectedRoomTypes.length > 0 
          ? `specifically for a ${selectedRoomTypes.join(" and ")}` 
          : "specifically for this room";
          
        finalPrompt = `${bundleContext}, ${roomContext}`;
      }

      const result = await processImageWithAI(assetUrl, tool.id, finalPrompt, dbxPath, tenantId, externalMaskData || undefined);
      if (result.success && result.outputUrl) {
        setResultUrl(result.outputUrl);
      } else {
        setError(result.error || "AI processing failed. Please try again.");
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToDropbox = async () => {
    if (!resultUrl || !dbxPath || !tenantId || !activeTask) return;

    setIsSaving(true);
    setSaveStatus("idle");

    try {
      const result = await saveAIResultToDropbox({
        tenantId,
        resultUrl,
        originalPath: dbxPath,
        taskType: activeTask
      });

      if (result.success) {
        setSaveStatus("success");
        if (onComplete) onComplete(resultUrl);
      } else {
        setSaveStatus("error");
        setError(result.error || "Failed to save to Dropbox.");
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
    
    try {
      const response = await fetch(resultUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AI_${activeTask}_${assetName}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download failed:", err);
      // Fallback: open in new tab
      window.open(resultUrl, '_blank');
    }
  };

  const handleReset = () => {
    setResultUrl(null);
    setError(null);
    setActiveTask(null);
    setPrompt("");
    setStagingStep("select_style");
    setSelectedStyle(null);
    setSelectedRoomTypes([]);
    setSelectedBundle(null);
    setMaskData(null);
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
              {/* Virtual Staging Multi-Step Flow */}
              {activeTask === "virtual_staging" ? (
                <div className="space-y-8 animate-in fade-in duration-500">
                  {/* Step Header */}
                  <div className="flex items-center gap-4 mb-2">
                    <button 
                      onClick={() => {
                        if (stagingStep === "select_style") setActiveTask(null);
                        else if (stagingStep === "room_type") setStagingStep("select_style");
                        else if (stagingStep === "select_furniture") setStagingStep("room_type");
                        else if (stagingStep === "placement") setStagingStep("select_furniture");
                        else if (stagingStep === "ready") setStagingStep("placement");
                      }}
                      className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10"
                    >
                      <X className="h-4 w-4 rotate-45" /> {/* Using rotate as a back arrow for now */}
                    </button>
                    <div>
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                        Step {stagingStep === "select_style" ? "1 of 4" : stagingStep === "room_type" ? "2 of 4" : stagingStep === "select_furniture" ? "3 of 4" : "4 of 4"}
                      </p>
                      <h4 className="text-sm font-bold">
                        {stagingStep === "select_style" ? "Pick Your Design Style" : stagingStep === "room_type" ? "What room is this?" : stagingStep === "select_furniture" ? "Select Furniture Set" : "Place Your Furniture"}
                      </h4>
                    </div>
                  </div>

                  {stagingStep === "select_style" ? (
                    <div className="grid grid-cols-2 gap-4">
                      {AI_STAGING_STYLES.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => {
                            setSelectedStyle(style);
                            setStagingStep("room_type");
                          }}
                          className="group relative aspect-[4/3] rounded-2xl overflow-hidden border-2 border-transparent hover:border-primary transition-all text-left"
                        >
                          <img src={style.thumbnail} className="h-full w-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt={style.name} />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-4 flex flex-col justify-end">
                            <p className="font-bold text-[11px] uppercase tracking-wider">{style.name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : stagingStep === "room_type" ? (
                    <div className="space-y-6 animate-in slide-in-from-right duration-300">
                      <div className="grid grid-cols-1 gap-2">
                        {roomTypes.map((type) => {
                          const isSelected = selectedRoomTypes.includes(type);
                          return (
                            <button
                              key={type}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedRoomTypes(prev => prev.filter(t => t !== type));
                                } else {
                                  setSelectedRoomTypes(prev => [...prev, type]);
                                }
                              }}
                              className={cn(
                                "flex items-center justify-between px-6 py-4 rounded-2xl border-2 transition-all font-bold text-sm",
                                isSelected 
                                  ? "bg-primary/10 border-primary text-primary" 
                                  : "bg-white/5 border-white/5 text-white/60 hover:bg-white/10"
                              )}
                            >
                              {type}
                              {isSelected && <CheckCircle2 className="h-4 w-4" />}
                            </button>
                          );
                        })}
                      </div>
                      
                      <button
                        onClick={() => setStagingStep("select_furniture")}
                        disabled={selectedRoomTypes.length === 0}
                        className="w-full h-12 rounded-2xl bg-primary text-white font-bold text-xs uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        Next: Select Furniture
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  ) : stagingStep === "select_furniture" ? (
                    <div className="space-y-6 animate-in slide-in-from-right duration-300">
                      <div className="grid grid-cols-1 gap-4">
                        {AI_FURNITURE_BUNDLES.filter(b => selectedRoomTypes.includes(b.roomType)).length > 0 ? (
                          AI_FURNITURE_BUNDLES
                            .filter(b => selectedRoomTypes.includes(b.roomType))
                            .map((bundle) => (
                              <button
                                key={bundle.id}
                                onClick={() => {
                                  setSelectedBundle(bundle);
                                  setStagingStep("placement");
                                  if (onStartPlacement) onStartPlacement();
                                }}
                                className="group relative aspect-[16/9] rounded-[32px] overflow-hidden border-2 border-transparent hover:border-primary transition-all text-left bg-slate-900"
                              >
                                <img src={bundle.thumbnail} className="h-full w-full object-contain p-4 opacity-80 group-hover:opacity-100 transition-opacity" alt={bundle.name} />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-6 flex flex-col justify-end">
                                  <p className="font-bold text-xs uppercase tracking-widest text-white">{bundle.name}</p>
                                </div>
                              </button>
                            ))
                        ) : (
                          <div className="p-8 text-center bg-white/5 rounded-[32px] border border-dashed border-white/10">
                            <p className="text-xs font-medium text-white/40">No specific bundles found for this room type. You can still use the general style.</p>
                            <button 
                              onClick={() => setStagingStep("placement")}
                              className="mt-4 text-primary font-bold text-[10px] uppercase tracking-widest hover:underline"
                            >
                              Skip to placement →
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 animate-in slide-in-from-right duration-300">
                      <div className="p-6 bg-white/5 rounded-3xl border border-white/10 text-center space-y-4">
                        <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                          {externalMaskData ? <CheckCircle2 className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
                        </div>
                        <p className="text-xs font-medium text-white/60">
                          {externalMaskData 
                            ? "Placement areas marked! You're ready to launch." 
                            : "To get the best results, draw boxes or simple blobs where you'd like the furniture placed."}
                        </p>
                        
                        {!externalMaskData && (
                          <button
                            onClick={onStartPlacement}
                            className="w-full h-10 rounded-xl bg-white/5 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all border border-white/5"
                          >
                            Open Placement Tool
                          </button>
                        )}

                        <button
                          onClick={() => {
                            handleProcess(tools.find(t => t.id === "virtual_staging")!);
                          }}
                          className="w-full h-12 rounded-2xl bg-primary text-white font-bold text-xs uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2"
                        >
                          Launch AI with {selectedStyle?.name}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Standard Tool Selection */
                <div className="grid grid-cols-1 gap-4">
                  {tools.map((tool) => (
                    <div key={tool.id} className="space-y-4">
                      <button 
                        onClick={() => {
                          if (tool.id === "virtual_staging") {
                            setActiveTask("virtual_staging");
                            setStagingStep("select_style");
                          } else if (tool.needsPrompt) {
                            setActiveTask(tool.id);
                          } else {
                            handleProcess(tool);
                          }
                        }}
                        disabled={isProcessing}
                        className={cn(
                          "w-full flex items-center gap-4 p-6 rounded-[32px] border transition-all text-left group relative overflow-hidden",
                          activeTask === tool.id 
                            ? "bg-white/10 border-white/20 ring-2 ring-primary/20" 
                            : "bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10",
                          isProcessing && activeTask !== tool.id && "opacity-40"
                        )}
                      >
                        <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", tool.bg, tool.color)}>
                          <tool.icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm tracking-tight">{tool.name}</p>
                          <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">{tool.desc}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-white/20 group-hover:translate-x-1 transition-all" />
                      </button>

                      {activeTask === tool.id && tool.needsPrompt && !isProcessing && (tool.id as string) !== "virtual_staging" && (
                        <div className="p-6 bg-white/5 rounded-[32px] border border-white/10 space-y-4 animate-in slide-in-from-top-4 duration-300">
                          <textarea
                            autoFocus
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={tool.placeholder}
                            className="w-full bg-transparent border-none p-0 text-sm text-white placeholder:text-white/20 focus:ring-0 resize-none h-24 font-medium"
                          />
                          <button
                            onClick={() => handleProcess(tool)}
                            className="w-full h-12 rounded-2xl bg-primary text-white font-bold text-xs uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2"
                          >
                            <Sparkles className="h-4 w-4" />
                            Launch AI Model
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
                  Download High-Res
                </button>
                
                <button 
                  onClick={handleSaveToDropbox}
                  disabled={isSaving || saveStatus === "success"}
                  className={cn(
                    "w-full h-14 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all border border-white/10",
                    saveStatus === "success" 
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                      : "bg-white/5 text-white hover:bg-white/10"
                  )}
                >
                  {isSaving ? (
                    <CameraLoader size="sm" color="currentColor" />
                  ) : saveStatus === "success" ? (
                    <>
                      <CheckCircle2 className="h-5 w-5" />
                      Saved to Dropbox
                    </>
                  ) : (
                    <>
                      <Share2 className="h-5 w-5 opacity-40" />
                      Save back to Dropbox
                    </>
                  )}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(resultUrl);
                      alert("Result URL copied to clipboard!");
                    }}
                    className="h-14 rounded-2xl bg-white/5 text-white/60 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-all border border-white/5"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Copy Link
                  </button>
                  <button 
                    onClick={handleReset}
                    className="h-14 rounded-2xl bg-white/5 text-white/60 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-all border border-white/5"
                  >
                    Try Another
                  </button>
                </div>
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
    </>
  );
}
