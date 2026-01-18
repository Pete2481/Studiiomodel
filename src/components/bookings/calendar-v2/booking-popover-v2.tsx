"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { deleteBooking, upsertBooking } from "@/app/actions/booking-upsert";
import { QuickClientModal } from "@/components/modules/clients/quick-client-modal";
import { QuickServiceModal } from "@/components/modules/services/quick-service-modal";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Box, Camera, Check, ChevronDown, FileText, Loader2, Plane, Search, Sun, Trash2, User, Video, Wrench, X, Zap } from "lucide-react";
import { getServiceIconComponent, getServiceIconStyle } from "@/lib/service-icons";
import { getSunTimesForAddress } from "@/app/actions/weather";

export type AnchorRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export function BookingPopoverV2(props: {
  open: boolean;
  mode: "booking" | "blockout";
  user?: any;
  bookingId?: string;
  startAt?: string;
  endAt?: string;
  presetSlotType?: "" | "SUNRISE" | "DUSK" | null;
  anchorRect?: AnchorRect | null;
  tenantTimezone: string;
  reference?: { clients: any[]; services: any[]; teamMembers: any[]; agents: any[] };
  onUpserted?: (calendarBooking: any) => void;
  onDeleted?: (bookingId: string) => void;
  onClose: () => void;
}) {
  const { open, mode, user, bookingId, startAt, endAt, presetSlotType, anchorRect, tenantTimezone, reference, onUpserted, onDeleted, onClose } = props;
  const isClient = user?.role === "CLIENT";
  const [tab, setTab] = useState<"booking" | "blockout">(mode === "blockout" && isClient ? "booking" : mode);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<{ w: number; h: number }>({ w: 420, h: 420 });

  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notifyPref, setNotifyPref] = useState<"silent" | "send">("silent");
  const [preview, setPreview] = useState<null | { type: string; bookingId: string; subject: string; html: string; to: string[] }>(null);
  const [isPreviewSending, setIsPreviewSending] = useState(false);
  const initialStatusRef = useRef<string>("");

  const [isQuickClientOpen, setIsQuickClientOpen] = useState(false);
  const [isQuickServiceOpen, setIsQuickServiceOpen] = useState(false);

  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isStartTimeOpen, setIsStartTimeOpen] = useState(false);
  const [isEndTimeOpen, setIsEndTimeOpen] = useState(false);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
  const [teamSearch, setTeamSearch] = useState("");

  const normalizeStatus = (raw: string) => {
    const s = String(raw || "").toLowerCase().trim();
    if (s === "confirmed") return "approved";
    if (s === "approved") return "approved";
    if (s === "penciled") return "pencilled";
    if (s === "pending") return "pencilled";
    if (s === "pencilled") return "pencilled";
    if (s === "requested") return "requested";
    if (s === "declined") return "declined";
    if (s === "cancelled" || s === "canceled") return "cancelled";
    if (s === "blocked" || s === "blockout") return "blocked";
    return "pencilled";
  };

  const STATUS_OPTIONS: Array<{ value: string; label: string; dot: string; pill: string }> = [
    { value: "approved", label: "Approved", dot: "bg-emerald-500", pill: "border-emerald-200 bg-emerald-50/60 text-emerald-900" },
    { value: "pencilled", label: "Pencilled", dot: "bg-sky-600", pill: "border-sky-200 bg-sky-50/70 text-sky-900" },
    { value: "requested", label: "Requested", dot: "bg-rose-500", pill: "border-rose-200 bg-rose-50/60 text-rose-900" },
    { value: "declined", label: "Declined", dot: "bg-rose-500", pill: "border-rose-200 bg-rose-50/60 text-rose-900" },
    { value: "cancelled", label: "Cancelled", dot: "bg-slate-500", pill: "border-slate-200 bg-slate-50 text-slate-800" },
    { value: "blocked", label: "Blocked", dot: "bg-rose-600", pill: "border-rose-200 bg-rose-50/60 text-rose-900" },
  ];

  const computeNotificationType = (opts: { isCreate: boolean; prevStatus: string; nextStatus: string }) => {
    const next = normalizeStatus(opts.nextStatus);
    const prev = normalizeStatus(opts.prevStatus);
    if (opts.isCreate) {
      return next === "approved" ? "BOOKING_APPROVED" : "NEW_BOOKING";
    }
    if (next === "approved" && prev !== "approved") return "BOOKING_APPROVED";
    if (next === "cancelled" || next === "declined") return "BOOKING_CANCELLED";
    if (next === "requested") return "BOOKING_CHANGE_REQUESTED";
    return "BOOKING_UPDATED";
  };

  const openPreview = async (params: { bookingId: string; type: string }) => {
    const res = await fetch("/api/tenant/calendar/notifications/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(data?.error || "Failed to load notification preview");
      return;
    }
    setPreview({
      type: String(data?.type || params.type),
      bookingId: String(data?.bookingId || params.bookingId),
      subject: String(data?.subject || ""),
      html: String(data?.html || ""),
      to: Array.isArray(data?.to) ? data.to : [],
    });
  };

  const isPackageService = (s: any) => String(s?.icon || "").toUpperCase().trim() === "PACKAGE";

  const [localRef, setLocalRef] = useState<{ clients: any[]; services: any[]; teamMembers: any[]; agents: any[] }>({
    clients: [],
    services: [],
    teamMembers: [],
    agents: [],
  });

  useEffect(() => {
    if (!reference) return;
    setLocalRef({
      clients: Array.isArray(reference.clients) ? reference.clients : [],
      services: Array.isArray(reference.services) ? reference.services : [],
      teamMembers: Array.isArray(reference.teamMembers) ? reference.teamMembers : [],
      agents: Array.isArray(reference.agents) ? reference.agents : [],
    });
  }, [reference]);

  const [form, setForm] = useState({
    title: "New Event",
    status: isClient ? "requested" : "pencilled",
    slotType: "" as "" | "SUNRISE" | "DUSK",
    clientMode: "existing" as "existing" | "otc",
    clientId: isClient ? String(user?.clientId || "") : "",
    agentId: "",
    otcName: "",
    otcEmail: "",
    otcPhone: "",
    address: "",
    startAt: startAt || "",
    endAt: endAt || "",
    durationMinutes: 60,
    serviceIds: [] as string[],
    teamMemberIds: [] as string[],
    clientNotes: "",
    internalNotes: "",
    repeat: "none" as "none" | "daily" | "weekly" | "monthly",
  });

  // Tenant portal: keep selected contact (agent) consistent with selected client
  useEffect(() => {
    if (!open) return;
    if (isClient) return;
    // Only relevant for Agency client mode
    if (form.clientMode !== "existing" || !form.clientId) {
      if (form.agentId) setForm((p) => ({ ...p, agentId: "" }));
      return;
    }
    if (!form.agentId) return;
    const ok = (localRef.agents || []).some((a: any) => String(a.id) === String(form.agentId) && String(a.clientId) === String(form.clientId));
    if (!ok) {
      setForm((p) => ({ ...p, agentId: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isClient, form.clientId, form.clientMode, localRef.agents]);

  const [notesOpen, setNotesOpen] = useState(false);
  const isSunLocked = form.slotType === "SUNRISE" || form.slotType === "DUSK";

  // Client portal: enforce tenant-only feature locks in UI state.
  useEffect(() => {
    if (!open) return;
    if (!isClient) return;
    setTab("booking");
    setForm((p) => ({
      ...p,
      status: "requested",
      clientMode: "existing",
      clientId: String(user?.clientId || p.clientId || ""),
      // Client duration fixed to 60m
      durationMinutes: 60,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isClient]);

  const dtfParts = useMemo(() => {
    const fmt = (opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("en-AU", { timeZone: tenantTimezone, ...opts });
    return {
      dateTime: fmt({ year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", hour12: true }),
      hhmm24: fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
      ymd: fmt({ year: "numeric", month: "2-digit", day: "2-digit" }),
      // For dropdown labels, we want a stable representation of HH:MM (not shifted by timezone).
      time12: (h: number, m: number) =>
        new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", hour: "numeric", minute: "2-digit", hour12: true }).format(
          new Date(Date.UTC(2000, 0, 1, h, m, 0))
        ),
      partsFromDate: (d: Date) => {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: tenantTimezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).formatToParts(d);
        const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
        return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute") };
      },
    };
  }, [tenantTimezone]);

  const formatDateTimeTenant = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return dtfParts.dateTime.format(d).toUpperCase();
  };

  const formatHHMMTenant = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return dtfParts.hhmm24.format(d);
  };

  // Convert a tenant-timezone wall-clock time into a UTC Date.
  const zonedTimeToUtc = (parts: { y: number; m: number; d: number; hh: number; mm: number }, timeZone: string) => {
    const utcGuess = new Date(Date.UTC(parts.y, parts.m - 1, parts.d, parts.hh, parts.mm, 0));
    const observed = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(utcGuess);
    const get = (t: string) => Number(observed.find((p) => p.type === t)?.value ?? "0");
    const oy = get("year");
    const om = get("month");
    const od = get("day");
    const oh = get("hour");
    const omi = get("minute");
    const desiredAsUTC = Date.UTC(parts.y, parts.m - 1, parts.d, parts.hh, parts.mm, 0);
    const observedAsUTC = Date.UTC(oy, om - 1, od, oh, omi, 0);
    return new Date(utcGuess.getTime() + (desiredAsUTC - observedAsUTC));
  };

  const TIME_OPTIONS = useMemo(() => {
    const opts: Array<{ label: string; hhmm: string }> = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        opts.push({ hhmm: `${hh}:${mm}`, label: dtfParts.time12(h, m).toUpperCase() });
      }
    }
    return opts;
  }, [dtfParts]);

  const setStartTimeHHMM = (hhmm: string) => {
    if (!form.startAt) return;
    const [hh, mm] = hhmm.split(":").map((x) => parseInt(x, 10));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    // Keep the tenant-local date, but change the tenant-local wall clock time.
    const base = new Date(form.startAt);
    if (isNaN(base.getTime())) return;
    const p = dtfParts.partsFromDate(base);
    const utc = zonedTimeToUtc({ y: p.y, m: p.m, d: p.d, hh, mm }, tenantTimezone);
    setForm((prev) => ({ ...prev, startAt: utc.toISOString() }));
  };

  const setEndTimeHHMM = (hhmm: string) => {
    if (!form.endAt && !form.startAt) return;
    const [hh, mm] = hhmm.split(":").map((x) => parseInt(x, 10));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    // Use startAt's date if present; otherwise endAt's date.
    const base = new Date(form.startAt || form.endAt || "");
    if (isNaN(base.getTime())) return;
    const p = dtfParts.partsFromDate(base);
    const utc = zonedTimeToUtc({ y: p.y, m: p.m, d: p.d, hh, mm }, tenantTimezone);
    // Ensure end >= start + 15m when we have a start time.
    const start = form.startAt ? new Date(form.startAt) : null;
    let end = utc;
    if (start && !isNaN(start.getTime())) {
      const minEnd = new Date(start.getTime() + 15 * 60 * 1000);
      if (end.getTime() < minEnd.getTime()) end = minEnd;
    }
    setForm((prev) => ({ ...prev, endAt: end.toISOString() }));
  };

  const [sunInfo, setSunInfo] = useState<{ sunriseLabel: string; sunsetLabel: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (tab !== "booking") return;
    const address = String(form.address || "").trim();
    if (!address || address.length < 4) {
      setSunInfo(null);
      return;
    }
    if (!form.startAt) return;

    // Build YYYY-MM-DD from parts in tenant tz.
    const parts = dtfParts.partsFromDate(new Date(form.startAt));
    const ymd = `${String(parts.y).padStart(4, "0")}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;

    let cancelled = false;
    (async () => {
      const res = await getSunTimesForAddress({ address, date: ymd, timeZone: tenantTimezone });
      if (cancelled) return;
      if (!res.success) {
        setSunInfo(null);
        return;
      }
      const sunrise = new Date(res.sunrise);
      const sunset = new Date(res.sunset);
      if (isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) {
        setSunInfo(null);
        return;
      }
      const sunriseLabel = new Intl.DateTimeFormat("en-AU", { timeZone: tenantTimezone, hour: "numeric", minute: "2-digit", hour12: true })
        .format(sunrise)
        .toUpperCase();
      const sunsetLabel = new Intl.DateTimeFormat("en-AU", { timeZone: tenantTimezone, hour: "numeric", minute: "2-digit", hour12: true })
        .format(sunset)
        .toUpperCase();
      setSunInfo({ sunriseLabel, sunsetLabel });
    })().catch(() => setSunInfo(null));

    return () => {
      cancelled = true;
    };
  }, [open, tab, form.address, form.startAt, tenantTimezone, dtfParts]);

  useEffect(() => {
    if (!open) return;
    setTab(mode === "blockout" && isClient ? "booking" : mode);
  }, [mode, open, isClient]);

  // Client portal restrictions: enforce form defaults + tenant-only lockouts.
  useEffect(() => {
    if (!open) return;
    if (!isClient) return;
    setTab("booking");
    setForm((p) => ({
      ...p,
      status: "requested",
      clientMode: "existing",
      clientId: user?.clientId ? String(user.clientId) : p.clientId,
      // No OTC for clients
      otcName: "",
      otcEmail: "",
      otcPhone: "",
      // Default duration: 1 hour
      durationMinutes: 60,
      // Client cannot assign team
      teamMemberIds: p.teamMemberIds,
    }));
  }, [open, isClient, user?.clientId]);

  useEffect(() => {
    if (!open) return;
    if (bookingId) return; // edits handled by details fetch
    const preset = String(presetSlotType || "").toUpperCase();
    const slotType = preset === "SUNRISE" ? "SUNRISE" : preset === "DUSK" ? "DUSK" : "";
    setForm((prev) => ({
      ...prev,
      slotType: slotType as any,
      startAt: startAt || prev.startAt,
      endAt: endAt || prev.endAt,
      durationMinutes: (() => {
        // Initialize duration from the provided start/end range once on open (prevents ping-pong loops).
        try {
          const s = new Date(startAt || prev.startAt);
          const e = new Date(endAt || prev.endAt);
          if (isNaN(s.getTime()) || isNaN(e.getTime())) return prev.durationMinutes;
          const mins = Math.max(30, Math.min(480, Math.round((e.getTime() - s.getTime()) / (1000 * 60) / 30) * 30));
          return mins;
        } catch {
          return prev.durationMinutes;
        }
      })(),
    }));
  }, [open, bookingId, presetSlotType, startAt, endAt]);

  // When duration changes, recompute endAt from startAt.
  useEffect(() => {
    if (!open) return;
    if (!form.startAt) return;
    const s = new Date(form.startAt);
    if (isNaN(s.getTime())) return;
    const mins = isClient ? 60 : Math.max(30, Math.min(480, Number(form.durationMinutes || 60)));
    const newEnd = new Date(s.getTime() + mins * 60 * 1000).toISOString();
    if (newEnd !== form.endAt) {
      setForm((p) => ({ ...p, endAt: newEnd }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.durationMinutes, form.startAt, isClient]);

  // Load booking details on open (for edit)
  useEffect(() => {
    if (!open) return;
    if (!bookingId) return;
    let cancelled = false;

    (async () => {
      setIsLoadingDetails(true);
      try {
        const res = await fetch(`/api/tenant/calendar/booking/${encodeURIComponent(bookingId)}`);
        const data = await res.json().catch(() => ({}));
        const b = data?.booking;
        if (cancelled || !b) return;
        setForm((prev) => ({
          ...prev,
          title: String(b.title || "New Event"),
          status: normalizeStatus(String(b.status || "pencilled")),
          slotType: (String(b.slotType || "").toUpperCase() === "SUNRISE" ? "SUNRISE" : String(b.slotType || "").toUpperCase() === "DUSK" ? "DUSK" : ""),
          clientMode: b.clientId ? "existing" : (b?.otcName ? "otc" : prev.clientMode),
          clientId: b.clientId ? String(b.clientId) : "",
          agentId: b.agentId ? String(b.agentId) : "",
          otcName: String(b.otcName || ""),
          otcEmail: String(b.otcEmail || ""),
          otcPhone: String(b.otcPhone || ""),
          // Treat placeholder values as empty for the form (we want a clean blank state).
          address: (() => {
            const name = String(b.property?.name || "").trim();
            if (!name) return "";
            if (name.toUpperCase() === "TBC") return "";
            if (name.toUpperCase() === "RESTRICTED") return "";
            return name;
          })(),
          startAt: String(b.startAt || prev.startAt),
          endAt: String(b.endAt || prev.endAt),
          durationMinutes: (() => {
            try {
              const s = new Date(b.startAt || prev.startAt);
              const e = new Date(b.endAt || prev.endAt);
              if (isNaN(s.getTime()) || isNaN(e.getTime())) return prev.durationMinutes;
              return Math.max(30, Math.min(480, Math.round((e.getTime() - s.getTime()) / (1000 * 60) / 30) * 30));
            } catch {
              return prev.durationMinutes;
            }
          })(),
          serviceIds: Array.isArray(b.services) ? b.services.map((s: any) => String(s.serviceId)).filter(Boolean) : [],
          teamMemberIds: Array.isArray(b.assignments) ? b.assignments.map((a: any) => String(a.teamMemberId)).filter(Boolean) : [],
          clientNotes: String(b.clientNotes || ""),
          internalNotes: String(b.internalNotes || ""),
          repeat: prev.repeat,
        }));
        initialStatusRef.current = normalizeStatus(String(b.status || "pencilled"));
      } finally {
        if (!cancelled) setIsLoadingDetails(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, bookingId]);

  const defaultTitle = useMemo(() => (tab === "blockout" ? "Blocked Time" : "Booking"), [tab]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = popoverRef.current;
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      setMeasured({ w: r.width, h: r.height });
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, tab]);

  if (!open) return null;

  const margin = 12;
  const arrowWidth = 12;
  // Hard rule: bubble sits flush to the card edge (arrow bridges the entire gap).
  const gap = arrowWidth;
  const desiredWidth = 420;
  const minWidth = 320;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const anchor = anchorRect || { left: vw / 2, right: vw / 2, top: 120, bottom: 120, width: 0, height: 0 };
  const anchorMidY = (anchor.top + anchor.bottom) / 2;

  const rightSpace = vw - anchor.right;
  const leftSpace = anchor.left;

  const prefersRight = true;
  const availRight = vw - margin - (anchor.right + gap);
  const availLeft = (anchor.left - gap) - margin;
  const canFitRight = availRight >= minWidth;
  const canFitLeft = availLeft >= minWidth;

  // Choose side so the booking card remains visible (popover never overlaps the anchor).
  const side: "right" | "left" = prefersRight ? (canFitRight ? "right" : canFitLeft ? "left" : "right") : canFitLeft ? "left" : "right";

  // If space is tight, shrink width to fit the chosen side rather than overlapping the card.
  const maxWidthOnSide = Math.max(minWidth, side === "right" ? availRight : availLeft);
  const popoverWidth = Math.min(desiredWidth, maxWidthOnSide, vw - margin * 2);

  let left = side === "right" ? anchor.right + gap : anchor.left - gap - popoverWidth;
  // Hard constraint: never overlap the anchor card
  if (side === "right") left = Math.max(left, anchor.right + gap);
  if (side === "left") left = Math.min(left, anchor.left - gap - popoverWidth);
  // Clamp within viewport
  left = Math.max(margin, Math.min(left, vw - margin - popoverWidth));

  let top = anchorMidY - measured.h / 2;
  top = Math.max(margin, Math.min(top, vh - margin - measured.h));

  const arrowSize = 14;
  const arrowInset = 26; // keep arrow away from rounded corners
  let arrowTop = anchorMidY - top - arrowSize / 2;
  arrowTop = Math.max(arrowInset, Math.min(arrowTop, measured.h - arrowInset));

  return (
    <div className="fixed inset-0 z-[210]">
      {/* iOS behavior: no blur/dim. Click-away closes. */}
      <div className="absolute inset-0 bg-transparent" onClick={onClose} />

      <div
        className="absolute"
        style={{
          left,
          top,
          width: popoverWidth,
          maxWidth: "92vw",
        }}
      >
        {/* Keep overflow visible so the arrow can sit outside the bubble */}
        <div ref={popoverRef} className="relative overflow-visible">
          {/* Arrow (speech-bubble triangle) */}
          <div className={cn("absolute", side === "right" ? "left-[-12px]" : "right-[-12px]")} style={{ top: arrowTop }}>
            {/* border triangle */}
            <div
              className={cn(
                "absolute top-0",
                side === "right"
                  ? "border-y-[8px] border-y-transparent border-r-[12px] border-r-slate-100"
                  : "border-y-[8px] border-y-transparent border-l-[12px] border-l-slate-100"
              )}
            />
            {/* fill triangle */}
            <div
              className={cn(
                "absolute top-0",
                side === "right"
                  ? "left-[1px] border-y-[8px] border-y-transparent border-r-[12px] border-r-white"
                  : "right-[1px] border-y-[8px] border-y-transparent border-l-[12px] border-l-white"
              )}
            />
          </div>

          {/* Bubble (scrollable) */}
          <div className="rounded-[28px] border border-slate-100 bg-white shadow-2xl overflow-hidden max-h-[calc(100vh-40px)] overflow-y-auto overscroll-contain">
          <div className="p-5 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="text-xs font-black text-slate-500 uppercase tracking-widest">
                {bookingId ? "Edit booking" : "New booking"}
              </div>
              <div className="flex items-center gap-2">
                {!isClient && bookingId && (
                  <button
                    className="h-9 w-9 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200"
                    onClick={async () => {
                      if (!bookingId) return;
                      setIsDeleting(true);
                      try {
                        await deleteBooking(String(bookingId));
                        onDeleted?.(String(bookingId));
                        onClose();
                      } finally {
                        setIsDeleting(false);
                      }
                    }}
                    title="Delete"
                    aria-label="Delete"
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : <Trash2 className="h-4 w-4 mx-auto" />}
                  </button>
                )}
                <button
                  className="h-9 w-9 rounded-full bg-slate-50 border border-slate-100 text-slate-600 hover:bg-slate-100"
                  onClick={onClose}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            {tab === "booking" && sunInfo && (
              <div className="mt-3 flex items-center justify-end gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <Sun className="h-4 w-4 text-amber-500" />
                  <div className="text-xs font-black text-slate-900">{sunInfo.sunriseLabel}</div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sunrise</div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <Sun className="h-4 w-4 text-violet-500" />
                  <div className="text-xs font-black text-slate-900">{sunInfo.sunsetLabel}</div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sunset</div>
                </div>
              </div>
            )}

            {/* iOS-style segmented control (tenant-only) */}
            <div className="mt-4 rounded-full bg-slate-100 p-1 flex gap-1">
              <button
                className={cn(
                  "flex-1 h-9 rounded-full text-sm font-black",
                  tab === "booking" ? "bg-white shadow-sm text-slate-900" : "text-slate-600"
                )}
                onClick={() => setTab("booking")}
              >
                Booking
              </button>
              {!isClient && (
                <button
                  className={cn(
                    "flex-1 h-9 rounded-full text-sm font-black",
                    tab === "blockout" ? "bg-white shadow-sm text-slate-900" : "text-slate-600"
                  )}
                  onClick={() => setTab("blockout")}
                >
                  Block Out
                </button>
              )}
            </div>
          </div>

          <div className="px-6 pb-6">
            {isLoadingDetails && (
              <div className="mb-3 flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            )}
            {tab === "blockout" && !isClient ? (
              <div className="space-y-4">
                <div className="text-2xl font-black text-slate-900">{defaultTitle}</div>

                <Field label="Title">
                  <input
                    className="w-full rounded-3xl border border-slate-200 px-5 py-4 text-sm font-black"
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Blocked Time"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start">
                    <div className="relative">
                      <div
                        role="button"
                        tabIndex={0}
                        className="w-full h-[56px] rounded-3xl border border-slate-200 px-5 pr-11 text-sm font-black bg-white flex items-center cursor-pointer select-none"
                        onClick={() => setIsStartTimeOpen((v) => !v)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setIsStartTimeOpen((v) => !v);
                          }
                        }}
                      >
                        {form.startAt ? formatDateTimeTenant(form.startAt) : "Start"}
                        <ChevronDown className={cn("ml-auto h-4 w-4 text-slate-400 transition-transform", isStartTimeOpen && "rotate-180")} />
                      </div>
                      {isStartTimeOpen && (
                        <>
                          <div className="fixed inset-0 z-[220]" onClick={() => setIsStartTimeOpen(false)} />
                          <div className="absolute z-[230] top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-3xl shadow-2xl overflow-hidden">
                            <div className="max-h-[280px] overflow-y-auto py-2">
                              {TIME_OPTIONS.map((t) => {
                                const currentHHMM = form.startAt ? formatHHMMTenant(form.startAt) : "";
                                const selected = currentHHMM === t.hhmm;
                                return (
                                  <div
                                    key={`bo-start-${t.hhmm}`}
                                    role="button"
                                    tabIndex={0}
                                    className={cn(
                                      "px-5 py-3 flex items-center justify-between cursor-pointer select-none",
                                      selected ? "bg-slate-50" : "hover:bg-slate-50"
                                    )}
                                    onClick={() => {
                                      setStartTimeHHMM(t.hhmm);
                                      setIsStartTimeOpen(false);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setStartTimeHHMM(t.hhmm);
                                        setIsStartTimeOpen(false);
                                      }
                                    }}
                                  >
                                    <span className="text-sm font-black text-slate-900">{t.label}</span>
                                    {selected && <Check className="h-4 w-4 text-emerald-600" />}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </Field>
                  <Field label="End">
                    <div className="relative">
                      <div
                        role="button"
                        tabIndex={0}
                        className="w-full h-[56px] rounded-3xl border border-slate-200 px-5 pr-11 text-sm font-black bg-white flex items-center cursor-pointer select-none"
                        onClick={() => setIsEndTimeOpen((v) => !v)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setIsEndTimeOpen((v) => !v);
                          }
                        }}
                      >
                        {form.endAt ? formatDateTimeTenant(form.endAt) : "End"}
                        <ChevronDown className={cn("ml-auto h-4 w-4 text-slate-400 transition-transform", isEndTimeOpen && "rotate-180")} />
                      </div>
                      {isEndTimeOpen && (
                        <>
                          <div className="fixed inset-0 z-[220]" onClick={() => setIsEndTimeOpen(false)} />
                          <div className="absolute z-[230] top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-3xl shadow-2xl overflow-hidden">
                            <div className="max-h-[280px] overflow-y-auto py-2">
                              {TIME_OPTIONS.map((t) => {
                                const currentHHMM = form.endAt ? formatHHMMTenant(form.endAt) : "";
                                const selected = currentHHMM === t.hhmm;
                                return (
                                  <div
                                    key={`bo-end-${t.hhmm}`}
                                    role="button"
                                    tabIndex={0}
                                    className={cn(
                                      "px-5 py-3 flex items-center justify-between cursor-pointer select-none",
                                      selected ? "bg-slate-50" : "hover:bg-slate-50"
                                    )}
                                    onClick={() => {
                                      setEndTimeHHMM(t.hhmm);
                                      setIsEndTimeOpen(false);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setEndTimeHHMM(t.hhmm);
                                        setIsEndTimeOpen(false);
                                      }
                                    }}
                                  >
                                    <span className="text-sm font-black text-slate-900">{t.label}</span>
                                    {selected && <Check className="h-4 w-4 text-emerald-600" />}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </Field>
                </div>

                <Field label="Repeat">
                  <select
                    className="w-full rounded-3xl border border-slate-200 px-5 py-4 text-sm font-black bg-white appearance-none"
                    value={form.repeat}
                    onChange={(e) => setForm((p) => ({ ...p, repeat: e.target.value as any }))}
                  >
                    <option value="none">Never</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </Field>

                <Field label="Notes (internal)">
                  <textarea
                    className="w-full rounded-3xl border border-slate-200 px-5 py-4 text-sm font-semibold min-h-[96px]"
                    placeholder="Add notes…"
                    value={form.internalNotes}
                    onChange={(e) => setForm((p) => ({ ...p, internalNotes: e.target.value }))}
                  />
                </Field>

                <div className="flex justify-end gap-2 pt-2">
                  <button className="h-12 px-6 rounded-full bg-slate-100 text-slate-700 font-black" onClick={onClose} type="button">
                    Close
                  </button>
                  <button
                    className="h-12 px-8 rounded-full bg-slate-900 text-white font-black flex items-center gap-2"
                    type="button"
                    disabled={isSaving}
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        const result = await upsertBooking({
                          ...(bookingId ? { id: bookingId } : {}),
                          title: form.title || "Blocked Time",
                          startAt: form.startAt,
                          endAt: form.endAt,
                          status: "blocked",
                          notes: form.internalNotes,
                          metadata: { draft: false },
                        });
                        if ((result as any)?.success && (result as any)?.booking) {
                          onUpserted?.((result as any).booking);
                          onClose();
                        }
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 pr-2">
                    <div className="text-2xl md:text-3xl font-black text-slate-900 leading-tight break-words">
                      {form.title || "New Event"}
                    </div>
                  </div>

                  {!isClient ? (
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</div>
                      <div className="relative">
                        {(() => {
                          const current = STATUS_OPTIONS.find((o) => o.value === normalizeStatus(form.status)) || STATUS_OPTIONS[1];
                          return (
                            <>
                              <div
                                role="button"
                                tabIndex={0}
                                className={cn(
                                  "h-11 px-4 rounded-2xl border font-black text-sm flex items-center gap-2 cursor-pointer select-none",
                                  current.pill
                                )}
                                onClick={() => setIsStatusOpen((v) => !v)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setIsStatusOpen((v) => !v);
                                  }
                                }}
                              >
                                <span className={cn("h-2.5 w-2.5 rounded-full", current.dot)} />
                                <span>{current.label}</span>
                                <ChevronDown className={cn("ml-auto h-4 w-4 text-slate-500 transition-transform", isStatusOpen && "rotate-180")} />
                              </div>

                              {isStatusOpen && (
                                <>
                                  <div className="fixed inset-0 z-[220]" onClick={() => setIsStatusOpen(false)} />
                                  <div className="absolute z-[230] top-full right-0 mt-2 w-56 bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden">
                                    <div className="py-2">
                                      {STATUS_OPTIONS.map((opt) => {
                                        const selected = normalizeStatus(form.status) === opt.value;
                                        return (
                                          <div
                                            key={opt.value}
                                            role="button"
                                            tabIndex={0}
                                            className={cn(
                                              "px-4 py-2.5 flex items-center gap-2 cursor-pointer select-none",
                                              selected ? "bg-slate-50" : "hover:bg-slate-50"
                                            )}
                                            onClick={() => {
                                              setForm((p) => ({ ...p, status: opt.value }));
                                              setIsStatusOpen(false);
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                setForm((p) => ({ ...p, status: opt.value }));
                                                setIsStatusOpen(false);
                                              }
                                            }}
                                          >
                                            <span className={cn("h-2.5 w-2.5 rounded-full", opt.dot)} />
                                            <span className="text-sm font-black text-slate-900">{opt.label}</span>
                                            {selected && <Check className="ml-auto h-4 w-4 text-emerald-600" />}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</div>
                      <div className="h-11 px-4 rounded-2xl border border-rose-200 bg-rose-50/60 text-rose-900 font-black text-sm flex items-center gap-2 select-none">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                        Requested
                      </div>
                    </div>
                  )}
                </div>

                {/* Approval send method (only for Approved) */}
                {!isClient && normalizeStatus(form.status) === "approved" && (
                  <div className="flex justify-end">
                    <div className="rounded-full bg-slate-100 p-1 flex gap-1">
                      <button
                        type="button"
                        className={cn(
                          "h-9 px-4 rounded-full text-[11px] font-black uppercase tracking-widest",
                          notifyPref === "silent" ? "bg-white shadow-sm text-slate-900" : "text-slate-600"
                        )}
                        onClick={() => setNotifyPref("silent")}
                      >
                        Approve (silent)
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "h-9 px-4 rounded-full text-[11px] font-black uppercase tracking-widest",
                          notifyPref === "send" ? "bg-white shadow-sm text-slate-900" : "text-slate-600"
                        )}
                        onClick={() => setNotifyPref("send")}
                      >
                        Approve + Send
                      </button>
                    </div>
                  </div>
                )}

                {/* Client selection / contacts */}
                {isClient ? (
                  <div className="space-y-4">
                    <Field label="Agency">
                      <div className="w-full h-14 rounded-3xl border border-slate-200 bg-white px-5 flex items-center">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200 overflow-hidden">
                            <User className="h-4 w-4" />
                          </div>
                          <div className="text-sm font-black text-slate-900 truncate">
                            {(() => {
                              const c = (localRef.clients || []).find((x: any) => x.id === String(user?.clientId || ""));
                              return c?.businessName || c?.name || "Your agency";
                            })()}
                          </div>
                        </div>
                      </div>
                    </Field>

                    <Field label="Contact">
                      <select
                        className="w-full h-14 rounded-3xl border border-slate-200 px-5 pr-11 text-sm font-black bg-white appearance-none"
                        value={form.agentId}
                        onChange={(e) => setForm((p) => ({ ...p, agentId: e.target.value }))}
                      >
                        <option value="">Select contact…</option>
                        {(localRef.agents || []).map((a: any) => (
                          <option key={String(a.id)} value={String(a.id)}>
                            {String(a.name || "Contact")}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                ) : (
                  <>
                    {/* Client row header */}
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Client</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, clientMode: "existing", agentId: "" }))}
                          className={cn(
                            "h-8 px-3 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all",
                            form.clientMode === "existing" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-slate-400 border-slate-200"
                          )}
                        >
                          Agency
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, clientMode: "otc", clientId: "", agentId: "" }))}
                          className={cn(
                            "h-8 px-3 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all",
                            form.clientMode === "otc" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-slate-400 border-slate-200"
                          )}
                        >
                          OTC
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsQuickClientOpen(true)}
                          className="text-[10px] font-black text-emerald-700 uppercase tracking-widest hover:underline"
                        >
                          + Express Add
                        </button>
                      </div>
                    </div>

                    {form.clientMode === "otc" ? (
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="OTC Name">
                          <input
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold"
                            value={form.otcName}
                            onChange={(e) => setForm((p) => ({ ...p, otcName: e.target.value }))}
                            placeholder="Name…"
                          />
                        </Field>
                        <Field label="OTC Email">
                          <input
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold"
                            value={form.otcEmail}
                            onChange={(e) => setForm((p) => ({ ...p, otcEmail: e.target.value }))}
                            placeholder="email@…"
                          />
                        </Field>
                      </div>
                    ) : (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setIsClientDropdownOpen((v) => !v)}
                          className="w-full h-14 rounded-3xl border border-slate-200 bg-white px-5 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200 overflow-hidden">
                              <User className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 text-left">
                              <div className="text-sm font-black text-slate-900 truncate">
                                {form.clientId
                                  ? (() => {
                                      const c = (localRef.clients || []).find((x: any) => x.id === form.clientId);
                                      return c?.businessName || c?.name || "Select client…";
                                    })()
                                  : "Select client…"}
                              </div>
                            </div>
                          </div>
                          <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", isClientDropdownOpen && "rotate-180")} />
                        </button>

                        {isClientDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-[220]" onClick={() => setIsClientDropdownOpen(false)} />
                            <div className="absolute z-[230] top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-3xl shadow-2xl overflow-hidden">
                              <div className="p-3 border-b border-slate-100">
                                <div className="relative">
                                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                  <input
                                    className="w-full h-11 pl-11 pr-4 rounded-2xl bg-slate-50 border border-slate-100 text-sm font-semibold"
                                    placeholder="Search clients…"
                                    value={clientSearch}
                                    onChange={(e) => setClientSearch(e.target.value)}
                                    autoFocus
                                  />
                                </div>
                              </div>
                              <div className="max-h-[240px] overflow-y-auto py-1">
                                {(reference?.clients || [])
                                  .filter((c: any) => {
                                    const q = clientSearch.toLowerCase();
                                    return String(c.name || "").toLowerCase().includes(q) || String(c.businessName || "").toLowerCase().includes(q);
                                  })
                                  .map((c: any) => {
                                    const selected = form.clientId === c.id;
                                    return (
                                      <button
                                        key={c.id}
                                        type="button"
                                        className={cn(
                                          "w-full px-5 py-3 flex items-center justify-between text-left",
                                          selected ? "bg-emerald-50/50" : "hover:bg-slate-50"
                                        )}
                                        onClick={() => {
                                          setForm((p) => ({ ...p, clientId: c.id, agentId: "" }));
                                          setIsClientDropdownOpen(false);
                                        }}
                                      >
                                        <div className="min-w-0">
                                          <div className="text-sm font-black text-slate-900 truncate">{c.businessName || c.name}</div>
                                          {c.businessName && <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{c.name}</div>}
                                        </div>
                                        {selected && <Check className="h-4 w-4 text-emerald-600" />}
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Contact / Agent (tenant portal) */}
                    {form.clientMode === "existing" && !!form.clientId ? (
                      <Field label="Contact">
                        <select
                          className="w-full h-14 rounded-3xl border border-slate-200 px-5 pr-11 text-sm font-black bg-white appearance-none"
                          value={form.agentId}
                          onChange={(e) => setForm((p) => ({ ...p, agentId: e.target.value }))}
                        >
                          <option value="">Select contact…</option>
                          {(localRef.agents || [])
                            .filter((a: any) => String(a.clientId) === String(form.clientId))
                            .map((a: any) => (
                              <option key={String(a.id)} value={String(a.id)}>
                                {String(a.name || "Contact")}
                              </option>
                            ))}
                        </select>
                      </Field>
                    ) : null}
                  </>
                )}

                <Field label="Address">
                  <AddressAutocomplete
                    value={form.address}
                    onChange={(newAddress) => {
                      setForm((prev) => ({
                        ...prev,
                        address: newAddress,
                        title: prev.title === prev.address || prev.title === "" ? newAddress : prev.title,
                      }));
                    }}
                    placeholder="45 Jarra Rd, Clunes"
                    className="w-full rounded-3xl border border-slate-200 px-5 py-4 text-sm font-semibold focus:outline-none focus:ring-0"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start">
                    <div className="relative">
                      <div
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "w-full h-[56px] rounded-3xl border border-slate-200 px-5 pr-11 text-sm font-black bg-white flex items-center select-none",
                          isSunLocked ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                        )}
                        onClick={() => {
                          if (isSunLocked) return;
                          setIsStartTimeOpen((v) => !v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (isSunLocked) return;
                            setIsStartTimeOpen((v) => !v);
                          }
                        }}
                      >
                        {form.startAt ? formatDateTimeTenant(form.startAt) : "Start"}
                        <ChevronDown className={cn("ml-auto h-4 w-4 text-slate-400 transition-transform", isStartTimeOpen && "rotate-180")} />
                      </div>

                      {isStartTimeOpen && (
                        <>
                          <div className="fixed inset-0 z-[220]" onClick={() => setIsStartTimeOpen(false)} />
                          <div className="absolute z-[230] top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-3xl shadow-2xl overflow-hidden">
                            <div className="max-h-[280px] overflow-y-auto py-2">
                              {TIME_OPTIONS.map((t) => {
                                const currentHHMM = form.startAt ? formatHHMMTenant(form.startAt) : "";
                                const selected = currentHHMM === t.hhmm;
                                return (
                                  <div
                                    key={t.hhmm}
                                    role="button"
                                    tabIndex={0}
                                    className={cn(
                                      "px-5 py-3 flex items-center justify-between cursor-pointer select-none",
                                      selected ? "bg-slate-50" : "hover:bg-slate-50"
                                    )}
                                    onClick={() => {
                                      setStartTimeHHMM(t.hhmm);
                                      setIsStartTimeOpen(false);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setStartTimeHHMM(t.hhmm);
                                        setIsStartTimeOpen(false);
                                      }
                                    }}
                                  >
                                    <span className="text-sm font-black text-slate-900">{t.label}</span>
                                    {selected && <Check className="h-4 w-4 text-emerald-600" />}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </Field>
                  <Field label="Duration">
                    {isClient ? (
                      <div className="w-full h-[56px] rounded-3xl border border-slate-200 px-5 text-sm font-black bg-white flex items-center">
                        1 hr
                      </div>
                    ) : (
                      <div className="relative">
                        <select
                          className="w-full h-[56px] rounded-3xl border border-slate-200 px-5 pr-11 text-sm font-black bg-white appearance-none"
                          value={String(form.durationMinutes)}
                          disabled={isSunLocked}
                          onChange={(e) => {
                            if (isSunLocked) return;
                            setForm((p) => ({ ...p, durationMinutes: Number(e.target.value) }));
                          }}
                        >
                          {Array.from({ length: 16 }).map((_, i) => {
                            const mins = (i + 1) * 30; // 30..480
                            const label = mins < 60 ? `${mins} mins` : `${mins / 60} hrs`;
                            return (
                              <option key={mins} value={String(mins)}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      </div>
                    )}
                  </Field>
                </div>

                {/* Services */}
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Services</div>
                  {!isClient && (
                    <button
                      type="button"
                      onClick={() => setIsQuickServiceOpen(true)}
                      className="text-[10px] font-black text-emerald-700 uppercase tracking-widest hover:underline"
                    >
                      + Express Add
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setIsServiceDropdownOpen((v) => !v)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setIsServiceDropdownOpen((v) => !v);
                      }
                    }}
                    className="w-full min-h-[56px] rounded-3xl border border-emerald-400 bg-white px-4 py-3 flex flex-wrap gap-2 items-center cursor-pointer"
                  >
                    {form.serviceIds.length ? (
                      form.serviceIds.map((id) => {
                        const s = (localRef.services || []).find((x: any) => x.id === id);
                        const Icon = getServiceIconComponent(s?.icon);
                        const iconStyle = getServiceIconStyle(s?.icon);
                        return (
                          <span
                            key={id}
                            className="px-3 py-2 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-black uppercase tracking-widest flex items-center gap-2"
                          >
                            <span className={cn("h-9 w-9 rounded-2xl flex items-center justify-center shadow-inner ring-1", iconStyle.bg, iconStyle.text, iconStyle.ring)}>
                              <Icon className="h-4 w-4" />
                            </span>
                            {s?.name || "Service"}
                            <button
                              type="button"
                              className="h-5 w-5 rounded-full hover:bg-emerald-100 flex items-center justify-center"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setForm((p) => ({ ...p, serviceIds: p.serviceIds.filter((x) => x !== id) }));
                              }}
                              aria-label="Remove service"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-sm font-semibold text-slate-400">Select services…</span>
                    )}
                    <span className="ml-auto text-slate-400">
                      <ChevronDown className={cn("h-4 w-4 transition-transform", isServiceDropdownOpen && "rotate-180")} />
                    </span>
                  </div>

                  {isServiceDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-[220]" onClick={() => setIsServiceDropdownOpen(false)} />
                      <div className="absolute z-[230] top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-3xl shadow-2xl overflow-hidden">
                        <div className="p-3 border-b border-slate-100">
                          <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                              className="w-full h-11 pl-11 pr-4 rounded-2xl bg-slate-50 border border-slate-100 text-sm font-semibold"
                              placeholder="Search services…"
                              value={serviceSearch}
                              onChange={(e) => setServiceSearch(e.target.value)}
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="max-h-[240px] overflow-y-auto py-1">
                          {(reference?.services || [])
                            // Slots-only: remove SUNRISE/DUSK from the Services picker (they must be booked via calendar slots).
                            .filter((s: any) => {
                              const st = String((s as any)?.slotType || "").toUpperCase();
                              return st !== "SUNRISE" && st !== "DUSK";
                            })
                            .filter((s: any) => String(s.name || "").toLowerCase().includes(serviceSearch.toLowerCase()))
                            .sort((a: any, b: any) => {
                              const aPkg = isPackageService(a);
                              const bPkg = isPackageService(b);
                              if (aPkg && !bPkg) return -1;
                              if (!aPkg && bPkg) return 1;
                              return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" });
                            })
                            .map((s: any) => {
                              const selected = form.serviceIds.includes(s.id);
                              const Icon = getServiceIconComponent(s?.icon);
                              const iconStyle = getServiceIconStyle(s?.icon);
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  className={cn("w-full px-5 py-3 flex items-center justify-between text-left", selected ? "bg-emerald-50/50" : "hover:bg-slate-50")}
                                  onClick={() => {
                                    setForm((p) => ({
                                      ...p,
                                      serviceIds: selected ? p.serviceIds.filter((x) => x !== s.id) : [...p.serviceIds, s.id],
                                    }));
                                  }}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className={cn("h-9 w-9 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ring-1", iconStyle.bg, iconStyle.text, iconStyle.ring)}>
                                      <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="text-sm font-black text-slate-900 truncate">{s.name}</div>
                                  </div>
                                  {selected && <Check className="h-4 w-4 text-emerald-600" />}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Assigned team */}
                <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Assigned team</div>
                {isClient ? (
                  <div className="w-full min-h-[56px] rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-600 flex items-center">
                    {form.teamMemberIds.length
                      ? form.teamMemberIds
                          .map((id) => (localRef.teamMembers || []).find((x: any) => x.id === id)?.displayName)
                          .filter(Boolean)
                          .join(", ")
                      : "To be assigned by studio"}
                  </div>
                ) : (
                  <div className="relative">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setIsTeamDropdownOpen((v) => !v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setIsTeamDropdownOpen((v) => !v);
                        }
                      }}
                      className="w-full min-h-[56px] rounded-3xl border border-emerald-400 bg-white px-4 py-3 flex flex-wrap gap-2 items-center cursor-pointer"
                    >
                      {form.teamMemberIds.length ? (
                        form.teamMemberIds.map((id) => {
                          const m = (localRef.teamMembers || []).find((x: any) => x.id === id);
                          return (
                            <span key={id} className="px-3 py-2 rounded-full bg-slate-900 text-white text-[11px] font-black flex items-center gap-2">
                              <span className="h-6 w-6 rounded-full bg-white/10 overflow-hidden border border-white/20">
                                {m?.avatarUrl ? <img src={m.avatarUrl} className="h-full w-full object-cover" alt="" /> : null}
                              </span>
                              {m?.displayName || "Team"}
                              <button
                                type="button"
                                className="h-5 w-5 rounded-full hover:bg-white/10 flex items-center justify-center"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setForm((p) => ({ ...p, teamMemberIds: p.teamMemberIds.filter((x) => x !== id) }));
                                }}
                                aria-label="Remove team member"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-sm font-semibold text-slate-400">Add team…</span>
                      )}
                      <span className="ml-auto text-slate-400">
                        <ChevronDown className={cn("h-4 w-4 transition-transform", isTeamDropdownOpen && "rotate-180")} />
                      </span>
                    </div>

                    {isTeamDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-[220]" onClick={() => setIsTeamDropdownOpen(false)} />
                        <div className="absolute z-[230] top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-3xl shadow-2xl overflow-hidden">
                          <div className="p-3 border-b border-slate-100">
                            <div className="relative">
                              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                              <input
                                className="w-full h-11 pl-11 pr-4 rounded-2xl bg-slate-50 border border-slate-100 text-sm font-semibold"
                                placeholder="Search team…"
                                value={teamSearch}
                                onChange={(e) => setTeamSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-[240px] overflow-y-auto py-1">
                            {(reference?.teamMembers || [])
                              .filter((m: any) => String(m.displayName || "").toLowerCase().includes(teamSearch.toLowerCase()))
                              .map((m: any) => {
                                const selected = form.teamMemberIds.includes(m.id);
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    className={cn(
                                      "w-full px-5 py-3 flex items-center justify-between text-left",
                                      selected ? "bg-emerald-50/50" : "hover:bg-slate-50"
                                    )}
                                    onClick={() => {
                                      setForm((p) => ({
                                        ...p,
                                        teamMemberIds: selected ? p.teamMemberIds.filter((x) => x !== m.id) : [...p.teamMemberIds, m.id],
                                      }));
                                    }}
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="h-8 w-8 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200">
                                        {m.avatarUrl ? <img src={m.avatarUrl} className="h-full w-full object-cover" alt="" /> : null}
                                      </div>
                                      <div className="text-sm font-black text-slate-900 truncate">{m.displayName}</div>
                                    </div>
                                    {selected && <Check className="h-4 w-4 text-emerald-600" />}
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Notes (collapsible) */}
                <div className="rounded-3xl border border-slate-100 bg-slate-50/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setNotesOpen((v) => !v)}
                    className="w-full px-5 py-4 flex items-center justify-between"
                  >
                    <div className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Notes</div>
                    <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", notesOpen && "rotate-180")} />
                  </button>
                  {notesOpen && (
                    <div className="px-5 pb-5 space-y-4">
                      <Field label="Client Notes">
                        <textarea
                          className="w-full rounded-3xl border border-slate-200 px-5 py-4 text-sm font-semibold min-h-[96px] bg-white"
                          value={form.clientNotes}
                          onChange={(e) => setForm((p) => ({ ...p, clientNotes: e.target.value }))}
                          placeholder="Visible to the client…"
                        />
                      </Field>
                      <Field label="Internal Notes">
                        <textarea
                          className="w-full rounded-3xl border border-slate-200 px-5 py-4 text-sm font-semibold min-h-[96px] bg-white"
                          value={form.internalNotes}
                          onChange={(e) => setForm((p) => ({ ...p, internalNotes: e.target.value }))}
                          placeholder="Internal instructions…"
                        />
                      </Field>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button className="h-12 px-6 rounded-full bg-slate-100 text-slate-700 font-black" onClick={onClose} type="button">
                    Close
                  </button>
                  <button
                    className="h-12 px-8 rounded-full bg-slate-900 text-white font-black flex items-center gap-2"
                    type="button"
                    disabled={isSaving}
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        // Keep draft=true until we have a client or OTC name
                        const hasClient = !!form.clientId || (form.clientMode === "otc" && !!form.otcName.trim());
                        const metadata = { draft: !hasClient };
                        const result = await upsertBooking({
                          ...(bookingId ? { id: bookingId } : {}),
                          title: form.title || "New Event",
                          startAt: form.startAt,
                          endAt: form.endAt,
                          status: normalizeStatus(form.status),
                          slotType: form.slotType || null,
                          clientId: form.clientMode === "existing" ? form.clientId : "",
                          agentId: form.agentId || "",
                          otcName: form.clientMode === "otc" ? form.otcName : "",
                          otcEmail: form.clientMode === "otc" ? form.otcEmail : "",
                          otcPhone: form.clientMode === "otc" ? form.otcPhone : "",
                          address: form.address,
                          serviceIds: form.serviceIds,
                          teamMemberIds: form.teamMemberIds,
                          notes: form.internalNotes, // legacy maps to internalNotes in backend
                          clientNotes: form.clientNotes,
                          metadata,
                        });
                        if ((result as any)?.success && (result as any)?.booking) {
                          const saved = (result as any).booking;
                          onUpserted?.(saved);

                          // Decide whether to prompt an email preview for this action.
                          const isCreate = !bookingId;
                          const prevStatus = isCreate ? "pencilled" : (initialStatusRef.current || "pencilled");
                          const nextStatus = normalizeStatus(form.status);
                          const type = computeNotificationType({ isCreate, prevStatus, nextStatus });

                          const wantsPreview = nextStatus === "approved" ? notifyPref === "send" : true;
                          // Update baseline after save
                          initialStatusRef.current = nextStatus;

                          if (wantsPreview) {
                            await openPreview({ bookingId: String(saved.id), type });
                            return;
                          }

                          onClose();
                        }
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Quick add modals */}
      <QuickClientModal
        isOpen={isQuickClientOpen}
        onClose={() => setIsQuickClientOpen(false)}
        onSuccess={(client) => {
          setLocalRef((prev) => ({ ...prev, clients: [...prev.clients, client] }));
          setForm((p) => ({ ...p, clientMode: "existing", clientId: String(client.id || "") }));
        }}
      />
      <QuickServiceModal
        isOpen={isQuickServiceOpen}
        onClose={() => setIsQuickServiceOpen(false)}
        onSuccess={(service) => {
          setLocalRef((prev) => ({ ...prev, services: [...prev.services, service] }));
          const id = String(service.id || service.serviceId || "");
          if (!id) return;
          setForm((p) => ({ ...p, serviceIds: p.serviceIds.includes(id) ? p.serviceIds : [...p.serviceIds, id] }));
        }}
      />

      {/* Notification preview modal */}
      {preview && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setPreview(null)} />
          <div className="relative w-full max-w-3xl bg-white rounded-[28px] shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Draft email preview</div>
                <div className="mt-1 text-lg font-black text-slate-900 truncate">{preview.subject}</div>
                <div className="mt-2 text-xs font-semibold text-slate-500 break-words">
                  To: {(preview.to || []).join(", ") || "—"}
                </div>
              </div>
              <button
                className="h-10 w-10 rounded-full bg-slate-50 border border-slate-100 text-slate-600 hover:bg-slate-100"
                onClick={() => setPreview(null)}
                aria-label="Close preview"
              >
                ×
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
                <div className="p-4" dangerouslySetInnerHTML={{ __html: preview.html }} />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                className="h-12 px-6 rounded-full bg-slate-100 text-slate-700 font-black"
                onClick={() => {
                  setPreview(null);
                  onClose();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-12 px-8 rounded-full bg-slate-900 text-white font-black flex items-center gap-2"
                disabled={isPreviewSending}
                onClick={async () => {
                  if (!preview?.bookingId || !preview?.type) return;
                  setIsPreviewSending(true);
                  try {
                    const res = await fetch("/api/tenant/calendar/notifications/send", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ bookingId: preview.bookingId, type: preview.type }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      window.alert(data?.error || "Failed to send");
                      return;
                    }
                    setPreview(null);
                    onClose();
                  } finally {
                    setIsPreviewSending(false);
                  }
                }}
              >
                {isPreviewSending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{props.label}</div>
      {props.children}
    </div>
  );
}




