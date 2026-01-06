"use client";

import { cn } from "@/lib/utils";

export function SidebarSkeleton({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <div className={cn(
      "flex flex-col gap-10 px-6",
      isCollapsed ? "lg:items-center" : ""
    )}>
      {/* Brand Skeleton */}
      <div className="flex items-center gap-3 pt-8 mb-10">
        <div className="h-11 w-11 rounded-2xl bg-slate-100 animate-pulse shrink-0" />
        {!isCollapsed && (
          <div className="space-y-2">
            <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
            <div className="h-3 w-16 bg-slate-50 rounded animate-pulse" />
          </div>
        )}
      </div>

      {/* Nav Section Skeleton */}
      {[1, 2, 3].map((section) => (
        <div key={section} className="space-y-4">
          {!isCollapsed && <div className="h-3 w-20 bg-slate-100 rounded ml-3 animate-pulse" />}
          <div className="space-y-2">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className={cn(
                "h-12 rounded-xl bg-slate-50 animate-pulse",
                isCollapsed ? "w-12" : "w-full"
              )} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

