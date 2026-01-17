"use client";

import React, { useId, useMemo, useRef, useState, useCallback, useEffect } from "react";
import Cropper from "react-easy-crop";
import { X, Check, Smartphone, Monitor, Square, ChevronRight, Share2, Download, Loader2, Sun, Contrast, Droplets, ThermometerSun, Sliders, Crop as CropIcon, Image as ImageIcon, Palette, SunMedium } from "lucide-react";
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
  { id: "luminance", label: "Luminance", icon: SunMedium, min: 50, max: 150, defaultValue: 100, unit: "%" },
  { id: "contrast", label: "Contrast", icon: Contrast, min: 50, max: 150, defaultValue: 100, unit: "%" },
  { id: "saturation", label: "Saturation", icon: Droplets, min: 0, max: 200, defaultValue: 100, unit: "%" },
  { id: "warmth", label: "Warmth", icon: ThermometerSun, min: -50, max: 50, defaultValue: 0, unit: "" },
  { id: "hue", label: "Hue", icon: Palette, min: 0, max: 360, defaultValue: 0, unit: "°" },
];

export function SocialCropper({ imageUrl, imageName, onClose, onSave }: SocialCropperProps) {
  const filterId = useId().replace(/:/g, "_");
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
    luminance: 100,
    contrast: 100,
    saturation: 100,
    warmth: 0,
    hue: 0,
  });
  const [luminanceTargetHex, setLuminanceTargetHex] = useState<string>("#ffffff");
  const [activeAdjId, setActiveAdjId] = useState(ADJUSTMENTS[0].id);

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const hueColorHex = useMemo(() => {
    const hue = Number(adjustValues.hue || 0);
    const h = ((hue % 360) + 360) % 360;
    // HSL( h, 100%, 50% ) -> hex
    const s = 1;
    const l = 0.5;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const to255 = (v: number) => Math.round((v + m) * 255);
    const toHex = (v: number) => to255(v).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }, [adjustValues.hue]);

  const setHueFromHex = (hex: string) => {
    // Parse #RRGGBB -> hue (0..360)
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return;
    const int = parseInt(m[1], 16);
    const r = ((int >> 16) & 255) / 255;
    const g = ((int >> 8) & 255) / 255;
    const b = (int & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d === 0) h = 0;
    else if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    setAdjustValues((prev) => ({ ...prev, hue: h }));
  };

  const luminanceTargetRgb = useMemo(() => {
    const m = /^#?([0-9a-f]{6})$/i.exec(luminanceTargetHex || "");
    if (!m) return { r: 255, g: 255, b: 255 };
    const int = parseInt(m[1], 16);
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255,
    };
  }, [luminanceTargetHex]);

  const buildAlphaTable = (target01: number, tolerance01: number) => {
    const tol = Math.max(0.00001, tolerance01);
    const arr: string[] = [];
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      const w = Math.max(0, Math.min(1, 1 - Math.abs(v - target01) / tol));
      arr.push(w.toFixed(4));
    }
    return arr.join(" ");
  };

  // Targeted luminance: create a mask based on RGB proximity to the chosen target color.
  // This is used in preview via an SVG filter (so crop math stays correct) and in export via canvas pixels.
  const luminanceTables = useMemo(() => {
    const tol = 0.18; // ~46/255 per-channel tolerance (feels forgiving)
    return {
      r: buildAlphaTable(luminanceTargetRgb.r / 255, tol),
      g: buildAlphaTable(luminanceTargetRgb.g / 255, tol),
      b: buildAlphaTable(luminanceTargetRgb.b / 255, tol),
    };
  }, [luminanceTargetRgb, luminanceTargetHex]);

  const getFilterString = () => {
    const { exposure, luminance, contrast, saturation, warmth, hue } = adjustValues;
    const warmthHue = warmth < 0 ? warmth : 0;
    const hueDeg = Number(hue || 0) + Number(warmthHue || 0);
    // Note: luminance is applied selectively via SVG filter + export pixel pass (not global brightness).
    return `brightness(${exposure}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${warmth > 0 ? warmth : 0}%) hue-rotate(${hueDeg}deg) url(#${filterId})`;
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
      // Apply global filters via canvas filter first (doesn't support targeted luminance mask).
      // Keep targeted luminance for a pixel pass afterward.
      const { exposure, contrast, saturation, warmth, hue } = adjustValues;
      const warmthHue = warmth < 0 ? warmth : 0;
      const hueDeg = Number(hue || 0) + Number(warmthHue || 0);
      ctx.filter = `brightness(${exposure}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${warmth > 0 ? warmth : 0}%) hue-rotate(${hueDeg}deg)`;

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

      // Targeted luminance pixel pass (brighten/darken only near chosen target color)
      const lumFactor = Number(adjustValues.luminance || 100) / 100;
      const hasTargetedLum = Math.abs(lumFactor - 1) > 0.001;
      if (hasTargetedLum) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const tol = 46; // per-channel tolerance in 0..255 (should match preview-ish)
        const tr = luminanceTargetRgb.r;
        const tg = luminanceTargetRgb.g;
        const tb = luminanceTargetRgb.b;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const wr = Math.max(0, 1 - Math.abs(r - tr) / tol);
          const wg = Math.max(0, 1 - Math.abs(g - tg) / tol);
          const wb = Math.max(0, 1 - Math.abs(b - tb) / tol);
          const w = wr * wg * wb;
          if (w <= 0) continue;
          const nr = Math.max(0, Math.min(255, r * lumFactor));
          const ng = Math.max(0, Math.min(255, g * lumFactor));
          const nb = Math.max(0, Math.min(255, b * lumFactor));
          data[i] = Math.round(r * (1 - w) + nr * w);
          data[i + 1] = Math.round(g * (1 - w) + ng * w);
          data[i + 2] = Math.round(b * (1 - w) + nb * w);
        }
        ctx.putImageData(imgData, 0, 0);
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
      {/* SVG filter for targeted luminance (preview) */}
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <filter id={filterId} colorInterpolationFilters="sRGB">
          {/* Build per-channel alpha masks based on proximity to target RGB */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0"
            result="rAlpha"
          />
          <feComponentTransfer in="rAlpha" result="maskR">
            <feFuncA type="table" tableValues={luminanceTables.r} />
          </feComponentTransfer>

          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 1 0 0 0"
            result="gAlpha"
          />
          <feComponentTransfer in="gAlpha" result="maskG">
            <feFuncA type="table" tableValues={luminanceTables.g} />
          </feComponentTransfer>

          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0"
            result="bAlpha"
          />
          <feComponentTransfer in="bAlpha" result="maskB">
            <feFuncA type="table" tableValues={luminanceTables.b} />
          </feComponentTransfer>

          <feComposite in="maskR" in2="maskG" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="maskRG" />
          <feComposite in="maskRG" in2="maskB" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="maskRGB" />

          {/* Brightened/darkened version */}
          <feComponentTransfer in="SourceGraphic" result="bright">
            <feFuncR type="linear" slope={String(Number(adjustValues.luminance || 100) / 100)} />
            <feFuncG type="linear" slope={String(Number(adjustValues.luminance || 100) / 100)} />
            <feFuncB type="linear" slope={String(Number(adjustValues.luminance || 100) / 100)} />
          </feComponentTransfer>

          {/* Original * (1-mask) */}
          <feComponentTransfer in="maskRGB" result="invMask">
            <feFuncA type="linear" slope="-1" intercept="1" />
          </feComponentTransfer>
          <feComposite in="SourceGraphic" in2="invMask" operator="in" result="origPart" />

          {/* Bright * mask */}
          <feComposite in="bright" in2="maskRGB" operator="in" result="brightPart" />

          {/* origPart + brightPart */}
          <feComposite in="origPart" in2="brightPart" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="out" />

          <feColorMatrix in="out" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
        </filter>
      </svg>

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
                        {isChanged && (
                          <span 
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAdjustValues(prev => ({ ...prev, [adj.id]: adj.defaultValue }));
                              if (adj.id === "luminance") setLuminanceTargetHex("#ffffff");
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

                {/* Hue picker + slider */}
                {activeAdjId === "hue" && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={hueColorHex}
                        onChange={(e) => setHueFromHex(e.target.value)}
                        className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 p-0 overflow-hidden cursor-pointer"
                        aria-label="Hue color picker"
                      />
                      <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Pick hue</p>
                    </div>
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                      {Math.round(adjustValues.hue)}°
                    </p>
                  </div>
                )}

                {/* Luminance swatch + slider */}
                {activeAdjId === "luminance" && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={luminanceTargetHex}
                        onChange={(e) => setLuminanceTargetHex(e.target.value)}
                        className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 p-0 overflow-hidden cursor-pointer"
                        aria-label="Luminance target color picker"
                      />
                      <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Pick color</p>
                    </div>
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                      {Math.round(adjustValues.luminance)}%
                    </p>
                  </div>
                )}

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

