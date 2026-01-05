"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  format, 
  addDays, 
  startOfToday, 
  isSameDay, 
  parseISO,
} from "date-fns";
import { cn } from "@/lib/utils";
import { Clock, Plus, X, ChevronDown, Loader2, MapPin, Pencil } from "lucide-react";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { upsertBooking } from "@/app/actions/booking-upsert";
import { useRouter } from "next/navigation";
import { permissionService } from "@/lib/permission-service";

interface Booking {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  isPlaceholder: boolean;
  clientId: string | null;
  title: string;
  propertyName?: string;
  services: string[];
  teamMembers: { name: string; avatarUrl?: string | null }[];
}

interface Service {
  id: string;
  name: string;
  price: number;
  icon?: string | null;
}

interface MobileCalendarViewProps {
  initialBookings: Booking[];
  user: any;
  businessHours: any;
  services: Service[];
  clients?: { id: string; name: string }[];
  teamMembers?: { id: string; name: string }[];
}

export function MobileCalendarView({
  initialBookings,
  user,
  businessHours,
  services,
  clients = [],
  teamMembers = []
}: MobileCalendarViewProps) {
  const userClientId = user?.clientId || null;
  const canPlaceBookings = permissionService.can(user, "canPlaceBookings");
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(startOfToday());
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState("09:00 AM");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>(userClientId || "");
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState<string>("");
  const [address, setAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => {
    return Array.from({ length: 30 }).map((_, i) => addDays(startOfToday(), i));
  }, []);

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let h = 6; h <= 22; h++) {
      slots.push(`${h}:00`);
      slots.push(`${h}:30`);
    }
    return slots;
  }, []);

  // Stacking logic for overlapping bookings
  const dayBookings = useMemo(() => {
    const filtered = initialBookings
      .filter(b => isSameDay(parseISO(b.startAt), selectedDate))
      .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime());

    const columns: Booking[][] = [];
    
    filtered.forEach(booking => {
      let placed = false;
      for (let i = 0; i < columns.length; i++) {
        const lastInCol = columns[i][columns[i].length - 1];
        if (parseISO(booking.startAt) >= parseISO(lastInCol.endAt)) {
          columns[i].push(booking);
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([booking]);
      }
    });

    return filtered.map(booking => {
      let colIdx = 0;
      let totalCols = columns.length;
      columns.forEach((col, idx) => {
        if (col.find(b => b.id === booking.id)) colIdx = idx;
      });
      return { ...booking, colIdx, totalCols };
    });
  }, [initialBookings, selectedDate]);

  const bookingSlots = useMemo(() => {
    let startHour = 8;
    let endHour = 18;
    if (businessHours) {
      const dayName = format(selectedDate, 'EEEE').toLowerCase();
      const todayHours = businessHours[dayName];
      if (todayHours && todayHours.active && todayHours.slots?.length > 0) {
        const firstSlot = todayHours.slots[0];
        startHour = parseInt(firstSlot.start.split(':')[0]);
        endHour = parseInt(firstSlot.end.split(':')[0]);
      }
    }
    const slots = [];
    for (let h = startHour; h < endHour; h++) {
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? 'PM' : 'AM';
      slots.push(`${h12}:00 ${ampm}`);
      slots.push(`${h12}:30 ${ampm}`);
    }
    return slots;
  }, [businessHours, selectedDate]);

  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const hour = now.getHours();
      const targetHour = hour >= 6 && hour <= 22 ? hour - 1 : 8;
      scrollRef.current.scrollTop = ((targetHour - 6) * 160);
    }
  }, []);

  const handleEditBooking = (booking: Booking) => {
    if ((user?.role === "CLIENT" || user?.role === "AGENT") && !canPlaceBookings) return;
    const start = parseISO(booking.startAt);
    setSelectedDate(start);
    const h = start.getHours();
    const m = start.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    setSelectedTime(`${h12}:${m === 0 ? '00' : m} ${ampm}`);
    
    // Attempt to find service ID by name (this is a bit fragile, but works if names are unique)
    const service = services.find(s => booking.services.includes(s.name));
    setSelectedServiceId(service?.id || "");
    
    setSelectedClientId(booking.clientId || "");
    setAddress(booking.propertyName || booking.title);
    setEditingBookingId(booking.id);
    
    // Team member - take first assigned if any
    if (booking.teamMembers.length > 0) {
      const tm = teamMembers.find(t => t.name === booking.teamMembers[0].name);
      setSelectedTeamMemberId(tm?.id || "");
    } else {
      setSelectedTeamMemberId("");
    }

    setIsBookingOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !selectedServiceId || !selectedClientId) {
      alert("Please provide an address, select a service, and select a client.");
      return;
    }
    setIsSubmitting(true);
    try {
      const [time, ampm] = selectedTime.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      const startAt = new Date(selectedDate);
      startAt.setHours(hours, minutes, 0, 0);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const result = await upsertBooking({
        id: editingBookingId, // Pass ID if editing
        title: address,
        address,
        clientId: selectedClientId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        status: "REQUESTED",
        serviceIds: [selectedServiceId],
        teamMemberIds: selectedTeamMemberId ? [selectedTeamMemberId] : [],
      });
      if (result.success) {
        setIsBookingOpen(false);
        setAddress("");
        setSelectedServiceId("");
        setSelectedTeamMemberId("");
        setEditingBookingId(null);
        router.refresh();
      } else {
        alert(result.error || "Failed to submit request.");
      }
    } catch (error) {
      console.error("Submission error:", error);
      alert("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white select-none overflow-hidden relative">
      {/* 1. DATE PICKER STRIP */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-2 py-4 z-30">
        <div className="flex overflow-x-auto scrollbar-hide gap-3 px-4">
          {days.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isTodayDate = isSameDay(day, new Date());
            return (
              <button 
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "flex flex-col items-center min-w-[50px] py-3 rounded-2xl transition-all duration-300",
                  isSelected ? "bg-primary text-white shadow-lg shadow-primary/30 scale-110" : "bg-slate-50 text-slate-400"
                )}
              >
                <span className="text-[10px] font-bold uppercase tracking-tighter mb-1">
                  {format(day, "EEE")}
                </span>
                <span className={cn(
                  "text-lg font-black",
                  isTodayDate && !isSelected && "text-primary"
                )}>
                  {format(day, "d")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. ONE-DAY GRID */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide bg-white relative">
        <div className="flex relative h-[2720px]">
          {/* TIME LABELS */}
          <div className="w-20 shrink-0 border-r border-slate-100 bg-slate-50/30">
            {timeSlots.map(time => {
              const hour = parseInt(time.split(':')[0]);
              const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
              const ampm = hour >= 12 ? 'PM' : 'AM';
              return (
                <div key={time} className="h-20 flex items-start justify-center pt-2">
                  <span className="text-[11px] font-black text-slate-400">
                    {time.split(':')[1] === '00' ? `${displayHour} ${ampm}` : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {/* SINGLE DAY CANVAS */}
          <div className="flex-1 relative bg-white">
            {timeSlots.map((_, idx) => (
              <div key={idx} className={cn("h-20 border-b border-slate-100/60", idx % 2 === 1 && "border-dashed border-slate-100/30")} />
            ))}

            {isSameDay(selectedDate, new Date()) && (
              <div className="absolute left-0 right-0 z-40 flex items-center pointer-events-none" style={{ top: `${((new Date().getHours() + new Date().getMinutes()/60) - 6) * 160}px` }}>
                <div className="h-3 w-3 rounded-full bg-rose-500 -ml-1.5 shadow-lg" />
                <div className="flex-1 h-[2px] bg-rose-500/60 shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
              </div>
            )}

            {dayBookings.map(booking => {
                const start = parseISO(booking.startAt);
                const end = parseISO(booking.endAt);
                const top = (start.getHours() + start.getMinutes()/60 - 6) * 160;
                const height = Math.max((end.getTime() - start.getTime()) / (1000 * 60 * 60) * 160, 60);
                const isPlaceholder = booking.isPlaceholder;
                const status = booking.status.toUpperCase();
                
                // Calculate width and left based on columns
                const { colIdx, totalCols } = booking as any;
                const width = 100 / totalCols;
                const left = colIdx * width;

                const getStatusStyles = () => {
                  if (isPlaceholder) return "bg-emerald-50/80 border-emerald-200 text-emerald-700";
                  switch (status) {
                    case 'APPROVED': return "bg-emerald-50/90 border-emerald-500 text-emerald-900";
                    case 'REQUESTED': case 'DECLINED': case 'BLOCKED': return "bg-rose-50/90 border-rose-500 text-rose-900";
                    case 'PENCILLED': case 'PENDING': return "bg-amber-50/90 border-amber-500 text-amber-900";
                    default: return "bg-slate-50 border-slate-200 text-slate-600";
                  }
                };

                const getBadgeColor = () => {
                  switch (status) {
                    case 'APPROVED': return "bg-emerald-500";
                    case 'REQUESTED': case 'DECLINED': case 'BLOCKED': return "bg-rose-500";
                    case 'PENCILLED': case 'PENDING': return "bg-amber-500";
                    default: return "bg-slate-400";
                  }
                };

                return (
                  <div 
                    key={booking.id} 
                    onClick={() => {
                      if (isPlaceholder && (user?.role === "CLIENT" || user?.role === "AGENT") && !canPlaceBookings) return;
                      if (isPlaceholder) {
                        setEditingBookingId(null);
                        setAddress("");
                        setSelectedDate(start);
                        const h = start.getHours();
                        const ampm = h >= 12 ? 'PM' : 'AM';
                        const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
                        setSelectedTime(`${h12}:00 ${ampm}`);
                        setIsBookingOpen(true);
                      } else {
                        handleEditBooking(booking);
                      }
                    }}
                    className={cn(
                      "absolute rounded-2xl p-3 shadow-sm transition-all border-l-[6px] backdrop-blur-sm group/card", 
                      getStatusStyles(),
                      isPlaceholder && !canPlaceBookings && "opacity-50 grayscale cursor-not-allowed"
                    )} 
                    style={{ 
                      top: `${top}px`, 
                      height: `${height}px`, 
                      left: `${left}%`, 
                      width: `${width}%`,
                      paddingRight: '8px',
                      zIndex: colIdx + 10
                    }}
                  >
                    <div className="flex items-start justify-between gap-1 overflow-hidden h-full">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", getBadgeColor())} />
                          <p className="text-[8px] font-black uppercase tracking-widest opacity-70 truncate">{isPlaceholder ? "Available Slot" : status}</p>
                        </div>
                        <h4 className="text-[11px] font-black uppercase leading-tight truncate">{isPlaceholder ? "OPEN FOR BOOKING" : booking.propertyName || booking.title}</h4>
                        
                        {height > 80 && booking.services.length > 0 && !isPlaceholder && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {booking.services.map((s, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-white/50 rounded-md text-[7px] font-bold uppercase tracking-wider border border-current/10">{s}</span>
                            ))}
                          </div>
                        )}

                        {height > 120 && (
                          <div className="mt-2 flex flex-col gap-1 text-[8px] font-bold opacity-60">
                            <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {format(start, "h:mm")} - {format(end, "h:mm a")}</span>
                            {!isPlaceholder && booking.propertyName && <span className="flex items-center gap-1 truncate"><MapPin className="h-2.5 w-2.5" /> {booking.propertyName}</span>}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {/* Edit Button */}
                        {!isPlaceholder && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditBooking(booking);
                            }}
                            className="h-7 w-7 rounded-full bg-white/50 hover:bg-white text-slate-600 flex items-center justify-center shadow-sm transition-all active:scale-90"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}

                        {/* Team Member Avatar */}
                        {!isPlaceholder && booking.teamMembers.length > 0 && (
                          <div className="flex -space-x-1.5">
                            {booking.teamMembers.map((tm, i) => (
                              <div key={i} className="h-6 w-6 rounded-full border-2 border-white bg-slate-100 overflow-hidden shadow-sm">
                                {tm.avatarUrl ? <img src={tm.avatarUrl} className="h-full w-full object-cover" alt={tm.name} /> : <div className="h-full w-full flex items-center justify-center text-[8px] font-bold">{tm.name[0]}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            }
          </div>
        </div>
      </div>

      {/* FAB and Drawer (Same as before) */}
      {canPlaceBookings && (
        <button 
          onClick={() => {
            setEditingBookingId(null);
            setAddress("");
            setSelectedServiceId("");
            setSelectedTeamMemberId("");
            setIsBookingOpen(true);
          }} 
          className="fixed bottom-24 right-6 h-16 w-16 rounded-full bg-primary text-white shadow-2xl shadow-primary/40 flex items-center justify-center z-50 transition-all active:scale-90"
        >
          <Plus className="h-8 w-8" />
        </button>
      )}
      <div className={cn("fixed inset-0 z-[100] transition-all duration-500", isBookingOpen ? "visible" : "invisible pointer-events-none")}>
        <div className={cn("absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-500", isBookingOpen ? "opacity-100" : "opacity-0")} onClick={() => setIsBookingOpen(false)} />
        <div className={cn("absolute bottom-0 left-0 right-0 bg-white rounded-t-[40px] shadow-2xl transition-transform duration-500 ease-out p-8 max-h-[90vh] overflow-y-auto custom-scrollbar", isBookingOpen ? "translate-y-0" : "translate-y-full")}>
          <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8" />
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-black text-slate-900">{editingBookingId ? "Edit Shoot" : "Request Shoot"}</h2>
              <p className="text-sm font-medium text-slate-400">{editingBookingId ? "Update your production details" : "Lock in your production date"}</p>
            </div>
            <button onClick={() => setIsBookingOpen(false)} className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400"><X className="h-5 w-5" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Selected Date</label><div className="w-full h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center px-4 font-bold text-slate-900">{format(selectedDate, "EEEE, MMMM do, yyyy")}</div></div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Primary Client</label>
              <div className="relative">
                <select 
                  required 
                  value={selectedClientId} 
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full h-14 rounded-2xl bg-slate-50 border border-slate-100 px-4 font-bold text-slate-900 focus:outline-none appearance-none pr-12"
                >
                  <option value="" disabled>Select a client...</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <ChevronDown className="h-5 w-5" />
                </div>
              </div>
            </div>

            <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Property Address</label><AddressAutocomplete value={address} onChange={(val) => setAddress(val)} placeholder="Search property address..." className="w-full h-14 rounded-2xl bg-slate-50 border border-slate-100 px-4 font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20" /></div>
            <div className="space-y-3"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Preferred Time</label><div className="flex overflow-x-auto scrollbar-hide gap-2 pb-2">{bookingSlots.map((slot) => (<button key={slot} type="button" onClick={() => setSelectedTime(slot)} className={cn("shrink-0 px-6 py-3 rounded-xl font-bold text-sm transition-all border", selectedTime === slot ? "bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105" : "bg-slate-50 border-slate-100 text-slate-600 hover:bg-white")}>{slot}</button>))}</div></div>
            <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Shoot Type</label><div className="relative"><select required value={selectedServiceId} onChange={(e) => setSelectedServiceId(e.target.value)} className="w-full h-14 rounded-2xl bg-slate-50 border border-slate-100 px-4 font-bold text-slate-900 focus:outline-none appearance-none pr-12"><option value="" disabled>Select a service...</option>{services.map((service) => (<option key={service.id} value={service.id}>{service.name} {(user?.role !== "CLIENT" && user?.role !== "AGENT") ? ` - $${service.price}` : ""}</option>))}</select><div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><ChevronDown className="h-5 w-5" /></div></div></div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Assign Team Member (Optional)</label>
              <div className="relative">
                <select 
                  value={selectedTeamMemberId} 
                  onChange={(e) => setSelectedTeamMemberId(e.target.value)}
                  className="w-full h-14 rounded-2xl bg-slate-50 border border-slate-100 px-4 font-bold text-slate-900 focus:outline-none appearance-none pr-12"
                >
                  <option value="">No team assigned</option>
                  {teamMembers.map((tm) => (
                    <option key={tm.id} value={tm.id}>{tm.name}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <ChevronDown className="h-5 w-5" />
                </div>
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} className={cn("w-full h-16 bg-primary text-white rounded-[24px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 mt-4 active:scale-95 transition-all flex items-center justify-center gap-3", isSubmitting && "opacity-80 scale-95")}>{isSubmitting ? (<><Loader2 className="h-5 w-5 animate-spin" />Processing...</>) : ("Submit Request")}</button>
          </form>
          <div className="h-8" />
        </div>
      </div>
    </div>
  );
}
