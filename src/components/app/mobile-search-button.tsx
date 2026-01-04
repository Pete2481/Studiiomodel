"use client";

import { Search } from "lucide-react";
import { useMobileSearch } from "./mobile-search-context";
import { cn } from "@/lib/utils";

interface MobileSearchButtonProps {
  variant?: "square" | "circle";
  className?: string;
}

export function MobileSearchButton({ variant = "square", className }: MobileSearchButtonProps) {
  const { openSearch } = useMobileSearch();

  return (
    <button 
      onClick={openSearch}
      className={cn(
        "bg-slate-50 flex items-center justify-center text-slate-400 active:scale-95 transition-all shadow-sm border border-slate-100/50",
        variant === "square" ? "h-11 w-11 rounded-2xl" : "h-10 w-10 rounded-full",
        className
      )}
    >
      <Search className={cn(variant === "square" ? "h-6 w-6" : "h-5 w-5")} />
    </button>
  );
}

