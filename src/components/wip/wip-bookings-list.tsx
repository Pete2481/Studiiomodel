"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBookingWip } from "@/app/actions/wip";
import { WipProgressBar } from "@/components/wip/wip-progress-bar";
import { cn } from "@/lib/utils";

type WipState = {
  status?: string;
  pendingItems?: string[];
  note?: string;
};

export type WipBookingRow = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  metadata: any;
  client: { id: string; name: string; businessName: string } | null;
  property: { id: string; name: string } | null;
};

const DEFAULT_PENDING_ITEMS = ["Floorplan", "Video", "Aerials", "Twilight", "Other"];
const WEEK_START_DAY: "MON" | "SUN" = "MON";
const WEEKDAY_TO_INDEX: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

function getWip(meta: any): WipState {
  const w = meta?.wip;
  if (!w || typeof w !== "object") return {};
  return {
    status: typeof w.status === "string" ? w.status : undefined,
    pendingItems: Array.isArray(w.pendingItems) ? w.pendingItems.map(String) : [],
    note: typeof w.note === "string" ? w.note : "",
  };
}

function norm(s: any) {
  return String(s || "").toLowerCase().trim();
}

function getWeekStartKey(dateIso: string, timeZone: string) {
  const d0 = new Date(dateIso);
  if (!dateIso || isNaN(d0.getTime())) return null as string | null;

  // Determine the weekday in the tenant timezone, then step back until we hit the configured week start.
  const weekStartIndex = WEEK_START_DAY === "SUN" ? 0 : 1;
  let d = d0;

  for (let i = 0; i < 8; i++) {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d).toUpperCase().slice(0, 3);
    const idx = WEEKDAY_TO_INDEX[wd];
    if (idx === weekStartIndex) break;
    d = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  }

  // Key is the tenant-local YYYY-MM-DD of the week start.
  const key = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return key;
}

export function WipBookingsList(props: {
  bookings: WipBookingRow[];
  canEdit: boolean;
  timezone: string;
}) {
  const { bookings, canEdit, timezone } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState("");
  const [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>({});

  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<string>("");
  const [customItem, setCustomItem] = useState<string>("");

  const fmt = useMemo(() => {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  }, [timezone]);

  const timeFmt = useMemo(() => {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }, [timezone]);

  const weekLabelFmt = useMemo(() => {
    return new Intl.DateTimeFormat("en-AU", { timeZone: timezone, year: "numeric", month: "short", day: "2-digit" });
  }, [timezone]);

  const filteredBookings = useMemo(() => {
    const q = norm(searchQuery);
    if (!q) return bookings;
    return (bookings || []).filter((b) => {
      const hay = [
        b?.property?.name,
        b?.client?.name,
        b?.client?.businessName,
      ]
        .map(norm)
        .filter(Boolean)
        .join(" ");
      return hay.includes(q);
    });
  }, [bookings, searchQuery]);

  const weekGroups = useMemo(() => {
    const m = new Map<string, { key: string; weekStartIso: string; items: WipBookingRow[] }>();
    for (const b of filteredBookings || []) {
      const key = getWeekStartKey(String(b.startAt || ""), timezone);
      if (!key) continue;
      const weekStartIso = new Date(String(b.startAt)).toISOString(); // used only for parsing; key drives display
      const row = m.get(key);
      if (!row) m.set(key, { key, weekStartIso, items: [b] });
      else row.items.push(b);
    }
    const out = Array.from(m.values()).map((g) => {
      // Sort within week by startAt desc (most recent first)
      const items = [...g.items].sort((a, b) => String(b.startAt || "").localeCompare(String(a.startAt || "")));
      return { ...g, items };
    });
    // Sort groups by week start key desc (YYYY-MM-DD sorts lexicographically)
    out.sort((a, b) => b.key.localeCompare(a.key));
    return out;
  }, [filteredBookings, timezone]);

  const weekKeys = useMemo(() => weekGroups.map((g) => g.key), [weekGroups]);

  useEffect(() => {
    // When searching, expand all matching weeks by default.
    const q = norm(searchQuery);
    if (q) {
      const next: Record<string, boolean> = {};
      for (const k of weekKeys) next[k] = true;
      setOpenWeeks(next);
      return;
    }

    // Otherwise, ensure we have an entry for each week; default the most recent week to open.
    setOpenWeeks((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const k of weekKeys) if (next[k] === undefined) next[k] = false;
      if (weekKeys.length && Object.keys(next).length === weekKeys.length) {
        // If nothing is open yet, open the most recent week.
        const anyOpen = Object.values(next).some(Boolean);
        if (!anyOpen) next[weekKeys[0]] = true;
      }
      // Remove keys that no longer exist
      for (const k of Object.keys(next)) if (!weekKeys.includes(k)) delete next[k];
      return next;
    });
  }, [searchQuery, weekKeys.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const openEditor = (b: WipBookingRow) => {
    const w = getWip(b.metadata);
    const existing = new Set<string>([...DEFAULT_PENDING_ITEMS, ...(w.pendingItems || [])].map(String));
    const init: Record<string, boolean> = {};
    existing.forEach((k) => (init[k] = (w.pendingItems || []).map(String).includes(k)));
    setSelected(init);
    setNote(String(w.note || ""));
    setCustomItem("");
    setOpenId(b.id);
  };

  const closeEditor = () => {
    setOpenId(null);
    setCustomItem("");
  };

  const toggleItem = (item: string) => {
    setSelected((prev) => ({ ...prev, [item]: !prev[item] }));
  };

  const addCustom = () => {
    const v = String(customItem || "").trim();
    if (!v) return;
    setSelected((prev) => ({ ...prev, [v]: true }));
    setCustomItem("");
  };

  const save = (bookingId: string) => {
    const items = Object.entries(selected)
      .filter(([_, v]) => !!v)
      .map(([k]) => k)
      .slice(0, 12);

    startTransition(async () => {
      const res = await updateBookingWip({
        bookingId,
        status: "PENDING",
        pendingItems: items,
        note,
      });
      if (!(res as any)?.success) {
        window.alert((res as any)?.error || "Failed to update WIP");
        return;
      }
      closeEditor();
      router.refresh();
    });
  };

  const markComplete = (bookingId: string) => {
    startTransition(async () => {
      const res = await updateBookingWip({
        bookingId,
        status: "COMPLETED",
        pendingItems: [],
        note: "",
      });
      if (!(res as any)?.success) {
        window.alert((res as any)?.error || "Failed to update WIP");
        return;
      }
      router.refresh();
    });
  };

  if (!bookings.length) {
    return (
      <div className="ui-card border-slate-100 p-10">
        <div className="text-sm font-bold text-slate-900">No past jobs yet.</div>
        <div className="text-sm text-slate-500 mt-2">
          This list shows bookings after the job date has passed, so clients can see what’s still pending.
        </div>
      </div>
    );
  }

  const renderBookingRow = (b: WipBookingRow) => {
    const w = getWip(b.metadata);
    const wipStatus = String(w.status || "").toUpperCase();
    const status = (wipStatus === "COMPLETED" ? "COMPLETED" : wipStatus === "PENDING" ? "PENDING" : "UNKNOWN") as
      | "COMPLETED"
      | "PENDING"
      | "UNKNOWN";
    const pendingItems = Array.isArray(w.pendingItems) ? w.pendingItems : [];
    const noteText = String(w.note || "");

    const start = b.startAt ? new Date(b.startAt) : null;
    const end = b.endAt ? new Date(b.endAt) : null;
    const dateStr = start && !isNaN(start.getTime()) ? fmt.format(start) : "—";
    const timeStr =
      start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())
        ? `${timeFmt.format(start)}–${timeFmt.format(end)}`
        : "";

    return (
      <div key={b.id} className="px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-6 items-start">
          <div className="space-y-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Booking date</div>
            <div className="text-base font-black text-slate-900">{dateStr}</div>
            {timeStr && <div className="text-xs font-bold text-slate-500">{timeStr}</div>}
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Property</div>
            <div className="text-base font-black text-slate-900">{b.property?.name || "TBC"}</div>
            <div className="text-xs font-bold text-slate-500">
              {b.client?.businessName ? `${b.client.businessName} · ` : ""}
              {b.client?.name || "Client"}
            </div>

            <div className="mt-3">
              <WipProgressBar status={status} pendingItems={pendingItems} />
            </div>

            {status === "PENDING" && (pendingItems.length || noteText) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {pendingItems.map((it) => (
                  <span
                    key={it}
                    className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700 border border-amber-100"
                  >
                    {it}
                  </span>
                ))}
                {!!noteText && (
                  <span className="inline-flex items-center rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600 border border-slate-100">
                    {noteText}
                  </span>
                )}
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            {canEdit ? (
              status === "COMPLETED" ? (
                <div className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-black shadow-sm border border-emerald-200 bg-emerald-50 text-emerald-700 w-full">
                  COMPLETED
                </div>
              ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => markComplete(b.id)}
                  disabled={isPending}
                  className={cn("ui-button-primary w-full justify-center", "bg-emerald-600 hover:opacity-95")}
                >
                  Mark complete
                </button>
                <button
                  onClick={() => openEditor(b)}
                  disabled={isPending}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition active:scale-95 disabled:opacity-50",
                    "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
                  )}
                >
                  Still in progress
                </button>
              </div>
              )
            ) : (
              <div className="text-xs font-bold text-slate-400">Status updates are controlled by the studio.</div>
            )}

            {openId === b.id && canEdit && (
              <div className="mt-2 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pending items</div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  {Object.keys(selected)
                    .sort((a, bb) => a.localeCompare(bb))
                    .map((k) => (
                      <label key={k} className="flex items-center gap-3 text-sm font-bold text-slate-700">
                        <input
                          type="checkbox"
                          checked={!!selected[k]}
                          onChange={() => toggleItem(k)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        {k}
                      </label>
                    ))}
                </div>

                <div className="mt-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Add custom item</div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={customItem}
                      onChange={(e) => setCustomItem(e.target.value)}
                      placeholder="e.g. Video re-edit"
                      className="ui-input-tight h-10 px-4 text-xs"
                    />
                    <button
                      type="button"
                      onClick={addCustom}
                      className="ui-button-primary h-10 px-5 text-xs"
                      disabled={!String(customItem || "").trim()}
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Note (optional)</div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Floorplan pending from supplier"
                    className="ui-input-tight h-24 py-4 resize-none text-xs text-slate-700 font-medium"
                  />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => save(b.id)}
                    disabled={isPending}
                    className="ui-button-primary flex-1 justify-center"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={closeEditor}
                    disabled={isPending}
                    className="inline-flex flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="ui-card border-slate-100 p-0 overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Past jobs</div>
          <div className="text-lg font-black text-slate-900 tracking-tight">Client Work In Progress</div>
          <div className="text-xs font-bold text-slate-500 mt-1">
            Grouped by week of booking date · Search by property or client
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bookings, clients, addresses…"
            className="ui-input-tight h-10 w-full lg:w-[360px] px-4 text-xs"
          />
          {isPending && <div className="text-xs font-bold text-slate-500">Saving…</div>}
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {weekGroups.map((g) => {
          const isOpen = !!openWeeks[g.key];

          const counts = (() => {
            let completed = 0;
            for (const b of g.items) {
              const w = getWip(b.metadata);
              if (String(w.status || "").toUpperCase() === "COMPLETED") completed += 1;
            }
            const total = g.items.length;
            const pending = Math.max(0, total - completed);
            return { total, completed, pending };
          })();

          const weekStartDate = new Date(`${g.key}T00:00:00Z`);
          const weekLabel = `Week of ${isNaN(weekStartDate.getTime()) ? g.key : weekLabelFmt.format(weekStartDate)}`;

          return (
            <div key={g.key}>
              <button
                type="button"
                onClick={() => setOpenWeeks((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
                className="w-full px-8 py-5 flex items-center justify-between gap-4 hover:bg-slate-50 text-left"
              >
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{weekLabel}</div>
                  <div className="text-sm font-black text-slate-900 mt-1">{counts.total} bookings</div>
                </div>

                <div className="flex items-center gap-3">
                  {counts.pending === 0 ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700 border border-emerald-100">
                      All completed
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700 border border-amber-100">
                      {counts.pending} pending
                    </span>
                  )}
                  <span className="text-slate-400 text-xl leading-none">{isOpen ? "▾" : "▸"}</span>
                </div>
              </button>

              {isOpen && <div className="divide-y divide-slate-100">{g.items.map(renderBookingRow)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

