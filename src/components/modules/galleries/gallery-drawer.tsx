"use client";

import React, { useState, useEffect } from "react";
import { 
  X, 
  Camera, 
  Trash2, 
  Check, 
  Plus, 
  Folder, 
  Video, 
  Lock, 
  Unlock,
  Type,
  Link as LinkIcon,
  ChevronRight,
  Loader2,
  Image as ImageIcon,
  AlertCircle,
  Info,
  ChevronDown,
  Search,
  User,
  Bell,
  Zap,
  FileText,
  Wrench,
  Sun,
  Box,
  Edit3,
  Plane
} from "lucide-react";
import { cn } from "@/lib/utils";
import { browseDropboxFolders } from "@/app/actions/dropbox";
import { upsertGallery } from "@/app/actions/gallery";
import { QuickClientModal } from "../clients/quick-client-modal";
import { QuickServiceModal } from "../services/quick-service-modal";
import { QuickAgentModal } from "../agents/quick-agent-modal";
import { Hint } from "@/components/ui";

interface GalleryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  clients: any[];
  bookings: any[];
  agents: any[];
  services: any[];
  initialGallery?: any;
  onRefresh: () => void;
}

export function GalleryDrawer({ 
  isOpen, 
  onClose, 
  clients, 
  bookings, 
  agents,
  services,
  initialGallery,
  onRefresh 
}: GalleryDrawerProps) {
  const [activeSection, setActiveTab] = useState<"setup" | "assets">("setup");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Dropdown States
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const [agentSearchQuery, setAgentSearchQuery] = useState("");
  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");

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
    Zap: Zap 
  };
  
  // Form State
  const [formData, setFormData] = useState<any>({
    id: null,
    clientId: "",
    bookingId: "",
    agentId: "",
    title: "",
    status: "DRAFT",
    notifyClient: true, 
    isLocked: false,
    watermarkEnabled: false,
    deliveryNotes: "", 
    bannerImageUrl: "", // New: Banner Image Link
    serviceIds: [],     // New: Linked Services
    dropboxLink: "", 
    imageFolders: [], 
    videoLinks: [],   
    settings: {
      loginToDownload: false,
      restrictDownloads: false
    }
  });

  // Dropbox State
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [currentPath, setCurrentPath] = useState("/");
  const [folders, setFolders] = useState<any[]>([]);
  const [isDropboxLoading, setIsDropboxLoading] = useState(false);

  useEffect(() => {
    if (initialGallery) {
      setFormData({
        id: initialGallery.id,
        clientId: initialGallery.clientId,
        bookingId: initialGallery.bookingId || "",
        agentId: initialGallery.agentId || "",
        title: initialGallery.title,
        status: initialGallery.status,
        notifyClient: initialGallery.notifyClient ?? true,
        isLocked: initialGallery.isLocked ?? false,
        watermarkEnabled: initialGallery.watermarkEnabled ?? false,
        deliveryNotes: initialGallery.deliveryNotes || "",
        bannerImageUrl: initialGallery.bannerImageUrl || "",
        serviceIds: initialGallery.serviceIds || [],
        dropboxLink: initialGallery.metadata?.dropboxLink || "",
        imageFolders: initialGallery.metadata?.imageFolders || [],
        videoLinks: initialGallery.metadata?.videoLinks || [],
        settings: initialGallery.metadata?.settings || {
          loginToDownload: false,
          restrictDownloads: false
        }
      });
    } else {
      setFormData({
        id: null,
        clientId: "",
        bookingId: "",
        agentId: "",
        title: "",
        status: "DRAFT",
        notifyClient: true,
        isLocked: false,
        watermarkEnabled: false,
        deliveryNotes: "",
        bannerImageUrl: "",
        serviceIds: [],
        dropboxLink: "",
        imageFolders: [],
        videoLinks: [],
        settings: {
          loginToDownload: false,
          restrictDownloads: false
        }
      });
    }
  }, [initialGallery, isOpen]);

  const handleBrowseFolders = async (path: string = "") => {
    setIsBrowsing(true);
    setIsDropboxLoading(true);
    const result = await browseDropboxFolders(path);
    setIsDropboxLoading(false);
    if (result.success) {
      setFolders(result.folders || []);
      setCurrentPath(path || "/");
    } else {
      alert(result.error);
      setIsBrowsing(false);
    }
  };

  const addFolder = (folder: any) => {
    if (formData.imageFolders.some((f: any) => f.path === folder.path)) return;
    setFormData({
      ...formData,
      imageFolders: [...formData.imageFolders, folder]
    });
    setIsBrowsing(false);
  };

  const removeFolder = (index: number) => {
    const next = [...formData.imageFolders];
    next.splice(index, 1);
    setFormData({ ...formData, imageFolders: next });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId) return alert("Please select a client");
    if (!formData.title) return alert("Please enter a gallery title");

    setIsSubmitting(true);
    try {
      const result = await upsertGallery({
        ...formData,
        isLocked: formData.isLocked,
        watermarkEnabled: formData.watermarkEnabled,
        agentId: formData.agentId,
        notifyClient: formData.notifyClient,
        bannerImageUrl: formData.bannerImageUrl,
        serviceIds: formData.serviceIds,
        metadata: {
          dropboxLink: formData.dropboxLink,
          imageFolders: formData.imageFolders,
          videoLinks: formData.videoLinks,
          settings: formData.settings
        }
      });
      if (result.success) {
        onRefresh();
        onClose();
      } else {
        alert(result.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to sync title and services with booking
  useEffect(() => {
    if (formData.bookingId && !formData.id) {
      const booking = bookings.find(b => b.id === formData.bookingId);
      if (booking) {
        setFormData((prev: any) => ({ 
          ...prev, 
          title: booking.property?.name || booking.title,
          serviceIds: booking.services?.map((s: any) => s.service.id) || []
        }));
      }
    }
  }, [formData.bookingId]);

  // Filter services based on client visibility
  const visibleServices = React.useMemo(() => {
    const currentClient = localClients.find(c => c.id === formData.clientId);
    if (!currentClient?.disabledServices) return localServices;
    
    return localServices.filter(s => !currentClient.disabledServices.includes(s.id));
  }, [localServices, formData.clientId, localClients]);

  return (
    <>
      <div 
        className={cn(
          "fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px] transition-all duration-500",
          isOpen ? "opacity-100 visible" : "opacity-0 pointer-events-none invisible"
        )}
        onClick={onClose}
      />
      
      <div className={cn(
        "fixed inset-y-0 right-0 z-[101] w-full max-w-[540px] bg-white shadow-2xl flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="px-10 py-8 flex items-start justify-between border-b border-slate-50">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-primary uppercase tracking-widest">
              GALLERY ENGINE
            </p>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {formData.id ? 'Update Gallery' : 'Create New Gallery'}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Content Tabs */}
        <div className="flex px-10 border-b border-slate-50">
          <TabButton active={activeSection === "setup"} onClick={() => setActiveTab("setup")} label="1. Setup & Control" />
          <TabButton active={activeSection === "assets"} onClick={() => setActiveTab("assets")} label="2. Assets & Production" />
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-10 py-8 space-y-8 custom-scrollbar">
            
            {activeSection === "setup" && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-6">
                  <div className="space-y-2 relative">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Client / Agency</label>
                      <button 
                        type="button"
                        onClick={() => setIsQuickClientOpen(true)}
                        className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                      >
                        + Express Add
                      </button>
                    </div>
                    
                    {/* Universal Searchable Dropdown */}
                    <Hint 
                      title="Agency Selection" 
                      content="Choose which company this gallery belongs to. If you don't see them, use '+ Express Add' to create them instantly."
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
                                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tighter">
                                        {client.name}
                                      </span>
                                    )}
                                  </div>
                                </>
                              );
                            })()
                          ) : (
                            <span className="text-sm text-slate-500 font-medium">Select agency...</span>
                          )}
                        </div>
                        <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform duration-300", isClientDropdownOpen && "rotate-180")} />
                      </div>
                    </Hint>

                    {isClientDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsClientDropdownOpen(false)} />
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
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
                                      setFormData({ ...formData, clientId: c.id, bookingId: "" });
                                      setIsClientDropdownOpen(false);
                                    }}
                                    className={cn(
                                      "w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors group",
                                      isSelected ? "bg-primary/10" : "hover:bg-slate-50"
                                    )}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="h-8 w-8 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                                        {c.avatarUrl ? (
                                          <img src={c.avatarUrl} className="h-full w-full object-cover" alt={c.businessName || c.name} />
                                        ) : (
                                          <User className="h-4 w-4" />
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <p className={cn("text-sm font-bold truncate transition-colors", isSelected ? "text-primary" : "text-slate-700")}>
                                          {c.businessName || c.name}
                                        </p>
                                        {c.businessName && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{c.name}</p>}
                                      </div>
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

                  {/* Lead Agent (Conditional on Agency selection) */}
                  {formData.clientId && (
                    <div className="space-y-2 relative animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Lead Agent</label>
                        <button 
                          type="button"
                          onClick={() => setIsQuickAgentOpen(true)}
                          className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                        >
                          + Express Add
                        </button>
                      </div>
                      
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
                            <span className="text-sm text-slate-500 italic font-medium">Select lead agent (Optional)</span>
                          )}
                        </div>
                        <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform duration-300", isAgentDropdownOpen && "rotate-180")} />
                      </div>

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
                                .filter(a => a.clientId === formData.clientId)
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
                                        isSelected ? "bg-primary/10" : "hover:bg-slate-50"
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

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Linked Booking</label>
                    <div className="relative">
                      <select 
                        value={formData.bookingId}
                        onChange={(e) => setFormData({ ...formData, bookingId: e.target.value })}
                        disabled={!formData.clientId}
                        className="ui-input-tight bg-white appearance-none disabled:opacity-50 pr-10 text-slate-700 font-bold"
                      >
                        <option value="">No Booking (Standalone)</option>
                        {bookings
                          .filter(b => b.clientId === formData.clientId)
                          .map(b => (
                            <option key={b.id} value={b.id}>{b.property?.name || b.title}</option>
                          ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Gallery Title</label>
                    <input 
                      required
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g. 45 Jarra Rd Cluster"
                      className="ui-input-tight font-bold text-slate-900"
                    />
                  </div>

                  <div className="space-y-2 relative">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Gallery Services</label>
                      <button 
                        type="button"
                        onClick={() => setIsQuickServiceOpen(true)}
                        className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                      >
                        + Express Add
                      </button>
                    </div>
                    
                    {/* Multi-Select Dropdown Style */}
                    <Hint 
                      title="Production Services" 
                      content="Select the services included in this production. These will be used to automatically generate your invoice."
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
                                  return <Icon className="h-3 w-3" />;
                                })()}
                              </div>
                              <span className="text-[11px] font-black whitespace-nowrap uppercase tracking-widest">{s.name}</span>
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFormData({ 
                                    ...formData, 
                                    serviceIds: formData.serviceIds.filter((id: string) => id !== s.id) 
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
                            <span className="text-sm text-slate-500 italic font-medium">No services selected yet...</span>
                            <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform duration-300", isServiceDropdownOpen && "rotate-180")} />
                          </div>
                        )}
                      </div>
                    </Hint>

                    {isServiceDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsServiceDropdownOpen(false)} />
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
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
                              .map(s => {
                                const isSelected = formData.serviceIds.includes(s.id);
                                const Icon = IconMap[s.icon?.toUpperCase() || "CAMERA"] || Camera;
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                      const ids = isSelected
                                        ? formData.serviceIds.filter((id: string) => id !== s.id)
                                        : [...formData.serviceIds, s.id];
                                      setFormData({ ...formData, serviceIds: ids });
                                    }}
                                    className={cn(
                                      "w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors group",
                                      isSelected ? "bg-primary/10" : "hover:bg-slate-50"
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
                                          ${Number(s.price).toFixed(2)}
                                        </p>
                                      </div>
                                    </div>
                                    {isSelected && <Check className="h-4 w-4 text-primary animate-in zoom-in duration-200" />}
                                  </button>
                                );
                              })}
                            {localServices.filter(s => s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase())).length === 0 && (
                              <div className="px-4 py-8 text-center">
                                <p className="text-xs font-medium text-slate-400">No services found</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                    <p className="text-[9px] font-medium text-slate-400 italic">Select services to auto-populate your invoice later.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Gallery Status</label>
                    <div className="relative">
                      <select 
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="ui-input-tight bg-white appearance-none pr-10 font-bold text-slate-700"
                      >
                        <option value="DRAFT">DRAFT (Hidden)</option>
                        <option value="READY">READY (Live)</option>
                        <option value="DELIVERED">DELIVERED (Client Notified)</option>
                        <option value="ARCHIVED">ARCHIVED</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Controls - Moved here for speed */}
                <div className="space-y-4 pt-6 border-t border-slate-50">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Gallery Guardrails</label>
                  <div className="grid grid-cols-1 gap-3">
                    <ControlToggle 
                      label="Lock Gallery" 
                      active={formData.isLocked}
                      onToggle={() => setFormData({ ...formData, isLocked: !formData.isLocked })}
                      icon={formData.isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    />
                    <ControlToggle 
                      label="Watermark Assets" 
                      active={formData.watermarkEnabled}
                      onToggle={() => setFormData({ ...formData, watermarkEnabled: !formData.watermarkEnabled })}
                    />
                    <ControlToggle 
                      label="Notify Client" 
                      active={formData.notifyClient}
                      onToggle={() => setFormData({ ...formData, notifyClient: !formData.notifyClient })}
                      description="Auto-send email when gallery is ready."
                      icon={<Bell className="h-4 w-4" />}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeSection === "assets" && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Banner Image Link</label>
                  <div className="relative">
                    <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input 
                      value={formData.bannerImageUrl}
                      onChange={(e) => setFormData({ ...formData, bannerImageUrl: e.target.value })}
                      placeholder="Paste direct image URL for the gallery hero..."
                      className="ui-input-tight pl-11 text-xs text-slate-700"
                    />
                  </div>
                </div>

                {/* Dropbox Share Link - NEW */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Dropbox Share Link (Fastest)</label>
                    <div className="h-4 w-4 rounded-full bg-primary/10 flex items-center justify-center text-primary group cursor-help">
                      <Info className="h-2.5 w-2.5" />
                    </div>
                  </div>
                  <input 
                    value={formData.dropboxLink}
                    onChange={(e) => setFormData({ ...formData, dropboxLink: e.target.value })}
                    placeholder="Paste Dropbox Shareable Folder Link here..."
                    className="ui-input-tight text-xs border-primary/20 bg-primary/5 focus:bg-white transition-all text-slate-700"
                  />
                  <p className="text-[10px] font-bold text-slate-500">Pasting a link is 10x faster than navigating folders.</p>
                </div>

                {/* Dropbox Folders */}
                <div className="space-y-4 pt-6 border-t border-slate-50">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Mapped Folders (Advanced)</label>
                    <button 
                      type="button"
                      onClick={() => handleBrowseFolders()}
                      className="text-[11px] font-bold text-primary uppercase tracking-widest hover:underline"
                    >
                      + Browse Dropbox
                    </button>
                  </div>

                  <div className="space-y-2">
                    {formData.imageFolders.map((folder: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 group">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-blue-500">
                            <Folder className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{folder.name}</p>
                            <p className="text-[9px] text-slate-400 font-medium">{folder.path}</p>
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => removeFolder(i)}
                          className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Video Links */}
                <div className="space-y-4 pt-6 border-t border-slate-50">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Video Production Links</label>
                    <button 
                      type="button"
                      onClick={() => setFormData({ ...formData, videoLinks: [...formData.videoLinks, { url: "", title: "Main Feature" }] })}
                      className="text-[11px] font-bold text-primary uppercase tracking-widest hover:underline"
                    >
                      + Add Video
                    </button>
                  </div>
                  
                  {formData.videoLinks.map((video: any, i: number) => (
                    <div key={i} className="flex gap-3 items-start animate-in zoom-in-95 duration-200">
                      <div className="flex-1 space-y-2">
                        <input 
                          value={video.url}
                          onChange={(e) => {
                            const next = [...formData.videoLinks];
                            next[i].url = e.target.value;
                            setFormData({ ...formData, videoLinks: next });
                          }}
                          placeholder="Vimeo, YouTube or Dropbox URL"
                          className="ui-input-tight text-xs text-slate-700 font-medium"
                        />
                      </div>
                      <button 
                        type="button"
                        onClick={() => {
                          const next = [...formData.videoLinks];
                          next.splice(i, 1);
                          setFormData({ ...formData, videoLinks: next });
                        }}
                        className="mt-2 text-slate-300 hover:text-rose-500 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Notification Notes - NEW */}
                <div className="space-y-4 pt-6 border-t border-slate-50">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Notification Note (Email Body)</label>
                  <textarea 
                    value={formData.deliveryNotes}
                    onChange={(e) => setFormData({ ...formData, deliveryNotes: e.target.value })}
                    placeholder="Add a custom note to the delivery email (e.g. 'Enjoy the shots! We've added a few bonus edits.')"
                    className="ui-input-tight h-24 py-4 resize-none text-xs text-slate-700 font-medium"
                  />
                  <p className="text-[10px] font-bold text-slate-500 italic leading-relaxed">
                    This note will appear prominently in the automated email notification sent to your client.
                  </p>
                </div>
              </div>
            )}

          </div>

          {/* Footer Actions */}
          <div className="px-10 py-8 border-t border-slate-50 bg-slate-50/30 flex gap-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 h-12 rounded-2xl border border-slate-200 bg-white text-slate-600 font-bold hover:text-slate-900 transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="flex-[2] h-12 rounded-2xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving Gallery...
                </>
              ) : (
                formData.id ? 'Update Production' : 'Launch Gallery'
              )}
            </button>
          </div>
        </form>

        {/* Dropbox Browser Modal/Overlay */}
        {isBrowsing && (
          <div className="absolute inset-0 z-[110] bg-white flex flex-col animate-in slide-in-from-bottom duration-500">
            <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => handleBrowseFolders("/")}
                  className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
                >
                  <Folder className="h-5 w-5" />
                </button>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">Dropbox Browser</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{currentPath}</p>
                </div>
              </div>
              <button onClick={() => setIsBrowsing(false)} className="p-2 text-slate-400 hover:text-slate-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-10 py-6 space-y-2 custom-scrollbar">
              {isDropboxLoading ? (
                <div className="py-20 text-center">
                  <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-4" />
                  <p className="text-sm font-medium text-slate-400 tracking-tight">Accessing your production vault...</p>
                </div>
              ) : (
                <>
                  {folders.map((folder) => (
                    <div 
                      key={folder.id}
                      className="group flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all cursor-pointer"
                      onClick={() => handleBrowseFolders(folder.path)}
                    >
                      <div className="flex items-center gap-4">
                        <Folder className="h-5 w-5 text-blue-400 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-bold text-slate-700">{folder.name}</span>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          addFolder(folder);
                        }}
                        className="px-4 py-2 bg-primary/10 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-primary hover:text-white"
                      >
                        Select Folder
                      </button>
                    </div>
                  ))}
                  {folders.length === 0 && (
                    <div className="py-20 text-center">
                      <AlertCircle className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-400">This folder is empty.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
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
        clientId={formData.clientId}
        clientName={localClients.find(c => c.id === formData.clientId)?.businessName || localClients.find(c => c.id === formData.clientId)?.name}
        onSuccess={(newAgent) => {
          setLocalAgents([newAgent, ...localAgents]);
          setFormData({ ...formData, agentId: newAgent.id });
        }}
      />
    </>
  );
}

function TabButton({ active, onClick, label }: any) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 py-5 text-[11px] font-black uppercase tracking-widest transition-all relative",
        active ? "text-primary" : "text-slate-500 hover:text-slate-700"
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary animate-in fade-in duration-300" />
      )}
    </button>
  );
}

function ControlToggle({ label, description, active, onToggle, icon }: any) {
  return (
    <div className="flex items-center justify-between p-5 rounded-3xl bg-slate-50 border border-slate-100">
      <div className="flex items-center gap-4">
        {icon && (
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
            active ? "bg-primary/10 text-emerald-600" : "bg-white text-slate-400"
          )}>
            {icon}
          </div>
        )}
        <div className="space-y-0.5">
          <h4 className="text-sm font-bold text-slate-900">{label}</h4>
          {description && <p className="text-[11px] text-slate-500 font-bold leading-tight max-w-[240px]">{description}</p>}
        </div>
      </div>
      <button 
        type="button"
        onClick={onToggle}
        className={cn(
          "w-12 h-6 rounded-full transition-colors relative shrink-0",
          active ? "bg-primary" : "bg-slate-200"
        )}
      >
        <div className={cn(
          "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform",
          active ? "translate-x-6" : "translate-x-0"
        )} />
      </button>
    </div>
  );
}
