"use client";

import React, { useRef, useEffect, useState } from "react";
import { X, RotateCcw, PenTool, Eraser, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawingCanvasProps {
  imageUrl: string;
  onSave: (drawingData: any) => void;
  onCancel: () => void;
}

export function DrawingCanvas({ imageUrl, onSave, onCancel }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [paths, setPaths] = useState<any[]>([]);
  const [currentPath, setCurrentPath] = useState<any[]>([]);
  const [scale, setScale] = useState({ x: 1, y: 1 });

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
      ctx.strokeStyle = path.tool === "eraser" ? "rgba(0,0,0,1)" : "rgba(255, 0, 0, 0.8)";
      ctx.globalCompositeOperation = path.tool === "eraser" ? "destination-out" : "source-over";
      ctx.lineWidth = path.tool === "eraser" ? 20 : 4;
      
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    });

    // Draw current path
    if (currentPath.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = tool === "eraser" ? "rgba(0,0,0,1)" : "rgba(255, 0, 0, 0.8)";
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      ctx.lineWidth = tool === "eraser" ? 20 : 4;

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
    setIsDrawing(true);
    const pos = getPointerPos(e);
    setCurrentPath([pos]);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const pos = getPointerPos(e);
    setCurrentPath(prev => [...prev, pos]);
    redraw();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath.length > 1) {
      setPaths(prev => [...prev, { points: currentPath, tool }]);
    }
    setCurrentPath([]);
  };

  const handleUndo = () => {
    setPaths(prev => prev.slice(0, -1));
  };

  const handleSave = () => {
    if (paths.length === 0) return;
    
    // Save as normalized coordinates relative to image size
    const normalizedData = paths.map(path => ({
      tool: path.tool,
      points: path.points.map((p: any) => ({
        x: p.x / canvasRef.current!.width,
        y: p.y / canvasRef.current!.height
      }))
    }));

    onSave(normalizedData);
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
            <button 
              onClick={() => setTool("pen")}
              className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                tool === "pen" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/60 hover:text-white hover:bg-white/10"
              )}
            >
              <PenTool className="h-4 w-4" />
            </button>
            <button 
              onClick={() => setTool("eraser")}
              className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                tool === "eraser" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/60 hover:text-white hover:bg-white/10"
              )}
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
               Draw on image to mark changes
             </p>
             <button 
              onClick={handleSave}
              disabled={paths.length === 0}
              className="h-10 px-6 rounded-xl bg-white text-slate-950 text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-xl disabled:opacity-50 disabled:hover:scale-100"
            >
              <Check className="h-4 w-4" />
              Done Drawing
            </button>
          </div>
        </div>

        {/* Drawing Area */}
        <div 
          ref={containerRef}
          className="flex-1 relative rounded-3xl overflow-hidden bg-slate-900 border border-white/5 flex items-center justify-center cursor-crosshair"
        >
          {/* Base Image & Canvas Container */}
          <div className="relative flex items-center justify-center pointer-events-none">
            <img 
              src={imageUrl} 
              alt="Base"
              className="max-h-full max-w-full object-contain select-none"
              draggable={false}
            />
            
            {/* Drawing Layer - CAPTURES EVENTS */}
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="absolute inset-0 z-20 pointer-events-auto"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

