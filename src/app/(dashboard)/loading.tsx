import React from "react";
import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="flex h-[70vh] w-full flex-col items-center justify-center space-y-4">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-4 border-slate-100 border-t-primary animate-spin" />
        <Loader2 className="absolute inset-0 h-16 w-16 text-primary/20 p-4" />
      </div>
      <div className="space-y-2 text-center">
        <h3 className="text-lg font-bold text-slate-900 tracking-tight">Syncing Studio Data...</h3>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Optimizing your production view</p>
      </div>
    </div>
  );
}

