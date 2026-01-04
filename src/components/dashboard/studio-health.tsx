"use client";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { TrendingUp } from "lucide-react";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StudioHealthProps {
  monthlyTarget: number;
  monthlyRevenue: string;
  monthlyGoal: string;
  capacity: "Low" | "Medium" | "High";
  capacityNote: string;
  efficiencyUp: string;
}

export function StudioHealth({
  monthlyTarget,
  monthlyRevenue,
  monthlyGoal,
  capacity,
  capacityNote,
  efficiencyUp
}: StudioHealthProps) {
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Studio Health</h2>
      
      <div className="rounded-[40px] border border-slate-100 bg-slate-50/50 p-10 space-y-10 shadow-sm">
        {/* Monthly Target */}
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Monthly Target</p>
            <p className="text-[11px] font-bold text-slate-900">{monthlyTarget}%</p>
          </div>
          <div className="h-3 w-full bg-white border border-slate-100 rounded-full overflow-hidden p-0.5">
            <div 
              className="h-full bg-slate-900 rounded-full transition-all duration-1000" 
              style={{ width: `${monthlyTarget}%` }}
            />
          </div>
          <p className="text-[11px] font-bold text-slate-400">
            <span className="text-slate-900">{monthlyRevenue}</span> of {monthlyGoal} goal
          </p>
        </div>

        {/* Capacity */}
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Capacity</p>
            <p className="text-[11px] font-bold text-slate-900">{capacity}</p>
          </div>
          <div className="h-3 w-full bg-white border border-slate-100 rounded-full overflow-hidden p-0.5">
            <div 
              className="h-full bg-rose-500 rounded-full transition-all duration-1000 shadow-[0_0_12px_rgba(244,63,94,0.4)]" 
              style={{ width: capacity === 'High' ? '94%' : capacity === 'Medium' ? '50%' : '20%' }}
            />
          </div>
          <p className="text-[11px] font-bold text-slate-400">
            {capacityNote}
          </p>
        </div>

        {/* Efficiency Card */}
        <div className="pt-6 border-t border-slate-200/60">
          <div className="bg-white rounded-[24px] p-6 flex items-center gap-4 border border-slate-100 shadow-sm transition-all hover:shadow-lg hover:border-slate-200 group cursor-default">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-slate-900">Efficiency Up</p>
              <p className="text-[12px] font-bold text-emerald-600">{efficiencyUp}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
