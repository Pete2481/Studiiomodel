"use client";

import React from "react";
import Link from "next/link";

function IconAlertTriangle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function IconRefresh(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function IconCalendar(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

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
          <IconAlertTriangle className="h-10 w-10" />
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
            <IconRefresh className="h-4 w-4" />
            Refresh this view
          </button>
          
          <Link
            href="/tenant/calendar"
            className="h-14 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
          >
            <IconCalendar className="h-4 w-4" />
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

