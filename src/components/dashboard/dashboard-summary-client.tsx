"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui";
import { MetricCards, type MetricSummary } from "@/components/dashboard/metric-cards";
import { DashboardGalleries } from "@/components/dashboard/dashboard-galleries";
import { BookingList, type BookingListBooking } from "@/components/dashboard/booking-list";
import { CameraLoader } from "@/components/ui/camera-loader";

type DashboardSummaryPayload = {
  success: boolean;
  tenantId: string;
  isActionLocked: boolean;
  metrics: MetricSummary;
  featuredGalleries: any[];
  bookingPipeline: BookingListBooking[];
};

function MetricCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-28 bg-slate-100 rounded-[24px] animate-pulse border border-slate-50" />
      ))}
    </div>
  );
}

function GalleriesSkeleton() {
  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-100 rounded-lg animate-pulse" />
          <div className="h-4 w-64 bg-slate-50 rounded-lg animate-pulse" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-24 bg-slate-100 rounded-full animate-pulse" />
          <div className="h-10 w-32 bg-slate-100 rounded-full animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-[32px] border border-slate-100 bg-white">
            <div className="aspect-[4/3] bg-slate-100 animate-pulse" />
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <div className="h-5 w-3/4 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-3 w-1/2 bg-slate-50 rounded-lg animate-pulse" />
              </div>
              <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                <div className="flex gap-2">
                  <div className="h-4 w-8 bg-slate-50 rounded animate-pulse" />
                  <div className="h-4 w-8 bg-slate-50 rounded animate-pulse" />
                </div>
                <div className="h-4 w-16 bg-slate-50 rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookingPipelineSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-slate-100 rounded-lg animate-pulse" />
          <div className="h-4 w-64 bg-slate-50 rounded-lg animate-pulse" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-32 bg-slate-100 rounded-full animate-pulse" />
          <div className="h-10 w-40 bg-slate-100 rounded-full animate-pulse" />
        </div>
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-[32px] animate-pulse border border-slate-50" />
        ))}
      </div>
    </div>
  );
}

export function DashboardSummaryClient({
  tenantId,
  user,
}: {
  tenantId: string;
  user: any;
}) {
  const cacheKey = useMemo(() => `studiio:dashboardSummary:${tenantId}`, [tenantId]);
  // IMPORTANT: do not read sessionStorage during initial render (causes hydration mismatch).
  const [data, setData] = useState<DashboardSummaryPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = async () => {
    if (inFlight.current) return await inFlight.current;
    inFlight.current = (async () => {
      try {
        setLoading((prev) => prev || !data);
        const res = await fetch("/api/dashboard/summary", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as DashboardSummaryPayload;
        if (!next?.success) return;
        setData(next);
        try {
          window.sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: next }));
        } catch {
          // ignore caching failures
        }
      } finally {
        setLoading(false);
        inFlight.current = null;
      }
    })();
    return await inFlight.current;
  };

  // Hydrate from cache after mount (safe, avoids SSR/CSR mismatch).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { ts: number; data: DashboardSummaryPayload };
      if (!parsed?.data) return;
      // 3 minute TTL (fast but safe)
      if (parsed?.ts && Date.now() - parsed.ts > 3 * 60 * 1000) return;
      setData(parsed.data);
      setLoading(false);
    } catch {
      // ignore cache failures
    }
  }, [cacheKey]);

  // Background load on mount
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Revalidate when tab regains focus
  useEffect(() => {
    const onFocus = () => void refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const isActionLocked = !!data?.isActionLocked;
  const showInitialOverlay = loading && !data;

  return (
    <div className="relative grid gap-8 md:gap-12 w-full">
      {showInitialOverlay ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm rounded-[32px]">
          <div className="flex flex-col items-center gap-6">
            <CameraLoader size="sm" color="var(--primary)" className="text-primary" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 animate-pulse">
              Loading dashboard…
            </p>
          </div>
        </div>
      ) : null}
      {data?.metrics ? <MetricCards metrics={data.metrics} /> : <MetricCardsSkeleton />}

      {data?.featuredGalleries ? (
        <DashboardGalleries
          initialGalleries={data.featuredGalleries}
          user={user}
          isActionLocked={isActionLocked}
        />
      ) : (
        <GalleriesSkeleton />
      )}

      {data?.bookingPipeline ? (
        <section className="space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Booking pipeline</h2>
              <p className="text-sm font-medium text-slate-500">Track upcoming shoots and allocate the right agents in real time.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/tenant/calendar"
                prefetch={false}
                className="h-10 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 rounded-full px-5 text-xs font-bold transition-all active:scale-95 flex items-center justify-center"
              >
                Calendar view
              </Link>
              {user.role !== "CLIENT" && (
                <Hint title="Schedule" content="Book a new photography or media session.">
                  <Link
                    href={isActionLocked ? "/tenant/settings?tab=billing" : "/tenant/calendar?action=new"}
                    prefetch={false}
                    className={cn(
                      "h-10 bg-primary hover:opacity-90 text-white rounded-full px-5 text-xs font-bold transition-all shadow-lg shadow-primary/20 active:scale-95 flex items-center justify-center gap-2",
                      isActionLocked && "opacity-50 grayscale hover:grayscale-0",
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {isActionLocked ? "Subscription Required" : "New Appointment"}
                  </Link>
                </Hint>
              )}
            </div>
          </header>
          <BookingList bookings={data.bookingPipeline} />
        </section>
      ) : (
        <BookingPipelineSkeleton />
      )}
    </div>
  );
}


