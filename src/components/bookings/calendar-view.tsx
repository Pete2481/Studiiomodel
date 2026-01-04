"use client";

import React, { useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import { format, startOfDay, endOfDay, addDays, addHours, addMinutes, subMinutes } from "date-fns";
import { Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { permissionService } from "@/lib/permission-service";

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
}

export function CalendarView({ 
  bookings, 
  onSelectEvent, 
  onSelectSlot, 
  onDateClick,
  onExternalDrop, 
  user,
  businessHours
}: CalendarViewProps) {
  const calendarRef = useRef<any>(null);
  const [hoveredEvent, setHoveredEvent] = useState<{ event: any, x: number, y: number } | null>(null);

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

    // 3. Add real bookings and interactive placeholders
    bookings.forEach(b => {
      if (!b.startAt || !b.endAt) return;

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
                      status !== 'BLOCKED'; // Block outs are not masked, they are public info

      const title = b.isPlaceholder ? `${b.slotType || 'PRODUCTION'} SLOT` : (isMasked ? "LIMITED AVAILABILITY" : b.title);

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
        editable: !isMasked && !b.isPlaceholder
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
    <div className="relative space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Approved</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-rose-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Requested / Declined</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-rose-600 shadow-sm" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-rose-600">Time Block Out</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pending / Pencilled</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-slate-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Limited Availability</span>
        </div>
      </div>

      <div className="calendar-container h-[900px] bg-white rounded-[40px] border border-slate-100 shadow-sm p-2 px-6 overflow-hidden">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="timeGridWeek"
          hiddenDays={hiddenDays}
          slotDuration="00:30:00"
          expandRows={false}
          headerToolbar={{
            left: 'prev,today,next',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
          }}
          buttonText={{
            today: 'Today',
            month: 'Month',
            week: 'Week',
            day: 'Day',
            list: 'List'
          }}
          dayHeaderContent={(arg) => {
            return (
              <div className="flex flex-col items-center py-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{format(arg.date, "EEE")}</div>
                <div className="text-sm font-black text-slate-900">{format(arg.date, "d")}</div>
              </div>
            );
          }}
          events={calendarEvents}
          editable={!(isRestrictedRole && !canPlaceBookings)}
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
            if (info.event.extendedProps.isMasked) return;
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
          height="100%"
          nowIndicator={true}
          eventMouseEnter={(info) => {
            // Skip hover for background availability or masked/placeholders
            if (info.event.display === 'background' || info.event.extendedProps.isMasked || info.event.extendedProps.isPlaceholder) return;
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
            const leadMember = assignments[0]?.teamMember;
            
            return (
              <div className={cn(
                "flex flex-col h-full p-2 px-3 rounded-[20px] border-2 transition-all duration-300 relative group cursor-pointer",
                isPlaceholder 
                  ? "bg-amber-100 border-dashed border-amber-400 hover:bg-amber-200 hover:border-amber-600 hover:shadow-xl hover:shadow-amber-200/50 hover:-translate-y-1" 
                  : config.bg,
                isPlaceholder ? "" : config.border,
                isMasked && "cursor-not-allowed opacity-80",
                isBlocked && "bg-rose-500 border-rose-600 text-white shadow-lg shadow-rose-200/50",
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

                {/* Team Member Avatar Overlay - Only if not masked or placeholder or blocked */}
                {!isMasked && !isPlaceholder && !isBlocked && leadMember?.avatarUrl && (
                  <div className="absolute -top-2 -right-2 z-[20]">
                    <div className="h-9 w-9 rounded-xl border-2 border-white shadow-xl overflow-hidden bg-slate-100 ring-1 ring-slate-100/50">
                      <img 
                        src={leadMember.avatarUrl} 
                        alt={leadMember.displayName}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-start justify-between">
                  <div className="space-y-0.5 min-w-0 pr-10">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-wider truncate block transition-colors duration-300",
                        isPlaceholder ? "text-amber-700 group-hover:text-amber-900" : (isBlocked ? "text-white" : "text-slate-700")
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
                        <MapPin className="h-2 w-2" />
                        <span className="truncate">{isPlaceholder ? "Available to book" : (eventInfo.event.extendedProps.property?.name || "TBC")}</span>
                      </div>
                    )}
                    {isBlocked && (
                      <div className="flex items-center gap-1 text-[9px] font-bold text-rose-100/80 uppercase tracking-widest">
                        <Clock className="h-2 w-2" />
                        <span>Unavailable for Clients</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-auto -mx-1">
                  {isPlaceholder ? (
                    <div className="bg-amber-50/50 text-amber-700 px-3 py-1 rounded-full flex items-center justify-center border border-amber-200 shadow-sm">
                      <span className="text-[8px] font-black tracking-widest uppercase flex items-center gap-1">
                        <Clock className="h-2 w-2 opacity-60" />
                        {eventInfo.event.start && eventInfo.event.end ? (
                          `${format(eventInfo.event.start, "h:mma").toUpperCase()} — ${format(eventInfo.event.end, "h:mma").toUpperCase()}`
                        ) : "TBC"}
                      </span>
                    </div>
                  ) : isBlocked ? (
                    <div className="bg-white/20 text-white px-3 py-1.5 rounded-full flex items-center justify-center border border-white/30">
                      <span className="text-[9px] font-black tracking-widest uppercase flex items-center gap-1">
                        {eventInfo.event.start && eventInfo.event.end ? (
                          `${format(eventInfo.event.start, "h:mma").toUpperCase()} — ${format(eventInfo.event.end, "h:mma").toUpperCase()}`
                        ) : "TBC"}
                      </span>
                    </div>
                  ) : (
                    <div className="bg-white text-slate-900 px-3 py-1.5 rounded-full flex items-center justify-center shadow-sm border border-slate-100">
                      <span className="text-[9px] font-black tracking-widest uppercase flex items-center gap-1">
                        <Clock className="h-2 w-2 text-primary opacity-60" />
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
