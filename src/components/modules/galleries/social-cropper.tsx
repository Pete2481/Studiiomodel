"use client";

import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { X, Check, Smartphone, Monitor, Square, ChevronRight, Share2, Download, Loader2, Sun, Contrast, Droplets, ThermometerSun, Sliders, Crop as CropIcon, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SocialCropperProps {
  imageUrl: string;
  imageName: string;
  onClose: () => void;
  onSave?: (blob: Blob) => void;
}

const PRESETS = [
  { id: "original", label: "No Crop", ratio: undefined, icon: ImageIcon },
  { id: "square", label: "IG Post", ratio: 1, icon: Square },
  { id: "portrait", label: "IG Portrait", ratio: 4 / 5, icon: Monitor },
  { id: "story", label: "Story / TikTok", ratio: 9 / 16, icon: Smartphone },
  { id: "landscape", label: "FB Cover", ratio: 16 / 9, icon: Monitor },
];

const ADJUSTMENTS = [
  { id: "exposure", label: "Exposure", icon: Sun, min: 50, max: 150, defaultValue: 100, unit: "%" },
  { id: "contrast", label: "Contrast", icon: Contrast, min: 50, max: 150, defaultValue: 100, unit: "%" },
  { id: "saturation", label: "Saturation", icon: Droplets, min: 0, max: 200, defaultValue: 100, unit: "%" },
  { id: "warmth", label: "Warmth", icon: ThermometerSun, min: -50, max: 50, defaultValue: 0, unit: "" },
];

export function SocialCropper({ imageUrl, imageName, onClose, onSave }: SocialCropperProps) {
  const [activeTab, setActiveTab] = useState<"crop" | "adjust">("crop");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState(PRESETS[0].ratio);
  const [activePreset, setActivePreset] = useState(PRESETS[0].id);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Color Adjustments State
  const [adjustValues, setAdjustValues] = useState<Record<string, number>>({
    exposure: 100,
    contrast: 100,
    saturation: 100,
    warmth: 0,
  });
  const [activeAdjId, setActiveAdjId] = useState(ADJUSTMENTS[0].id);

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const getFilterString = () => {
    const { exposure, contrast, saturation, warmth } = adjustValues;
    return `brightness(${exposure}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${warmth > 0 ? warmth : 0}%) hue-rotate(${warmth < 0 ? warmth : 0}deg)`;
  };

  const generateCroppedImage = async (mode: 'download' | 'share') => {
    setIsGenerating(true);

    try {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = imageUrl;
      
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const isNoCrop = activePreset === "original";

      if (isNoCrop) {
        canvas.width = image.width;
        canvas.height = image.height;
      } else if (croppedAreaPixels) {
        canvas.width = croppedAreaPixels.width;
        canvas.height = croppedAreaPixels.height;
      } else {
        return;
      }

      // Apply Filters to Canvas
      ctx.filter = getFilterString();

      if (isNoCrop) {
        ctx.drawImage(image, 0, 0);
      } else if (croppedAreaPixels) {
        ctx.drawImage(
          image,
          croppedAreaPixels.x,
          croppedAreaPixels.y,
          croppedAreaPixels.width,
          croppedAreaPixels.height,
          0,
          0,
          croppedAreaPixels.width,
          croppedAreaPixels.height
        );
      }

      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.95));
      const file = new File([blob], `studiio-social-${imageName}`, { type: "image/jpeg" });

      if (mode === 'share' && navigator.share) {
        try {
          await navigator.share({
            files: [file],
            title: 'Studiio Social Edit',
            text: 'Check out this shot from my latest production!'
          });
        } catch (err) {
          if (onSave) onSave(blob);
          else downloadBlob(blob);
        }
      } else {
        if (onSave) onSave(blob);
        else downloadBlob(blob);
      }
    } catch (err) {
      console.error("Edit generation failed:", err);
      alert("Failed to generate image. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `studiio-social-${imageName}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-md animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between p-6 shrink-0 border-b border-white/5">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all border border-white/5"
          >
            <X className="h-5 w-5" />
          </button>
          <div>
            <p className="text-xs font-black text-primary uppercase tracking-widest">SOCIAL EDIT</p>
            <h3 className="text-sm font-bold text-white tracking-tight">Fine-tune your production shot</h3>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab Switcher */}
          <div className="flex bg-white/5 p-1 rounded-full border border-white/10 mr-4">
            <button 
              onClick={() => setActiveTab("crop")}
              className={cn(
                "h-9 px-6 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "crop" ? "bg-white text-slate-950" : "text-white/40 hover:text-white"
              )}
            >
              <CropIcon className="h-3.5 w-3.5" />
              Crop
            </button>
            <button 
              onClick={() => setActiveTab("adjust")}
              className={cn(
                "h-9 px-6 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                activeTab === "adjust" ? "bg-white text-slate-950" : "text-white/40 hover:text-white"
              )}
            >
              <Sliders className="h-3.5 w-3.5" />
              Adjust
            </button>
          </div>

          <button 
            onClick={() => generateCroppedImage('share')}
            disabled={isGenerating}
            className="hidden md:flex h-11 px-6 rounded-full bg-white text-slate-950 text-xs font-black uppercase tracking-widest items-center gap-2 hover:scale-105 transition-all shadow-xl disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Share
          </button>
          
          <button 
            onClick={() => generateCroppedImage('download')}
            disabled={isGenerating}
            className="h-11 px-6 rounded-full bg-primary text-white text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-xl disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
        {/* Sidebar */}
        <div className="w-full md:w-72 bg-black/20 p-6 flex flex-col gap-6 shrink-0 overflow-y-auto custom-scrollbar border-r border-white/5">
          {activeTab === "crop" ? (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4">Select Preset</p>
                <div className="grid grid-cols-1 gap-2">
                  {PRESETS.map((preset) => {
                    const Icon = preset.icon;
                    const isActive = activePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setAspect(preset.ratio);
                          setActivePreset(preset.id);
                        }}
                        className={cn(
                          "h-14 px-4 rounded-2xl flex items-center gap-4 transition-all border",
                          isActive 
                            ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" 
                            : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
                          isActive ? "bg-white/20" : "bg-white/5"
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] font-black uppercase tracking-tight">{preset.label}</p>
                          <p className="text-[9px] font-medium opacity-60">
                            {preset.id === "original" ? "Original" : preset.ratio === 1 ? "1:1" : preset.ratio === 0.8 ? "4:5" : preset.ratio && preset.ratio < 1 ? "9:16" : "16:9"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4">Adjustments</p>
                <div className="grid grid-cols-1 gap-2">
                  {ADJUSTMENTS.map((adj) => {
                    const Icon = adj.icon;
                    const isActive = activeAdjId === adj.id;
                    const currentVal = adjustValues[adj.id];
                    const isChanged = currentVal !== adj.defaultValue;

                    return (
                      <button
                        key={adj.id}
                        onClick={() => setActiveAdjId(adj.id)}
                        className={cn(
                          "h-14 px-4 rounded-2xl flex items-center gap-4 transition-all border",
                          isActive 
                            ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" 
                            : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center transition-colors relative",
                          isActive ? "bg-white/20" : "bg-white/5",
                          isChanged && !isActive && "text-primary"
                        )}>
                          <Icon className="h-4 w-4" />
                          {isChanged && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
                          )}
                        </div>
                        <div className="text-left flex-1">
                          <p className="text-[10px] font-black uppercase tracking-tight">{adj.label}</p>
                          <p className="text-[9px] font-medium opacity-60">
                            {currentVal}{adj.unit}
                          </p>
                        </div>
                        {isActive && isChanged && (
                          <span 
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAdjustValues(prev => ({ ...prev, [adj.id]: adj.defaultValue }));
                            }}
                            className="text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-white cursor-pointer"
                          >
                            Reset
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Workspace */}
        <div className="flex-1 relative bg-slate-950 overflow-hidden flex flex-col items-center justify-center">
          <div className="relative w-full h-full">
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              showGrid={activePreset !== "original"}
              classes={{
                containerClassName: "bg-slate-950",
                mediaClassName: "max-h-full transition-all duration-300",
                cropAreaClassName: cn(
                  "border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.8)]",
                  activeTab === "adjust" && "opacity-20", // Dim crop area when adjusting
                  activePreset === "original" && "opacity-0 pointer-events-none" // Hide crop area for "No Crop"
                )
              }}
              style={{
                mediaStyle: {
                  filter: getFilterString()
                }
              }}
            />
          </div>
          
          {/* Controls Overlay */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 w-full max-w-sm px-8 py-6 bg-black/60 backdrop-blur-xl rounded-[32px] border border-white/10 flex flex-col gap-6 shadow-2xl animate-in slide-in-from-bottom-4">
            {activeTab === "crop" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Zoom Level</span>
                  <span className="text-[10px] font-black text-primary">{Math.round(zoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.01}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
                    {ADJUSTMENTS.find(a => a.id === activeAdjId)?.label}
                  </span>
                  <span className="text-[10px] font-black text-primary">
                    {adjustValues[activeAdjId]}{ADJUSTMENTS.find(a => a.id === activeAdjId)?.unit}
                  </span>
                </div>
                <input
                  type="range"
                  value={adjustValues[activeAdjId]}
                  min={ADJUSTMENTS.find(a => a.id === activeAdjId)?.min}
                  max={ADJUSTMENTS.find(a => a.id === activeAdjId)?.max}
                  step={1}
                  onChange={(e) => setAdjustValues(prev => ({ ...prev, [activeAdjId]: Number(e.target.value) }))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            )}

            <div className="flex items-center justify-center">
               <p className="px-4 py-1.5 bg-white/5 rounded-full text-[8px] font-black text-white/40 uppercase tracking-widest border border-white/5">
                 {activeTab === "crop" ? "Drag photo to frame your shot" : "Slide to adjust professional color"}
               </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

