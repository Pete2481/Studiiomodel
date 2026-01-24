"use client";

import React, { useRef, useState, useEffect } from "react";
import { Plus, Calendar as CalendarIcon, Lock, GripHorizontal, Settings } from "lucide-react";
import dynamic from "next/dynamic";
import { upsertBooking, deleteBooking, bulkDeleteBookings } from "@/app/actions/booking-upsert";
import { BookingList } from "@/components/dashboard/booking-list";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { permissionService } from "@/lib/permission-service";
import { getClientServiceFavorites } from "@/app/actions/service";

const CalendarView = dynamic(
  () => import("./calendar-view").then((m) => m.CalendarView),
  {
    ssr: false,
    loading: () => <div className="h-[60vh] bg-slate-100 rounded-[32px] animate-pulse" />,
  }
);

const BookingDrawer = dynamic(
  () => import("./booking-drawer").then((m) => m.BookingDrawer),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[120] bg-white/50 backdrop-blur-sm">
        <div className="absolute right-6 top-6 h-10 w-10 rounded-full bg-slate-100 animate-pulse" />
      </div>
    ),
  }
);
const BusinessHoursModal = dynamic(
  () => import("./business-hours-modal").then((m) => m.BusinessHoursModal),
  { ssr: false, loading: () => null }
);
const SlotManagementModal = dynamic(
  () => import("./slot-management-modal").then((m) => m.SlotManagementModal),
  { ssr: false, loading: () => null }
);
const CalendarSubscriptionModal = dynamic(
  () => import("./calendar-subscription-modal").then((m) => m.CalendarSubscriptionModal),
  { ssr: false, loading: () => null }
);

interface BookingsPageContentProps {
  initialBookings: any[];
  clients: any[];
  services: any[];
  teamMembers: any[];
  agents: any[];
  user: any;
  customStatuses?: string[];
  businessHours?: any;
  calendarSecret?: string | null;
  aiLogisticsEnabled?: boolean;
  slotSettings?: {
    sunriseSlotTime: string;
    duskSlotTime: string;
    sunriseSlotsPerDay: number;
    duskSlotsPerDay: number;
  };
  mode?: "calendar" | "list";
  isActionLocked?: boolean;
  allowBulkDelete?: boolean;
}

export function BookingsPageContent({ 
  initialBookings, 
  clients, 
  services, 
  teamMembers, 
  agents, 
  user,
  customStatuses = [],
  businessHours,
  calendarSecret,
  aiLogisticsEnabled = false,
  slotSettings = {
    sunriseSlotTime: "06:00",
    duskSlotTime: "18:30",
    sunriseSlotsPerDay: 1,
    duskSlotsPerDay: 1
  },
  mode = "calendar",
  isActionLocked = false,
  allowBulkDelete = false
}: BookingsPageContentProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [bookings, setBookings] = useState(initialBookings);
  const [currentDate, setCurrentDate] = useState(new Date());
  const lastVisibleRangeRef = useRef<{ start: Date; end: Date } | null>(null);
  const rangeCacheRef = useRef<Map<string, any[]>>(new Map());
  const rangeInflightRef = useRef<Map<string, Promise<any[]>>>(new Map());
  const hasLoadedInitialRangeRef = useRef(false);

  const [localClients, setLocalClients] = useState(clients || []);
  const [localServices, setLocalServices] = useState(services || []);
  const [localTeamMembers, setLocalTeamMembers] = useState(teamMembers || []);
  const [localAgents, setLocalAgents] = useState(agents || []);
  const hasLoadedReferenceRef = useRef(false);
  const [clientFavServiceIds, setClientFavServiceIds] = useState<Set<string>>(new Set());
  const hasLoadedClientFavsRef = useRef(false);

  // Keep local reference data in sync if SSR provides it (list page, or future SSR improvements)
  useEffect(() => {
    if (Array.isArray(clients) && clients.length) setLocalClients(clients);
  }, [clients]);
  useEffect(() => {
    if (Array.isArray(services) && services.length) setLocalServices(services);
  }, [services]);
  useEffect(() => {
    if (Array.isArray(teamMembers) && teamMembers.length) setLocalTeamMembers(teamMembers);
  }, [teamMembers]);
  useEffect(() => {
    if (Array.isArray(agents) && agents.length) setLocalAgents(agents);
  }, [agents]);

  // Sync state when props update (crucial for router.refresh() to work)
  useEffect(() => {
    // If server provides bookings (legacy), sync. If server provides [], we use range-loading instead.
    if (Array.isArray(initialBookings) && initialBookings.length > 0) {
      setBookings(initialBookings);
    }
  }, [initialBookings]);

  // Calendar page loads reference data client-side after first paint to keep SSR fast.
  useEffect(() => {
    if (mode !== "calendar") return;
    if (hasLoadedReferenceRef.current) return;
    const needs = !(localClients.length && localServices.length && localTeamMembers.length && localAgents.length);
    if (!needs) {
      hasLoadedReferenceRef.current = true;
      return;
    }

    hasLoadedReferenceRef.current = true;
    const load = async () => {
      try {
        const res = await fetch("/api/tenant/calendar/reference");
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.clients)) setLocalClients(data.clients);
        if (Array.isArray(data?.services)) setLocalServices(data.services);
        if (Array.isArray(data?.teamMembers)) setLocalTeamMembers(data.teamMembers);
        if (Array.isArray(data?.agents)) setLocalAgents(data.agents);
      } catch (e) {
        console.error("[CALENDAR] Reference fetch failed:", e);
      }
    };

    // Let first paint happen; then fetch reference data.
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (window as any).requestIdleCallback(() => load(), { timeout: 1500 });
    } else {
      setTimeout(() => load(), 250);
    }

    // Warm the drawer bundle so the first open feels instant.
    void import("./booking-drawer");
  }, [mode, localClients.length, localServices.length, localTeamMembers.length, localAgents.length]);

  // Client favorites (per agency) for calendar quick-add.
  useEffect(() => {
    if (mode !== "calendar") return;
    if (user?.role !== "CLIENT") return;
    if (hasLoadedClientFavsRef.current) return;
    hasLoadedClientFavsRef.current = true;
    (async () => {
      const res = await getClientServiceFavorites();
      if (res.success) {
        setClientFavServiceIds(new Set((res as any).favoriteServiceIds || []));
      }
    })().catch((e) => console.error("[CALENDAR] Client favorites failed:", e));
  }, [mode, user?.role]);

  const mergeBookingsById = (prev: any[], next: any[]) => {
    const map = new Map<string, any>();
    prev.forEach((b) => b?.id && map.set(String(b.id), b));
    next.forEach((b) => b?.id && map.set(String(b.id), b));
    return Array.from(map.values());
  };

  const fetchBookingsForRange = async (start: Date, end: Date, opts?: { force?: boolean; prefetch?: boolean }) => {
    const key = `${start.toISOString()}|${end.toISOString()}`;
    if (!opts?.force && rangeCacheRef.current.has(key)) return rangeCacheRef.current.get(key)!;
    if (!opts?.force && rangeInflightRef.current.has(key)) return rangeInflightRef.current.get(key)!;

    const p = (async () => {
      const url = `/api/tenant/calendar/bookings?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      const items = Array.isArray(data?.bookings) ? data.bookings : [];
      rangeCacheRef.current.set(key, items);
      rangeInflightRef.current.delete(key);
      return items;
    })().catch((e) => {
      rangeInflightRef.current.delete(key);
      // Prefetch failures are non-blocking; visible-range fetch failures should still surface in console.
      if (!opts?.prefetch) console.error("[CALENDAR] Range fetch failed:", e);
      return [];
    });

    rangeInflightRef.current.set(key, p);
    return p;
  };

  const handleVisibleRangeChange = async (start: Date, end: Date) => {
    lastVisibleRangeRef.current = { start, end };

    const items = await fetchBookingsForRange(start, end);
    setBookings((prev) => mergeBookingsById(prev, items));

    // After the first visible range loads, prefetch upcoming ranges in background.
    if (!hasLoadedInitialRangeRef.current) {
      hasLoadedInitialRangeRef.current = true;
      const rangeDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

      // Avoid prefetching huge ranges (e.g. Month view) which can slow the UI/network.
      if (rangeDays <= 14) {
        // Prefetch next 2 ranges (best-effort)
        const nextStart1 = new Date(end);
        const nextEnd1 = new Date(end);
        nextEnd1.setDate(nextEnd1.getDate() + rangeDays);
        fetchBookingsForRange(nextStart1, nextEnd1, { prefetch: true }).then((prefetched) => {
          if (prefetched.length) setBookings((prev) => mergeBookingsById(prev, prefetched));
        });

        const nextStart2 = new Date(nextEnd1);
        const nextEnd2 = new Date(nextEnd1);
        nextEnd2.setDate(nextEnd2.getDate() + rangeDays);
        fetchBookingsForRange(nextStart2, nextEnd2, { prefetch: true }).then((prefetched) => {
          if (prefetched.length) setBookings((prev) => mergeBookingsById(prev, prefetched));
        });
      }
    }
  };

  const statusFilter = searchParams.get("status");
  const canPlaceBookings = permissionService.can(user, "canPlaceBookings");

  useEffect(() => {
    const action = searchParams.get("action");
    if (action === "new") {
      if (user?.role === "CLIENT" && !canPlaceBookings) return;
      setSelectedBooking(null);
      setIsDrawerOpen(true);
      
      // Silent cleanup
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("action");
      const cleanUrl = pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [searchParams, pathname, user?.role, canPlaceBookings]);

  useEffect(() => {
    const bookingId = searchParams.get("bookingId");
    if (bookingId) {
      if (user?.role === "CLIENT" && !canPlaceBookings) return;
      const booking = bookings.find(b => b.id === bookingId);
      if (booking) {
        setSelectedBooking(booking);
        setIsDrawerOpen(true);
      }
      
      // Silent cleanup
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("bookingId");
      const cleanUrl = pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [searchParams, pathname, bookings, user?.role, canPlaceBookings]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function init() {
      const draggableEl = document.getElementById("external-events");
      if (!draggableEl) return;

      const mod = await import("@fullcalendar/interaction");
      const Draggable = (mod as any).Draggable;

      const d = new Draggable(draggableEl, {
        itemSelector: ".fc-event",
        eventData: (eventEl: Element) => {
          const serviceId = eventEl.getAttribute("data-service-id");
          const serviceName = eventEl.getAttribute("data-service-name");
          const duration = eventEl.getAttribute("data-duration");
          return {
            title: serviceName,
            duration,
            extendedProps: { serviceId, isQuickAdd: true }
          };
        }
      });

      cleanup = () => d.destroy?.();
    }

    init();
    return () => cleanup?.();
  }, []);

  const handleSelectEvent = (booking: any) => {
    if (user?.role === "CLIENT" && !canPlaceBookings) return;
    setSelectedBooking(booking);
    setIsDrawerOpen(true);
  };

  const handleSelectSlot = (start: Date, end: Date) => {
    if (user?.role === "CLIENT" && !canPlaceBookings) return;
    if (isActionLocked) {
      window.location.href = "/tenant/settings?tab=billing";
      return;
    }
    setSelectedBooking({
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    });
    setIsDrawerOpen(true);
  };

  const handleExternalDrop = (data: any) => {
    if (isActionLocked) {
      window.location.href = "/tenant/settings?tab=billing";
      return;
    }
    const { start, end, serviceId } = data;

    if (serviceId === "blocked") {
      setSelectedBooking({
        status: 'blocked',
        title: 'TIME BLOCK OUT',
        startAt: start.toISOString(),
        endAt: end ? end.toISOString() : new Date(start.getTime() + 3600000).toISOString(),
      });
      setIsDrawerOpen(true);
      return;
    }
    
    const service = localServices.find((s: any) => s.id === serviceId);
    
    const isClient = user?.role === "CLIENT";
    
    setSelectedBooking({
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      serviceIds: [serviceId],
      title: isClient ? "" : (service?.name || "New Shoot"),
      duration: service?.durationMinutes ? String(service.durationMinutes / 60) : "1",
    });
    setIsDrawerOpen(true);
  };

  const handleSave = async (data: any) => {
    try {
      const isBlocked = data.status === 'BLOCKED' || data.status === 'blocked';
      
      const result = await upsertBooking({
        ...data,
        id: selectedBooking?.id,
        // Ensure blocked type data is strictly cleaned before sending to server
        clientId: isBlocked ? null : data.clientId,
        address: isBlocked ? null : data.address,
        serviceIds: isBlocked ? [] : data.serviceIds,
        teamMemberIds: isBlocked ? [] : data.teamMemberIds,
        agentId: isBlocked ? null : data.agentId,
        title: isBlocked ? (data.title || "TIME BLOCK OUT") : data.title,
        status: isBlocked ? "BLOCKED" : data.status,
      });
      if (result.success) {
        setIsDrawerOpen(false);
        // Optimistic update (makes the booking appear instantly).
        if (result.booking) {
          setBookings((prev) => mergeBookingsById(prev, [result.booking]));
        }

        // Ensure the visible range is consistent (best-effort, non-blocking).
        if (lastVisibleRangeRef.current) {
          const { start, end } = lastVisibleRangeRef.current;
          fetchBookingsForRange(start, end, { force: true }).then((items) => {
            if (items.length) setBookings((prev) => mergeBookingsById(prev, items));
          });
        }
        // Keep any server-derived props in sync (non-blocking)
        queueMicrotask(() => router.refresh());
      } else {
        alert(result.error || "Something went wrong while saving the booking.");
      }
    } catch (error) {
      console.error("Action error:", error);
      alert("An unexpected error occurred. Please try again.");
    }
  };

  const handleDeleteBooking = async (id: string) => {
    try {
      const result = await deleteBooking(id);
      if (result.success) {
        setIsDrawerOpen(false);
        // Optimistic remove
        setBookings((prev) => prev.filter((b: any) => String(b?.id) !== String(id)));

        // Ensure the visible range is consistent (best-effort, non-blocking).
        if (lastVisibleRangeRef.current) {
          const { start, end } = lastVisibleRangeRef.current;
          fetchBookingsForRange(start, end, { force: true }).then((items) => {
            setBookings((prev) => mergeBookingsById(prev.filter((b: any) => String(b?.id) !== String(id)), items));
          });
        }
        queueMicrotask(() => router.refresh());
      } else {
        alert(result.error || "Failed to remove booking.");
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("An unexpected error occurred. Please try again.");
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    try {
      const result = await bulkDeleteBookings(ids);
      if ((result as any)?.success) {
        // Optimistic remove from local state
        setBookings((prev) => prev.filter((b: any) => !ids.includes(String(b?.id))));
        queueMicrotask(() => router.refresh());
      }
      return result as any;
    } catch (e: any) {
      return { success: false, error: e?.message || "Failed to delete bookings." } as any;
    }
  };

  const filteredBookings = bookings.filter(b => {
    // 0. Status Filter (from query param)
    if (statusFilter && b.status.toUpperCase() !== statusFilter.toUpperCase()) {
      return false;
    }

    // 1. Masking for restricted roles
    const isMasked = (user?.role === "CLIENT" && b.clientId !== user?.clientId) || 
                     (user?.role === "AGENT" && !user?.permissions?.seeAll && b.agentId !== user?.agentId);
    if (isMasked) return true; // mask handles it visually

    // 2. Hide "No Client" stale cards
    // ONLY show if it's a real booking with a valid clientId
    // OR it's a valid production slot placeholder
    // OR it's a TIME BLOCK OUT
    if (!b.isPlaceholder && b.status !== 'blocked' && b.status !== 'BLOCKED' && (!b.clientId || b.clientId === "null" || b.client?.name === "Unknown" || b.client?.name === "No Client")) {
      return false;
    }

    // 3. Safety Check: Skip if dates are missing or invalid
    if (!b.startAt || !b.endAt) return false;
    
    return true;
  });

  return (
    <div className="space-y-6">
      {mode === "calendar" && (
        <>
          {/* Favourite Services Section */}
          <section className="space-y-3">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">FAVOURITE SERVICES</h3>
              <p className="text-[11px] font-medium text-slate-500">Drag a service to pencil in a job.</p>
            </div>
            
            <div id="external-events" className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {user?.role !== "CLIENT" && (
                <div 
                  data-service-id="blocked"
                  data-service-name="TIME BLOCK OUT"
                  data-duration="01:00"
                  className="fc-event flex-none w-48 p-4 rounded-[24px] border border-rose-100 bg-rose-50 hover:border-rose-400 hover:shadow-lg hover:shadow-rose-100 transition-all cursor-grab active:cursor-grabbing group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-rose-300">Quick schedule</span>
                    <Lock className="h-3 w-3 text-rose-200 group-hover:text-rose-400" />
                  </div>
                  <h4 className="text-xs font-bold text-rose-900 leading-tight truncate">TIME BLOCKER</h4>
                  <p className="mt-0.5 text-[10px] font-bold text-rose-400">Unavailable for Clients</p>
                </div>
              )}
              {localServices
                .filter((s: any) => {
                  if (user?.role === "CLIENT") {
                    if (!clientFavServiceIds.has(String(s.id))) return false;
                    if (s.clientVisible === false) return false;
                    const currentClient = localClients.find((c: any) => c.id === user?.clientId);
                    if (currentClient?.disabledServices?.includes(s.id)) return false;
                    return true;
                  }
                  return !!s.isFavorite;
                })
                .map((service) => (
                <div 
                  key={service.id} 
                  data-service-id={service.id}
                  data-service-name={service.name}
                  data-duration={service.durationMinutes ? `${service.durationMinutes / 60}:00` : "01:00"}
                  className="fc-event flex-none w-48 p-4 rounded-[24px] border border-slate-100 bg-white hover:border-primary/40 hover:shadow-lg hover:shadow-slate-100 transition-all cursor-grab active:cursor-grabbing group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-slate-300">Quick schedule</span>
                    <GripHorizontal className="h-3 w-3 text-slate-200 group-hover:text-emerald-400" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 leading-tight truncate">{service.name}</h4>
                  {(user?.role !== "CLIENT" && user?.role !== "AGENT") && (
                    <p className="mt-0.5 text-[10px] font-bold text-primary">${service.price}</p>
                  )}
                </div>
              ))}
              <button className="flex-none h-[74px] w-12 flex items-center justify-center rounded-[24px] border-2 border-dashed border-slate-100 text-slate-300 hover:text-slate-500 hover:border-slate-300 transition-colors">
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </section>

          {/* Main Calendar View */}
          <div className="relative mt-2">
            {user?.role === "TENANT_ADMIN" && (
              <div className="flex flex-wrap items-center justify-end gap-2 md:gap-3 mb-4 md:absolute md:-top-12 md:right-0 z-10">
                <button 
                  onClick={() => {
                    if (isActionLocked) {
                      window.location.href = "/tenant/settings?tab=billing";
                      return;
                    }
                    setSelectedBooking({
                      status: 'blocked',
                      title: 'TIME BLOCK OUT',
                      startAt: new Date().toISOString(),
                      endAt: new Date(Date.now() + 3600000).toISOString(),
                    });
                    setIsDrawerOpen(true);
                  }}
                  className={cn(
                    "flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-rose-50 text-rose-600 rounded-full border border-rose-200 text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-sm",
                    isActionLocked && "opacity-50 grayscale hover:grayscale-0 transition-all"
                  )}
                >
                  <Lock className="h-3 w-3" />
                  <span className="whitespace-nowrap">{isActionLocked ? "SUB REQUIRED" : "Time Blocker"}</span>
                </button>
                <button 
                  onClick={() => setIsSubscriptionModalOpen(true)}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-slate-50 text-slate-500 rounded-full border border-slate-200 text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-sm"
                >
                  <CalendarIcon className="h-3 w-3" />
                  <span className="whitespace-nowrap">Sub</span>
                </button>
                <button 
                  onClick={() => setIsHoursModalOpen(true)}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-slate-50 text-slate-500 rounded-full border border-slate-200 text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-sm"
                >
                  <Settings className="h-3 w-3" />
                  <span className="whitespace-nowrap">{aiLogisticsEnabled ? "Hours" : "Hours & Slots"}</span>
                </button>
                <button 
                  onClick={() => {
                    if (isActionLocked) {
                      window.location.href = "/tenant/settings?tab=billing";
                      return;
                    }
                    setSelectedBooking(null);
                    setIsDrawerOpen(true);
                  }}
                  className={cn(
                    "flex-[2] md:flex-none flex items-center justify-center gap-2 px-4 md:px-6 py-2 bg-primary text-white rounded-full border border-white/10 text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg",
                    isActionLocked && "opacity-50 grayscale hover:grayscale-0 transition-all"
                  )}
                  style={{ boxShadow: `0 10px 15px -3px var(--primary-soft)` }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="whitespace-nowrap">{isActionLocked ? "SUB REQUIRED" : "New Appt"}</span>
                </button>
              </div>
            )}
            <CalendarView 
              bookings={filteredBookings} 
              onSelectEvent={handleSelectEvent}
              onSelectSlot={handleSelectSlot}
              onDateClick={(date) => {
                setCurrentDate(date);
                setIsSlotModalOpen(true);
              }}
              onExternalDrop={handleExternalDrop}
              user={user}
              businessHours={businessHours}
              aiLogisticsEnabled={aiLogisticsEnabled}
              onVisibleRangeChange={handleVisibleRangeChange}
            />
          </div>
        </>
      )}

      {mode === "list" && (
        <section className="space-y-6">
          <BookingList 
            bookings={filteredBookings.filter(b => !b.isPlaceholder).map(b => ({
              ...b,
              address: b.property?.name || "TBC",
              clientName: b.client?.name || "Unknown",
              serviceNames: b.services?.map((s: any) => {
                const fullService = services.find(fs => fs.id === s.serviceId);
                return fullService?.name || "Service";
              }) || [],
              photographers: b.assignments?.map((a: any) => a.teamMember?.displayName).join(", ") || "To assign",
              status: b.status.toLowerCase() as any,
            }))} 
            onEdit={user?.role === "CLIENT" && !canPlaceBookings ? undefined : handleSelectEvent}
            bulkDelete={{
              enabled: allowBulkDelete && user?.role !== "CLIENT" && user?.role !== "AGENT",
              onDeleteMany: handleBulkDelete,
            }}
          />
        </section>
      )}

      <BusinessHoursModal 
        isOpen={isHoursModalOpen}
        onClose={() => setIsHoursModalOpen(false)}
        initialHours={businessHours}
        aiLogisticsEnabled={aiLogisticsEnabled}
      />

      <SlotManagementModal 
        isOpen={isSlotModalOpen}
        onClose={() => setIsSlotModalOpen(false)}
        tenantSettings={slotSettings}
        currentDate={currentDate}
        aiLogisticsEnabled={aiLogisticsEnabled}
      />

      <CalendarSubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
        secret={calendarSecret || null}
      />

      {/* Slide-out Booking Form */}
      <BookingDrawer 
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        booking={selectedBooking}
        clients={localClients}
        services={localServices}
        teamMembers={localTeamMembers}
        agents={localAgents}
        onSave={handleSave}
        onDelete={handleDeleteBooking}
        role={user?.role}
        currentClientId={user?.clientId}
        customStatuses={customStatuses}
        aiLogisticsEnabled={aiLogisticsEnabled}
      />
    </div>
  );
}
