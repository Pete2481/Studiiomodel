"use client";

import React, { useRef, useEffect, useState } from "react";
import { X, RotateCcw, PenTool, Eraser, Check, Type, Trash2, Move } from "lucide-react";
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
}

export function DrawingCanvas({ imageUrl, onSave, onCancel, isMaskMode, maskPurpose = "place" }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser" | "text">("pen");
  const [paths, setPaths] = useState<any[]>([]);
  const [currentPath, setCurrentPath] = useState<any[]>([]);
  const [scale, setScale] = useState({ x: 1, y: 1 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  const [texts, setTexts] = useState<TextAnnotation[]>([]);
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const CHARACTER_LIMIT = 100;

  // Initialize canvas size based on image and container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = new Image();
    img.onload = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      if (containerWidth === 0 || containerHeight === 0) return;

      // Calculate aspect ratio to fit image in container
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
        y: img.height / dHeight
      });

      // Redraw everything
      redraw();
    };
    img.src = imageUrl;
  }, [imageUrl, paths]);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Draw all finished paths
    paths.forEach(path => {
      if (path.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = path.tool === "eraser" ? "rgba(0,0,0,1)" : (isMaskMode ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 0, 0, 0.8)");
      ctx.globalCompositeOperation = path.tool === "eraser" ? "destination-out" : "source-over";
      ctx.lineWidth = path.tool === "eraser" ? (isMaskMode ? 40 : 40) : (isMaskMode ? 32 : 4);
      
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    });

    // Draw current path
    if (currentPath.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = tool === "eraser" ? "rgba(0,0,0,1)" : (isMaskMode ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 0, 0, 0.8)");
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      ctx.lineWidth = tool === "eraser" ? (isMaskMode ? 32 : 40) : (isMaskMode ? 24 : 4);

      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x, currentPath[i].y);
      }
      ctx.stroke();
    }
  };

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
      setPaths(prev => [...prev, { points: currentPath, tool }]);
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
        mctx.lineWidth = 80;

        paths.forEach(path => {
          if (path.tool === "eraser") {
            mctx.globalCompositeOperation = "destination-out";
          } else {
            mctx.globalCompositeOperation = "source-over";
          }
          
          if (path.points.length < 2) return;
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
}

