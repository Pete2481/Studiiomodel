import React from "react";
import { CameraLoader } from "@/components/ui/camera-loader";

export default function DashboardLoading() {
  return (
    <div className="flex h-[70vh] w-full flex-col items-center justify-center space-y-8">
      <CameraLoader size="lg" className="text-emerald-500" />
      <div className="space-y-2 text-center">
        <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase">Syncing Studio Data</h3>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Optimizing your production view</p>
      </div>
    </div>
  );
}

