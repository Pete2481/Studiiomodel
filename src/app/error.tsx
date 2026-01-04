"use client";

import React, { useEffect } from "react";
import { AlertCircle, RotateCcw, Home, MessageSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const isMobile = pathname?.startsWith("/mobile");

  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global Error Boundary caught:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white rounded-[48px] shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden animate-in zoom-in duration-500">
        {/* Decorative Header */}
        <div className="bg-rose-50 h-32 flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-20 h-20 bg-rose-500 rounded-full -translate-x-10 -translate-y-10" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-rose-500 rounded-full translate-x-10 translate-y-10" />
          </div>
          <div className="h-16 w-16 rounded-3xl bg-white shadow-xl shadow-rose-500/10 flex items-center justify-center text-rose-500 relative z-10">
            <AlertCircle className="h-8 w-8" />
          </div>
        </div>

        <div className="p-12 text-center space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Something went wrong</h1>
            <p className="text-slate-500 leading-relaxed max-w-sm mx-auto">
              We encountered an unexpected error. Your data is safe, but we couldn't complete that action.
            </p>
          </div>

          {/* Error Details (Safe for Prod) */}
          <div className="bg-slate-50 rounded-2xl p-4 text-left">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Error Reference</p>
            <p className="text-[11px] font-mono text-slate-500 break-all bg-white p-2 rounded-lg border border-slate-100">
              {error.digest || "ERR_UNKNOWN_CONTEXT"}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={() => reset()}
              className="h-16 rounded-full bg-slate-900 text-white font-bold flex items-center justify-center gap-3 shadow-xl shadow-slate-900/10 hover:bg-slate-800 transition-all active:scale-95 group"
            >
              <RotateCcw className="h-5 w-5 group-hover:rotate-[-45deg] transition-transform" />
              Try again
            </button>

            <div className="grid grid-cols-2 gap-4">
              <Link
                href={isMobile ? "/mobile" : "/"}
                className="h-14 rounded-full bg-white border border-slate-100 text-slate-600 font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all active:scale-95"
              >
                <Home className="h-4 w-4" />
                Go Home
              </Link>
              <button
                onClick={() => window.location.reload()}
                className="h-14 rounded-full bg-white border border-slate-100 text-slate-600 font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all active:scale-95"
              >
                <MessageSquare className="h-4 w-4" />
                Reload Page
              </button>
            </div>
          </div>
        </div>

        {/* Support Footer */}
        <div className="px-12 py-6 border-t border-slate-50 bg-slate-50/50 flex justify-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            If this persists, please contact Studiio Support
          </p>
        </div>
      </div>
    </div>
  );
}

