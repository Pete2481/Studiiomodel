"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import { addDays, addMinutes, format, subMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { permissionService } from "@/lib/permission-service";
import { BookingPopoverV2 } from "./booking-popover-v2";
import { deleteBooking, upsertBooking } from "@/app/actions/booking-upsert";
import dynamic from "next/dynamic";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Settings } from "lucide-react";
import { getSunTimesForLatLonRange } from "@/app/actions/weather";

const BusinessHoursModal = dynamic(() => import("../business-hours-modal").then((m) => m.BusinessHoursModal), { ssr: false });
const CalendarSubscriptionModal = dynamic(() => import("../calendar-subscription-modal").then((m) => m.CalendarSubscriptionModal), { ssr: false });

function IconClock(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function IconMapPin(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  );
}

type LiteBooking = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status: string;
  propertyStatus?: string;
  client?: { name?: string; businessName?: string } | null;
  property?: { name?: string } | null;
  isPlaceholder?: boolean;
  slotType?: string | null;
  isDraft?: boolean;
  isTemp?: boolean;
  teamAvatars?: string[];
  teamCount?: number;
  teamMemberIds?: string[];
  slotCapacity?: number;
  slotIndex?: number;
};

type BookingDetails = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status: string;
  propertyStatus?: string;
  client?: { name?: string; businessName?: string } | null;
  property?: { name?: string } | null;
  internalNotes?: string;
  clientNotes?: string;
  isPlaceholder?: boolean;
  slotType?: string | null;
  services?: { serviceId: string; name: string }[];
  assignments?: { teamMemberId: string; teamMember: { displayName: string; avatarUrl: string | null } }[];
};

export function CalendarViewV2(props: {
  user: any;
  tenantTimezone: string;
  tenantLat?: number | null;
  tenantLon?: number | null;
  sunSlotsAddress?: string | null;
  customStatuses?: string[];
  businessHours?: any;
  calendarSecret?: string | null;
  aiLogisticsEnabled?: boolean;
  reference?: { clients: any[]; services: any[]; teamMembers: any[]; agents: any[] };
  slotSettings?: {
    sunriseSlotTime: string;
    duskSlotTime: string;
    sunriseSlotsPerDay: number;
    duskSlotsPerDay: number;
  };
}) {
  const { user, tenantTimezone, tenantLat, tenantLon, businessHours, aiLogisticsEnabled = false, reference, slotSettings, sunSlotsAddress } = props;
  const calendarRef = useRef<any>(null);

  // Local-only feature gates (do not ship to prod UI).
  const isLocalOnly = typeof window !== "undefined" && window.location.hostname === "localhost";
  const [selectedTeamMemberIds, setSelectedTeamMemberIds] = useState<string[]>([]);
  const [isStaffFilterOpen, setIsStaffFilterOpen] = useState(false);

  // Mobile responsiveness (keep desktop unchanged)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(!!mq.matches);
    update();
    try {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    } catch {
      // Safari fallback
      mq.addListener(update);
      return () => mq.removeListener(update);
    }
  }, []);

  const [bookings, setBookings] = useState<LiteBooking[]>([]);
  const [sunSlots, setSunSlots] = useState<LiteBooking[]>([]);
  const [clientTempBooking, setClientTempBooking] = useState<LiteBooking | null>(null);
  const [rangeTitle, setRangeTitle] = useState<string>("");
  const [clientHoursMsg, setClientHoursMsg] = useState<string | null>(null);
  const lastVisibleRangeRef = useRef<{ start: Date; end: Date } | null>(null);
  const rangeCacheRef = useRef<Map<string, LiteBooking[]>>(new Map());
  const rangeInflightRef = useRef<Map<string, Promise<LiteBooking[]>>>(new Map());
  const sunRangeCacheRef = useRef<Map<string, LiteBooking[]>>(new Map());
  const sunRangeInflightRef = useRef<Map<string, Promise<LiteBooking[]>>>(new Map());

  type HoverLiteEvent = {
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    status: string;
    isPlaceholder?: boolean;
    isMasked?: boolean;
    client?: { name?: string; businessName?: string } | null;
    property?: { name?: string } | null;
    teamAvatars?: string[];
    teamCount?: number;
  };

  const [hoveredEvent, setHoveredEvent] = useState<{ event: HoverLiteEvent; x: number; y: number } | null>(null);
  const hoverDomHandlersRef = useRef<WeakMap<Element, { enter: () => void; leave: () => void }>>(new WeakMap());
  const pointerMoveHandlersRef = useRef<WeakMap<Element, (e: MouseEvent) => void>>(new WeakMap());

  const [popover, setPopover] = useState<{ open: boolean; mode: "booking" | "blockout"; bookingId?: string; startAt?: string; endAt?: string; presetSlotType?: "" | "SUNRISE" | "DUSK" | null }>(
    { open: false, mode: "booking" }
  );
  const [popoverAnchor, setPopoverAnchor] = useState<{ left: number; top: number; right: number; bottom: number; width: number; height: number } | null>(null);
  const [popoverRestore, setPopoverRestore] = useState<{ key: number; form: any } | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);

  const [view, setView] = useState<string>("timeGridWeek");
  const [dayGridPlugin, setDayGridPlugin] = useState<any>(null);
  const [pendingView, setPendingView] = useState<string | null>(null);

  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastCreateRef = useRef<{ key: string; at: number } | null>(null);
  const suppressSelectUntilRef = useRef<number>(0);
  const pendingAnchorBookingIdRef = useRef<string | null>(null);

  const isClientOrRestrictedAgent = user?.role === "CLIENT" || (user?.role === "AGENT" && !user?.permissions?.seeAll);
  const isRestrictedRole = user?.role === "CLIENT" || user?.role === "AGENT";
  const canPlaceBookings = permissionService.can(user, "canPlaceBookings");
  const canClientPlaceBookings = canPlaceBookings;

  const setClientTempAt = (startIso: string, endIso: string, opts?: { slotType?: "SUNRISE" | "DUSK" | null }) => {
    if (user?.role !== "CLIENT") return;
    setClientTempBooking({
      id: "client-temp",
      title: "New Event",
      startAt: startIso,
      endAt: endIso,
      status: "REQUESTED",
      isPlaceholder: false,
      slotType: opts?.slotType || null,
      isDraft: true,
      isTemp: true,
      client: { businessName: "CLIENT" },
      property: { name: "TBC" },
      teamAvatars: [],
      teamCount: 0,
    });
    // Re-anchor popover to the actual rendered temp card (so arrow sits on the card edge, not the click point).
    pendingAnchorBookingIdRef.current = "client-temp";
  };

  const mergeLiteById = (prev: LiteBooking[], next: LiteBooking[]) => {
    const m = new Map<string, LiteBooking>();
    prev.forEach((b) => b?.id && m.set(String(b.id), b));
    next.forEach((b) => b?.id && m.set(String(b.id), b));
    return Array.from(m.values());
  };

  // Changes to per-day Max AM/PM should regenerate slots (avoid stale cache).
  const sunCountsKey = useMemo(() => {
    const bh = businessHours as any;
    if (!bh) return "no-bh";
    return [0, 1, 2, 3, 4, 5, 6]
      .map((d) => `${d}:${Number(bh?.[String(d)]?.sunrise ?? 0)}:${Number(bh?.[String(d)]?.dusk ?? 0)}`)
      .join("|");
  }, [businessHours]);

  useEffect(() => {
    // When counters change, clear cache + regenerate lazily.
    sunRangeCacheRef.current.clear();
    setSunSlots([]);
  }, [sunCountsKey]);

  const timeFmtTenant = useMemo(() => {
    return new Intl.DateTimeFormat("en-AU", { timeZone: tenantTimezone, hour: "numeric", minute: "2-digit", hour12: true });
  }, [tenantTimezone]);

  const dateFmtTenant = useMemo(() => {
    return new Intl.DateTimeFormat("en-AU", { timeZone: tenantTimezone, weekday: "short", day: "numeric", month: "short" });
  }, [tenantTimezone]);

  const formatTimeRangeTenant = (start?: Date | null, end?: Date | null) => {
    if (!start || !end) return "TBC";
    try {
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return "TBC";
      return `${timeFmtTenant.format(start).toUpperCase()} — ${timeFmtTenant.format(end).toUpperCase()}`;
    } catch {
      return "TBC";
    }
  };

  const formatDateAndTimeRangeTenant = (start?: Date | null, end?: Date | null) => {
    if (!start || !end) return "Invalid Date";
    try {
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return "Invalid Date";
      return `${dateFmtTenant.format(start)} • ${formatTimeRangeTenant(start, end)}`;
    } catch {
      return "Invalid Date";
    }
  };

  // Lazy-load heavier calendar plugins only when needed (e.g. Month view).
  const ensureDayGridPlugin = async () => {
    if (dayGridPlugin) return;
    const mod = await import("@fullcalendar/daygrid");
    const plugin = (mod as any).default || mod;
    setDayGridPlugin(plugin);
  };

  // If we requested a view that requires a lazily loaded plugin, wait until it is present before switching.
  useEffect(() => {
    if (!pendingView) return;
    if (pendingView === "dayGridMonth" && !dayGridPlugin) return;
    const api = calendarRef.current?.getApi?.();
    queueMicrotask(() => {
      api?.changeView(pendingView);
      setView(pendingView);
      setPendingView(null);
    });
  }, [pendingView, dayGridPlugin]);

  const toLiteFromCalendarBooking = (b: any): LiteBooking => {
    const members = (b?.assignments || []).map((a: any) => a?.teamMember).filter(Boolean);
    const teamAvatars = members.map((m: any) => m?.avatarUrl).filter(Boolean).slice(0, 3);
    return {
      id: String(b.id),
      title: String(b.title || "Booking"),
      startAt: String(b.startAt),
      endAt: String(b.endAt),
      status: String(b.status || "requested"),
      propertyStatus: String(b.propertyStatus || ""),
      client: b.client || null,
      property: b.property || { name: "TBC" },
      isPlaceholder: !!b.isPlaceholder,
      slotType: b.slotType || null,
      isDraft: !!(b?.metadata?.draft),
      teamAvatars,
      teamCount: members.length,
    };
  };

  const getStatusConfig = (status: string, isMasked?: boolean) => {
    if (isMasked) return { dot: "bg-slate-400", border: "border-slate-200", bg: "bg-slate-50", text: "text-slate-500" };
    switch (status) {
      case "APPROVED":
      case "CONFIRMED":
        return { dot: "bg-primary", border: "border-emerald-200", bg: "bg-emerald-50/50", text: "text-emerald-700" };
      case "PENCILLED":
      case "PENDING":
        // iOS-style "new event" blue
        return { dot: "bg-sky-600", border: "border-sky-200", bg: "bg-sky-50/70", text: "text-sky-800" };
      case "REQUESTED":
        return { dot: "bg-rose-500", border: "border-rose-200", bg: "bg-rose-50/50", text: "text-rose-700" };
      case "DECLINED":
      case "CANCELLED":
        return { dot: "bg-rose-500", border: "border-rose-200", bg: "bg-rose-50/50", text: "text-rose-700" };
      case "BLOCKED":
      case "BLOCKOUT":
        return { dot: "bg-rose-600", border: "border-rose-200/70", bg: "bg-rose-100/45", text: "text-rose-700" };
      default:
        return { dot: "bg-slate-500", border: "border-slate-200", bg: "bg-white", text: "text-slate-700" };
    }
  };

  const getStatusGradient = (status: string, isMasked?: boolean) => {
    // Don’t reveal extra info for masked events; keep them neutral.
    if (isMasked) return "none";
    // Very light top→bottom wash; fades out by mid-card.
    const s = String(status || "").toUpperCase();
    const rgbaTop = (r: number, g: number, b: number, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;
    // Slightly stronger at top, fade to transparent.
    const mk = (rgb: [number, number, number]) =>
      `linear-gradient(to bottom, ${rgbaTop(rgb[0], rgb[1], rgb[2], 0.18)} 0%, ${rgbaTop(rgb[0], rgb[1], rgb[2], 0.0)} 65%)`;

    switch (s) {
      case "APPROVED":
      case "CONFIRMED":
        return mk([16, 185, 129]); // emerald
      case "PENCILLED":
      case "PENDING":
        return mk([2, 132, 199]); // sky
      case "REQUESTED":
        return mk([244, 63, 94]); // rose
      case "DECLINED":
      case "CANCELLED":
        return mk([244, 63, 94]); // rose
      case "BLOCKED":
      case "BLOCKOUT":
        return mk([225, 29, 72]); // deeper rose
      default:
        return "none";
    }
  };

  const createDraftBooking = async (
    startAtIso: string,
    endAtIso: string,
    anchor: { left: number; top: number; right: number; bottom: number; width: number; height: number },
    opts?: { slotType?: "SUNRISE" | "DUSK" | null }
  ) => {
    try {
      // Dedupe: FullCalendar can fire both dateClick + select for a single user gesture.
      const now = Date.now();
      // Use start-time only (rounded) because click+select may produce different endAt values.
      const startKey = new Date(startAtIso);
      const roundedStartMs = Math.floor(startKey.getTime() / (60 * 1000)) * (60 * 1000);
      const key = `${roundedStartMs}`;
      if (lastCreateRef.current && lastCreateRef.current.key === key && now - lastCreateRef.current.at < 750) {
        return null;
      }
      lastCreateRef.current = { key, at: now };

      const res = await upsertBooking({
        title: "New Event",
        startAt: startAtIso,
        endAt: endAtIso,
        status: "approved",
        metadata: { draft: true },
        slotType: opts?.slotType || null,
      });
      if (!(res as any)?.success || !(res as any)?.booking) return null;
      const created = { ...toLiteFromCalendarBooking((res as any).booking), isDraft: true };
      setBookings((prev) => mergeBookingsById(prev, [created]));
      // Initially open using pointer anchor, then re-anchor to the actual rendered event card once mounted.
      setPopoverAnchor(anchor);
      setPopover({ open: true, mode: "booking", bookingId: String(created.id), startAt: startAtIso, endAt: endAtIso });
      pendingAnchorBookingIdRef.current = String(created.id);
      return created;
    } catch (e) {
      console.error("[CALENDAR_V2] Draft create failed:", e);
      return null;
    }
  };

  const deleteBookingLocal = async (id: string) => {
    try {
      await deleteBooking(id);
    } catch (e) {
      console.error("[CALENDAR_V2] delete failed:", e);
    } finally {
      setBookings((prev) => prev.filter((b) => String(b.id) !== String(id)));
    }
  };

  const mergeBookingsById = (prev: LiteBooking[], next: LiteBooking[]) => {
    const map = new Map<string, LiteBooking>();
    prev.forEach((b) => b?.id && map.set(String(b.id), b));
    next.forEach((b) => b?.id && map.set(String(b.id), b));
    return Array.from(map.values());
  };

  const fetchBookingsForRange = async (start: Date, end: Date) => {
    const key = `${start.toISOString()}|${end.toISOString()}`;
    if (rangeCacheRef.current.has(key)) return rangeCacheRef.current.get(key)!;
    if (rangeInflightRef.current.has(key)) return rangeInflightRef.current.get(key)!;

    const p = (async () => {
      const url = `/api/tenant/calendar/bookings-lite?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      const items = Array.isArray(data?.bookings) ? (data.bookings as LiteBooking[]) : [];
      rangeCacheRef.current.set(key, items);
      rangeInflightRef.current.delete(key);
      return items;
    })().catch((e) => {
      rangeInflightRef.current.delete(key);
      console.error("[CALENDAR_V2] Range fetch failed:", e);
      return [];
    });

    rangeInflightRef.current.set(key, p);
    return p;
  };

  const handleVisibleRange = async (start: Date, end: Date) => {
    lastVisibleRangeRef.current = { start, end };
    const items = await fetchBookingsForRange(start, end);
    setBookings((prev) => mergeBookingsById(prev, items));
  };

  const formatYMDInTenantTimezone = (d: Date) => {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tenantTimezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  };

  const formatRangeTitle = (viewType: string, start: Date, endExclusive: Date) => {
    // FullCalendar gives an exclusive end; for range title we want inclusive end.
    const end = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);

    const monthShort = (d: Date) =>
      new Intl.DateTimeFormat("en-US", { timeZone: tenantTimezone, month: "short" }).format(d).toUpperCase();
    const yearNum = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tenantTimezone, year: "numeric" }).format(d);
    const dayNum = (d: Date) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: tenantTimezone, day: "2-digit" }).format(d));
    const monthNum = (d: Date) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: tenantTimezone, month: "2-digit" }).format(d));

    const y = yearNum(start);
    const ms = monthShort(start);
    const me = monthShort(end);
    const ds = dayNum(start);
    const de = dayNum(end);
    const mns = monthNum(start);
    const mne = monthNum(end);

    if (viewType === "dayGridMonth") {
      return `${ms} ${y}`;
    }
    if (viewType === "timeGridDay") {
      return `${ms} ${ds}, ${y}`;
    }
    // Week (or any multi-day): JAN12—17, 2026 (or JAN30—FEB2, 2026)
    if (mns === mne) return `${ms}${ds}—${de}, ${y}`;
    return `${ms}${ds}—${me}${de}, ${y}`;
  };

  const navPrev = () => {
    const api = calendarRef.current?.getApi?.();
    api?.prev();
  };
  const navNext = () => {
    const api = calendarRef.current?.getApi?.();
    api?.next();
  };
  const navToday = () => {
    const api = calendarRef.current?.getApi?.();
    api?.today();
  };

  const loadSunSlotsForRange = async (start: Date, end: Date) => {
    try {
      // FullCalendar gives an exclusive `end`; we want inclusive day range for Open-Meteo.
      const endInclusive = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      const startDate = formatYMDInTenantTimezone(start);
      const endDate = formatYMDInTenantTimezone(endInclusive);
      const cacheKey = `${tenantTimezone}|${startDate}|${endDate}|${sunCountsKey}`;
      if (sunRangeCacheRef.current.has(cacheKey)) {
        const cached = sunRangeCacheRef.current.get(cacheKey)!;
        setSunSlots((prev) => mergeLiteById(prev, cached));
        return;
      }
      if (sunRangeInflightRef.current.has(cacheKey)) {
        const inflight = sunRangeInflightRef.current.get(cacheKey)!;
        const slots = await inflight.catch(() => []);
        if (slots.length) setSunSlots((prev) => mergeLiteById(prev, slots));
        return;
      }

      const p = (async (): Promise<LiteBooking[]> => {
        // STRICT: Sunrise/Dusk slots require an explicit tenant-configured base location.
        const lat = Number(tenantLat);
        const lon = Number(tenantLon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

        const res = await getSunTimesForLatLonRange({
          lat,
          lon,
          startDate,
          endDate,
          timeZone: tenantTimezone,
        });
        if (!res.success) return [];

        const slots: LiteBooking[] = [];
        for (const day of res.days) {
          const sunrise = new Date(day.sunrise);
          const sunset = new Date(day.sunset);

          const dayIndex = (() => {
            // Determine weekday in tenant timezone based on the sunrise instant (stable for the day).
            const wd = new Intl.DateTimeFormat("en-US", { timeZone: tenantTimezone, weekday: "short" }).format(sunrise);
            const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
            return map[wd] ?? null;
          })();
          const dayCfg = dayIndex == null ? null : (businessHours ? (businessHours as any)[String(dayIndex)] : null);
          const sunriseCount = Math.max(0, Math.min(3, Number(dayCfg?.sunrise ?? 0)));
          const duskCount = Math.max(0, Math.min(3, Number(dayCfg?.dusk ?? 0)));

          if (!isNaN(sunrise.getTime()) && sunriseCount > 0) {
            const slotStart = subMinutes(sunrise, 30).toISOString();
            const slotEnd = addMinutes(sunrise, 30).toISOString();
            for (let i = 0; i < sunriseCount; i++) {
              slots.push({
                id: `sun-slot-SUNRISE-${day.date}-${i + 1}`,
                title: "SUNRISE SLOT",
                startAt: slotStart,
                endAt: slotEnd,
                status: "PENCILLED",
                isPlaceholder: true,
                slotType: "SUNRISE",
                isDraft: false,
                teamAvatars: [],
                teamCount: 0,
                slotCapacity: sunriseCount,
                slotIndex: i + 1,
                client: null,
                property: { name: "SUNRISE" },
              });
            }
          }
          if (!isNaN(sunset.getTime()) && duskCount > 0) {
            const slotStart = subMinutes(sunset, 30).toISOString();
            const slotEnd = addMinutes(sunset, 30).toISOString();
            for (let i = 0; i < duskCount; i++) {
              slots.push({
                id: `sun-slot-DUSK-${day.date}-${i + 1}`,
                title: "DUSK SLOT",
                startAt: slotStart,
                endAt: slotEnd,
                status: "PENCILLED",
                isPlaceholder: true,
                slotType: "DUSK",
                isDraft: false,
                teamAvatars: [],
                teamCount: 0,
                slotCapacity: duskCount,
                slotIndex: i + 1,
                client: null,
                property: { name: "DUSK" },
              });
            }
          }
        }

        return slots;
      })()
        .then((slots) => {
          if (slots.length) sunRangeCacheRef.current.set(cacheKey, slots);
          sunRangeInflightRef.current.delete(cacheKey);
          return slots;
        })
        .catch((e) => {
          sunRangeInflightRef.current.delete(cacheKey);
          console.error("[CALENDAR_V2] Sun slot fetch failed:", e);
          return [];
        });

      sunRangeInflightRef.current.set(cacheKey, p);
      const slots = await p;
      if (slots.length) setSunSlots((prev) => mergeLiteById(prev, slots));
    } catch (e) {
      console.error("[CALENDAR_V2] Sun slot load failed:", e);
      // non-fatal; keep any existing cached slots
    }
  };

  const ensureRolling4WeeksAhead = () => {
    const today = new Date();
    // endExclusive = today + 29 so inclusive range covers +28 days
    const endExclusive = addDays(today, 29);
    const startDate = formatYMDInTenantTimezone(today);
    const endDate = formatYMDInTenantTimezone(new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000));
    const cacheKey = `${tenantTimezone}|${startDate}|${endDate}|${sunCountsKey}`;
    if (sunRangeCacheRef.current.has(cacheKey) || sunRangeInflightRef.current.has(cacheKey)) return;
    void loadSunSlotsForRange(today, endExclusive);
  };

  // Keep a rolling "today → today+28 days" window preloaded at all times.
  useEffect(() => {
    ensureRolling4WeeksAhead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantTimezone, tenantLat, tenantLon, sunCountsKey]);

  const partsFromDateInTenantTimezone = (d: Date) => {
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
  };

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

  const weekdayFmtTenant = useMemo(() => {
    return new Intl.DateTimeFormat("en-AU", { timeZone: tenantTimezone, weekday: "short" });
  }, [tenantTimezone]);

  const isWithinBusinessHoursTenant = (start: Date, durationMinutes: number) => {
    if (!businessHours) return true;
    const weekday = weekdayFmtTenant.format(start);
    const dayIdx =
      weekday === "Sun"
        ? 0
        : weekday === "Mon"
          ? 1
          : weekday === "Tue"
            ? 2
            : weekday === "Wed"
              ? 3
              : weekday === "Thu"
                ? 4
                : weekday === "Fri"
                  ? 5
                  : 6;
    const cfg = (businessHours as any)?.[String(dayIdx)];
    if (!cfg?.open || !cfg?.start || !cfg?.end) return false;

    const parseHHMM = (v: any) => {
      const [hh, mm] = String(v || "").split(":").map((x) => Number(x));
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
      return hh * 60 + mm;
    };
    const startMin = parseHHMM(cfg.start);
    const endMin = parseHHMM(cfg.end);
    if (startMin == null || endMin == null) return false;

    const p = partsFromDateInTenantTimezone(start);
    const mins = p.hh * 60 + p.mm;
    return mins >= startMin && mins + durationMinutes <= endMin;
  };

  const flashClientHoursMsg = (msg: string) => {
    if (user?.role !== "CLIENT") return;
    setClientHoursMsg(msg);
    window.setTimeout(() => setClientHoursMsg((cur) => (cur === msg ? null : cur)), 2200);
  };

  const handleNewAppt = async (e: React.MouseEvent) => {
    if (isRestrictedRole && !canClientPlaceBookings) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const anchor = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };

    // Create a 60-min draft booking at the next 15-min boundary in tenant timezone.
    const now = new Date();
    const p = partsFromDateInTenantTimezone(now);
    const midnightUtc = zonedTimeToUtc({ y: p.y, m: p.m, d: p.d, hh: 0, mm: 0 }, tenantTimezone);
    const minsNow = p.hh * 60 + p.mm;
    const minsRounded = Math.ceil(minsNow / 15) * 15;
    let start = new Date(midnightUtc.getTime() + minsRounded * 60 * 1000);
    const end = addMinutes(start, 60);

    suppressSelectUntilRef.current = Date.now() + 800;
    // CLIENT: open form only; booking is created only when user presses Save.
    if (user?.role === "CLIENT") {
      // Enforce: client can only request within business hours (sunrise/dusk must be via cards).
      if (!isWithinBusinessHoursTenant(start, 60)) {
        let found: { start: Date; end: Date } | null = null;
        for (let offset = 0; offset < 14; offset++) {
          const d = addDays(now, offset);
          const parts = partsFromDateInTenantTimezone(d);
          const weekday = weekdayFmtTenant.format(d);
          const dayIdx =
            weekday === "Sun"
              ? 0
              : weekday === "Mon"
                ? 1
                : weekday === "Tue"
                  ? 2
                  : weekday === "Wed"
                    ? 3
                    : weekday === "Thu"
                      ? 4
                      : weekday === "Fri"
                        ? 5
                        : 6;
          const cfg = (businessHours as any)?.[String(dayIdx)];
          if (!cfg?.open || !cfg?.start || !cfg?.end) continue;
          const [sh, sm] = String(cfg.start).split(":").map((x: string) => Number(x));
          const [eh, em] = String(cfg.end).split(":").map((x: string) => Number(x));
          if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) continue;
          const startMin = sh * 60 + sm;
          const endMin = eh * 60 + em;
          const nowMin = offset === 0 ? minsRounded : startMin;
          const candidateMin = offset === 0 ? Math.max(startMin, nowMin) : startMin;
          if (candidateMin + 60 > endMin) continue;
          const midnight = zonedTimeToUtc({ y: parts.y, m: parts.m, d: parts.d, hh: 0, mm: 0 }, tenantTimezone);
          const candStart = new Date(midnight.getTime() + candidateMin * 60 * 1000);
          const candEnd = addMinutes(candStart, 60);
          found = { start: candStart, end: candEnd };
          break;
        }
        if (!found) {
          flashClientHoursMsg("Select a Sunrise/Dusk slot or a time within business hours.");
          return;
        }
        start = found.start;
      }
      setClientTempAt(start.toISOString(), end.toISOString());
      setPopoverAnchor(anchor);
      setPopover({ open: true, mode: "booking", bookingId: undefined, startAt: start.toISOString(), endAt: end.toISOString(), presetSlotType: null });
      return;
    }
    await createDraftBooking(start.toISOString(), end.toISOString(), anchor);
  };

  const calendarEvents = useMemo(() => {
    const events: any[] = [];
    // Render sunrise/dusk placeholders only for remaining capacity (hide once quota is met).
    const sunSlotDayKey = (iso: string) => {
      try {
        return formatYMDInTenantTimezone(new Date(iso));
      } catch {
        return String(iso || "").slice(0, 10);
      }
    };
    const normStatus = (s: any) => String(s || "").toUpperCase();
    const isActiveBookingStatus = (s: any) => {
      const st = normStatus(s);
      return st !== "CANCELLED" && st !== "DECLINED";
    };
    const isSunPlaceholder = (s: any) => {
      const st = String(s?.slotType || "").toUpperCase();
      return !!s?.isPlaceholder && (st === "SUNRISE" || st === "DUSK") && String(s?.id || "").startsWith("sun-slot-");
    };

    // Compute remaining capacity per day+slotType based on real bookings overlapping that day's sun window.
    const remainingByDayType = (() => {
      const m = new Map<string, { cap: number; startAt: string; endAt: string; booked: number; remaining: number }>();
      for (const s of sunSlots) {
        if (!isSunPlaceholder(s)) continue;
        const st = String(s.slotType || "").toUpperCase();
        const day = sunSlotDayKey(String(s.startAt || ""));
        const key = `${day}|${st}`;
        const prev = m.get(key);
        const cap = Math.max(Number(prev?.cap || 0), Number(s?.slotCapacity || 0));
        const startAt = prev?.startAt || String(s.startAt);
        const endAt = prev?.endAt || String(s.endAt);
        m.set(key, { cap, startAt, endAt, booked: 0, remaining: cap });
      }
      for (const b of bookings) {
        const st = String(b?.slotType || "").toUpperCase();
        if (st !== "SUNRISE" && st !== "DUSK") continue;
        if (b?.isPlaceholder) continue;
        if (!isActiveBookingStatus(b?.status)) continue;
        const day = sunSlotDayKey(String(b.startAt || ""));
        const key = `${day}|${st}`;
        const row = m.get(key);
        if (!row) continue;
        try {
          const slotS = new Date(row.startAt);
          const slotE = new Date(row.endAt);
          const s = new Date(b.startAt);
          const e = new Date(b.endAt);
          if (isNaN(slotS.getTime()) || isNaN(slotE.getTime()) || isNaN(s.getTime()) || isNaN(e.getTime())) continue;
          if (s < slotE && e > slotS) row.booked += 1;
        } catch {
          // ignore
        }
      }
      for (const [key, row] of m.entries()) {
        row.remaining = Math.max(0, (row.cap || 0) - (row.booked || 0));
        m.set(key, row);
      }
      return m;
    })();

    const sunSlotsRender = (() => {
      const groups = new Map<string, LiteBooking[]>();
      for (const s of sunSlots) {
        if (!isSunPlaceholder(s)) continue;
        const st = String(s.slotType || "").toUpperCase();
        const day = sunSlotDayKey(String(s.startAt || ""));
        const key = `${day}|${st}`;
        const arr = groups.get(key) || [];
        arr.push(s);
        groups.set(key, arr);
      }
      const out: LiteBooking[] = [];
      for (const [key, arr] of groups.entries()) {
        const remaining = remainingByDayType.get(key)?.remaining ?? arr.length;
        const sorted = [...arr].sort((a, b) => Number(a?.slotIndex || 0) - Number(b?.slotIndex || 0));
        out.push(...sorted.slice(0, Math.max(0, remaining)));
      }
      return out;
    })();

    const staffFilteredBookings = (() => {
      if (!isLocalOnly) return bookings;
      if (!selectedTeamMemberIds.length) return bookings;
      const sel = new Set(selectedTeamMemberIds.map(String));
      return (bookings || []).filter((b: any) => {
        if (!b || b.isPlaceholder) return true;
        const ids = Array.isArray((b as any).teamMemberIds) ? ((b as any).teamMemberIds as any[]).map(String) : [];
        // Keep Unassigned visible.
        if (!ids.length) return true;
        for (const id of ids) if (sel.has(String(id))) return true;
        return false;
      });
    })();

    const allBookings = [...staffFilteredBookings, ...sunSlotsRender, ...(clientTempBooking ? [clientTempBooking] : [])];

    // 1) Availability background (punched holes)
    if (businessHours) {
      Object.entries(businessHours).forEach(([day, config]: [string, any]) => {
        if (config.open && config.start && config.end) {
          events.push({
            daysOfWeek: [parseInt(day)],
            startTime: config.start,
            endTime: config.end,
            display: "background",
            groupId: "available",
            color: "#ffffff",
            classNames: ["available-hole"],
          });
        }
      });
    }

    // 2) Placeholder slots as background availability (date specific)
    if (!aiLogisticsEnabled) {
      allBookings
        .filter((b) => b.isPlaceholder && b.startAt && b.endAt)
        .forEach((b) => {
          if (user?.role === "CLIENT") {
            const isBlocked = allBookings.some((block) => {
              const status = String(block.status || "").toUpperCase();
              if (status !== "BLOCKED" && status !== "blocked") return false;
              return new Date(b.startAt) < new Date(block.endAt) && new Date(b.endAt) > new Date(block.startAt);
            });
            if (isBlocked) return;
          }

          events.push({
            start: b.startAt,
            end: b.endAt,
            display: "background",
            groupId: "available",
            color: "#ffffff",
            classNames: ["available-hole"],
          });
        });
    }

    // 3) Real bookings + interactive placeholders
    allBookings.forEach((b) => {
      if (!b.startAt || !b.endAt) return;
      const slotType = String(b.slotType || "").toUpperCase();
      const isSunSlot = !!b.isPlaceholder && (slotType === "SUNRISE" || slotType === "DUSK") && String(b.id || "").startsWith("sun-slot-");
      // Month view: hide Sunrise/Dusk placeholder cards (keep them in Day/Week only)
      if (view === "dayGridMonth" && isSunSlot) return;
      // When AI logistics is on, hide generic placeholder availability, but keep sunrise/dusk guides visible.
      if (aiLogisticsEnabled && b.isPlaceholder && !isSunSlot) return;

      const status = String(b.status || "REQUESTED").toUpperCase();
      const isBlocked = status === "BLOCKED";
      const isMasked = !b.isPlaceholder && isClientOrRestrictedAgent && !b.client && String(b.title || "").toUpperCase().includes("LIMITED");

      // If client, hide placeholders that overlap with block-out
      if (b.isPlaceholder && user?.role === "CLIENT") {
        const isBlockedOverlap = allBookings.some((block) => {
          const st = String(block.status || "").toUpperCase();
          if (st !== "BLOCKED") return false;
          return new Date(b.startAt) < new Date(block.endAt) && new Date(b.endAt) > new Date(block.startAt);
        });
        if (isBlockedOverlap) return;
      }

            const title = b.isPlaceholder
              ? `${b.slotType || "PRODUCTION"} SLOT${b.slotCapacity && b.slotIndex ? ` ${b.slotIndex}/${b.slotCapacity}` : ""}`
              : isMasked
                ? "LIMITED AVAILABILITY"
                : String(b.title || "Booking");

      events.push({
        id: String(b.id),
        title,
        start: b.startAt,
        end: b.endAt,
        extendedProps: { ...b, isMasked, status },
        display: "block",
        backgroundColor: "transparent",
        borderColor: "transparent",
        className: cn("booking-event-card", isMasked && "masked-event", b.isPlaceholder && "placeholder-event"),
        editable: !isMasked && !b.isPlaceholder && user?.role !== "CLIENT" && user?.role !== "AGENT",
        startEditable: !isMasked && !b.isPlaceholder && user?.role !== "CLIENT" && user?.role !== "AGENT",
        durationEditable: !isMasked && !b.isPlaceholder && user?.role !== "CLIENT" && user?.role !== "AGENT",
      });
    });

    return events;
  }, [
    aiLogisticsEnabled,
    bookings,
    sunSlots,
    clientTempBooking,
    businessHours,
    isClientOrRestrictedAgent,
    user,
    isLocalOnly,
    selectedTeamMemberIds,
    view,
  ]);

  // Hide closed days in multi-day views (Week + 2-day). Month stays full.
  const hiddenDaysForView = useMemo(() => {
    if (!businessHours) return [];
    if (view === "dayGridMonth") return [];
    // Only apply to views that show multiple days as columns.
    const isMultiDayGrid = view === "timeGridWeek" || view === "timeGridTwoDay";
    if (!isMultiDayGrid) return [];

    const hidden: number[] = [];
    for (const [day, cfg] of Object.entries(businessHours as any)) {
      const d = Number(day);
      if (!Number.isFinite(d)) continue;
      if (!cfg || typeof cfg !== "object") continue;
      const c = cfg as any;
      if (c?.open === false) hidden.push(d);
    }
    // Safety: don't allow hiding everything.
    if (hidden.length >= 7) return [];
    return hidden;
  }, [businessHours, view]);

  // Business hours baseline (for FullCalendar non-business shading + constraints)
  const calendarBusinessHours = useMemo(() => {
    if (!businessHours) return [];
    return Object.entries(businessHours)
      .filter(([_, config]: [string, any]) => config?.open && config?.start && config?.end)
      .map(([day, config]: [string, any]) => ({
        daysOfWeek: [parseInt(day, 10)],
        startTime: config.start,
        endTime: config.end,
      }));
  }, [businessHours]);

  const { minTime, maxTime } = useMemo(() => {
    let min = "09:00";
    let max = "17:00";
    if (businessHours) {
      Object.values(businessHours).forEach((config: any) => {
        if (config?.open && config?.start && config?.end) {
          if (String(config.start) < min) min = String(config.start);
          if (String(config.end) > max) max = String(config.end);
        }
      });
    }

    // Ensure the calendar always includes the sunrise/dusk window even before sunSlots async load.
    // We use the tenant's configured slot rules as an approximation.
    if (slotSettings?.sunriseSlotTime) {
      const t = String(slotSettings.sunriseSlotTime);
      if (/^\d{2}:\d{2}$/.test(t) && t < min) min = t;
    }
    if (slotSettings?.duskSlotTime) {
      const t = String(slotSettings.duskSlotTime);
      if (/^\d{2}:\d{2}$/.test(t) && t > max) max = t;
    }

    // Also consider placeholder availability + sunrise/dusk slots so they remain visible.
    [...bookings, ...sunSlots]
      .filter((b) => b?.isPlaceholder && b?.startAt && b?.endAt)
      .forEach((b) => {
        try {
          const s = new Date(b.startAt);
          const e = new Date(b.endAt);
          if (isNaN(s.getTime()) || isNaN(e.getTime())) return;
          const hhmm = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tenantTimezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
          const start = hhmm(s);
          const end = hhmm(e);
          if (start < min) min = start;
          if (end > max) max = end;
        } catch {
          // ignore
        }
      });

    const minHour = Math.max(0, parseInt(min.split(":")[0] || "0", 10) - 1);
    const maxHour = Math.min(24, parseInt(max.split(":")[0] || "24", 10) + 1);
    return {
      minTime: `${String(minHour).padStart(2, "0")}:00:00`,
      maxTime: `${String(maxHour).padStart(2, "0")}:00:00`,
    };
  }, [businessHours, bookings, sunSlots, tenantTimezone]);

  const clearHover = () => {
    setHoveredEvent(null);
  };

  const tryScheduleHoverFetch = (evt: any, el?: Element | null) => {
    if (!evt) return;
    const display = String(evt.display || "").toLowerCase();
    if (display === "background") return;

    const isMasked = !!evt.extendedProps?.isMasked;
    const isPlaceholder = !!evt.extendedProps?.isPlaceholder;
    const status = String(evt.extendedProps?.status || "").toUpperCase();
    const isBlocked = status === "BLOCKED";
    if (isMasked || isPlaceholder) return;
    if (user?.role === "CLIENT" && isBlocked) return;

    const rect = (el as any)?.getBoundingClientRect?.();
    if (!rect) return;
    const x = rect.left + rect.width / 2;
    const y = rect.top;

    const startAtIso = String(evt.extendedProps?.startAt || (evt.start ? evt.start.toISOString() : ""));
    const endAtIso = String(evt.extendedProps?.endAt || (evt.end ? evt.end.toISOString() : ""));
    if (!startAtIso || !endAtIso) return;

    const lite: HoverLiteEvent = {
      id: String(evt.id || ""),
      title: String(evt.title || ""),
      startAt: startAtIso,
      endAt: endAtIso,
      status: String(evt.extendedProps?.status || evt.extendedProps?.statusRaw || "").toUpperCase() || String(status || ""),
      isPlaceholder: !!evt.extendedProps?.isPlaceholder,
      isMasked: !!evt.extendedProps?.isMasked,
      client: evt.extendedProps?.client || null,
      property: evt.extendedProps?.property || null,
      teamAvatars: Array.isArray(evt.extendedProps?.teamAvatars) ? (evt.extendedProps.teamAvatars as string[]) : [],
      teamCount: Number(evt.extendedProps?.teamCount || 0),
    };

    setHoveredEvent({ event: lite, x, y });
  };

  useEffect(() => {
    return () => clearHover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestView = async (next: string) => {
    if (next === "dayGridMonth") {
      await ensureDayGridPlugin();
      setPendingView("dayGridMonth");
      return;
    }
    const api = calendarRef.current?.getApi?.();
    queueMicrotask(() => {
      api?.changeView(next);
      setView(next);
    });
  };

  const flashSaveError = (msg: string) => {
    setSaveErrorMsg(msg);
    window.setTimeout(() => setSaveErrorMsg(null), 3500);
  };

  return (
    <div className="relative">
      {/* Top menu (V1 parity) */}
      <div className={cn("flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4", isMobile && "mb-3")}>
        {/* Prev / Today / Next + range title (iOS style) */}
        <div className={cn("flex items-center justify-between gap-3", isMobile && "w-full")}>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full p-1 shadow-sm">
            <button
              type="button"
              onClick={navPrev}
              className="h-10 w-12 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
              aria-label="Previous"
              title="Previous"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={navToday}
              className="h-10 px-6 rounded-full flex items-center justify-center text-slate-500 font-black uppercase tracking-widest text-[11px] hover:bg-slate-50 transition-colors"
              aria-label="Today"
              title="Today"
            >
              Today
            </button>
            <button
              type="button"
              onClick={navNext}
              className="h-10 w-12 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
              aria-label="Next"
              title="Next"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className={cn("text-right", isMobile && "flex-1")}>
            <div className="text-[22px] md:text-[26px] font-black tracking-tight text-slate-900">
              {rangeTitle || ""}
            </div>
          </div>
        </div>

        {!isMobile ? (
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full p-1 shadow-sm">
          <button
            type="button"
            onClick={() => void requestView("timeGridDay")}
            className={cn(
              "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
              view === "timeGridDay" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            Day
          </button>
          <button
            type="button"
            onClick={() => void requestView("timeGridWeek")}
            className={cn(
              "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
              view === "timeGridWeek" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => void requestView("dayGridMonth")}
            className={cn(
              "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
              view === "dayGridMonth" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            Month
          </button>
        </div>
        ) : null}

        {/* Local-only: Staff filter (multi-select) */}
        {isLocalOnly && !isMobile && user?.role !== "CLIENT" ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsStaffFilterOpen((v) => !v)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-slate-700 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
              title="Filter by staff"
              aria-label="Filter by staff"
            >
              <span>Staff</span>
              <span className="text-slate-400">{selectedTeamMemberIds.length ? `(${selectedTeamMemberIds.length})` : ""}</span>
            </button>

            {isStaffFilterOpen ? (
              <>
                <div className="fixed inset-0 z-[220]" onClick={() => setIsStaffFilterOpen(false)} />
                <div className="absolute z-[230] right-0 mt-2 w-[280px] bg-white border border-slate-100 rounded-[24px] shadow-2xl overflow-hidden">
                  <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Staff view</div>
                    <button
                      type="button"
                      onClick={() => setSelectedTeamMemberIds([])}
                      className="text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:underline"
                    >
                      All
                    </button>
                  </div>
                  <div className="max-h-[260px] overflow-y-auto py-2">
                    {(reference?.teamMembers || []).map((m: any) => {
                      const id = String(m.id || "");
                      const selected = selectedTeamMemberIds.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          className={cn(
                            "w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50",
                            selected && "bg-emerald-50/50"
                          )}
                          onClick={() => {
                            setSelectedTeamMemberIds((prev) => {
                              if (prev.includes(id)) return prev.filter((x) => x !== id);
                              return [...prev, id];
                            });
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                              {m?.avatarUrl ? <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" /> : null}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-black text-slate-900 truncate">{String(m.displayName || "Team")}</div>
                            </div>
                          </div>
                          <div className={cn("h-5 w-5 rounded-full border flex items-center justify-center", selected ? "bg-emerald-600 border-emerald-600" : "bg-white border-slate-200")}>
                            {selected ? <span className="text-white text-[12px] leading-none">✓</span> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {!isMobile ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSubscriptionModalOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-sm"
          >
            <CalendarIcon className="h-3 w-3" />
            <span>Sub</span>
          </button>
          {user?.role !== "CLIENT" ? (
            <button
              onClick={() => setIsHoursModalOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-sm"
            >
              <Settings className="h-3 w-3" />
              <span>{aiLogisticsEnabled ? "Hours" : "Hours & Slots"}</span>
            </button>
          ) : null}
          <button
            onClick={(e) => void handleNewAppt(e)}
            className="flex items-center justify-center gap-2 px-6 py-2 bg-primary text-white rounded-full border border-white/10 text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg"
            style={{ boxShadow: `0 10px 15px -3px var(--primary-soft)` }}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Appt</span>
          </button>
        </div>
        ) : null}
      </div>

      {user?.role === "CLIENT" && clientHoursMsg ? (
        <div className="mb-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-black uppercase tracking-widest">
            {clientHoursMsg}
          </div>
        </div>
      ) : null}

      {saveErrorMsg ? (
        <div className="mb-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-black uppercase tracking-widest">
            {saveErrorMsg}
          </div>
        </div>
      ) : null}

      <div className="rounded-[32px] border border-slate-100 bg-white overflow-hidden">
        <FullCalendar
          ref={calendarRef}
          plugins={[luxonPlugin, timeGridPlugin, interactionPlugin, ...(dayGridPlugin ? [dayGridPlugin] : [])]}
          views={{ timeGridTwoDay: { type: "timeGrid", duration: { days: 2 } } } as any}
          initialView={isMobile ? "timeGridTwoDay" : "timeGridWeek"}
          headerToolbar={false}
          timeZone={tenantTimezone}
          height={isMobile ? "78vh" : "70vh"}
          events={calendarEvents}
          // For timeGrid, force collisions to render side-by-side (not overlapping).
          slotEventOverlap={false}
          businessHours={calendarBusinessHours}
          hiddenDays={hiddenDaysForView}
          selectable={!(isRestrictedRole && !canClientPlaceBookings)}
          selectMirror
          // Critical: prevents a simple click from also triggering `select` in timeGrid.
          // (Without this, a single click can fire both `dateClick` and `select`, creating duplicates.)
          selectMinDistance={10}
          nowIndicator
          allDaySlot={false}
          selectConstraint={isRestrictedRole ? (canClientPlaceBookings ? "available" : "none") : undefined}
          eventConstraint={isRestrictedRole ? (canClientPlaceBookings ? "available" : "none") : undefined}
          slotMinTime={minTime}
          slotMaxTime={maxTime}
          dateClick={async (info) => {
            if (isRestrictedRole && !canClientPlaceBookings) return;
            const start = info.date;
            const end = addMinutes(start, 60);
            const anchor = { left: info.jsEvent.clientX, right: info.jsEvent.clientX, top: info.jsEvent.clientY, bottom: info.jsEvent.clientY, width: 0, height: 0 };
            // Suppress any select callback that might follow this click gesture.
            suppressSelectUntilRef.current = Date.now() + 800;
            // CLIENT: open form only; booking is created only when user presses Save.
            if (user?.role === "CLIENT") {
              // If clicking during a Sunrise/Dusk window and quota is full, show "No time available".
              const overlapSunSlot = (() => {
                for (const s of sunSlots) {
                  const st = String(s?.slotType || "").toUpperCase();
                  const isSun = !!s?.isPlaceholder && (st === "SUNRISE" || st === "DUSK") && String(s?.id || "").startsWith("sun-slot-");
                  if (!isSun) continue;
                  try {
                    const slotS = new Date(String(s.startAt));
                    const slotE = new Date(String(s.endAt));
                    if (start < slotE && end > slotS) {
                      return { slotType: st as "SUNRISE" | "DUSK", slotStart: String(s.startAt), slotEnd: String(s.endAt) };
                    }
                  } catch {
                    // ignore
                  }
                }
                return null;
              })();
              if (overlapSunSlot) {
                const maxCap = Math.max(
                  0,
                  ...sunSlots
                    .filter((x) => String(x?.slotType || "").toUpperCase() === overlapSunSlot.slotType && String(x?.id || "").startsWith("sun-slot-"))
                    .map((x) => Number(x?.slotCapacity || 0))
                );
                const bookedCount = bookings.filter((b) => {
                  if (!b || b.isPlaceholder) return false;
                  if (String(b.slotType || "").toUpperCase() !== overlapSunSlot.slotType) return false;
                  const st = String(b.status || "").toUpperCase();
                  if (st === "CANCELLED" || st === "DECLINED") return false;
                  try {
                    const s = new Date(b.startAt);
                    const e = new Date(b.endAt);
                    const slotS = new Date(overlapSunSlot.slotStart);
                    const slotE = new Date(overlapSunSlot.slotEnd);
                    return s < slotE && e > slotS;
                  } catch {
                    return false;
                  }
                }).length;
                if (maxCap > 0 && bookedCount >= maxCap) {
                  flashClientHoursMsg("No time available.");
                  return;
                }
              }
              if (!isWithinBusinessHoursTenant(start, 60)) {
                flashClientHoursMsg("Select a Sunrise/Dusk slot or a time within business hours.");
                return;
              }
              setClientTempAt(start.toISOString(), end.toISOString());
              setPopoverAnchor(anchor);
              setPopover({ open: true, mode: "booking", bookingId: undefined, startAt: start.toISOString(), endAt: end.toISOString(), presetSlotType: null });
              return;
            }
            // Tenant/team: iOS behavior (create draft immediately on click).
            await createDraftBooking(start.toISOString(), end.toISOString(), anchor);
          }}
          eventDidMount={(info) => {
            const el = info.el as HTMLElement;
            if (!el) return;

            // Track pointer position for selection fallback anchoring.
            if (!pointerMoveHandlersRef.current.has(el)) {
              const onMove = (e: MouseEvent) => {
                lastPointerRef.current = { x: e.clientX, y: e.clientY };
              };
              el.addEventListener("mousemove", onMove);
              pointerMoveHandlersRef.current.set(el, onMove);
            }

            // Hover tooltip fallback (production-safe): attach native DOM listeners
            if (!hoverDomHandlersRef.current.has(el)) {
              const enter = () => tryScheduleHoverFetch(info.event, el);
              const leave = () => clearHover();
              el.addEventListener("mouseenter", enter);
              el.addEventListener("mouseleave", leave);
              hoverDomHandlersRef.current.set(el, { enter, leave });
            }

            // If we just created this booking, re-anchor popover to the real card edge.
            const maybeId = String((info.event as any)?.id || "");
            if (pendingAnchorBookingIdRef.current && pendingAnchorBookingIdRef.current === maybeId) {
              const r = el.getBoundingClientRect();
              setPopoverAnchor({
                left: r.left,
                top: r.top,
                right: r.right,
                bottom: r.bottom,
                width: r.width,
                height: r.height,
              });
              pendingAnchorBookingIdRef.current = null;
            }
          }}
          eventWillUnmount={(info) => {
            const el = info.el as HTMLElement;
            if (!el) return;

            const onMove = pointerMoveHandlersRef.current.get(el);
            if (onMove) {
              el.removeEventListener("mousemove", onMove);
              pointerMoveHandlersRef.current.delete(el);
            }

            const h = hoverDomHandlersRef.current.get(el);
            if (h) {
              el.removeEventListener("mouseenter", h.enter);
              el.removeEventListener("mouseleave", h.leave);
              hoverDomHandlersRef.current.delete(el);
            }
          }}
          datesSet={(arg) => {
            // FullCalendar gives inclusive/exclusive range boundaries.
            const start = arg.start;
            const end = arg.end;
            void handleVisibleRange(start, end);
            // Load visible range and ensure rolling 4-week prefetch.
            void loadSunSlotsForRange(start, end);
            ensureRolling4WeeksAhead();
            const vt = String(arg.view?.type || view);
            setView(vt);
            setRangeTitle(formatRangeTitle(vt, start, end));
          }}
          eventClick={(info) => {
            const isMasked = !!info.event.extendedProps.isMasked;
            if (isMasked) return;

            const status = String(info.event.extendedProps.status || "").toUpperCase();
            const isPlaceholder = !!info.event.extendedProps.isPlaceholder;
            const isBlocked = status === "BLOCKED";
            const slotType = String(info.event.extendedProps.slotType || "").toUpperCase();
            const isSunSlot = isPlaceholder && (slotType === "SUNRISE" || slotType === "DUSK") && String(info.event.id || "").startsWith("sun-slot-");
            const isClientTemp = user?.role === "CLIENT" && String(info.event.id || "") === "client-temp";

            // Clients: hide placeholders + blockouts
            if (user?.role === "CLIENT") {
              if (isBlocked) return;
              // Allow sunrise/dusk selection; disallow generic placeholders.
              if (isPlaceholder && !isSunSlot) return;
            }
            if (isPlaceholder && !canClientPlaceBookings) return;

            const rect = info.el.getBoundingClientRect();
            const anchor = {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            };

            if (isClientTemp) {
              const startAtIso = String(info.event.extendedProps.startAt || (info.event.start ? info.event.start.toISOString() : ""));
              const endAtIso = String(info.event.extendedProps.endAt || (info.event.end ? info.event.end.toISOString() : ""));
              setPopoverAnchor(anchor);
              setPopover({
                open: true,
                mode: "booking",
                bookingId: undefined,
                startAt: startAtIso,
                endAt: endAtIso,
                presetSlotType: slotType === "SUNRISE" || slotType === "DUSK" ? (slotType as any) : null,
              });
              return;
            }

            // Sunrise/Dusk slots: clicking the slot should hard-create a draft booking in that slot.
            if (isSunSlot) {
              // Enforce max capacity for that day (linked to Business Hours Max AM/PM counters).
              const maxCap = Math.max(0, Math.min(3, Number(info.event.extendedProps.slotCapacity ?? 0)));
              if (maxCap <= 0) return;

              const startAtIso = info.event.start ? info.event.start.toISOString() : "";
              const endAtIso = info.event.end ? info.event.end.toISOString() : "";
              if (startAtIso && endAtIso) {
                const overlappingCount = bookings.filter((b) => {
                  if (!b || b.isPlaceholder) return false;
                  if (String(b.slotType || "").toUpperCase() !== slotType) return false;
                  try {
                    const s = new Date(b.startAt);
                    const e = new Date(b.endAt);
                    if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
                    const slotS = new Date(startAtIso);
                    const slotE = new Date(endAtIso);
                    return s < slotE && e > slotS;
                  } catch {
                    return false;
                  }
                }).length;

                if (overlappingCount >= maxCap) {
                  window.alert(`No more ${slotType} slots available for this day (max ${maxCap}).`);
                  return;
                }
                // Slots-only behavior: open the popover anchored to the slot WITHOUT creating a booking until Save.
                // IMPORTANT: For CLIENT, do NOT create an extra temporary booking box here.
                // The Sunrise/Dusk card itself is the only selectable box; just open the popover.
                if (user?.role === "CLIENT") setClientTempBooking(null);
                setPopoverAnchor(anchor);
                setPopover({ open: true, mode: "booking", bookingId: undefined, startAt: startAtIso, endAt: endAtIso, presetSlotType: slotType as any });
              }
              return;
            }

            setPopoverAnchor(anchor);
            setPopover({ open: true, mode: isBlocked ? "blockout" : "booking", bookingId: String(info.event.id) });
          }}
          select={(info) => {
            if (isRestrictedRole && !canClientPlaceBookings) return;
            // If this selection was initiated by a click (not a drag), ignore it.
            if (Date.now() < suppressSelectUntilRef.current) return;
            // Drag-select should not be affected by our click dedupe key.
            lastCreateRef.current = null;
            const containerRect = calendarRef.current?.el?.getBoundingClientRect?.() as DOMRect | undefined;
            const p = lastPointerRef.current;
            const cx = p?.x ?? (containerRect ? containerRect.left + containerRect.width / 2 : window.innerWidth / 2);
            const cy = p?.y ?? (containerRect ? containerRect.top + 140 : 200);
            const anchor = { left: cx, right: cx, top: cy, bottom: cy, width: 0, height: 0 };
            // CLIENT: open form only; booking is created only when user presses Save.
            if (user?.role === "CLIENT") {
              const endGuess = addMinutes(info.start, 60);
              const overlapSunSlot = (() => {
                for (const s of sunSlots) {
                  const st = String(s?.slotType || "").toUpperCase();
                  const isSun = !!s?.isPlaceholder && (st === "SUNRISE" || st === "DUSK") && String(s?.id || "").startsWith("sun-slot-");
                  if (!isSun) continue;
                  try {
                    const slotS = new Date(String(s.startAt));
                    const slotE = new Date(String(s.endAt));
                    if (info.start < slotE && endGuess > slotS) {
                      return { slotType: st as "SUNRISE" | "DUSK", slotStart: String(s.startAt), slotEnd: String(s.endAt) };
                    }
                  } catch {
                    // ignore
                  }
                }
                return null;
              })();
              if (overlapSunSlot) {
                const maxCap = Math.max(
                  0,
                  ...sunSlots
                    .filter((x) => String(x?.slotType || "").toUpperCase() === overlapSunSlot.slotType && String(x?.id || "").startsWith("sun-slot-"))
                    .map((x) => Number(x?.slotCapacity || 0))
                );
                const bookedCount = bookings.filter((b) => {
                  if (!b || b.isPlaceholder) return false;
                  if (String(b.slotType || "").toUpperCase() !== overlapSunSlot.slotType) return false;
                  const st = String(b.status || "").toUpperCase();
                  if (st === "CANCELLED" || st === "DECLINED") return false;
                  try {
                    const s = new Date(b.startAt);
                    const e = new Date(b.endAt);
                    const slotS = new Date(overlapSunSlot.slotStart);
                    const slotE = new Date(overlapSunSlot.slotEnd);
                    return s < slotE && e > slotS;
                  } catch {
                    return false;
                  }
                }).length;
                if (maxCap > 0 && bookedCount >= maxCap) {
                  flashClientHoursMsg("No time available.");
                  return;
                }
              }
              if (!isWithinBusinessHoursTenant(info.start, 60)) {
                flashClientHoursMsg("Select a Sunrise/Dusk slot or a time within business hours.");
                return;
              }
              const endIso = addMinutes(info.start, 60).toISOString();
              setClientTempAt(info.start.toISOString(), endIso);
              setPopoverAnchor(anchor);
              setPopover({ open: true, mode: "booking", bookingId: undefined, startAt: info.start.toISOString(), endAt: endIso, presetSlotType: null });
              return;
            }
            // Tenant/team: create draft immediately for selected range.
            void createDraftBooking(info.start.toISOString(), info.end.toISOString(), anchor);
          }}
          selectAllow={(selectInfo) => {
            if (user?.role !== "CLIENT") return true;
            const isOverlappingBlocked = bookings.some((b) => String(b.status || "").toUpperCase() === "BLOCKED" && selectInfo.start < new Date(b.endAt) && selectInfo.end > new Date(b.startAt));
            return !isOverlappingBlocked;
          }}
          eventMouseEnter={(info) => {
            tryScheduleHoverFetch(info.event, info.el);
          }}
          eventMouseLeave={() => clearHover()}
          eventContent={(eventInfo) => {
            if (eventInfo.event.display === "background") return null;

            const isMasked = !!eventInfo.event.extendedProps.isMasked;
            const isPlaceholder = !!eventInfo.event.extendedProps.isPlaceholder;
            const status = String(eventInfo.event.extendedProps.status || "REQUESTED").toUpperCase();
            const isBlocked = status === "BLOCKED";
            const slotType = String(eventInfo.event.extendedProps.slotType || "").toUpperCase();
            const isSunSlot = isPlaceholder && (slotType === "SUNRISE" || slotType === "DUSK") && String(eventInfo.event.id || "").startsWith("sun-slot-");
            const config = getStatusConfig(status, isMasked);
            const gradient = !isPlaceholder ? getStatusGradient(status, isMasked) : "none";

            const teamAvatars = (eventInfo.event.extendedProps.teamAvatars || []) as string[];
            const teamCount = Number(eventInfo.event.extendedProps.teamCount || 0);
            const isDraft = !!eventInfo.event.extendedProps.isDraft;
            const isTemp = !!eventInfo.event.extendedProps.isTemp;

            const isStatic = isMasked || (user?.role === "CLIENT" && ((isPlaceholder && !isSunSlot) || isBlocked));

            return (
              <div
                className={cn(
                  "flex flex-col h-full p-2 md:p-3 rounded-[16px] md:rounded-[20px] border-2 transition-all duration-200 relative bg-white",
                  !isStatic && "group cursor-pointer hover:shadow-xl hover:-translate-y-[1px]",
                  isPlaceholder && "bg-amber-100 border-dashed border-amber-400",
                  !isPlaceholder && config.border,
                  isBlocked && "border-rose-200/70 text-rose-700 shadow-sm shadow-rose-100/40",
                  isMasked && "opacity-80",
                  isStatic && "cursor-default"
                )}
                style={gradient !== "none" ? { backgroundImage: gradient } : undefined}
              >
                {/* Delete X (for draft bookings) */}
                {isDraft && !isTemp && user?.role !== "CLIENT" && !isMasked && !isPlaceholder && !isBlocked && (
                  <button
                    className="absolute left-2 top-2 h-7 w-7 rounded-full bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-slate-900 hover:border-slate-300"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void deleteBookingLocal(String(eventInfo.event.id));
                    }}
                    title="Delete"
                    aria-label="Delete"
                  >
                    ×
                  </button>
                )}

                {/* Status dot */}
                {!isPlaceholder && (
                  <div className={cn("absolute right-2 top-2 md:right-3 md:top-3 h-2 w-2 md:h-2.5 md:w-2.5 rounded-full", config.dot, "hidden sm:block")} />
                )}

                {/* Team avatars + +N */}
                {!isMasked && !isPlaceholder && !isBlocked && teamCount > 0 && (
                  <div className="absolute -top-2 -right-2 z-[20] hidden sm:flex items-center">
                    {teamAvatars.slice(0, 3).map((url: string, idx: number) => (
                      <div
                        key={`${url}-${idx}`}
                        className="h-9 w-9 rounded-xl border-2 border-white shadow-xl overflow-hidden bg-slate-100 ring-1 ring-slate-100/50"
                        style={{ marginLeft: idx === 0 ? 0 : -10 }}
                      >
                        <img src={url} alt="Team member" className="h-full w-full object-cover" />
                      </div>
                    ))}
                    {teamCount > 3 && (
                      <div
                        className="h-9 w-9 rounded-xl border-2 border-white shadow-xl bg-slate-900 text-white flex items-center justify-center text-[10px] font-black ring-1 ring-slate-100/50"
                        style={{ marginLeft: -10 }}
                        title={`${teamCount - 3} more`}
                      >
                        +{teamCount - 3}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1 min-w-0 pr-6 sm:pr-10">
                  <div className="text-[11px] md:text-[12px] font-black uppercase tracking-wider truncate text-slate-700">
                    {isPlaceholder
                      ? `${eventInfo.event.extendedProps.slotType} SLOT`
                      : isBlocked
                        ? (user?.role === "CLIENT" || user?.role === "AGENT")
                          ? "UNAVAILABLE"
                          : String(eventInfo.event.title || "TIME BLOCK OUT")
                        : isMasked
                          ? "LIMITED AVAILABILITY"
                          : eventInfo.event.extendedProps.client?.businessName || eventInfo.event.extendedProps.client?.name || "No Client"}
                  </div>

                  {!isMasked && !isBlocked && (
                    <div className="flex items-center gap-1 text-[9px] md:text-[10px] font-bold text-slate-400 truncate">
                      <IconMapPin className="h-3 w-3 hidden sm:block" />
                      <span className="truncate">{isPlaceholder ? "Available to book" : eventInfo.event.extendedProps.property?.name || "TBC"}</span>
                    </div>
                  )}
                </div>

                <div className="mt-auto">
                  <div className="bg-slate-50 text-slate-700 px-2 md:px-3 py-1 rounded-full flex items-center justify-center border border-slate-100">
                    <span className="text-[9px] md:text-[10px] font-black tracking-widest uppercase flex items-center gap-1">
                      <IconClock className="h-3 w-3 opacity-60 hidden sm:block" />
                      {formatTimeRangeTenant(eventInfo.event.start, eventInfo.event.end)}
                    </span>
                  </div>
                </div>
              </div>
            );
          }}
        />
      </div>

      {/* Desktop Hover Tooltip (instant, derived from lite card data) */}
      {hoveredEvent && !hoveredEvent.event.isPlaceholder && (
        <div
          className="fixed z-[200] w-72 bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 pointer-events-none animate-in fade-in zoom-in duration-150"
          style={{
            left: hoveredEvent.x,
            top: hoveredEvent.y - 10,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">{hoveredEvent.event.property?.name || hoveredEvent.event.title}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {formatDateAndTimeRangeTenant(new Date(hoveredEvent.event.startAt), new Date(hoveredEvent.event.endAt))}
                </p>
              </div>
              <div className={cn("h-2 w-2 rounded-full shrink-0 mt-1.5", getStatusConfig(String(hoveredEvent.event.status || "").toUpperCase()).dot)} />
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-50">
              <div className="flex items-start justify-between gap-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase pt-0.5">Client</span>
                <div className="flex flex-col items-end">
                  <span className="text-xs font-bold text-slate-700 text-right">
                    {hoveredEvent.event.client?.businessName || hoveredEvent.event.client?.name}
                  </span>
                  {hoveredEvent.event.client?.businessName && (
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{hoveredEvent.event.client?.name}</span>
                  )}
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase pt-0.5">Team</span>
                <div className="flex items-center justify-end gap-2">
                  {Number(hoveredEvent.event.teamCount || 0) > 0 ? (
                    <>
                      <div className="flex items-center">
                        {(hoveredEvent.event.teamAvatars || []).slice(0, 3).map((u, i) => (
                          <div
                            key={`${u}-${i}`}
                            className="h-6 w-6 rounded-lg overflow-hidden border-2 border-white bg-slate-50 shadow-sm"
                            style={{ marginLeft: i === 0 ? 0 : -8 }}
                          >
                            <img src={u} className="h-full w-full object-cover" alt="" />
                          </div>
                        ))}
                      </div>
                      {Number(hoveredEvent.event.teamCount || 0) > 3 ? (
                        <span className="text-[10px] font-black text-slate-600">+{Number(hoveredEvent.event.teamCount || 0) - 3}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-xs font-bold text-slate-400 italic">To be assigned</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <BookingPopoverV2
        open={popover.open}
        mode={popover.mode}
        user={user}
        bookingId={popover.bookingId}
        startAt={popover.startAt}
        endAt={popover.endAt}
        anchorRect={popoverAnchor}
        presetSlotType={popover.presetSlotType || null}
        tenantTimezone={tenantTimezone}
        reference={reference}
        restoreForm={popoverRestore?.form || null}
        restoreKey={popoverRestore?.key || 0}
        onRequestReopen={(opts) => {
          flashSaveError(String(opts?.error || "Save failed. Please try again."));
          setPopoverRestore({ key: Date.now(), form: opts?.restoreForm || null });
          setPopoverAnchor((opts?.anchorRect as any) || popoverAnchor);
          setPopover({
            open: true,
            mode: opts.mode,
            bookingId: opts.bookingId,
            startAt: opts.startAt,
            endAt: opts.endAt,
            presetSlotType: opts.presetSlotType || null,
          });
        }}
        onUpserted={(calendarBooking) => {
          if (!calendarBooking) return;
          const lite = toLiteFromCalendarBooking(calendarBooking);
          setBookings((prev) => mergeBookingsById(prev, [lite]));
          if (user?.role === "CLIENT") setClientTempBooking(null);
        }}
        onDeleted={(id) => {
          if (!id) return;
          setBookings((prev) => prev.filter((b) => String(b.id) !== String(id)));
        }}
        onClose={() => {
          setPopover((p) => ({ ...p, open: false }));
          setPopoverAnchor(null);
          setPopoverRestore(null);
          if (user?.role === "CLIENT") setClientTempBooking(null);
        }}
      />

      <BusinessHoursModal
        isOpen={isHoursModalOpen}
        onClose={() => setIsHoursModalOpen(false)}
        initialHours={businessHours}
        aiLogisticsEnabled={aiLogisticsEnabled}
        initialSunSlotsAddress={sunSlotsAddress || ""}
      />
      <CalendarSubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
        secret={props.calendarSecret || null}
        kind={user?.role === "CLIENT" ? "client" : "default"}
      />
    </div>
  );
}


