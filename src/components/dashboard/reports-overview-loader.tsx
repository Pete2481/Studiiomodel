"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ReportsOverview } from "@/components/dashboard/report-overview";
import { Loader2 } from "lucide-react";

export function ReportsOverviewLoader({ tenantId }: { tenantId: string }) {
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const qs = useMemo(() => {
    const sp = new URLSearchParams(searchParams?.toString() || "");
    const view = sp.get("view") || "month";
    const date = sp.get("date");
    const q = new URLSearchParams();
    q.set("view", view);
    if (date) q.set("date", date);
    return q.toString();
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setStats(null);

    fetch(`/api/tenant/reports/stats?${qs}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to load report stats");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setStats(data?.stats || null);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message || "Failed to load report stats");
      });

    return () => {
      cancelled = true;
    };
  }, [qs]);

  if (error) {
    return (
      <div className="py-20 text-center text-slate-500">
        <p className="text-sm font-bold">Failed to load reports.</p>
        <p className="mt-2 text-xs font-medium text-slate-400">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
      </div>
    );
  }

  return <ReportsOverview tenantId={tenantId} stats={stats} />;
}


