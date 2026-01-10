"use client";

import { CameraLoader } from "./camera-loader";
import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  className?: string;
  variant?: "light" | "dark" | "green";
}

export function LoadingOverlay({ 
  isVisible, 
  message = "Processing...", 
  className,
  variant = "light"
}: LoadingOverlayProps) {
  if (!isVisible) return null;

  const bgClasses = {
    light: "bg-white/80 backdrop-blur-sm",
    dark: "bg-slate-900/80 backdrop-blur-sm",
    green: "bg-[#82d085]/90 backdrop-blur-sm"
  };

  const textClasses = {
    light: "text-slate-900",
    dark: "text-white",
    green: "text-white"
  };

  const loaderColor = variant === "light" ? "var(--primary)" : "white";

  return (
    <div className={cn(
      "absolute inset-0 z-50 flex flex-col items-center justify-center animate-in fade-in duration-500",
      bgClasses[variant],
      className
    )}>
      <div className="flex flex-col items-center gap-6">
        <CameraLoader size="md" color={loaderColor} className={textClasses[variant]} />
        {message && (
          <p className={cn(
            "text-[10px] font-black uppercase tracking-[0.2em] animate-pulse",
            textClasses[variant]
          )}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

