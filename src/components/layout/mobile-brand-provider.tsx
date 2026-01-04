"use client";

import { useEffect } from "react";

interface MobileBrandProviderProps {
  brandColor?: string;
  children: React.ReactNode;
}

export function MobileBrandProvider({ brandColor, children }: MobileBrandProviderProps) {
  useEffect(() => {
    // If brandColor is white, empty, or missing, default to a safe Slate Gray (#94a3b8)
    const safeColor = (!brandColor || brandColor.toLowerCase() === "#ffffff" || brandColor.toLowerCase() === "white") 
      ? "#94a3b8" 
      : brandColor;

    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.style.setProperty("--primary", safeColor);
      root.style.setProperty("--primary-soft", `${safeColor}33`);
    }
  }, [brandColor]);

  return <>{children}</>;
}

