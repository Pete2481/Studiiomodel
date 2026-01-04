"use client";

import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { X, Check, Smartphone, Monitor, Square, ChevronRight, Share2, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SocialCropperProps {
  imageUrl: string;
  imageName: string;
  onClose: () => void;
}

const PRESETS = [
  { id: "square", label: "IG Post", ratio: 1, icon: Square },
  { id: "portrait", label: "IG Portrait", ratio: 4 / 5, icon: Monitor },
  { id: "story", label: "Story / TikTok", ratio: 9 / 16, icon: Smartphone },
  { id: "landscape", label: "FB Cover", ratio: 16 / 9, icon: Monitor },
];

export function SocialCropper({ imageUrl, imageName, onClose }: SocialCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState(PRESETS[0].ratio);
  const [activePreset, setActivePreset] = useState(PRESETS[0].id);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const generateCroppedImage = async (mode: 'download' | 'share') => {
    if (!croppedAreaPixels) return;
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

      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;

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

      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
      const file = new File([blob], `studiio-crop-${imageName}`, { type: "image/jpeg" });

      if (mode === 'share' && navigator.share) {
        try {
          await navigator.share({
            files: [file],
            title: 'Studiio Social Crop',
            text: 'Check out this shot from my latest production!'
          });
        } catch (err) {
          console.log("Share failed:", err);
          // Fallback to download if share fails or is cancelled
          downloadBlob(blob);
        }
      } else {
        downloadBlob(blob);
      }
    } catch (err) {
      console.error("Crop generation failed:", err);
      alert("Failed to generate cropped image. Please try again.");
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
            <p className="text-xs font-black text-primary uppercase tracking-widest">SOCIAL CROPPER</p>
            <h3 className="text-sm font-bold text-white tracking-tight">Prepare your shot for socials</h3>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Mobile-only Share button */}
          <button 
            onClick={() => generateCroppedImage('share')}
            disabled={isGenerating}
            className="h-11 px-6 rounded-full bg-white text-slate-950 text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-xl disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Share to Socials
          </button>
          
          <button 
            onClick={() => generateCroppedImage('download')}
            disabled={isGenerating}
            className="h-11 px-6 rounded-full bg-primary text-white text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-xl disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download Optimized
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row relative">
        {/* Left Sidebar: Presets */}
        <div className="w-full md:w-64 bg-black/20 p-6 flex md:flex-col gap-3 shrink-0 overflow-x-auto custom-scrollbar border-r border-white/5">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 hidden md:block">SELECT PRESET</p>
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
                  "flex-1 md:flex-none h-14 md:h-16 px-4 rounded-2xl flex items-center gap-4 transition-all border shrink-0",
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
                    {preset.ratio === 1 ? "1:1" : preset.ratio === 0.8 ? "4:5" : preset.ratio < 1 ? "9:16" : "16:9"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Main Crop Area */}
        <div className="flex-1 relative bg-slate-900 overflow-hidden">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
            classes={{
              containerClassName: "bg-slate-900",
              mediaClassName: "max-h-full",
              cropAreaClassName: "border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]"
            }}
          />
          
          {/* Zoom Slider */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 w-full max-w-xs px-6 py-4 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 flex items-center gap-4">
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest shrink-0">Zoom</span>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>

          <div className="absolute top-10 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
             <p className="px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-[9px] font-black text-white/80 uppercase tracking-widest shadow-xl">
               Drag photo to frame your shot
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}

