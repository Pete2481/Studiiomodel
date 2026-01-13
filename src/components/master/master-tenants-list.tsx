"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Calendar, ChevronDown, Clock, ImageIcon, Paintbrush, Search, Users, Zap } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { TenantActions } from "@/components/master/tenant-actions";
import { PortalTooltip } from "@/components/ui/portal-tooltip";
import { setAiSuiteEnabledForAllTenants } from "@/app/actions/master-ai";

export type MasterTenantRow = {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  contactPhone: string | null;
  deletedAt: string | null;
  bookingsTotal: number;
  galleriesTotal: number;
  clientsTotal: number;
  usersTotal: number;
  newEdits: number;
  openEdits: number;
  pendingBookings: number;
  lastActiveAt: string | null;
  aiSuiteEnabled: boolean;
  aiSuiteFreeUnlocksRemaining: number;
  aiSuiteRunsTotal: number;
  aiSuiteEstimatedUsdTotal: number;
};

type SortMode =
  | "name"
  | "mostBookings"
  | "mostGalleries"
  | "mostClients"
  | "mostUsers"
  | "mostOpenEdits"
  | "mostPendingBookings"
  | "lastActive";

type StatusFilter = "all" | "active" | "inactive";

export function MasterTenantsList({ initialTenants }: { initialTenants: MasterTenantRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
  const [sortMode, setSortMode] = useState<SortMode>(() => (searchParams.get("sort") as SortMode) || "lastActive");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => (searchParams.get("status") as StatusFilter) || "all");
  const [isGlobalAiBusy, setIsGlobalAiBusy] = useState(false);

  // Keep local state in sync with URL (supports refresh/back/forward).
  useEffect(() => {
    setSearchQuery(searchParams.get("q") || "");
    setSortMode(((searchParams.get("sort") as SortMode) || "lastActive"));
    setStatusFilter(((searchParams.get("status") as StatusFilter) || "all"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setUrlParam = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Debounce search query → URL (so it persists on refresh but doesn't spam updates).
  useEffect(() => {
    const t = setTimeout(() => setUrlParam("q", searchQuery.trim() || undefined), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const visibleTenants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = initialTenants.filter((t) => {
      if (statusFilter === "active" && t.deletedAt) return false;
      if (statusFilter === "inactive" && !t.deletedAt) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        String(t.contactEmail || "").toLowerCase().includes(q)
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === "mostBookings") return b.bookingsTotal - a.bookingsTotal;
      if (sortMode === "mostGalleries") return b.galleriesTotal - a.galleriesTotal;
      if (sortMode === "mostClients") return b.clientsTotal - a.clientsTotal;
      if (sortMode === "mostUsers") return b.usersTotal - a.usersTotal;
      if (sortMode === "mostOpenEdits") return b.openEdits - a.openEdits;
      if (sortMode === "mostPendingBookings") return b.pendingBookings - a.pendingBookings;
      if (sortMode === "lastActive") {
        const at = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
        const bt = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
        return bt - at;
      }
      return a.name.localeCompare(b.name);
    });

    return sorted;
  }, [initialTenants, searchQuery, sortMode, statusFilter]);

  return (
    <div className="flex flex-col gap-8">
      {/* Action Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
            <input
              type="text"
              placeholder="Search workspaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ui-input h-12 w-full sm:w-80 pl-11 font-semibold shadow-sm"
            />
          </div>

          <div className="flex gap-3">
            <SelectPill
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v as StatusFilter);
                setUrlParam("status", v === "all" ? undefined : v);
              }}
              ariaLabel="Filter tenants by status"
              options={[
                { value: "all", label: "Status: All" },
                { value: "active", label: "Status: Active" },
                { value: "inactive", label: "Status: Inactive" },
              ]}
            />
            <SelectPill
              value={sortMode}
              onChange={(v) => {
                setSortMode(v as SortMode);
                setUrlParam("sort", v === "lastActive" ? undefined : v);
              }}
              ariaLabel="Sort tenants"
              options={[
                { value: "lastActive", label: "Sort: Last active" },
                { value: "name", label: "Sort: Name" },
                { value: "mostBookings", label: "Sort: Most bookings" },
                { value: "mostGalleries", label: "Sort: Most galleries" },
                { value: "mostClients", label: "Sort: Most clients" },
                { value: "mostUsers", label: "Sort: Most users" },
                { value: "mostOpenEdits", label: "Sort: Most open edits" },
                { value: "mostPendingBookings", label: "Sort: Most pending bookings" },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={isGlobalAiBusy}
            onClick={async () => {
              if (!confirm("Enable AI Suite for ALL active tenants?")) return;
              try {
                setIsGlobalAiBusy(true);
                await setAiSuiteEnabledForAllTenants(true);
              } catch (e: any) {
                alert(e?.message || "Failed to enable AI Suite globally");
              } finally {
                setIsGlobalAiBusy(false);
              }
            }}
            className="h-12 px-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
            title="Turns AI Suite ON for all active tenants"
          >
            Enable AI (All)
          </button>
          <button
            disabled={isGlobalAiBusy}
            onClick={async () => {
              if (!confirm("Disable AI Suite for ALL active tenants? This will block unlocks and runs.")) return;
              try {
                setIsGlobalAiBusy(true);
                await setAiSuiteEnabledForAllTenants(false);
              } catch (e: any) {
                alert(e?.message || "Failed to disable AI Suite globally");
              } finally {
                setIsGlobalAiBusy(false);
              }
            }}
            className="h-12 px-4 rounded-2xl bg-[#b5d0c1] text-slate-900 text-[11px] font-black uppercase tracking-widest transition-all border border-white/60 disabled:opacity-50"
            title="Turns AI Suite OFF for all active tenants"
          >
            Disable AI (All)
          </button>
        </div>
      </div>

      {/* Tenant Cards (re-implementation of the screenshot UI) */}
      <div className="space-y-4">
        {visibleTenants.map((tenant) => (
          <article
            key={tenant.id}
            className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden"
          >
            <div className="p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-500 border border-slate-100 font-bold text-xs shrink-0">
                      {tenant.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-slate-900 truncate">{tenant.name}</p>
                      <p className="text-[11px] font-medium text-slate-400 truncate">{tenant.contactEmail || tenant.slug}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-slate-400">
                    <Clock className="h-4 w-4" />
                    <span className="truncate">
                      Last active:{" "}
                      {tenant.lastActiveAt
                        ? format(new Date(tenant.lastActiveAt), "dd/MM/yyyy, hh:mm a")
                        : "—"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-4 py-1.5 text-[10px] font-bold tracking-widest",
                      tenant.deletedAt ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                    )}
                  >
                    {tenant.deletedAt ? "INACTIVE" : "ACTIVE"}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-4 py-1.5 text-[10px] font-bold tracking-widest border",
                      tenant.aiSuiteEnabled
                        ? "bg-[#b5d0c1]/60 text-slate-900 border-white/60"
                        : "bg-slate-50 text-slate-500 border-slate-100"
                    )}
                    title="AI Suite availability for this tenant"
                  >
                    {tenant.aiSuiteEnabled ? "AI ON" : "AI OFF"}
                  </span>
                  <TenantActions tenant={tenant} />
                </div>
              </div>

              {/* Icon metrics row */}
              <div className="mt-5 flex items-center justify-center gap-6 sm:gap-10 text-slate-400">
                <Metric label="Bookings (total)" icon={Calendar} value={tenant.bookingsTotal} />
                <Metric label="Galleries (total)" icon={ImageIcon} value={tenant.galleriesTotal} />
                <Metric label="Clients (agencies)" icon={Building2} value={tenant.clientsTotal} />
                <Metric label="Users (memberships)" icon={Users} value={tenant.usersTotal} />
                <Metric label="Open edit requests" icon={Paintbrush} value={tenant.openEdits} highlight={tenant.openEdits > 0} />
                <Metric
                  label="AI Suite runs (total)"
                  icon={Zap}
                  value={tenant.aiSuiteRunsTotal}
                  highlight={tenant.aiSuiteRunsTotal > 0}
                  tooltipContent={`${Number(tenant.aiSuiteRunsTotal || 0).toLocaleString()} (est $${Number(
                    tenant.aiSuiteEstimatedUsdTotal || 0,
                  ).toFixed(2)} USD)`}
                />
              </div>
            </div>
          </article>
        ))}

        {visibleTenants.length === 0 && (
          <div className="py-16 text-center text-slate-400 text-sm font-medium">
            No tenants found matching your filters.
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, icon: Icon, value, highlight = false, tooltipContent }: any) {
  const numeric = Number(value || 0);
  return (
    <PortalTooltip
      title={label}
      content={typeof tooltipContent === "string" ? tooltipContent : `${numeric.toLocaleString()}`}
      placement="top"
    >
      <div className="flex items-center gap-2 cursor-default">
        <Icon className={cn("h-4 w-4", highlight ? "text-rose-500" : "text-slate-300")} />
        <span className={cn("text-lg font-black tabular-nums", highlight ? "text-rose-500" : "text-slate-900")}>
          {numeric.toLocaleString()}
        </span>
      </div>
    </PortalTooltip>
  );
}

function SelectPill({
  value,
  onChange,
  ariaLabel,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ui-input h-12 w-52 pr-10 text-[12px] font-bold text-slate-700 appearance-none shadow-sm"
        aria-label={ariaLabel}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
    </div>
  );
}

