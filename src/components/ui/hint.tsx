"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
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
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

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
      onMouseEnter={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const left = rect.left + rect.width / 2;
        const top = position === "top" ? rect.top : position === "bottom" ? rect.bottom : rect.top + rect.height / 2;
        setCoords({ left, top });
        setIsVisible(true);
      }}
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
      {isVisible && coords
        ? createPortal(
            <div
              className="fixed z-[9999] w-64 pointer-events-none"
              style={{
                left: coords.left,
                top: coords.top,
                transform:
                  position === "top"
                    ? "translate(-50%, calc(-100% - 12px))"
                    : position === "bottom"
                      ? "translate(-50%, 12px)"
                      : position === "left"
                        ? "translate(calc(-100% - 12px), -50%)"
                        : "translate(12px, -50%)",
              }}
            >
              <div className="w-64 p-4 rounded-2xl bg-[#b5d0c1]/95 backdrop-blur-md text-slate-900 shadow-2xl animate-in fade-in zoom-in duration-200 border border-white/60">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-700 mb-1">{title}</p>
                <p className="text-xs font-medium leading-relaxed opacity-90">{content}</p>
              </div>

              {/* Arrow */}
              <div
                className={cn(
                  "absolute w-2 h-2 bg-[#b5d0c1]/95 rotate-45 border border-white/60",
                  position === "top" && "bottom-[-4px] left-1/2 -translate-x-1/2",
                  position === "bottom" && "top-[-4px] left-1/2 -translate-x-1/2",
                  position === "left" && "right-[-4px] top-1/2 -translate-y-1/2",
                  position === "right" && "left-[-4px] top-1/2 -translate-y-1/2"
                )}
              />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

