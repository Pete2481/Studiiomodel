"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-8 h-[calc(100vh-100px)] flex items-center justify-center">
      <div className="max-w-md w-full text-center space-y-8 animate-in zoom-in duration-300">
        <div className="h-20 w-20 rounded-3xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto shadow-sm">
          <AlertTriangle className="h-10 w-10" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard encountered a snag</h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            There was a problem loading this part of your studio dashboard. We've logged the incident.
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-start gap-4 text-left">
          <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shrink-0 border border-slate-100">
            <span className="text-xs font-bold text-slate-400">ID</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Crash Digest</p>
            <p className="text-[11px] font-mono text-slate-500 truncate">{error.digest || "ERR_TENANT_DASH_CRASH"}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => reset()}
            className="h-14 rounded-2xl bg-primary text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-95"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh this view
          </button>
          
          <Link
            href="/tenant/calendar"
            className="h-14 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
          >
            <LayoutDashboard className="h-4 w-4" />
            Back to Calendar
          </Link>
        </div>

        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest pt-4">
          Error code: {error.name}
        </p>
      </div>
    </div>
  );
}

