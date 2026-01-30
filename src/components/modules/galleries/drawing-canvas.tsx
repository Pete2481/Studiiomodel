"use client";

import React, { useRef, useEffect, useState, useImperativeHandle } from "react";
import { X, RotateCcw, PenTool, Eraser, Check, Type, Trash2, Move, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface TextAnnotation {
  id: string;
  x: number; // normalized
  y: number; // normalized
  content: string;
}

interface DrawingCanvasProps {
  imageUrl: string;
  onSave: (drawingData: any, maskUrl?: string) => void;
  onCancel: () => void;
  isMaskMode?: boolean;
  maskPurpose?: "remove" | "place";
  mode?: "overlay" | "embedded";
}

export type DrawingCanvasHandle = {
  save: () => void;
  clear: () => void;
  setBrushSize: (n: number) => void;
  setTool: (t: "pen" | "eraser") => void;
};

export const DrawingCanvas = React.forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(function DrawingCanvas(
  { imageUrl, onSave, onCancel, isMaskMode, maskPurpose = "place", mode = "overlay" }: DrawingCanvasProps,
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser" | "text">("pen");
  const [paths, setPaths] = useState<any[]>([]);
  const [currentPath, setCurrentPath] = useState<any[]>([]);
  const [scale, setScale] = useState({ x: 1, y: 1 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const MIN_BRUSH = 8;
  const MAX_BRUSH = 160;
  const DEFAULT_BRUSH = 60;
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);
  
  const [texts, setTexts] = useState<TextAnnotation[]>([]);
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const CHARACTER_LIMIT = 100;

  // Initialize canvas size based on image and container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = containerRef.current;
    if (!container) return;

    // Embedded mode: parent already renders the image; match the overlay to the image box.
    if (mode === "embedded") {
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.width = w;
      canvas.height = h;
      setDimensions({ width: w, height: h });
      setScale({ x: 1, y: 1 });
      redraw();
      return;
    }

    // Overlay mode: size canvas to the image aspect ratio in our own container.
    const img = new Image();
    img.onload = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      if (containerWidth === 0 || containerHeight === 0) return;

      const imgRatio = img.width / img.height;
      const containerRatio = containerWidth / containerHeight;

      let dWidth, dHeight;
      if (imgRatio > containerRatio) {
        dWidth = containerWidth;
        dHeight = containerWidth / imgRatio;
      } else {
        dHeight = containerHeight;
        dWidth = containerHeight * imgRatio;
      }

      canvas.width = dWidth;
      canvas.height = dHeight;

      setDimensions({ width: dWidth, height: dHeight });
      setScale({
        x: img.width / dWidth,
        y: img.height / dHeight,
      });

      redraw();
    };
    img.src = imageUrl;
  }, [imageUrl, paths, mode]);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const maskStroke =
      isMaskMode && maskPurpose === "remove" ? "rgba(236, 72, 153, 0.75)" : (isMaskMode ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 0, 0, 0.8)");

    // Draw all finished paths
    paths.forEach(path => {
      if (path.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = path.tool === "eraser" ? "rgba(0,0,0,1)" : maskStroke;
      ctx.globalCompositeOperation = path.tool === "eraser" ? "destination-out" : "source-over";
      const size = typeof path.size === "number" ? path.size : brushSize;
      const penWidth = isMaskMode ? size : Math.max(2, Math.round(size / 10));
      ctx.lineWidth = path.tool === "eraser" ? (isMaskMode ? size : 40) : penWidth;
      
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    });

    // Draw current path
    if (currentPath.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = tool === "eraser" ? "rgba(0,0,0,1)" : maskStroke;
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      const penWidth = isMaskMode ? brushSize : Math.max(2, Math.round(brushSize / 10));
      ctx.lineWidth = tool === "eraser" ? (isMaskMode ? brushSize : 40) : penWidth;

      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x, currentPath[i].y);
      }
      ctx.stroke();
    }
  };

  // Redraw overlay when brush size/tool/mode changes (avoids stale strokes when adjusting size).
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, currentPath, tool, brushSize, isMaskMode, maskPurpose]);

  const getPointerPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getPointerPos(e);

    if (tool === "text") {
      // Create new text annotation
      const newText: TextAnnotation = {
        id: Math.random().toString(36).substring(2, 9),
        x: pos.x / canvasRef.current!.width,
        y: pos.y / canvasRef.current!.height,
        content: "Tap to edit"
      };
      setTexts(prev => [...prev, newText]);
      return;
    }

    setIsDrawing(true);
    setCurrentPath([pos]);
  };

  const handleTextChange = (id: string, content: string) => {
    setTexts(prev => prev.map(t => t.id === id ? { ...t, content: content.slice(0, CHARACTER_LIMIT) } : t));
  };

  const handleDeleteText = (id: string) => {
    setTexts(prev => prev.filter(t => t.id !== id));
  };

  const handleTextMouseDown = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setDraggingTextId(id);
    const text = texts.find(t => t.id === id);
    if (text && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      
      const currentX = text.x * rect.width;
      const currentY = text.y * rect.height;
      
      setDragOffset({
        x: clientX - rect.left - currentX,
        y: clientY - rect.top - currentY
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (draggingTextId && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      
      const newX = (clientX - rect.left - dragOffset.x) / rect.width;
      const newY = (clientY - rect.top - dragOffset.y) / rect.height;
      
      setTexts(prev => prev.map(t => t.id === draggingTextId ? { ...t, x: newX, y: newY } : t));
    } else if (isDrawing) {
      const pos = getPointerPos(e);
      setCurrentPath(prev => [...prev, pos]);
      redraw();
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath.length > 1) {
      setPaths(prev => [...prev, { points: currentPath, tool, size: brushSize }]);
    }
    setCurrentPath([]);
  };

  const handleMouseUp = () => {
    if (draggingTextId) {
      setDraggingTextId(null);
    } else if (isDrawing) {
      stopDrawing();
    }
  };

  const handleUndo = () => {
    setPaths(prev => prev.slice(0, -1));
  };

  const handleSave = () => {
    if (paths.length === 0 && texts.length === 0) return;
    
    // Save as normalized coordinates relative to image size
    const drawingPaths = paths.map(path => ({
      type: "path",
      tool: path.tool,
      points: path.points.map((p: any) => ({
        x: p.x / canvasRef.current!.width,
        y: p.y / canvasRef.current!.height
      }))
    }));

    const textAnnotations = texts.map(t => ({
      type: "text",
      id: t.id,
      x: t.x,
      y: t.y,
      content: t.content
    }));

    // If in mask mode, generate a black/white mask image
    let maskUrl = undefined;
    if (isMaskMode && canvasRef.current) {
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = canvasRef.current.width;
      maskCanvas.height = canvasRef.current.height;
      const mctx = maskCanvas.getContext("2d");
      if (mctx) {
        mctx.fillStyle = "black";
        mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        
        mctx.lineCap = "round";
        mctx.lineJoin = "round";
        mctx.strokeStyle = "white";

        paths.forEach(path => {
          if (path.tool === "eraser") {
            mctx.globalCompositeOperation = "destination-out";
          } else {
            mctx.globalCompositeOperation = "source-over";
          }
          
          if (path.points.length < 2) return;
          const size = typeof path.size === "number" ? path.size : brushSize;
          mctx.lineWidth = Math.max(1, size);
          mctx.beginPath();
          mctx.moveTo(path.points[0].x, path.points[0].y);
          for (let i = 1; i < path.points.length; i++) {
            mctx.lineTo(path.points[i].x, path.points[i].y);
          }
          mctx.stroke();
        });
        
        maskUrl = maskCanvas.toDataURL("image/png");
      }
    }

    onSave([...drawingPaths, ...textAnnotations], maskUrl);
  };

  useImperativeHandle(
    ref,
    () => ({
      save: () => handleSave(),
      clear: () => {
        setPaths([]);
        setCurrentPath([]);
        setTexts([]);
        setDraggingTextId(null);
      },
      setBrushSize: (n: number) => setBrushSize(Math.max(MIN_BRUSH, Math.min(MAX_BRUSH, Math.floor(Number(n))))),
      setTool: (t: "pen" | "eraser") => setTool(t),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paths, currentPath, tool, brushSize, texts, isMaskMode, maskPurpose]
  );

  if (mode === "embedded") {
    return (
      <div ref={containerRef} className="absolute inset-0 z-[60] pointer-events-none">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={startDrawing}
          onTouchMove={(e) => {
            if (isDrawing) {
              const pos = getPointerPos(e);
              setCurrentPath((prev) => [...prev, pos]);
              redraw();
            }
          }}
          onTouchEnd={handleMouseUp}
          className="absolute inset-0 z-20 pointer-events-auto"
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-500">
      <div className="flex flex-col w-full h-full max-w-5xl gap-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 p-2 shrink-0">
          <div className="flex items-center gap-2">
            <button 
              onClick={onCancel}
              className="h-10 px-4 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all text-xs font-bold flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
            <div className="w-px h-6 bg-white/10 mx-2" />
            {!isMaskMode && (
              <>
                <button 
                  onClick={() => setTool("pen")}
                  className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                    tool === "pen" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                  title="Pen Tool"
                >
                  <PenTool className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => setTool("text")}
                  className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                    tool === "text" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                  title="Add Text"
                >
                  <Type className="h-4 w-4" />
                </button>
              </>
            )}
            {isMaskMode && (
              <button 
                onClick={() => setTool("pen")}
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  tool === "pen" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/60 hover:text-white hover:bg-white/10"
                )}
                title="Brush Tool"
              >
                <PenTool className="h-4 w-4" />
              </button>
            )}
            <button 
              onClick={() => setTool("eraser")}
              className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                tool === "eraser" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/60 hover:text-white hover:bg-white/10"
              )}
              title="Eraser"
            >
              <Eraser className="h-4 w-4" />
            </button>
            <button 
              onClick={handleUndo}
              disabled={paths.length === 0}
              className="h-10 w-10 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-all"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 px-4">
             <p className="text-[10px] font-black text-white/40 uppercase tracking-widest hidden sm:block">
               {isMaskMode
                 ? (maskPurpose === "remove"
                   ? "Paint over items you want removed (optional touch-up)"
                   : "Paint areas for furniture placement")
                 : "Draw on image to mark changes"}
             </p>
             {isMaskMode && (
               <div className="flex items-center gap-2 pr-2">
                 <span className="text-[10px] font-black text-white/40 uppercase tracking-widest hidden md:block">
                   Brush
                 </span>
                 <button
                   type="button"
                   onClick={() => setBrushSize((s) => Math.max(MIN_BRUSH, s - 8))}
                   className="h-10 w-10 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
                   title="Smaller brush"
                 >
                   <Minus className="h-4 w-4" />
                 </button>
                 <input
                   type="range"
                   min={MIN_BRUSH}
                   max={MAX_BRUSH}
                   value={brushSize}
                   onChange={(e) => setBrushSize(Math.max(MIN_BRUSH, Math.min(MAX_BRUSH, Number(e.target.value))))}
                   className="w-28 md:w-40 accent-pink-500"
                   aria-label="Brush size"
                 />
                 <button
                   type="button"
                   onClick={() => setBrushSize((s) => Math.min(MAX_BRUSH, s + 8))}
                   className="h-10 w-10 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
                   title="Larger brush"
                 >
                   <Plus className="h-4 w-4" />
                 </button>
               </div>
             )}
             <button 
              onClick={handleSave}
              disabled={paths.length === 0}
              className="h-10 px-6 rounded-xl bg-white text-slate-950 text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-xl disabled:opacity-50 disabled:hover:scale-100"
            >
              <Check className="h-4 w-4" />
              {isMaskMode ? (maskPurpose === "remove" ? "Save Removal Mask" : "Save Placement Mask") : "Done Drawing"}
            </button>
          </div>
        </div>

        {/* Drawing Area */}
        <div 
          ref={containerRef}
          className={cn(
            "flex-1 relative rounded-3xl overflow-hidden bg-slate-900/50 border border-white/5 flex items-center justify-center",
            tool === "text" ? "cursor-text" : "cursor-crosshair"
          )}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        >
          {/* Base Image & Canvas Container - LOCKED TO IMAGE SIZE */}
          <div 
            className="relative flex items-center justify-center pointer-events-none"
            style={{ 
              width: dimensions.width || 'auto', 
              height: dimensions.height || 'auto',
              maxWidth: '100%',
              maxHeight: '100%'
            }}
          >
            <img 
              src={imageUrl} 
              alt="Base"
              className="w-full h-full object-contain select-none"
              draggable={false}
            />
            
            {/* Drawing Layer - CAPTURES EVENTS */}
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onTouchStart={startDrawing}
              onTouchMove={(e) => {
                if (isDrawing) {
                  const pos = getPointerPos(e);
                  setCurrentPath(prev => [...prev, pos]);
                  redraw();
                }
              }}
              onTouchEnd={stopDrawing}
              className="absolute inset-0 z-20 pointer-events-auto"
            />

            {/* Text Annotations Layer */}
            {texts.map((t) => (
              <div
                key={t.id}
                style={{
                  position: "absolute",
                  left: `${t.x * 100}%`,
                  top: `${t.y * 100}%`,
                  transform: "translate(-50%, -50%)",
                }}
                className="z-30 pointer-events-auto group"
              >
                <div className="relative bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-xl p-2 min-w-[80px]">
                  <div 
                    className="absolute -top-3 -left-3 h-6 w-6 bg-slate-900 text-white rounded-full flex items-center justify-center cursor-move shadow-lg opacity-100 transition-opacity z-[40]"
                    onMouseDown={(e) => handleTextMouseDown(e, t.id)}
                    onTouchStart={(e) => handleTextMouseDown(e, t.id)}
                  >
                    <Move className="h-3 w-3" />
                  </div>
                  <button
                    onClick={() => handleDeleteText(t.id)}
                    className="absolute -bottom-3 -right-3 h-6 w-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-100 transition-opacity z-[40]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <textarea
                    value={t.content}
                    onChange={(e) => handleTextChange(t.id, e.target.value)}
                    className="w-full bg-transparent border-none focus:ring-0 text-xs font-bold text-slate-900 resize-none p-0 overflow-hidden leading-tight"
                    rows={Math.max(1, t.content.split('\n').length)}
                    maxLength={CHARACTER_LIMIT}
                    placeholder="Type..."
                    autoFocus={t.content === "Tap to edit"}
                    onFocus={(e) => {
                      if (t.content === "Tap to edit") {
                        handleTextChange(t.id, "");
                      }
                    }}
                  />
                  <div className="mt-1 flex justify-end">
                    <span className="text-[8px] font-bold text-slate-400">
                      {t.content.length}/{CHARACTER_LIMIT}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

