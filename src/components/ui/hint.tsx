"use client";

import React, { useState } from "react";
import { useGuide } from "../layout/guide-context";
import { cn } from "@/lib/utils";
import { HelpCircle } from "lucide-react";

interface HintProps {
  title: string;
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export function Hint({ title, content, children, position = "top", className }: HintProps) {
  const { showHints } = useGuide();
  const [isVisible, setIsVisible] = useState(false);

  if (!showHints) return <>{children}</>;

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-3",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-3",
    left: "right-full top-1/2 -translate-y-1/2 mr-3",
    right: "left-full top-1/2 -translate-y-1/2 ml-3",
  };

  return (
    <div 
      className={cn("relative inline-block group", className)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {/* Visual Indicator */}
      <div className="absolute -top-1 -right-1 z-10">
        <div className="h-3 w-3 bg-primary rounded-full animate-pulse border-2 border-white shadow-sm flex items-center justify-center">
          <HelpCircle className="h-2 w-2 text-white" />
        </div>
      </div>

      {children}

      {/* Tooltip */}
      {isVisible && (
        <div className={cn(
          "absolute z-[100] w-64 p-4 rounded-2xl bg-slate-900/95 backdrop-blur-md text-white shadow-2xl animate-in fade-in zoom-in duration-200 pointer-events-none",
          positionClasses[position]
        )}>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">{title}</p>
          <p className="text-xs font-medium leading-relaxed opacity-90">{content}</p>
          
          {/* Arrow */}
          <div className={cn(
            "absolute w-2 h-2 bg-slate-900/95 rotate-45",
            position === "top" && "bottom-[-4px] left-1/2 -translate-x-1/2",
            position === "bottom" && "top-[-4px] left-1/2 -translate-x-1/2",
            position === "left" && "right-[-4px] top-1/2 -translate-y-1/2",
            position === "right" && "left-[-4px] top-1/2 -translate-y-1/2",
          )} />
        </div>
      )}
    </div>
  );
}

