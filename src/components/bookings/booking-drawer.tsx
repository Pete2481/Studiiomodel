"use client";

import React, { useState, useEffect } from "react";
import { X, ChevronDown, Search, Check, User, Camera, Zap, Video, FileText, Wrench, Sun, Box, Edit3, Plane, Trash2, Plus, Sunrise, Sunset, Loader2 } from "lucide-react";
import { cn, getWeatherIcon } from "@/lib/utils";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { format, addHours, parse, startOfDay, addMinutes, subMinutes } from "date-fns";
import { updateTenantBookingStatuses } from "@/app/actions/tenant-settings";
import { getWeatherData } from "@/app/actions/weather";
import { QuickClientModal } from "../modules/clients/quick-client-modal";
import { QuickServiceModal } from "../modules/services/quick-service-modal";
import { QuickAgentModal } from "../modules/agents/quick-agent-modal";
import { Hint } from "@/components/ui";

interface BookingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  booking?: any; 
  clients: any[];
  services: any[];
  teamMembers: any[];
  agents: any[];
  onSave: (data: any) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  role?: string;
  currentClientId?: string;
  customStatuses?: string[];
}

export function BookingDrawer({ 
  isOpen, 
  onClose, 
  booking, 
  clients, 
  services, 
  teamMembers,
  agents,
  onSave,
  onDelete,
  role = "TENANT_ADMIN",
  currentClientId,
  customStatuses = []
}: BookingDrawerProps) {
  const isClient = role === "CLIENT";

  const [formData, setFormData] = useState({
    title: "",
    clientId: currentClientId || "",
    address: "",
    date: format(new Date(), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "17:00",
    duration: isClient ? "1.5" : "1",
    status: isClient ? "requested" : "confirmed",
    serviceIds: [] as string[],
    teamMemberIds: [] as string[],
    agentId: "",
    notes: "",
    propertyStatus: "",
  });

  const isBlockedType = formData.status === "blocked";

  // Filter services based on client visibility
  const visibleServices = React.useMemo(() => {
    if (!isClient) return services;
    return services.filter(s => s.clientVisible !== false);
  }, [services, isClient]);

  const [statuses, setStatuses] = useState<string[]>(customStatuses);
  const [newStatusName, setNewStatusName] = useState("");
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

  useEffect(() => {
    setStatuses(customStatuses);
  }, [customStatuses]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const [agentSearchQuery, setAgentSearchQuery] = useState("");
  const [weatherInfo, setWeatherInfo] = useState<any>(null);

  const [isQuickClientOpen, setIsQuickClientOpen] = useState(false);
  const [isQuickServiceOpen, setIsQuickServiceOpen] = useState(false);
  const [isQuickAgentOpen, setIsQuickAgentOpen] = useState(false);
  const [localClients, setLocalClients] = useState(clients);
  const [localServices, setLocalServices] = useState(services);
  const [localAgents, setLocalAgents] = useState(agents);

  useEffect(() => {
    setLocalClients(clients);
  }, [clients]);

  useEffect(() => {
    setLocalServices(services);
  }, [services]);

  useEffect(() => {
    setLocalAgents(agents);
  }, [agents]);

  // Derive slotType from selected services
  const derivedSlotType = React.useMemo(() => {
    const selectedServices = services.filter(s => formData.serviceIds.includes(s.id));
    const sunriseService = selectedServices.find(s => s.slotType === "SUNRISE");
    if (sunriseService) return "SUNRISE";
    const duskService = selectedServices.find(s => s.slotType === "DUSK");
    if (duskService) return "DUSK";
    return null;
  }, [formData.serviceIds, services]);

  // Fetch weather when date changes
  useEffect(() => {
    async function fetchWeather() {
      if (!formData.date) return;
      const res = await getWeatherData(-28.8333, 153.4333, formData.date, formData.date);
      if (res.success && res.daily) {
        setWeatherInfo({
          icon: getWeatherIcon(res.daily.weather_code[0]),
          sunrise: format(new Date(res.daily.sunrise[0]), "h:mm a"),
          sunset: format(new Date(res.daily.sunset[0]), "h:mm a"),
          rawSunrise: res.daily.sunrise[0],
          rawSunset: res.daily.sunset[0]
        });
      }
    }
    fetchWeather();
  }, [formData.date]);

  const IconMap: Record<string, any> = {
    CAMERA: Camera,
    DRONE: Plane,
    VIDEO: Video,
    FILETEXT: FileText,
    SERVICE: Wrench,
    SUNSET: Sun,
    PACKAGE: Box,
    "EDIT PEN": Edit3,
    PERSON: User,
    Zap: Zap // Fallback for old data
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (booking && booking.id && !booking.isPlaceholder) {
      let status = booking.status?.toLowerCase() || "confirmed";
      if (status === "approved") status = "confirmed";
      if (status === "penciled") status = "pencilled";

      const start = new Date(booking.startAt);
      const end = new Date(booking.endAt);
      const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

      setFormData({
        title: booking.title || "",
        clientId: booking.clientId || "",
        address: booking.property?.name || "",
        date: format(start, "yyyy-MM-dd"),
        endDate: format(end, "yyyy-MM-dd"),
        startTime: format(start, "HH:mm"),
        endTime: format(end, "HH:mm"),
        duration: String(diffHours > 0 ? diffHours : "1"), 
        status: status,
        serviceIds: booking.services?.map((s: any) => s.serviceId) || [],
        teamMemberIds: booking.assignments?.map((a: any) => a.teamMemberId) || [],
        agentId: booking.agentId || "",
        notes: booking.internalNotes || "",
        propertyStatus: booking.propertyStatus || "",
      });
    } else if (booking && (booking.startAt || booking.isPlaceholder)) {
      const autoSelectedServiceIds = booking.isPlaceholder 
        ? services.filter(s => s.slotType === booking.slotType).map(s => s.id)
        : [];

      const start = new Date(booking.startAt);
      const end = booking.endAt ? new Date(booking.endAt) : null;
      const diffHours = end ? (end.getTime() - start.getTime()) / (1000 * 60 * 60) : 1;

      setFormData(prev => ({
        ...prev,
        title: booking.isPlaceholder ? `${booking.slotType} SHOOT` : (booking.title || ""),
        clientId: currentClientId || "",
        address: "",
        date: format(start, "yyyy-MM-dd"),
        endDate: format(end || start, "yyyy-MM-dd"),
        startTime: format(start, "HH:mm"),
        endTime: end ? format(end, "HH:mm") : format(addHours(start, 1), "HH:mm"),
        duration: String(diffHours > 0 ? diffHours : "1"),
        status: booking.status || "confirmed",
        serviceIds: autoSelectedServiceIds.length > 0 ? autoSelectedServiceIds : (booking.serviceIds || []),
        teamMemberIds: [],
        agentId: "",
        notes: "",
        propertyStatus: "",
      }));
    } else {
      // Reset form
      setFormData({
        title: "",
        clientId: currentClientId || "",
        address: "",
        date: format(new Date(), "yyyy-MM-dd"),
        endDate: format(new Date(), "yyyy-MM-dd"),
        startTime: "09:00",
        endTime: "10:00",
        duration: isClient ? "1.5" : "1",
        status: isClient ? "requested" : "confirmed",
        serviceIds: [] as string[],
        teamMemberIds: [] as string[],
        agentId: "",
        notes: "",
        propertyStatus: "",
      });
    }
  }, [booking, currentClientId, isClient]);

  if (!mounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    let startDateTime = parse(`${formData.date} ${formData.startTime}`, "yyyy-MM-dd HH:mm", new Date());
    let endDateTime = isBlockedType 
      ? parse(`${formData.endDate} ${formData.endTime}`, "yyyy-MM-dd HH:mm", new Date())
      : addHours(startDateTime, parseFloat(formData.duration));

    // Force 60 min centering for Sunrise/Dusk
    if (derivedSlotType && weatherInfo) {
      const rawMidpoint = derivedSlotType === "SUNRISE" ? weatherInfo.rawSunrise : weatherInfo.rawSunset;
      if (rawMidpoint) {
        const midpoint = new Date(rawMidpoint);
        startDateTime = subMinutes(midpoint, 30);
        endDateTime = addMinutes(midpoint, 30);
      }
    }

    try {
      let finalStatus = formData.status.toUpperCase();
      if (finalStatus === "CONFIRMED") finalStatus = "APPROVED";

      await onSave({
        ...formData,
        startAt: startDateTime.toISOString(),
        endAt: endDateTime.toISOString(),
        status: finalStatus,
        slotType: derivedSlotType // Pass the slot type to server action
      });
      onClose();
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddStatus = async () => {
    if (!newStatusName.trim()) return;
    const updatedStatuses = [...statuses, newStatusName.trim()];
    setStatuses(updatedStatuses);
    setNewStatusName("");
    await updateTenantBookingStatuses(updatedStatuses);
  };

  const handleDeleteStatus = async (statusToDelete: string) => {
    const updatedStatuses = statuses.filter(s => s !== statusToDelete);
    setStatuses(updatedStatuses);
    if (formData.propertyStatus === statusToDelete) {
      setFormData(prev => ({ ...prev, propertyStatus: "" }));
    }
    await updateTenantBookingStatuses(updatedStatuses);
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px] transition-all duration-500 ease-in-out",
          isOpen ? "opacity-100 visible" : "opacity-0 pointer-events-none invisible"
        )}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className={cn(
        "fixed inset-y-0 right-0 z-[101] w-full max-w-[540px] bg-white shadow-2xl flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <LoadingOverlay isVisible={isSubmitting} message={booking?.id ? "Updating shoot..." : "Creating shoot..."} />
        
        {/* Header */}
        <div className="px-10 py-8 flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
              {isBlockedType ? (booking?.id ? "UPDATE BLOCK" : "BLOCK TIME") : (booking?.id ? "UPDATE BOOKING" : "CREATE BOOKING")}
            </p>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {isBlockedType ? (booking?.id ? "Edit time block" : "Block studio time") : (booking?.id ? "Edit this shoot" : "Plan a new shoot")}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto px-10 pb-10 space-y-8 custom-scrollbar">
          <form id="booking-form" onSubmit={handleSubmit} className="space-y-8">
            
            {/* Address (At the top for everyone, but crucial for clients) */}
            {!isBlockedType && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Property Address</label>
                <Hint 
                  title="Shoot Location" 
                  content="Enter the address of the property. We'll use this for mapping and weather forecasting."
                >
                  <AddressAutocomplete 
                    value={formData.address}
                    onChange={(newAddress) => {
                      // Auto-fill title if it hasn't been manually touched or is empty
                      setFormData(prev => ({
                        ...prev, 
                        address: newAddress,
                        title: prev.title === prev.address || prev.title === "" ? newAddress : prev.title
                      }));
                    }}
                    placeholder="45 Jarra Rd, Clunes" 
                    className="ui-input-tight" 
                  />
                </Hint>
              </div>
            )}

            {/* Title */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {isBlockedType ? "Block Out Name" : "Booking Title"}
              </label>
              <input 
                required
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                type="text" 
                placeholder={isBlockedType ? "e.g. Studio Maintenance" : "Enter name..."}
                className="ui-input-tight font-bold" 
              />
            </div>

            {/* Status & Client (Conditional Rendering) */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                <div className="relative">
                  {isClient ? (
                    <div className="h-12 px-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex items-center">
                      <span className="text-sm font-bold text-rose-500 uppercase tracking-widest">Requested</span>
                    </div>
                  ) : (
                    <>
                      <select 
                        value={formData.status}
                        onChange={(e) => setFormData({...formData, status: e.target.value})}
                        className={cn(
                          "ui-input-tight appearance-none bg-white pr-10",
                          isBlockedType && "border-rose-500 bg-rose-50 text-rose-700"
                        )}
                      >
                        <option value="requested">Requested</option>
                        <option value="confirmed">Approved</option>
                        <option value="pencilled">Pending / Pencilled</option>
                        <option value="declined">Declined</option>
                        <option value="blocked">Time Block Out (Unavailable for Clients)</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </>
                  )}
                </div>
              </div>

              {!isClient && !isBlockedType && (
                <div className="space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Agency</label>
                    <button 
                      type="button"
                      onClick={() => setIsQuickClientOpen(true)}
                      className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                    >
                      + Express Add
                    </button>
                  </div>
                  
                  {/* Selected Client Display */}
                  <Hint 
                    title="Agency Selection" 
                    content="Link this booking to a client agency. Use '+ Express Add' if they don't exist yet."
                  >
                    <div 
                      onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                      className={cn(
                        "h-12 px-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between bg-white",
                        isClientDropdownOpen ? "border-emerald-500 ring-2 ring-emerald-500/10" : "border-slate-100 hover:border-slate-200"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {formData.clientId ? (
                          (() => {
                            const client = localClients.find(c => c.id === formData.clientId);
                            return (
                              <>
                                <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 overflow-hidden">
                                  {client?.avatarUrl ? (
                                    <img src={client.avatarUrl} className="h-full w-full object-cover" alt={client.businessName || client.name} />
                                  ) : (
                                    <User className="h-3.5 w-3.5" />
                                  )}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm font-bold text-slate-900 truncate">
                                    {client?.businessName || client?.name || "Select agency..."}
                                  </span>
                                  {client?.businessName && (
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                      {client.name}
                                    </span>
                                  )}
                                </div>
                              </>
                            );
                          })()
                        ) : (
                          <span className="text-sm text-slate-400">Select agency...</span>
                        )}
                      </div>
                      <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform duration-300", isClientDropdownOpen && "rotate-180")} />
                    </div>
                  </Hint>

                  {/* Client Dropdown Menu */}
                  {isClientDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setIsClientDropdownOpen(false)} 
                      />
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl shadow-slate-200/50 z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-2 border-b border-slate-50">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input 
                              type="text"
                              autoFocus
                              placeholder="Search agencies..."
                              value={clientSearchQuery}
                              onChange={(e) => setClientSearchQuery(e.target.value)}
                              className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs focus:ring-0 placeholder:text-slate-400"
                            />
                          </div>
                        </div>
                        <div className="max-h-[240px] overflow-y-auto custom-scrollbar py-1">
                          {localClients
                            .filter(c => 
                              c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) || 
                              (c.businessName && c.businessName.toLowerCase().includes(clientSearchQuery.toLowerCase()))
                            )
                            .map(c => {
                              const isSelected = formData.clientId === c.id;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setFormData({ ...formData, clientId: c.id, agentId: "" });
                                    setIsClientDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors group",
                                    isSelected ? "bg-primary/10/50" : "hover:bg-slate-50"
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0 shadow-inner overflow-hidden">
                                    {c.avatarUrl ? (
                                      <img src={c.avatarUrl} className="h-full w-full object-cover" alt={c.businessName || c.name} />
                                    ) : (
                                      <User className="h-4 w-4" />
                                    )}
                                  </div>
                                    <div className="min-w-0">
                                      <p className={cn(
                                        "text-sm font-bold truncate transition-colors",
                                        isSelected ? "text-primary" : "text-slate-700 group-hover:text-slate-900"
                                      )}>
                                        {c.businessName || c.name}
                                      </p>
                                      {c.businessName && (
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                          {c.name}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  {isSelected && (
                                    <Check className="h-4 w-4 text-primary animate-in zoom-in duration-200" />
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Lead Agent (Conditional on Agency selection) */}
            {(formData.clientId || isClient) && !isBlockedType && (
              <div className="space-y-2 relative animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lead Agent</label>
                  {!isClient && (
                    <button 
                      type="button"
                      onClick={() => setIsQuickAgentOpen(true)}
                      className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                    >
                      + Express Add
                    </button>
                  )}
                </div>
                
                {/* Selected Agent Display */}
                <div 
                  onClick={() => setIsAgentDropdownOpen(!isAgentDropdownOpen)}
                  className={cn(
                    "h-12 px-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between bg-white",
                    isAgentDropdownOpen ? "border-emerald-500 ring-2 ring-emerald-500/10" : "border-slate-100 hover:border-slate-200"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {formData.agentId ? (
                      (() => {
                        const agent = localAgents.find(a => a.id === formData.agentId);
                        return (
                          <>
                            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 overflow-hidden">
                              {agent?.avatarUrl ? (
                                <img src={agent.avatarUrl} className="h-full w-full object-cover" alt={agent.name} />
                              ) : (
                                <User className="h-3.5 w-3.5" />
                              )}
                            </div>
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {agent?.name || "Select agent..."}
                            </span>
                          </>
                        );
                      })()
                    ) : (
                      <span className="text-sm text-slate-400 italic">Select lead agent (Optional)</span>
                    )}
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform duration-300", isAgentDropdownOpen && "rotate-180")} />
                </div>

                {/* Agent Dropdown Menu */}
                {isAgentDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsAgentDropdownOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-2 border-b border-slate-50">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <input 
                            type="text"
                            autoFocus
                            placeholder="Search agents..."
                            value={agentSearchQuery}
                            onChange={(e) => setAgentSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs focus:ring-0 placeholder:text-slate-400"
                          />
                        </div>
                      </div>
                      <div className="max-h-[200px] overflow-y-auto custom-scrollbar py-1">
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, agentId: "" });
                            setIsAgentDropdownOpen(false);
                          }}
                          className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-400 hover:bg-slate-50 italic"
                        >
                          No lead agent
                        </button>
                        {localAgents
                          .filter(a => (isClient ? a.clientId === currentClientId : a.clientId === formData.clientId))
                          .filter(a => a.name.toLowerCase().includes(agentSearchQuery.toLowerCase()))
                          .map(a => {
                            const isSelected = formData.agentId === a.id;
                            return (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => {
                                  setFormData({ ...formData, agentId: a.id });
                                  setIsAgentDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors group",
                                  isSelected ? "bg-primary/10/50" : "hover:bg-slate-50"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                                    {a.avatarUrl ? (
                                      <img src={a.avatarUrl} className="h-full w-full object-cover" alt={a.name} />
                                    ) : (
                                      <User className="h-4 w-4" />
                                    )}
                                  </div>
                                  <p className={cn("text-sm font-bold truncate transition-colors", isSelected ? "text-primary" : "text-slate-700")}>
                                    {a.name}
                                  </p>
                                </div>
                                {isSelected && <Check className="h-4 w-4 text-primary" />}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Services */}
            {!isBlockedType && (
              <div className="space-y-3 relative">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Services</label>
                  <button 
                    type="button"
                    onClick={() => setIsQuickServiceOpen(true)}
                    className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                  >
                    + Express Add
                  </button>
                </div>
                
                {/* Selected Services Display */}
                <Hint 
                  title="Production Services" 
                  content="Choose the media services for this booking. Duration will auto-calculate based on your selection."
                >
                  <div 
                    onClick={() => setIsServiceDropdownOpen(!isServiceDropdownOpen)}
                    className={cn(
                      "min-h-[52px] p-2 rounded-2xl border transition-all cursor-pointer flex flex-wrap gap-2 items-center bg-white",
                      isServiceDropdownOpen ? "border-emerald-500 ring-2 ring-emerald-500/10" : "border-slate-100 hover:border-slate-200"
                    )}
                  >
                    {formData.serviceIds.length > 0 ? (
                      localServices.filter(s => formData.serviceIds.includes(s.id)).map(s => (
                        <div 
                          key={s.id} 
                          className="flex items-center gap-2 pl-2 pr-3 py-1 bg-primary/10 text-emerald-700 rounded-full border border-primary/20 transition-all animate-in zoom-in duration-200"
                        >
                          <div className="h-5 w-5 flex items-center justify-center text-primary shrink-0">
                            {(() => {
                              const Icon = IconMap[s.icon?.toUpperCase() || "CAMERA"] || Camera;
                              return <Icon className="h-3.5 w-3.5" />;
                            })()}
                          </div>
                          <span className="text-[11px] font-bold whitespace-nowrap uppercase tracking-tighter">{s.name}</span>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormData({ 
                                ...formData, 
                                serviceIds: formData.serviceIds.filter(id => id !== s.id) 
                              });
                            }}
                            className="p-0.5 hover:bg-emerald-100 rounded-full transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-between w-full px-3">
                        <span className="text-sm text-slate-400 italic">No services selected yet.</span>
                        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform duration-300", isServiceDropdownOpen && "rotate-180")} />
                      </div>
                    )}
                  </div>
                </Hint>

                {/* Service Dropdown Menu */}
                {isServiceDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsServiceDropdownOpen(false)} 
                    />
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl shadow-slate-200/50 z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-2 border-b border-slate-50">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <input 
                            type="text"
                            autoFocus
                            placeholder="Search catalogue..."
                            value={serviceSearchQuery}
                            onChange={(e) => setServiceSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs focus:ring-0 placeholder:text-slate-400"
                          />
                        </div>
                      </div>
                      <div className="max-h-[240px] overflow-y-auto custom-scrollbar py-1">
                        {visibleServices
                          .filter(s => s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase()))
                          .sort((a, b) => {
                            if (booking?.slotType) {
                              const aMatch = a.slotType === booking.slotType;
                              const bMatch = b.slotType === booking.slotType;
                              if (aMatch && !bMatch) return -1;
                              if (!aMatch && bMatch) return 1;
                            }
                            return 0;
                          })
                          .map(s => {
                            const isSelected = formData.serviceIds.includes(s.id);
                            const Icon = IconMap[s.icon?.toUpperCase() || "CAMERA"] || Camera;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  const ids = isSelected
                                    ? formData.serviceIds.filter(id => id !== s.id)
                                    : [...formData.serviceIds, s.id];
                                  setFormData({ ...formData, serviceIds: ids });
                                }}
                                className={cn(
                                  "w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors group",
                                  isSelected ? "bg-primary/10/50" : "hover:bg-slate-50"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0 shadow-inner">
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className={cn(
                                      "text-sm font-bold truncate transition-colors",
                                      isSelected ? "text-primary" : "text-slate-700 group-hover:text-slate-900"
                                    )}>
                                      {s.name}
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                      ${Number(s.price).toFixed(2)} • {s.durationMinutes || 60}m
                                    </p>
                                  </div>
                                </div>
                                {isSelected && (
                                  <Check className="h-4 w-4 text-primary animate-in zoom-in duration-200" />
                                )}
                              </button>
                            );
                          })}
                        {visibleServices.filter(s => s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase())).length === 0 && (
                          <div className="px-4 py-8 text-center">
                            <p className="text-xs font-medium text-slate-400">No services found</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
                <p className="text-[10px] font-medium text-slate-400 italic">Select services to copy into the booking workflow.</p>
              </div>
            )}

            {/* Assigned Team */}
            {!isBlockedType && (
              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Assigned Team</label>
                
                {isClient ? (
                  <div className="h-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 flex items-center gap-3">
                    <div className="h-6 w-6 rounded-lg bg-white border border-slate-100 flex items-center justify-center">
                      <User className="h-3 w-3 text-slate-300" />
                    </div>
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Assigned by Admin</span>
                  </div>
                ) : (
                  <div className="space-y-3 relative">
                    {/* Selected Members Display */}
                    <div 
                      onClick={() => setIsTeamDropdownOpen(!isTeamDropdownOpen)}
                      className={cn(
                        "min-h-[52px] p-2 rounded-2xl border transition-all cursor-pointer flex flex-wrap gap-2 items-center bg-white",
                        isTeamDropdownOpen ? "border-emerald-500 ring-2 ring-emerald-500/10" : "border-slate-100 hover:border-slate-200"
                      )}
                    >
                      {formData.teamMemberIds.length > 0 ? (
                        teamMembers.filter(m => formData.teamMemberIds.includes(m.id)).map(m => (
                          <div 
                            key={m.id} 
                            className="flex items-center gap-2 pl-1 pr-3 py-1 bg-slate-900 text-white rounded-full transition-all animate-in zoom-in duration-200"
                          >
                            <div className="h-6 w-6 rounded-full bg-slate-700 overflow-hidden shrink-0 border border-slate-800">
                              {m.avatarUrl ? (
                                <img src={m.avatarUrl} className="h-full w-full object-cover" alt={m.displayName} />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center bg-slate-800 text-[10px] font-bold">
                                  {m.displayName?.[0]}
                                </div>
                              )}
                            </div>
                            <span className="text-[11px] font-bold whitespace-nowrap">{m.displayName}</span>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFormData({ 
                                  ...formData, 
                                  teamMemberIds: formData.teamMemberIds.filter(id => id !== m.id) 
                                });
                              }}
                              className="p-0.5 hover:bg-white/20 rounded-full transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center justify-between w-full px-3">
                          <span className="text-sm text-slate-400">Select team members...</span>
                          <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform duration-300", isTeamDropdownOpen && "rotate-180")} />
                        </div>
                      )}
                    </div>

                    {/* Dropdown Menu */}
                    {isTeamDropdownOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setIsTeamDropdownOpen(false)} 
                        />
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl shadow-slate-200/50 z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="p-2 border-b border-slate-50">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                              <input 
                                type="text"
                                autoFocus
                                placeholder="Search crew..."
                                value={teamSearchQuery}
                                onChange={(e) => setTeamSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs focus:ring-0 placeholder:text-slate-400"
                              />
                            </div>
                          </div>
                          <div className="max-h-[240px] overflow-y-auto custom-scrollbar py-1">
                            {teamMembers
                              .filter(m => m.displayName.toLowerCase().includes(teamSearchQuery.toLowerCase()))
                              .map(m => {
                                const isSelected = formData.teamMemberIds.includes(m.id);
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => {
                                      const ids = isSelected
                                        ? formData.teamMemberIds.filter(id => id !== m.id)
                                        : [...formData.teamMemberIds, m.id];
                                      setFormData({ ...formData, teamMemberIds: ids });
                                    }}
                                    className={cn(
                                      "w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors group",
                                      isSelected ? "bg-primary/10/50" : "hover:bg-slate-50"
                                    )}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="h-8 w-8 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-white shadow-sm transition-transform group-hover:scale-105">
                                        {m.avatarUrl ? (
                                          <img src={m.avatarUrl} className="h-full w-full object-cover" alt={m.displayName} />
                                        ) : (
                                          <div className="h-full w-full flex items-center justify-center text-slate-400">
                                            <User className="h-4 w-4" />
                                          </div>
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <p className={cn(
                                          "text-sm font-bold truncate transition-colors",
                                          isSelected ? "text-primary" : "text-slate-700 group-hover:text-slate-900"
                                        )}>
                                          {m.displayName}
                                        </p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                          {m.role || "PHOTOGRAPHER"}
                                        </p>
                                      </div>
                                    </div>
                                    {isSelected && (
                                      <Check className="h-4 w-4 text-primary animate-in zoom-in duration-200" />
                                    )}
                                  </button>
                                );
                              })}
                            {teamMembers.filter(m => m.displayName.toLowerCase().includes(teamSearchQuery.toLowerCase())).length === 0 && (
                              <div className="px-4 py-8 text-center">
                                <p className="text-xs font-medium text-slate-400">No crew members found</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Start Date & Time */}
            <div className={cn(
              "space-y-4 p-6 rounded-3xl border animate-in fade-in duration-500",
              isBlockedType ? "bg-rose-50/50 border-rose-100" : "bg-slate-50/50 border-slate-100"
            )}>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className={cn(
                    "text-[10px] font-bold uppercase tracking-widest",
                    isBlockedType ? "text-rose-500" : "text-primary"
                  )}>
                    {isBlockedType ? "Date From" : "Start Date"}
                  </label>
                  <input 
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    type="date" 
                    className="ui-input-tight" 
                  />
                </div>
                {isBlockedType ? (
                  <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                    <label className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Date To</label>
                    <input 
                      required
                      value={formData.endDate}
                      onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                      type="date" 
                      className="ui-input-tight" 
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Start Time
                    </label>
                    <div className="relative">
                      <select 
                        value={formData.startTime}
                        onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                        className="ui-input-tight appearance-none bg-white pr-10"
                      >
                        {Array.from({ length: 24 }).map((_, i) => {
                          const h = i === 0 ? 12 : i > 12 ? i - 12 : i;
                          const ampm = i >= 12 ? "PM" : "AM";
                          const val = i.toString().padStart(2, '0');
                          return (
                            <React.Fragment key={i}>
                              <option value={`${val}:00`}>{h}:00{ampm}</option>
                              <option value={`${val}:30`}>{h}:30{ampm}</option>
                            </React.Fragment>
                          );
                        })}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>

              {isBlockedType && (
                <div className="grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300 pt-2 border-t border-rose-100/50">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time From</label>
                    <div className="relative">
                      <select 
                        value={formData.startTime}
                        onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                        className="ui-input-tight appearance-none bg-white pr-10 border-rose-100"
                      >
                        {Array.from({ length: 24 }).map((_, i) => {
                          const h = i === 0 ? 12 : i > 12 ? i - 12 : i;
                          const ampm = i >= 12 ? "PM" : "AM";
                          const val = i.toString().padStart(2, '0');
                          return (
                            <React.Fragment key={i}>
                              <option value={`${val}:00`}>{h}:00{ampm}</option>
                              <option value={`${val}:30`}>{h}:30{ampm}</option>
                            </React.Fragment>
                          );
                        })}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time To</label>
                    <div className="relative">
                      <select 
                        value={formData.endTime}
                        onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                        className="ui-input-tight appearance-none bg-white pr-10 border-rose-100"
                      >
                        {Array.from({ length: 24 }).map((_, i) => {
                          const h = i === 0 ? 12 : i > 12 ? i - 12 : i;
                          const ampm = i >= 12 ? "PM" : "AM";
                          const val = i.toString().padStart(2, '0');
                          return (
                            <React.Fragment key={i}>
                              <option value={`${val}:00`}>{h}:00{ampm}</option>
                              <option value={`${val}:30`}>{h}:30{ampm}</option>
                            </React.Fragment>
                          );
                        })}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              )}

              {/* Weather Forecast Overlay */}
              {!isBlockedType && weatherInfo && (
                <div className="flex items-center justify-between px-2 pt-2 animate-in fade-in slide-in-from-top-1 duration-500">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-xl border border-slate-100/50">
                      {weatherInfo.icon}
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Forecasted Conditions</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Local area weather for this day</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5 justify-end">
                        <Sunrise className="h-3 w-3" /> {weatherInfo.sunrise}
                      </p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">Sunrise</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-purple-500 uppercase tracking-widest flex items-center gap-1.5 justify-end">
                        <Sunset className="h-3 w-3" /> {weatherInfo.sunset}
                      </p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">Sunset</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Duration & Ends At */}
            {!isBlockedType && (
              <div className="grid grid-cols-2 gap-6 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Duration
                  </label>
                  <div className="relative">
                    <select 
                      value={formData.duration}
                      onChange={(e) => setFormData({...formData, duration: e.target.value})}
                      className="ui-input-tight appearance-none bg-white pr-10"
                    >
                      <option value="0.5">30 mins</option>
                      <option value="1">1 hr</option>
                      <option value="1.5">{isClient ? "Select duration (default 1.5 hrs)" : "1.5 hrs"}</option>
                      <option value="2">2 hrs</option>
                      <option value="3">3 hrs</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ends At</label>
                  <div className="h-12 flex items-center px-5 text-[11px] font-medium text-slate-400 italic bg-slate-50/30 rounded-2xl border border-slate-50">
                    {(() => {
                      try {
                        const start = parse(`${formData.date} ${formData.startTime}`, "yyyy-MM-dd HH:mm", new Date());
                        const end = addHours(start, parseFloat(formData.duration));
                        return format(end, "h:mm a");
                      } catch (e) {
                        return "Select duration to calculate end time";
                      }
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {isBlockedType ? "Private Note" : "Notes"}
              </label>
              <textarea 
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder={isBlockedType ? "Internal reason for block out..." : "Special access notes, arrival instructions, etc."}
                className="ui-input-tight h-32 py-4 resize-none" 
              />
            </div>

            {/* Property Access Status */}
            {!isBlockedType && (
              <div className="space-y-3 relative">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Access Status</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div 
                      onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                      className={cn(
                        "h-12 px-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between bg-white",
                        isStatusDropdownOpen ? "border-emerald-500 ring-2 ring-emerald-500/10" : "border-slate-100 hover:border-slate-200"
                      )}
                    >
                      <span className={cn("text-sm font-bold", formData.propertyStatus ? "text-slate-900" : "text-slate-400")}>
                        {formData.propertyStatus || "Select status..."}
                      </span>
                      <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform duration-300", isStatusDropdownOpen && "rotate-180")} />
                    </div>

                    {isStatusDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsStatusDropdownOpen(false)} />
                        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                          <div className="max-h-[240px] overflow-y-auto custom-scrollbar py-2">
                            {statuses.map((s, idx) => (
                              <div key={idx} className="flex items-center group px-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData({ ...formData, propertyStatus: s });
                                    setIsStatusDropdownOpen(false);
                                  }}
                                  className={cn(
                                    "flex-1 flex items-center justify-between px-3 py-2.5 text-left rounded-xl transition-colors",
                                    formData.propertyStatus === s ? "bg-primary/10 text-primary" : "hover:bg-slate-50 text-slate-700"
                                  )}
                                >
                                  <span className="text-sm font-bold">{s}</span>
                                  {formData.propertyStatus === s && <Check className="h-4 w-4" />}
                                </button>
                                {!isClient && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteStatus(s);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                            {statuses.length === 0 && (
                              <div className="px-4 py-8 text-center text-slate-400 text-xs italic">
                                No statuses defined
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {!isClient && (
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="Add new..."
                        value={newStatusName}
                        onChange={(e) => setNewStatusName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddStatus())}
                        className="w-32 h-12 px-4 rounded-2xl border border-slate-100 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={handleAddStatus}
                        className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-all active:scale-95 shadow-sm border border-primary/10"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="px-10 py-8 border-t border-slate-100 flex items-center justify-between gap-6 bg-slate-50/50">
          <div className="flex items-center gap-4">
            {booking?.id && !isClient && (
              <button 
                type="button"
                onClick={async () => {
                  if (confirm("Are you sure you want to remove this booking?")) {
                    setIsSubmitting(true);
                    try {
                      await onDelete?.(booking.id);
                      onClose();
                    } finally {
                      setIsSubmitting(false);
                    }
                  }
                }}
                disabled={isSubmitting}
                className="text-[10px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-700 transition-colors border-b-2 border-rose-200 hover:border-rose-500 pb-0.5"
              >
                REMOVE BOOKING
              </button>
            )}
          </div>

          <div className="flex items-center gap-6">
            <button 
              onClick={onClose}
              className="text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              form="booking-form"
              disabled={isSubmitting}
              className="h-12 px-8 rounded-full bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                booking?.id ? (isBlockedType ? "Update block" : "Update booking") : (isBlockedType ? "Create block out" : "Create booking")
              )}
            </button>
          </div>
        </div>
      </div>

      <QuickClientModal 
        isOpen={isQuickClientOpen}
        onClose={() => setIsQuickClientOpen(false)}
        onSuccess={(newClient) => {
          setLocalClients([newClient, ...localClients]);
          setFormData({ ...formData, clientId: newClient.id });
        }}
      />

      <QuickServiceModal
        isOpen={isQuickServiceOpen}
        onClose={() => setIsQuickServiceOpen(false)}
        onSuccess={(newService) => {
          setLocalServices([newService, ...localServices]);
          setFormData({ ...formData, serviceIds: [...formData.serviceIds, newService.id] });
        }}
      />

      <QuickAgentModal
        isOpen={isQuickAgentOpen}
        onClose={() => setIsQuickAgentOpen(false)}
        clientId={isClient ? currentClientId! : formData.clientId}
        clientName={localClients.find(c => c.id === (isClient ? currentClientId : formData.clientId))?.businessName || localClients.find(c => c.id === (isClient ? currentClientId : formData.clientId))?.name}
        onSuccess={(newAgent) => {
          setLocalAgents([newAgent, ...localAgents]);
          setFormData({ ...formData, agentId: newAgent.id });
        }}
      />
    </>
  );
}
