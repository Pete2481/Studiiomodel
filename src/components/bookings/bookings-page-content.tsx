"use client";

import React, { useState, useEffect } from "react";
import { Plus, Calendar as CalendarIcon, Lock, GripHorizontal, Settings } from "lucide-react";
import { Draggable } from "@fullcalendar/interaction";
import { CalendarView } from "./calendar-view";
import { BookingDrawer } from "./booking-drawer";
import { BusinessHoursModal } from "./business-hours-modal";
import { SlotManagementModal } from "./slot-management-modal";
import { CalendarSubscriptionModal } from "./calendar-subscription-modal";
import { upsertBooking, deleteBooking } from "@/app/actions/booking-upsert";
import { BookingList } from "@/components/dashboard/booking-list";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { permissionService } from "@/lib/permission-service";

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
  slotSettings?: {
    sunriseSlotTime: string;
    duskSlotTime: string;
    sunriseSlotsPerDay: number;
    duskSlotsPerDay: number;
  };
  mode?: "calendar" | "list";
  isActionLocked?: boolean;
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
  slotSettings = {
    sunriseSlotTime: "06:00",
    duskSlotTime: "18:30",
    sunriseSlotsPerDay: 1,
    duskSlotsPerDay: 1
  },
  mode = "calendar",
  isActionLocked = false
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

  // Sync state when props update (crucial for router.refresh() to work)
  useEffect(() => {
    setBookings(initialBookings);
  }, [initialBookings]);

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
    let draggableEl = document.getElementById("external-events");
    if (draggableEl) {
      new Draggable(draggableEl, {
        itemSelector: ".fc-event",
        eventData: (eventEl) => {
          const serviceId = eventEl.getAttribute("data-service-id");
          const serviceName = eventEl.getAttribute("data-service-name");
          const duration = eventEl.getAttribute("data-duration");
          return {
            title: serviceName,
            duration: duration,
            extendedProps: { serviceId, isQuickAdd: true }
          };
        }
      });
    }
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
    const service = services.find(s => s.id === serviceId);
    
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
        // Soft refresh to update data without page flicker
        router.refresh();
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
        // Soft refresh to update data without page flicker
        router.refresh();
      } else {
        alert(result.error || "Failed to remove booking.");
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("An unexpected error occurred. Please try again.");
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
              {services
                .filter(s => s.isFavorite && (user?.role !== "CLIENT" || s.clientVisible !== false))
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
              <div className="absolute -top-10 right-0 flex items-center gap-3 z-10">
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
                    "flex items-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-full border border-rose-200 text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-rose-700 transition-all shadow-sm",
                    isActionLocked && "opacity-50 grayscale hover:grayscale-0 transition-all"
                  )}
                >
                  <Lock className="h-3 w-3" />
                  {isActionLocked ? "SUB REQUIRED" : "Time Blocker"}
                </button>
                <button 
                  onClick={() => setIsSubscriptionModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 text-slate-500 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-primary transition-all shadow-sm"
                >
                  <CalendarIcon className="h-3 w-3" />
                  Subscription
                </button>
                <button 
                  onClick={() => setIsHoursModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 text-slate-500 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-slate-900 transition-all shadow-sm"
                >
                  <Settings className="h-3 w-3" />
                  Business Hours
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
                    "flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white rounded-full border border-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200/50",
                    isActionLocked && "opacity-50 grayscale hover:grayscale-0 transition-all"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {isActionLocked ? "SUB REQUIRED" : "New Appointment"}
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
          />
        </section>
      )}

      <BusinessHoursModal 
        isOpen={isHoursModalOpen}
        onClose={() => setIsHoursModalOpen(false)}
        initialHours={businessHours}
      />

      <SlotManagementModal 
        isOpen={isSlotModalOpen}
        onClose={() => setIsSlotModalOpen(false)}
        tenantSettings={slotSettings}
        currentDate={currentDate}
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
        clients={clients}
        services={services}
        teamMembers={teamMembers}
        agents={agents}
        onSave={handleSave}
        onDelete={handleDeleteBooking}
        role={user?.role}
        currentClientId={user?.clientId}
        customStatuses={customStatuses}
      />
    </div>
  );
}
