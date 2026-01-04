"use client";

import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  className?: string;
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action, 
  className 
}: EmptyStateProps) {
  return (
    <div className={cn(
      "py-32 flex flex-col items-center justify-center text-center px-6 rounded-[48px] border-2 border-dashed border-slate-100 bg-white/50 shadow-sm animate-in fade-in zoom-in duration-500",
      className
    )}>
      <div className="h-20 w-20 rounded-[32px] bg-slate-50 flex items-center justify-center text-slate-200 mb-6 shadow-inner ring-1 ring-slate-100">
        <Icon className="h-10 w-10" />
      </div>
      
      <div className="max-w-xs space-y-2">
        <h3 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h3>
        <p className="text-sm font-medium text-slate-400 leading-relaxed">
          {description}
        </p>
      </div>

      {action && (
        <button
          onClick={action.onClick}
          className="mt-8 h-12 px-6 rounded-full bg-slate-900 text-white text-xs font-bold shadow-lg shadow-slate-900/10 hover:scale-105 transition-all flex items-center gap-2"
        >
          {action.icon && <action.icon className="h-3.5 w-3.5" />}
          {action.label}
        </button>
      )}
    </div>
  );
}

