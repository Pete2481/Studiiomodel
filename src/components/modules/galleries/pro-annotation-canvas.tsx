"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import { 
  X, 
  RotateCcw, 
  PenTool, 
  Check, 
  MapPin, 
  Move, 
  Trash2, 
  Type, 
  Square,
  Maximize2,
  Circle,
  MousePointer2,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Point {
  x: number;
  y: number;
}

interface LogoPin {
  id: string;
  pinPos: Point;
  logoPos: Point;
  logoSize: number;
  lineWidth: number;
  color: string;
}

interface BoundaryPath {
  id: string;
  points: Point[];
  isClosed: boolean;
  color: string;
  lineWidth: number;
}

interface TextPin {
  id: string;
  pinPos: Point;
  textPos: Point;
  text: string;
  color: string;
  fontSize: number;
}

interface ProAnnotationCanvasProps {
  imageUrl: string;
  logoUrl?: string;
  onSave: (data: any, blob?: Blob) => void;
  onCancel: () => void;
  initialTool?: "select" | "pin" | "boundary" | "text";
  mode?: "overlay" | "panel";
}

export function ProAnnotationCanvas({
  imageUrl,
  logoUrl,
  onSave,
  onCancel,
  initialTool = "select",
  mode = "overlay",
}: ProAnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [tool, setTool] = useState<"select" | "pin" | "boundary" | "text">(initialTool);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [pins, setPins] = useState<LogoPin[]>([]);
  const [paths, setPaths] = useState<BoundaryPath[]>([]);
  const [textPins, setTextPins] = useState<TextPin[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; type: "pin" | "logo" | "anchor" | "resize" | "textPin" | "textLabel"; index?: number } | null>(null);

  // Load image and set dimensions
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const updateDimensions = () => {
        const container = containerRef.current;
        if (!container) return;
        
        // Subtract padding for toolbar and spacing
        const paddingH = 48; 
        const paddingV = 160; 
        
        const bounds = container.getBoundingClientRect();
        const cW = (mode === "panel" ? bounds.width : window.innerWidth) - paddingH;
        const cH = (mode === "panel" ? bounds.height : window.innerHeight) - paddingV;
        
        if (cW <= 0 || cH <= 0) return;

        const imgRatio = img.width / img.height;
        const containerRatio = cW / cH;

        let dWidth, dHeight;
        if (imgRatio > containerRatio) {
          dWidth = cW;
          dHeight = cW / imgRatio;
        } else {
          dHeight = cH;
          dWidth = cH * imgRatio;
        }

        // Limit maximum size to prevent over-stretching
        const finalWidth = Math.min(dWidth, 1200);
        const finalHeight = finalWidth / imgRatio;

        setDimensions({ width: finalWidth, height: finalHeight });
        setIsImageLoaded(true);
        if (canvasRef.current) {
          canvasRef.current.width = finalWidth;
          canvasRef.current.height = finalHeight;
        }
      };

      updateDimensions();
      window.addEventListener("resize", updateDimensions);
      return () => window.removeEventListener("resize", updateDimensions);
    };
    img.src = imageUrl;
  }, [imageUrl, mode]);

  // Allow parent to open directly into a specific mode (pin vs boundary)
  useEffect(() => {
    setTool(initialTool);
    setSelectedId(null);
    setEditingTextId(null);
    setDragging(null);
  }, [initialTool]);

  // Redraw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Paths (Boundaries)
    paths.forEach(path => {
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.lineWidth;
      ctx.setLineDash([]);
      
      path.points.forEach((p, i) => {
        const px = p.x * dimensions.width;
        const py = p.y * dimensions.height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });

      if (path.isClosed) ctx.closePath();
      ctx.stroke();

      // Draw anchor points if selected
      if (selectedId === path.id) {
        path.points.forEach((p, i) => {
          ctx.beginPath();
          ctx.fillStyle = dragging?.index === i && dragging.id === path.id ? "#3b82f6" : "white";
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2;
          ctx.arc(p.x * dimensions.width, p.y * dimensions.height, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
    });

    // Draw Pins
    pins.forEach(pin => {
      const px = pin.pinPos.x * dimensions.width;
      const py = pin.pinPos.y * dimensions.height;
      const lx = pin.logoPos.x * dimensions.width;
      const ly = pin.logoPos.y * dimensions.height;

      // Calculate the point on the edge of the logo to start the line
      // This prevents the line from crossing through the logo to its center
      const dx = px - lx;
      const dy = py - ly;
      const distance = Math.hypot(dx, dy);
      const radius = pin.logoSize / 2;

      let edgeX = lx;
      let edgeY = ly;

      if (distance > radius) {
        edgeX = lx + (dx / distance) * radius;
        edgeY = ly + (dy / distance) * radius;
      }

      // Draw connecting line
      ctx.beginPath();
      ctx.strokeStyle = pin.color;
      ctx.lineWidth = pin.lineWidth;
      ctx.moveTo(px, py);
      ctx.lineTo(edgeX, edgeY);
      ctx.stroke();

      // Draw pin base
      ctx.beginPath();
      ctx.fillStyle = pin.color;
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();

      // Skip drawing placeholder rect on canvas as we use a real div/image now
    });

    // Draw Text Pin Lines
    textPins.forEach(tPin => {
      const px = tPin.pinPos.x * dimensions.width;
      const py = tPin.pinPos.y * dimensions.height;
      const tx = tPin.textPos.x * dimensions.width;
      const ty = tPin.textPos.y * dimensions.height;

      // Draw connecting line
      ctx.beginPath();
      ctx.strokeStyle = tPin.color;
      ctx.lineWidth = 2;
      ctx.moveTo(px, py);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      // Draw pin base
      ctx.beginPath();
      ctx.fillStyle = tPin.color;
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [dimensions, pins, paths, textPins, selectedId, dragging]);

  const handlePointerDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / dimensions.width;
    const y = (e.clientY - rect.top) / dimensions.height;

    if (tool === "pin") {
      const newPin: LogoPin = {
        id: Math.random().toString(36).substr(2, 9),
        pinPos: { x, y },
        logoPos: { x, y: y - 0.1 },
        logoSize: 60,
        lineWidth: 2,
        color: "#ffffff"
      };
      setPins([...pins, newPin]);
      setSelectedId(newPin.id);
      setTool("select");
      return;
    }

    if (tool === "text") {
      const newTextPin: TextPin = {
        id: Math.random().toString(36).substr(2, 9),
        pinPos: { x, y },
        textPos: { x, y: y - 0.1 },
        text: "New Label",
        color: "#ffffff",
        fontSize: 14
      };
      setTextPins([...textPins, newTextPin]);
      setSelectedId(newTextPin.id);
      setEditingTextId(newTextPin.id); // Open editor immediately
      setTool("select");
      return;
    }

    if (tool === "boundary") {
      // Logic for adding points to current or new path
      if (selectedId) {
        const path = paths.find(p => p.id === selectedId);
        if (path && !path.isClosed) {
          setPaths(paths.map(p => p.id === selectedId ? { ...p, points: [...p.points, { x, y }] } : p));
          return;
        }
      }
      
      const newPath: BoundaryPath = {
        id: Math.random().toString(36).substr(2, 9),
        points: [{ x, y }],
        isClosed: false,
        color: "#ffffff",
        lineWidth: 2
      };
      setPaths([...paths, newPath]);
      setSelectedId(newPath.id);
      return;
    }

    // Select/Drag logic
    // Check pins first
    for (const pin of pins) {
      const px = pin.pinPos.x * dimensions.width;
      const py = pin.pinPos.y * dimensions.height;
      const lx = pin.logoPos.x * dimensions.width;
      const ly = pin.logoPos.y * dimensions.height;

      const distPin = Math.hypot(e.clientX - rect.left - px, e.clientY - rect.top - py);
      if (distPin < 10) {
        setDragging({ id: pin.id, type: "pin" });
        setSelectedId(pin.id);
        return;
      }

      const dxLogo = e.clientX - rect.left - lx;
      const dyLogo = e.clientY - rect.top - ly;
      if (Math.abs(dxLogo) < pin.logoSize/2 && Math.abs(dyLogo) < pin.logoSize/2) {
        setDragging({ id: pin.id, type: "logo" });
        setSelectedId(pin.id);
        return;
      }
    }

    // Check text pins
    for (const tPin of textPins) {
      const px = tPin.pinPos.x * dimensions.width;
      const py = tPin.pinPos.y * dimensions.height;
      const tx = tPin.textPos.x * dimensions.width;
      const ty = tPin.textPos.y * dimensions.height;

      const distPin = Math.hypot(e.clientX - rect.left - px, e.clientY - rect.top - py);
      if (distPin < 10) {
        setDragging({ id: tPin.id, type: "textPin" });
        setSelectedId(tPin.id);
        return;
      }

      // Check text label (approximate hit area)
      const dxText = e.clientX - rect.left - tx;
      const dyText = e.clientY - rect.top - ty;
      if (Math.abs(dxText) < 50 && Math.abs(dyText) < 20) {
        setDragging({ id: tPin.id, type: "textLabel" });
        setSelectedId(tPin.id);
        return;
      }
    }

    // Check path anchors
    for (const path of paths) {
      if (selectedId === path.id) {
        for (let i = 0; i < path.points.length; i++) {
          const p = path.points[i];
          const dist = Math.hypot(e.clientX - rect.left - p.x * dimensions.width, e.clientY - rect.top - p.y * dimensions.height);
          if (dist < 10) {
            setDragging({ id: path.id, type: "anchor", index: i });
            return;
          }
        }
      }
    }

    setSelectedId(null);
  };

  const handlePointerMove = (e: React.MouseEvent) => {
    // Moved to global effect
  };

  // Global drag listeners
  useEffect(() => {
    if (!dragging) return;

    const handleGlobalMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / dimensions.width;
      const y = (e.clientY - rect.top) / dimensions.height;
      
      if (dragging.type === "pin") {
        setPins(prev => prev.map(p => p.id === dragging.id ? { ...p, pinPos: { x, y } } : p));
      } else if (dragging.type === "logo") {
        setPins(prev => prev.map(p => p.id === dragging.id ? { ...p, logoPos: { x, y } } : p));
      } else if (dragging.type === "resize") {
        setPins(prev => prev.map(p => {
          if (p.id !== dragging.id) return p;
          const dx = (x - p.logoPos.x) * dimensions.width;
          const dy = (y - p.logoPos.y) * dimensions.height;
          const newSize = Math.max(20, Math.min(400, Math.hypot(dx, dy) * 2));
          return { ...p, logoSize: newSize };
        }));
      } else if (dragging.type === "textPin") {
        setTextPins(prev => prev.map(p => p.id === dragging.id ? { ...p, pinPos: { x, y } } : p));
      } else if (dragging.type === "textLabel") {
        setTextPins(prev => prev.map(p => p.id === dragging.id ? { ...p, textPos: { x, y } } : p));
      } else if (dragging.type === "anchor") {
        setPaths(prev => prev.map(p => p.id === dragging.id ? { 
          ...p, 
          points: p.points.map((pt, i) => i === dragging.index ? { x, y } : pt) 
        } : p));
      }
    };

    const handleGlobalUp = () => {
      setDragging(null);
    };

    window.addEventListener("mousemove", handleGlobalMove);
    window.addEventListener("mouseup", handleGlobalUp);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMove);
      window.removeEventListener("mouseup", handleGlobalUp);
    };
  }, [dragging, dimensions.width, dimensions.height]);

  const handleDelete = () => {
    if (!selectedId) return;
    setPins(pins.filter(p => p.id !== selectedId));
    setPaths(paths.filter(p => p.id !== selectedId));
    setTextPins(textPins.filter(p => p.id !== selectedId));
    setSelectedId(null);
  };

  const handleClosePath = () => {
    if (!selectedId) return;
    setPaths(paths.map(p => p.id === selectedId ? { ...p, isClosed: true } : p));
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // 1. Create an export canvas at the image's original resolution for high quality
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageUrl;
      
      await new Promise((resolve) => { img.onload = resolve; });

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = img.width;
      exportCanvas.height = img.height;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) return;

      // 2. Draw base image
      ctx.drawImage(img, 0, 0);

      // Scale factors for normalized coords
      const w = exportCanvas.width;
      const h = exportCanvas.height;

      // 3. Draw Paths (Boundaries)
      paths.forEach(path => {
        ctx.beginPath();
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.lineWidth * (w / dimensions.width); // Scale line width
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        
        path.points.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x * w, p.y * h);
          else ctx.lineTo(p.x * w, p.y * h);
        });

        if (path.isClosed) ctx.closePath();
        ctx.stroke();
      });

      // 4. Draw Logo Pins & Connecting Lines
      for (const pin of pins) {
        const px = pin.pinPos.x * w;
        const py = pin.pinPos.y * h;
        const lx = pin.logoPos.x * w;
        const ly = pin.logoPos.y * h;

        const dx = px - lx;
        const dy = py - ly;
        const distance = Math.hypot(dx, dy);
        const radius = (pin.logoSize / 2) * (w / dimensions.width);

        let edgeX = lx;
        let edgeY = ly;

        if (distance > radius) {
          edgeX = lx + (dx / distance) * radius;
          edgeY = ly + (dy / distance) * radius;
        }

        // Connecting line
        ctx.beginPath();
        ctx.strokeStyle = pin.color;
        ctx.lineWidth = 2 * (w / dimensions.width);
        ctx.moveTo(px, py);
        ctx.lineTo(edgeX, edgeY);
        ctx.stroke();

        // Pin base dot
        ctx.beginPath();
        ctx.fillStyle = pin.color;
        ctx.arc(px, py, 4 * (w / dimensions.width), 0, Math.PI * 2);
        ctx.fill();

        // Draw Logo
        if (logoUrl) {
          const logoImg = new Image();
          logoImg.crossOrigin = "anonymous";
          logoImg.src = logoUrl;
          await new Promise((resolve) => { logoImg.onload = resolve; });
          
          const size = pin.logoSize * (w / dimensions.width);
          
          // Draw shadow for logo
          ctx.shadowColor = "rgba(0,0,0,0.5)";
          ctx.shadowBlur = 10 * (w / dimensions.width);
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2 * (w / dimensions.width);

          ctx.drawImage(logoImg, lx - size/2, ly - size/2, size, size);
          
          // Reset shadow
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }
      }

      // 5. Draw Text Pins & Labels
      for (const tPin of textPins) {
        const px = tPin.pinPos.x * w;
        const py = tPin.pinPos.y * h;
        const tx = tPin.textPos.x * w;
        const ty = tPin.textPos.y * h;

        // Connecting line
        ctx.beginPath();
        ctx.strokeStyle = tPin.color;
        ctx.lineWidth = 2 * (w / dimensions.width);
        ctx.moveTo(px, py);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        // Pin base dot
        ctx.beginPath();
        ctx.fillStyle = tPin.color;
        ctx.arc(px, py, 4 * (w / dimensions.width), 0, Math.PI * 2);
        ctx.fill();

        // Draw Text
        ctx.fillStyle = "white";
        const fontSize = 24 * (w / dimensions.width); // Larger for high-res
        ctx.font = `black ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        
        // Shadow for text
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 4 * (w / dimensions.width);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2 * (w / dimensions.width);

        ctx.fillText(tPin.text.toUpperCase(), tx, ty - (10 * (w / dimensions.width)));
        
        ctx.shadowColor = "transparent";
      }

      // 6. Convert to Blob
      exportCanvas.toBlob((blob) => {
        if (blob) {
          onSave({ pins, paths, textPins }, blob);
        }
        setIsSaving(false);
      }, "image/jpeg", 0.95);

    } catch (err) {
      console.error("EXPORT ERROR:", err);
      setIsSaving(false);
      onSave({ pins, paths, textPins });
    }
  };

  return (
    <div
      className={cn(
        mode === "overlay"
          ? "fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4 md:p-8 animate-in fade-in duration-500 overflow-hidden"
          : "h-full w-full flex flex-col items-center justify-center bg-slate-950/95 p-4 md:p-6 overflow-hidden"
      )}
    >
      <div className="flex flex-col w-full h-full max-w-7xl gap-4 md:gap-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 p-2 shrink-0 shadow-2xl">
          <div className="flex items-center gap-2">
            <button onClick={onCancel} className="h-10 px-4 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all text-xs font-bold flex items-center gap-2">
              <X className="h-4 w-4" /> Cancel
            </button>
            <div className="w-px h-6 bg-white/10 mx-2" />
            <ToolbarButton active={tool === "select"} onClick={() => setTool("select")} icon={<MousePointer2 className="h-4 w-4" />} title="Select & Move" />
            <ToolbarButton active={tool === "pin"} onClick={() => setTool("pin")} icon={<MapPin className="h-4 w-4" />} title="Add Logo Pin" />
            <ToolbarButton active={tool === "text"} onClick={() => setTool("text")} icon={<Type className="h-4 w-4" />} title="Add Text Label" />
            <ToolbarButton active={tool === "boundary"} onClick={() => setTool("boundary")} icon={<PenTool className="h-4 w-4" />} title="Draw Boundary" />
            
            {selectedId && (
              <>
                <div className="w-px h-6 bg-white/10 mx-2" />
                <button onClick={handleDelete} className="h-10 w-10 rounded-xl flex items-center justify-center text-rose-400 hover:bg-rose-500/10 transition-all">
                  <Trash2 className="h-4 w-4" />
                </button>
                {paths.find(p => p.id === selectedId && !p.isClosed) && (
                  <button onClick={handleClosePath} className="h-10 px-4 rounded-xl bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest">
                    Close Shape
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-4 px-4">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest hidden sm:block">
              Professional Annotation Suite
            </p>
            <button 
              onClick={handleSave} 
              disabled={isSaving}
              className="h-10 px-6 rounded-xl bg-white text-slate-950 text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-xl disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Preparing Download...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Save & Download
                </>
              )}
            </button>
          </div>
        </div>

        {/* Drawing Area */}
        <div ref={containerRef} className="flex-1 relative rounded-[32px] overflow-hidden bg-slate-900/50 border border-white/5 flex items-center justify-center">
          {!isImageLoaded && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 text-white/20 animate-spin" />
              <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Syncing Source...</p>
            </div>
          )}
          
          <div 
            className={cn("relative transition-all duration-500", isImageLoaded ? "opacity-100 scale-100" : "opacity-0 scale-95")}
            style={{ width: dimensions.width, height: dimensions.height }}
          >
            <img src={imageUrl} alt="Base" className="w-full h-full object-contain select-none shadow-2xl rounded-xl" draggable={false} />
            <canvas 
              ref={canvasRef} 
              onMouseDown={handlePointerDown}
              className="absolute inset-0 z-20 cursor-crosshair" 
            />

            {/* Text Labels Layer */}
            {textPins.map(tPin => (
              <div 
                key={tPin.id}
                style={{
                  position: "absolute",
                  left: `${tPin.textPos.x * 100}%`,
                  top: `${tPin.textPos.y * 100}%`,
                  transform: "translate(-50%, -100%)",
                  pointerEvents: "auto"
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDragging({ id: tPin.id, type: "textLabel" });
                  setSelectedId(tPin.id);
                }}
                className={cn(
                  "z-30 px-3 py-1.5 cursor-move flex items-center gap-2 group transition-all",
                  selectedId === tPin.id ? "ring-2 ring-blue-500 rounded-lg shadow-lg bg-blue-500/10" : ""
                )}
              >
                {editingTextId === tPin.id ? (
                  <input 
                    autoFocus
                    className="bg-slate-900/80 backdrop-blur-sm text-white text-sm font-bold border border-white/20 rounded px-2 py-1 outline-none min-w-[100px] text-center"
                    value={tPin.text}
                    onChange={(e) => setTextPins(prev => prev.map(p => p.id === tPin.id ? { ...p, text: e.target.value } : p))}
                    onBlur={() => setEditingTextId(null)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingTextId(null)}
                  />
                ) : (
                  <span 
                    className="text-white text-base font-black whitespace-nowrap px-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] tracking-tight uppercase"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingTextId(tPin.id);
                    }}
                  >
                    {tPin.text}
                  </span>
                )}
                
                {/* Visual handle for text label when selected */}
                {selectedId === tPin.id && (
                  <div className="absolute -top-2 -right-2 w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-sm flex items-center justify-center pointer-events-none">
                    <Move className="h-2 w-2 text-white" />
                  </div>
                )}
              </div>
            ))}
            
            {/* Logo Layer - Overlaying the canvas for actual images */}
            {pins.map(pin => (
              <div 
                key={pin.id}
                style={{
                  position: "absolute",
                  left: `${pin.logoPos.x * 100}%`,
                  top: `${pin.logoPos.y * 100}%`,
                  width: pin.logoSize,
                  height: pin.logoSize,
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "auto"
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDragging({ id: pin.id, type: "logo" });
                  setSelectedId(pin.id);
                }}
                className={cn(
                  "z-30 flex items-center justify-center rounded-full cursor-move transition-shadow p-1",
                  selectedId === pin.id ? "ring-4 ring-blue-500/20 shadow-2xl" : ""
                )}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]" />
                ) : (
                  <span className="text-[8px] font-black text-white/40">LOGO</span>
                )}
                
                {/* Resize handle */}
                {selectedId === pin.id && (
                  <div 
                    className="absolute bottom-0 right-0 w-6 h-6 bg-blue-500 rounded-full cursor-nwse-resize border-2 border-white shadow-lg flex items-center justify-center transform translate-x-1/4 translate-y-1/4 z-40 active:scale-110 transition-transform"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDragging({ id: pin.id, type: "resize" });
                    }}
                  >
                    <Maximize2 className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ active, onClick, icon, title }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
        active ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/60 hover:text-white hover:bg-white/10"
      )}
      title={title}
    >
      {icon}
    </button>
  );
}

