"use client";

import React, { useRef, useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { format, startOfDay, endOfDay, addDays, addHours, addMinutes, subMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { permissionService } from "@/lib/permission-service";

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

interface CalendarViewProps {
  bookings: any[];
  onSelectEvent: (booking: any) => void;
  onSelectSlot: (start: Date, end: Date) => void;
  onDateClick?: (date: Date) => void;
  onExternalDrop?: (data: any) => void;
  user?: any;
  defaultLat?: number;
  defaultLon?: number;
  businessHours?: any;
  aiLogisticsEnabled?: boolean;
  onVisibleRangeChange?: (start: Date, end: Date) => void;
}

export function CalendarView({ 
  bookings, 
  onSelectEvent, 
  onSelectSlot, 
  onDateClick,
  onExternalDrop, 
  user,
  businessHours,
  aiLogisticsEnabled = false,
  onVisibleRangeChange
}: CalendarViewProps) {
  const calendarRef = useRef<any>(null);
  const [hoveredEvent, setHoveredEvent] = useState<{ event: any, x: number, y: number } | null>(null);
  const [view, setView] = useState<string>("timeGridWeek");
  const [extraPlugins, setExtraPlugins] = useState<any[]>([]);
  const [dayGridPlugin, setDayGridPlugin] = useState<any>(null);
  const [pendingView, setPendingView] = useState<string | null>(null);

  // Responsive View Handler
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      const newView = isMobile ? "timeGridDay" : "timeGridWeek";
      
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        // If the user is in Month view, do not force-switch views on resize.
        if (calendarApi.view?.type === "dayGridMonth") return;
        if (calendarApi.view.type !== newView) {
          // Defer to avoid React flushSync warnings from FullCalendar internals.
          queueMicrotask(() => {
            calendarApi.changeView(newView);
            setView(newView);
          });
        }
      }
    };

    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    if (pendingView === "dayGridMonth") {
      if (!dayGridPlugin) return;
    }
    const api = calendarRef.current?.getApi?.();
    api?.changeView(pendingView);
    setView(pendingView);
    setPendingView(null);
  }, [pendingView, extraPlugins, dayGridPlugin]);

  const isClientOrRestrictedAgent = user?.role === "CLIENT" || (user?.role === "AGENT" && !user?.permissions?.seeAll);
  const isRestrictedRole = user?.role === "CLIENT" || user?.role === "AGENT";
  const canPlaceBookings = permissionService.can(user, "canPlaceBookings");

  // Combine bookings with availability markers
  const calendarEvents = React.useMemo(() => {
    const events: any[] = [];
    
    // 1. Add Availability Background Events (to block out everything else)
    // This creates the "punched holes" effect so only open slots are white
    if (businessHours) {
      Object.entries(businessHours).forEach(([day, config]: [string, any]) => {
        if (config.open && config.start && config.end) {
          events.push({
            daysOfWeek: [parseInt(day)],
            startTime: config.start,
            endTime: config.end,
            display: 'background',
            groupId: 'available',
            color: '#ffffff'
          });
        }
      });
    }

    // 2. Add Placeholder slots as background availability (DATE SPECIFIC - no smearing)
    if (!aiLogisticsEnabled) {
      bookings.filter(b => b.isPlaceholder && b.startAt && b.endAt).forEach(b => {
        // If client, hide availability that overlaps with a block-out
        if (user?.role === "CLIENT") {
          const isBlocked = bookings.some(block => 
            block.status === 'BLOCKED' && 
            new Date(b.startAt) < new Date(block.endAt) && 
            new Date(b.endAt) > new Date(block.startAt)
          );
          if (isBlocked) return;
        }

        events.push({
          start: b.startAt,
          end: b.endAt,
          display: 'background',
          groupId: 'available',
          color: '#ffffff'
        });
      });
    }

    // 3. Add real bookings and interactive placeholders
    bookings.forEach(b => {
      if (!b.startAt || !b.endAt) return;
      if (aiLogisticsEnabled && b.isPlaceholder) return; // Hide placeholders when AI is on

      const status = b.status?.toUpperCase() || 'REQUESTED';
      
      // If client, hide interactive placeholders that overlap with a block-out
      if (b.isPlaceholder && user?.role === "CLIENT") {
        const isBlocked = bookings.some(block => 
          (block.status === 'BLOCKED' || block.status === 'blocked') && 
          new Date(b.startAt) < new Date(block.endAt) && 
          new Date(b.endAt) > new Date(block.startAt)
        );
        if (isBlocked) return;
      }

      // Placeholders are NEVER masked - they are public availability
      const isMasked = !b.isPlaceholder && isClientOrRestrictedAgent && 
                      (user.role === "CLIENT" ? b.clientId !== user.clientId : b.agentId !== user.agentId) &&
                      status !== 'BLOCKED';

      // Time blocks: tenant/team see internal title; client/agent see generic.
      const isBlocked = status === "BLOCKED";
      const blockedTitle = (user?.role === "CLIENT" || user?.role === "AGENT") ? "TIME BLOCK OUT" : (b.title || "TIME BLOCK OUT");

      const title = b.isPlaceholder
        ? `${b.slotType || 'PRODUCTION'} SLOT`
        : (isMasked ? "LIMITED AVAILABILITY" : (isBlocked ? blockedTitle : b.title));

      events.push({
        id: String(b.id || `temp-${b.startAt}-${b.title}`),
        title,
        start: b.startAt,
        end: b.endAt,
        extendedProps: { ...b, isMasked, status }, // Ensure status is passed correctly
        display: 'block',
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        className: cn(
          'booking-event-card', 
          isMasked && 'masked-event',
          b.isPlaceholder && 'placeholder-event'
        ),
        editable: !isMasked && !b.isPlaceholder && (user?.role !== "CLIENT" && user?.role !== "AGENT"),
        startEditable: !isMasked && !b.isPlaceholder && (user?.role !== "CLIENT" && user?.role !== "AGENT"),
        durationEditable: !isMasked && !b.isPlaceholder && (user?.role !== "CLIENT" && user?.role !== "AGENT")
      });
    });

    return events;
  }, [bookings, isClientOrRestrictedAgent, user, businessHours]);

  // Generate business hours baseline (only standard hours for visual coloring)
  const calendarBusinessHours = React.useMemo(() => {
    return businessHours ? Object.entries(businessHours)
      .filter(([_, config]: [string, any]) => config.open && config.start && config.end)
      .map(([day, config]: [string, any]) => ({
        daysOfWeek: [parseInt(day)],
        startTime: config.start,
        endTime: config.end
      })) : [];
  }, [businessHours]);

  // Calculate time range for the calendar view to avoid massive empty space
  const { minTime, maxTime } = React.useMemo(() => {
    let min = "09:00";
    let max = "17:00";

    if (businessHours) {
      Object.values(businessHours).forEach((config: any) => {
        if (config.open && config.start && config.end) {
          if (config.start < min) min = config.start;
          if (config.end > max) max = config.end;
        }
      });
    }

    // Also consider placeholders for the view range
    bookings.filter(b => b.isPlaceholder && b.startAt && b.endAt).forEach(b => {
      try {
        const startDate = new Date(b.startAt);
        const endDate = new Date(b.endAt);
        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          const start = format(startDate, "HH:mm");
          const end = format(endDate, "HH:mm");
          if (start < min) min = start;
          if (end > max) max = end;
        }
      } catch (e) {}
    });

    const minHour = Math.max(0, parseInt(min.split(':')[0]) - 1);
    const maxHour = Math.min(24, parseInt(max.split(':')[0]) + 1);

    return {
      minTime: `${String(minHour).padStart(2, '0')}:00:00`,
      maxTime: `${String(maxHour).padStart(2, '0')}:00:00`
    };
  }, [businessHours, bookings]);

  const getStatusConfig = (status: string, isMasked?: boolean) => {
    if (isMasked) {
      return { dot: 'bg-slate-400', border: 'border-slate-200', bg: 'bg-slate-50', text: 'text-slate-500' };
    }
    switch (status) {
      case 'APPROVED': 
      case 'CONFIRMED':
        return { dot: 'bg-primary', border: 'border-emerald-200', bg: 'bg-emerald-50/50', text: 'text-emerald-700' };
      case 'PENCILLED': 
      case 'PENDING':
        return { dot: 'bg-amber-500', border: 'border-amber-200', bg: 'bg-amber-50/50', text: 'text-amber-700' };
      case 'DECLINED': 
      case 'REQUESTED':
        return { dot: 'bg-rose-500', border: 'border-rose-200', bg: 'bg-rose-50/50', text: 'text-rose-700' };
      case 'BLOCKED':
        return { dot: 'bg-rose-600', border: 'border-rose-300', bg: 'bg-rose-100', text: 'text-rose-900' };
      default: 
        return { dot: 'bg-primary', border: 'border-emerald-200', bg: 'bg-emerald-50/50', text: 'text-emerald-700' };
    }
  };

  // Calculate hidden days (days that are closed)
  const hiddenDays = React.useMemo(() => {
    if (!businessHours) return [];
    return [0, 1, 2, 3, 4, 5, 6].filter(dayId => {
      const config = businessHours[dayId.toString()];
      return !config?.open;
    });
  }, [businessHours]);

  return (
    <div className="relative space-y-6 w-full max-w-full overflow-hidden">
      {/* Legend - more compact on mobile */}
      <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-3 px-2 md:px-4 py-2 border-b border-slate-50 md:border-none pb-4 md:pb-0">
        <div className="flex items-center gap-2.5 group">
          <div className="h-2 w-2 rounded-full bg-primary shadow-sm" />
          <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 group-hover:text-primary transition-colors">Approved</span>
        </div>
        <div className="flex items-center gap-2.5 group">
          <div className="h-2 w-2 rounded-full bg-rose-500 shadow-sm" />
          <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 group-hover:text-rose-500 transition-colors">Requested</span>
        </div>
        <div className="flex items-center gap-2.5 group text-rose-600">
          <div className="h-2 w-2 rounded-full bg-rose-600 shadow-sm" />
          <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] text-rose-500 group-hover:text-rose-600 transition-colors">Block Out</span>
        </div>
        <div className="flex items-center gap-2.5 group">
          <div className="h-2 w-2 rounded-full bg-amber-500 shadow-sm" />
          <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 group-hover:text-amber-500 transition-colors">Pending</span>
        </div>
        <div className="flex items-center gap-2.5 group">
          <div className="h-2 w-2 rounded-full bg-slate-400 shadow-sm" />
          <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 group-hover:text-slate-600 transition-colors">Limited</span>
        </div>
      </div>

      <div className="calendar-container h-[85vh] md:h-[900px] bg-white rounded-[32px] md:rounded-[40px] border border-slate-100 shadow-sm p-2 md:p-2 md:px-6 overflow-hidden w-full">
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, interactionPlugin, ...(dayGridPlugin ? [dayGridPlugin] : []), ...extraPlugins]}
          initialView={view}
          datesSet={(arg: any) => {
            // Allows parent to fetch only visible range (no behavior change).
            try {
              // Defer: FullCalendar may call this during its own lifecycle; avoid flushSync warnings.
              queueMicrotask(() => onVisibleRangeChange?.(arg.start, arg.end));
            } catch {
              // non-blocking
            }
          }}
          hiddenDays={hiddenDays}
          slotDuration="00:30:00"
          expandRows={false}
          customButtons={{
            month: {
              text: "Month",
              click: async () => {
                await ensureDayGridPlugin();
                setPendingView("dayGridMonth");
              }
            }
          }}
          headerToolbar={{
            left: 'prev,today,next',
            center: 'title',
            right: 'timeGridDay,timeGridWeek,month'
          }}
          handleWindowResize={true}
          windowResizeDelay={100}
          height="100%"
          dayHeaderContent={(arg) => {
            const isToday = format(arg.date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
            return (
              <div className={cn(
                "flex flex-col items-center py-1 px-3 rounded-xl transition-colors",
                isToday ? "bg-primary/10 ring-1 ring-primary/20" : ""
              )}>
                <div className={cn(
                  "text-[10px] font-bold uppercase tracking-widest",
                  isToday ? "text-primary" : "text-slate-400"
                )}>
                  {format(arg.date, "EEE")}
                </div>
                <div className={cn(
                  "text-sm font-black",
                  isToday ? "text-primary" : "text-slate-900"
                )}>
                  {format(arg.date, "d")}
                </div>
              </div>
            );
          }}
          events={calendarEvents}
          editable={!isRestrictedRole}
          selectable={!(isRestrictedRole && !canPlaceBookings)}
          selectMirror={true}
          dayMaxEvents={true}
          slotLabelInterval="01:00"
          weekends={true}
          droppable={true}
          eventReceive={(info) => {
            const start = info.event.start;
            const end = info.event.end;
            const serviceId = info.event.extendedProps.serviceId;
            info.revert(); // Remove the temporary event from calendar
            if (onExternalDrop) {
              onExternalDrop({ start, end, serviceId });
            }
          }}
          businessHours={calendarBusinessHours}
          selectConstraint={isRestrictedRole ? (canPlaceBookings ? "available" : "none") : undefined}
          eventConstraint={isRestrictedRole ? (canPlaceBookings ? "available" : "none") : undefined}
          slotMinTime={minTime}
          slotMaxTime={maxTime}
          allDaySlot={false}
          eventClick={(info) => {
            // 1. NEVER allow clicking masked events (Someone else's booking)
            const isMasked = info.event.extendedProps.isMasked;
            if (isMasked) return;

            // 2. If client, hide placeholders AND block-outs (red cards)
            if (user?.role === "CLIENT") {
              const isPlaceholder = info.event.extendedProps.isPlaceholder;
              const isBlocked = info.event.extendedProps.status === 'BLOCKED';
              if (isPlaceholder || isBlocked) return;
            }
            
            if (info.event.extendedProps.isPlaceholder && !canPlaceBookings) return;
            onSelectEvent(info.event.extendedProps);
          }}
          select={(info) => {
            if (isRestrictedRole && !canPlaceBookings) return;
            onSelectSlot(info.start, info.end);
          }}
          selectAllow={(selectInfo) => {
            if (user?.role !== "CLIENT") return true;
            
            // Clients cannot select slots that overlap with a BLOCKED booking
            const isOverlappingBlocked = bookings.some(b => {
              if (b.status !== 'BLOCKED') return false;
              const bStart = new Date(b.startAt);
              const bEnd = new Date(b.endAt);
              return selectInfo.start < bEnd && selectInfo.end > bStart;
            });
            
            return !isOverlappingBlocked;
          }}
          nowIndicator={true}
          eventMouseEnter={(info) => {
            // Skip hover for background availability
            if (info.event.display === 'background') return;
            
            // Skip hover for masked events (privacy), placeholders, or block-outs for clients
            const isMasked = info.event.extendedProps.isMasked;
            const isPlaceholder = info.event.extendedProps.isPlaceholder;
            const isBlocked = info.event.extendedProps.status === 'BLOCKED';
            
            if (isMasked || (user?.role === "CLIENT" && (isPlaceholder || isBlocked))) return;

            const rect = info.el.getBoundingClientRect();
            setHoveredEvent({
              event: info.event.extendedProps,
              x: rect.left + rect.width / 2,
              y: rect.top
            });
          }}
          eventMouseLeave={() => setHoveredEvent(null)}
          eventContent={(eventInfo) => {
            // NEVER render background events (availability holes) as cards
            if (eventInfo.event.display === 'background') return null;

            const isMasked = eventInfo.event.extendedProps.isMasked;
            const isPlaceholder = eventInfo.event.extendedProps.isPlaceholder;
            const status = eventInfo.event.extendedProps.status?.toUpperCase() || 'REQUESTED';
            const isBlocked = status === 'BLOCKED';
            const config = getStatusConfig(status, isMasked);
            const assignments = eventInfo.event.extendedProps.assignments || [];
            const teamMembers = (assignments || [])
              .map((a: any) => a?.teamMember)
              .filter(Boolean);
            
            const isStatic = isMasked || (user?.role === "CLIENT" && (isPlaceholder || isBlocked));

            return (
              <div className={cn(
                "flex flex-col h-full p-2 px-3 rounded-[20px] border-2 transition-all duration-300 relative",
                !isStatic && "group cursor-pointer",
                isPlaceholder 
                  ? cn(
                      "bg-amber-100 border-dashed border-amber-400",
                      !isStatic && "hover:bg-amber-200 hover:border-amber-600 hover:shadow-xl hover:shadow-amber-200/50 hover:-translate-y-1"
                    )
                  : config.bg,
                isPlaceholder ? "" : config.border,
                isMasked && "opacity-80",
                isStatic && "cursor-default",
                // Block-outs should be visible but subtle
                isBlocked && "shadow-sm shadow-rose-100/40",
                isBlocked && "bg-rose-100/45 border-rose-200/70 text-rose-700",
                isPlaceholder && !canPlaceBookings && "opacity-50 grayscale cursor-not-allowed"
              )}>
                {/* Book Now Badge - Only for placeholders */}
                {isPlaceholder && canPlaceBookings && (
                  <div className="absolute top-2 right-2 opacity-100 group-hover:scale-110 transition-all duration-300">
                    <div className="bg-amber-600 text-white text-[7px] font-black px-1.5 py-0.5 rounded-md shadow-sm uppercase tracking-wider">
                      Book Now
                    </div>
                  </div>
                )}

                {/* Team Member Avatar Stack - Only if not masked or placeholder or blocked */}
                {!isMasked && !isPlaceholder && !isBlocked && teamMembers.length > 0 && (
                  <div className="absolute -top-2 -right-2 z-[20] flex items-center">
                    {teamMembers.slice(0, 3).map((m: any, idx: number) => (
                      <div
                        key={m.id || m.displayName || idx}
                        className="h-9 w-9 rounded-xl border-2 border-white shadow-xl overflow-hidden bg-slate-100 ring-1 ring-slate-100/50"
                        style={{ marginLeft: idx === 0 ? 0 : -10 }}
                        title={m.displayName || ""}
                      >
                        {m.avatarUrl ? (
                          <img
                            src={m.avatarUrl}
                            alt={m.displayName || "Team member"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[10px] font-black text-slate-500 bg-slate-100">
                            {(m.displayName || "T").charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                    ))}

                    {teamMembers.length > 3 && (
                      <div
                        className="h-9 w-9 rounded-xl border-2 border-white shadow-xl bg-slate-900 text-white flex items-center justify-center text-[10px] font-black ring-1 ring-slate-100/50"
                        style={{ marginLeft: -10 }}
                        title={`${teamMembers.length - 3} more`}
                      >
                        +{teamMembers.length - 3}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-start justify-between">
                  <div className="space-y-0.5 min-w-0 pr-10">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-wider truncate block transition-colors duration-300",
                        isPlaceholder ? "text-amber-700 group-hover:text-amber-900" : (isBlocked ? "text-rose-700" : "text-slate-700")
                      )}>
                        {isPlaceholder ? `${eventInfo.event.extendedProps.slotType} SLOT` : 
                         (isBlocked ? (user?.role === "CLIENT" ? "UNAVAILABLE" : "TIME BLOCK OUT") :
                         (isMasked ? "LIMITED AVAILABILITY" : (eventInfo.event.extendedProps.client?.businessName || eventInfo.event.extendedProps.client?.name || "No Client")))}
                      </span>
                      {!isPlaceholder && !isBlocked && <div className={cn("h-2 w-2 rounded-full shrink-0", config.dot)} />}
                      {isPlaceholder && (
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-400 group-hover:animate-pulse transition-all duration-300" />
                      )}
                    </div>

                    {!isMasked && !isBlocked && (
                      <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 truncate">
                        <IconMapPin className="h-2 w-2" />
                        <span className="truncate">{isPlaceholder ? "Available to book" : (eventInfo.event.extendedProps.property?.name || "TBC")}</span>
                      </div>
                    )}
                    {isBlocked && (
                      <div className="flex items-center gap-1 text-[9px] font-bold text-rose-600/80 uppercase tracking-widest">
                        <IconClock className="h-2 w-2" />
                        <span>Unavailable for Clients</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-auto -mx-1">
                  {isPlaceholder ? (
                    <div className="bg-amber-50/50 text-amber-700 px-3 py-1 rounded-full flex items-center justify-center border border-amber-200 shadow-sm">
                      <span className="text-[8px] font-black tracking-widest uppercase flex items-center gap-1">
                        <IconClock className="h-2 w-2 opacity-60" />
                        {eventInfo.event.start && eventInfo.event.end ? (
                          `${format(eventInfo.event.start, "h:mma").toUpperCase()} — ${format(eventInfo.event.end, "h:mma").toUpperCase()}`
                        ) : "TBC"}
                      </span>
                    </div>
                  ) : isBlocked ? (
                    <div className="bg-white/70 text-rose-700 px-3 py-1.5 rounded-full flex items-center justify-center border border-rose-200/60">
                      <span className="text-[9px] font-black tracking-widest uppercase flex items-center gap-1">
                        {eventInfo.event.start && eventInfo.event.end ? (
                          `${format(eventInfo.event.start, "h:mma").toUpperCase()} — ${format(eventInfo.event.end, "h:mma").toUpperCase()}`
                        ) : "TBC"}
                      </span>
                    </div>
                  ) : (
                    <div className="bg-white text-slate-900 px-3 py-1.5 rounded-full flex items-center justify-center shadow-sm border border-slate-100">
                      <span className="text-[9px] font-black tracking-widest uppercase flex items-center gap-1">
                        <IconClock className="h-2 w-2 text-primary opacity-60" />
                        {eventInfo.event.start && eventInfo.event.end ? (
                          `${format(eventInfo.event.start, "h:mma").toUpperCase()} — ${format(eventInfo.event.end, "h:mma").toUpperCase()}`
                        ) : "TBC"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          }}
        />
      </div>

      {/* Hover Tooltip/Popover */}
      {hoveredEvent && !hoveredEvent.event.isPlaceholder && (
        <div 
          className="fixed z-[200] w-72 bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 pointer-events-none animate-in fade-in zoom-in duration-150"
          style={{ 
            left: hoveredEvent.x, 
            top: hoveredEvent.y - 10,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">{hoveredEvent.event.property?.name || hoveredEvent.event.title}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {(() => {
                    try {
                      const d = new Date(hoveredEvent.event.startAt);
                      const e = new Date(hoveredEvent.event.endAt);
                      if (isNaN(d.getTime())) return "Invalid Date";
                      return `${format(d, "EEE d MMM")} • ${format(d, "h:mma")} — ${format(e, "h:mma")}`;
                    } catch (err) {
                      return "Invalid Date";
                    }
                  })()}
                </p>
              </div>
              <div className={cn("h-2 w-2 rounded-full shrink-0 mt-1.5", getStatusConfig(hoveredEvent.event.status?.toUpperCase()).dot)} />
            </div>
            
            <div className="space-y-3 pt-3 border-t border-slate-50">
              <div className="flex items-start justify-between gap-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase pt-0.5">Client</span>
                <div className="flex flex-col items-end">
                  <span className="text-xs font-bold text-slate-700 text-right">
                    {hoveredEvent.event.client?.businessName || hoveredEvent.event.client?.name}
                  </span>
                  {hoveredEvent.event.client?.businessName && (
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                      {hoveredEvent.event.client?.name}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase pt-0.5">Team</span>
                <div className="flex flex-col items-end gap-2">
                  {hoveredEvent.event.assignments?.length > 0 ? (
                    hoveredEvent.event.assignments.map((a: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700">{a.teamMember?.displayName}</span>
                        {a.teamMember?.avatarUrl && (
                          <div className="h-6 w-6 rounded-lg overflow-hidden border border-slate-100 bg-slate-50">
                            <img src={a.teamMember.avatarUrl} className="h-full w-full object-cover" alt="" />
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <span className="text-xs font-bold text-slate-400 italic">To be assigned</span>
                  )}
                </div>
              </div>
              {hoveredEvent.event.services?.length > 0 && (
                <div className="flex items-start justify-between gap-4 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase pt-0.5">Services</span>
                  <div className="flex flex-wrap justify-end gap-1 max-w-[160px]">
                    {hoveredEvent.event.services.map((s: any, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-50 text-slate-600 rounded-md text-[9px] font-black border border-slate-100 uppercase tracking-tighter">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Arrow */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-white" />
        </div>
      )}
    </div>
  );
}

// Helper for classes (removed local definition)
