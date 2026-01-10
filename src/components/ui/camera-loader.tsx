"use client";

import { cn } from "@/lib/utils";

interface CameraLoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  color?: string;
}

export function CameraLoader({ 
  className, 
  size = "md",
  color = "currentColor" 
}: CameraLoaderProps) {
  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-32 h-32",
    lg: "w-48 h-48"
  };

  const lensSizeClasses = {
    sm: "w-6 h-6 border-2",
    md: "w-14 h-14 border-4",
    lg: "w-20 h-20 border-4"
  };

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <div className={cn("relative flex items-center justify-center", sizeClasses[size])}>
        {/* The Lens / Aperture (Always spinning) */}
        <div className="absolute z-10 flex items-center justify-center">
          <div className={cn("relative rounded-full", lensSizeClasses[size])}>
            {/* Inner rotating dash */}
            <div className="absolute inset-0 border-current opacity-20 rounded-full" />
            <div 
              className="absolute inset-0 border-current rounded-full animate-[spin_2s_linear_infinite]" 
              style={{ borderStyle: 'solid', borderLeftColor: 'transparent', borderBottomColor: 'transparent' }}
            />
            {/* Center glass reflection */}
            <div className="absolute top-[15%] right-[15%] w-[20%] h-[20%] bg-current opacity-30 rounded-full blur-[1px]" />
          </div>
        </div>

        {/* The Camera Body (Revealing/Drawing) */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full fill-none stroke-[3]"
          style={{ color }}
        >
          {/* Main Body */}
          <rect
            x="12" y="28" width="76" height="52" rx="12"
            stroke="currentColor"
            className="animate-[camera-draw_4s_ease-in-out_infinite]"
            style={{ strokeDasharray: 300, strokeDashoffset: 300 }}
          />
          {/* Shutter Top */}
          <path
            d="M30 28 V22 Q30 18 34 18 H46 Q50 18 50 22 V28"
            stroke="currentColor"
            className="animate-[camera-draw_4s_ease-in-out_infinite]"
            style={{ strokeDasharray: 100, strokeDashoffset: 100 }}
          />
          {/* Flash */}
          <rect 
            x="68" y="38" width="8" height="6" rx="2" 
            fill="currentColor"
            className="animate-[flash_4s_infinite] opacity-0"
          />
        </svg>
      </div>

      <style jsx global>{`
        @keyframes camera-draw {
          0% { stroke-dashoffset: 300; opacity: 0; transform: scale(0.8) rotate(-5deg); }
          10% { opacity: 0; }
          20% { opacity: 1; }
          45% { stroke-dashoffset: 0; opacity: 1; transform: scale(1) rotate(0deg); }
          75% { stroke-dashoffset: 0; opacity: 1; transform: scale(1) rotate(0deg); }
          90% { stroke-dashoffset: -300; opacity: 0; transform: scale(1.1) rotate(5deg); }
          100% { stroke-dashoffset: -300; opacity: 0; }
        }
        @keyframes flash {
          0%, 45% { opacity: 0; }
          50% { opacity: 1; }
          55% { opacity: 0; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

