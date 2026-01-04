"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  className?: string;
}

export function LoadingOverlay({ isVisible, message = "Processing...", className }: LoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className={cn(
      "absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[1px] animate-in fade-in duration-300",
      className
    )}>
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
          <Loader2 className="absolute inset-0 m-auto h-5 w-5 text-primary animate-pulse" />
        </div>
        {message && (
          <p className="text-xs font-black text-slate-900 uppercase tracking-widest animate-pulse">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

