"use client";

import React, { useLayoutEffect } from "react";

interface ThemeProviderProps {
  brandColor?: string;
  children: React.ReactNode;
}

export function ThemeProvider({ brandColor = "#10b981", children }: ThemeProviderProps) {
  useLayoutEffect(() => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.style.setProperty("--primary", brandColor);
      
      // Also generate a "soft" version for rings and backgrounds (20% opacity)
      root.style.setProperty("--primary-soft", `${brandColor}33`);
    }
  }, [brandColor]);

  return <>{children}</>;
}

