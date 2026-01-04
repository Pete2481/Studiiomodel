"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface AutoFadeCoverProps {
  images: string[];
  title: string;
  fallback: string;
  className?: string;
  interval?: number;
}

export function AutoFadeCover({ 
  images, 
  title, 
  fallback, 
  className,
  interval = 4000 
}: AutoFadeCoverProps) {
  const [index, setIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);

  const allImages = React.useMemo(() => {
    const list = [...(images || [])];
    if (fallback && !list.includes(fallback)) {
      list.unshift(fallback);
    }
    // Filter out duplicates and empty strings
    return Array.from(new Set(list)).filter(Boolean);
  }, [images, fallback]);

  useEffect(() => {
    if (allImages.length <= 1) return;

    const timer = setInterval(() => {
      setIsFading(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % allImages.length);
        setIsFading(false);
      }, 500); 
    }, interval);

    return () => clearInterval(timer);
  }, [allImages, interval]);

  const currentImage = allImages[index] || fallback;

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-slate-100", className)}>
      <img 
        src={currentImage} 
        alt={title} 
        className={cn(
          "h-full w-full object-cover transition-all duration-700",
          isFading ? "opacity-0 scale-105" : "opacity-100 scale-100"
        )}
      />
      {allImages.length > 1 && (
        <img 
          src={allImages[(index + 1) % allImages.length]} 
          alt="" 
          className="absolute inset-0 h-full w-full object-cover -z-10"
        />
      )}
    </div>
  );
}

