"use client";

import { cn } from "@/lib/utils";

export function WipProgressBar(props: {
  status: "COMPLETED" | "PENDING" | "UNKNOWN";
  pendingItems: string[];
}) {
  const { status, pendingItems } = props;
  const isComplete = status === "COMPLETED";
  const isPending = status === "PENDING";

  const fillClass = isComplete
    ? "bg-emerald-500"
    : isPending
      ? "bg-amber-500"
      : "bg-slate-300";

  const label = isComplete ? "Completed" : isPending ? "In progress" : "Not set";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
        {isPending && pendingItems.length > 0 && (
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {pendingItems.length} pending
          </div>
        )}
      </div>

      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", fillClass)}
          style={{ width: isComplete ? "100%" : isPending ? "65%" : "12%" }}
        />
      </div>
    </div>
  );
}

