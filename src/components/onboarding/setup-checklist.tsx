"use client";

import { useState, useEffect } from "react";
import { 
  CheckCircle2, 
  Circle, 
  ChevronRight, 
  LayoutList,
  ArrowRight,
  Trophy,
  X
} from "lucide-react";
import { getOnboardingProgress } from "@/app/actions/onboarding";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function SetupChecklist() {
  const [data, setData] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProgress = async () => {
    const progress = await getOnboardingProgress();
    setData(progress);
    setLoading(false);
  };

  useEffect(() => {
    fetchProgress();
  }, []);

  if (loading || !data || data.isAllCompleted) return null;

  const remainingCount = data.totalCount - data.completedCount;

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "h-10 px-4 rounded-xl border flex items-center gap-2 transition-all relative group shadow-sm",
          isOpen ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
        )}
      >
        <LayoutList className={cn("h-4 w-4", isOpen ? "text-indigo-400" : "text-slate-400")} />
        <span className="text-[10px] font-black uppercase tracking-widest">Setup Guide</span>
        
        {remainingCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white ring-2 ring-white">
            {remainingCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-[60]" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 mt-3 w-80 bg-white rounded-[32px] border border-slate-100 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] z-[70] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="p-6 bg-slate-900 text-white">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Onboarding Progress</p>
                </div>
                <button onClick={() => setIsOpen(false)}>
                  <X className="h-4 w-4 text-slate-500 hover:text-white transition-colors" />
                </button>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>{data.completedCount} of {data.totalCount} Complete</span>
                  <span className="text-slate-400">{Math.round((data.completedCount / data.totalCount) * 100)}%</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-1000" 
                    style={{ width: `${(data.completedCount / data.totalCount) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 space-y-1 max-h-[400px] overflow-y-auto">
              {data.steps.map((step: any) => (
                <Link 
                  key={step.id} 
                  href={step.link}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-2xl transition-all group",
                    step.isCompleted ? "opacity-50 grayscale bg-slate-50" : "hover:bg-slate-50"
                  )}
                >
                  <div className="mt-0.5">
                    {step.isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-200 group-hover:text-indigo-500 transition-colors" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-bold leading-tight",
                      step.isCompleted ? "text-slate-500 line-through" : "text-slate-900"
                    )}>
                      {step.title}
                    </p>
                    {!step.isCompleted && (
                      <p className="text-[11px] font-medium text-slate-500 mt-1">
                        {step.description}
                      </p>
                    )}
                  </div>
                  {!step.isCompleted && (
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-900 group-hover:translate-x-1 transition-all mt-1" />
                  )}
                </Link>
              ))}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 text-center uppercase tracking-widest">
                Unlock all features by finishing setup
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

