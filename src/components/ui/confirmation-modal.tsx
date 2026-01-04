"use client";

import React from "react";
import { X, AlertCircle, CheckCircle2, Info, HelpCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "success" | "info";
  isLoading?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "info",
  isLoading = false,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const icons = {
    danger: <AlertCircle className="h-6 w-6 text-rose-500" />,
    warning: <HelpCircle className="h-6 w-6 text-amber-500" />,
    success: <CheckCircle2 className="h-6 w-6 text-emerald-500" />,
    info: <Info className="h-6 w-6 text-blue-500" />,
  };

  const buttonColors = {
    danger: "bg-rose-500 hover:bg-rose-600 shadow-rose-200/50",
    warning: "bg-amber-500 hover:bg-amber-600 shadow-amber-200/50",
    success: "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200/50",
    info: "bg-slate-900 hover:bg-slate-800 shadow-slate-200/50",
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
      <div 
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      
      <div className="relative w-full max-w-md bg-white rounded-[40px] shadow-[0_32px_128px_-12px_rgba(0,0,0,0.2)] border border-slate-100 p-10 text-center space-y-8 animate-in zoom-in duration-300">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-400 transition-all"
        >
          <X className="h-5 w-5" />
        </button>

        <div className={cn(
          "h-20 w-20 rounded-[32px] flex items-center justify-center mx-auto mb-2",
          variant === "danger" ? "bg-rose-50" : 
          variant === "warning" ? "bg-amber-50" : 
          variant === "success" ? "bg-emerald-50" : "bg-blue-50"
        )}>
          {icons[variant]}
        </div>

        <div className="space-y-3">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase italic">{title}</h2>
          <p className="text-slate-500 font-medium leading-relaxed px-2">
            {message}
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "h-14 rounded-2xl text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl disabled:opacity-50 disabled:hover:scale-100",
              buttonColors[variant]
            )}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              confirmLabel
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="h-14 rounded-2xl bg-white text-slate-500 font-bold hover:text-slate-900 hover:bg-slate-50 transition-all"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

