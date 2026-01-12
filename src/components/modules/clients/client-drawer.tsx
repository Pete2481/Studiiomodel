"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Building2, User, Mail, Phone, ShieldCheck, Plus, ChevronDown, Download, CalendarDays, Receipt, Edit3, Globe, Camera, Layout, Upload, Move, RotateCcw, Trash2, DollarSign, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  client?: any; // Can be null for new client
  services: any[];
  onSave: (data: any) => Promise<void>;
}

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active", description: "Portal access enabled" },
  { value: "PENDING", label: "Pending", description: "Waiting for invitation" },
  { value: "INACTIVE", label: "Inactive", description: "Access disabled" },
];

const PERMISSION_OPTIONS = [
  { key: "canDownloadHighRes", label: "High-Res Downloads", icon: Download },
  { key: "canViewAllAgencyGalleries", label: "View Agency Galleries", icon: Globe },
  { key: "canPlaceBookings", label: "Place Bookings", icon: CalendarDays },
  { key: "canViewInvoices", label: "Access Invoices", icon: Receipt },
  { key: "canEditRequests", label: "Request Edits", icon: Edit3 },
];

export function ClientDrawer({
  isOpen,
  onClose,
  client,
  services,
  onSave,
}: ClientDrawerProps) {
  const [activeTab, setActiveTab] = useState<"details" | "branding" | "pricing">("details");
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    businessName: "",
    email: "",
    phone: "",
    avatarUrl: "",
    status: "PENDING",
    watermarkUrl: "",
    watermarkSettings: {
      x: 50,
      y: 50,
      scale: 100,
      opacity: 60
    },
    permissions: {
      canDownloadHighRes: true,
      canViewAllAgencyGalleries: false,
      canPlaceBookings: true,
      canViewInvoices: false,
      canEditRequests: true,
    } as Record<string, boolean>,
    priceOverrides: {} as Record<string, number | string>,
    disabledServices: [] as string[],
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const watermarkRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) setMounted(true);
  }, [isOpen]);

  useEffect(() => {
    if (client && client.id) {
      setFormData({
        id: client.id,
        name: client.contact || client.name || "",
        businessName: client.businessName || client.name || "",
        email: client.email || "",
        phone: client.phone || "",
        avatarUrl: client.avatarUrl || "",
        status: client.status || "PENDING",
        watermarkUrl: client.watermarkUrl || "",
        watermarkSettings: client.watermarkSettings || { x: 50, y: 50, scale: 100, opacity: 60 },
        permissions: client.permissions || {
          canDownloadHighRes: true,
          canViewAllAgencyGalleries: false,
          canPlaceBookings: true,
          canViewInvoices: false,
          canEditRequests: true,
        },
        priceOverrides: client.priceOverrides || {},
        disabledServices: client.disabledServices || [],
      });
      setPreviewUrl(client.avatar || client.avatarUrl || null);
    } else {
      setFormData({
        id: "",
        name: "",
        businessName: "",
        email: "",
        phone: "",
        avatarUrl: "",
        status: "PENDING",
        watermarkUrl: "",
        watermarkSettings: { x: 50, y: 50, scale: 100, opacity: 60 },
        permissions: {
          canDownloadHighRes: true,
          canViewAllAgencyGalleries: false,
          canPlaceBookings: true,
          canViewInvoices: false,
          canEditRequests: true,
        },
        priceOverrides: {},
        disabledServices: [],
      });
      setPreviewUrl(null);
    }
  }, [client]);

  if (!mounted) return null;

  const promptForImageLink = (title: string, current?: string) => {
    if (typeof window === "undefined") return null;
    const next = window.prompt(title, current || "");
    if (next === null) return null;
    return next.trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div 
        className={cn(
          "fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px] transition-all duration-500 ease-in-out",
          isOpen ? "opacity-100 visible" : "opacity-0 pointer-events-none invisible"
        )}
        onClick={onClose}
      />
      
      <div className={cn(
        "fixed inset-y-0 right-0 z-[101] w-full max-w-[540px] bg-white shadow-2xl flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        
        <div className="px-10 py-8 flex items-start justify-between border-b border-slate-50">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
              {formData.id ? "EDIT CLIENT" : "ADD NEW CLIENT"}
            </p>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {formData.id ? "Update details" : "Client profile"}
            </h2>
          </div>
          <button onClick={onClose} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-400 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-10 border-b border-slate-50 shrink-0">
          <button
            onClick={() => setActiveTab("details")}
            className={cn(
              "flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative",
              activeTab === "details" ? "text-emerald-500" : "text-slate-400 hover:text-slate-600"
            )}
          >
            1. Details
            {activeTab === "details" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 animate-in fade-in duration-300" />}
          </button>
          <button
            onClick={() => setActiveTab("branding")}
            className={cn(
              "flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative",
              activeTab === "branding" ? "text-emerald-500" : "text-slate-400 hover:text-slate-600"
            )}
          >
            2. Branding
            {activeTab === "branding" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 animate-in fade-in duration-300" />}
          </button>
          <button
            onClick={() => setActiveTab("pricing")}
            className={cn(
              "flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative",
              activeTab === "pricing" ? "text-emerald-500" : "text-slate-400 hover:text-slate-600"
            )}
          >
            3. Pricing
            {activeTab === "pricing" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 animate-in fade-in duration-300" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-10 pb-10 space-y-10 custom-scrollbar mt-8">
          <form id="client-form" onSubmit={handleSubmit} className="space-y-10">
            
            {activeTab === "details" ? (
              <>
                {/* Profile Picture Section */}
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="relative group">
                    <div className="h-32 w-32 rounded-[40px] bg-slate-100 overflow-hidden border-4 border-white shadow-xl flex items-center justify-center">
                      {previewUrl ? (
                        <img src={previewUrl} className="h-full w-full object-cover" alt="Profile preview" />
                      ) : (
                        <Camera className="h-10 w-10 text-slate-300" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const url = promptForImageLink("Paste a public Dropbox image link for the client icon (logo/avatar):", formData.avatarUrl);
                        if (!url) return;
                        setPreviewUrl(url);
                        setFormData(prev => ({ ...prev, avatarUrl: url }));
                      }}
                      className="absolute -bottom-2 -right-2 h-10 w-10 bg-emerald-500 rounded-2xl text-white flex items-center justify-center shadow-lg hover:bg-emerald-600 transition-all active:scale-95 border-2 border-white"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                  <p className="mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Profile Photo</p>
                  <div className="mt-4 w-full max-w-sm">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Client icon link (Dropbox)</label>
                    <input
                      value={formData.avatarUrl || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPreviewUrl(v || null);
                        setFormData(prev => ({ ...prev, avatarUrl: v }));
                      }}
                      type="url"
                      placeholder="Paste Dropbox link…"
                      className="ui-input-tight mt-2"
                    />
                  </div>
                </div>

                {/* Agency Info */}
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Agency / Business Name</label>
                    <div className="relative">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                      <input 
                        required
                        value={formData.businessName}
                        onChange={(e) => setFormData({...formData, businessName: e.target.value})}
                        type="text" 
                        placeholder="Ray White Real Estate" 
                        className="ui-input-tight pl-12" 
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Primary Contact Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                      <input 
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        type="text" 
                        placeholder="John Doe" 
                        className="ui-input-tight pl-12" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                        <input 
                          required
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({...formData, email: e.target.value})}
                          placeholder="john@agency.com" 
                          className="ui-input-tight pl-12 text-xs" 
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                        <input 
                          value={formData.phone}
                          onChange={(e) => setFormData({...formData, phone: e.target.value})}
                          type="tel" 
                          placeholder="0412 345 678" 
                          className="ui-input-tight pl-12" 
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Portal Status</label>
                    <div className="relative">
                      <select 
                        value={formData.status}
                        onChange={(e) => setFormData({...formData, status: e.target.value})}
                        className="ui-input-tight appearance-none bg-white pr-10"
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label} — {opt.description}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Portal Permissions */}
                <div className="space-y-6 border-t border-slate-100 pt-8">
                  <div className="flex flex-col gap-1">
                    <h4 className="text-sm font-bold text-slate-900">Portal Permissions</h4>
                    <p className="text-xs text-slate-500">Define what this client can do within their dashboard.</p>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {PERMISSION_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <label 
                          key={opt.key}
                          className={cn(
                            "flex items-center justify-between px-6 py-4 rounded-3xl border transition-all cursor-pointer",
                            formData.permissions[opt.key] 
                              ? "border-emerald-500 bg-emerald-50/30" 
                              : "border-slate-100 bg-white hover:border-slate-200"
                          )}
                        >
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "h-10 w-10 rounded-2xl flex items-center justify-center transition-colors",
                              formData.permissions[opt.key] ? "bg-emerald-500 text-white" : "bg-slate-50 text-slate-400"
                            )}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <span className={cn(
                              "text-xs font-bold uppercase tracking-widest",
                              formData.permissions[opt.key] ? "text-slate-900" : "text-slate-500"
                            )}>
                              {opt.label}
                            </span>
                          </div>
                          <input 
                            type="checkbox"
                            className="h-5 w-5 rounded-lg border-slate-300 text-emerald-500 focus:ring-emerald-500"
                            checked={!!formData.permissions[opt.key]}
                            onChange={(e) => {
                              setFormData({
                                ...formData,
                                permissions: {
                                  ...formData.permissions,
                                  [opt.key]: e.target.checked
                                }
                              });
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : activeTab === "branding" ? (
              <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Agency Watermark (PNG recommended)</label>
                    <div className="flex flex-col items-center justify-center p-8 rounded-[32px] bg-slate-50 border-2 border-dashed border-slate-200 group hover:border-emerald-500/50 transition-all">
                      <div className="relative">
                        <div className="h-24 w-40 rounded-2xl bg-white shadow-sm flex items-center justify-center overflow-hidden border border-slate-100 p-4">
                          {formData.watermarkUrl ? (
                            <img src={formData.watermarkUrl} className="max-h-full max-w-full object-contain" alt="Watermark preview" />
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                              <Upload className="h-6 w-6 text-slate-300" />
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Upload Logo</span>
                            </div>
                          )}
                        </div>

                        {formData.watermarkUrl && (
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ 
                              ...prev, 
                              watermarkUrl: "",
                              watermarkSettings: { x: 50, y: 50, scale: 100, opacity: 60 }
                            }))}
                            className="absolute -top-2 -right-2 h-8 w-8 bg-rose-500 rounded-xl text-white flex items-center justify-center shadow-lg hover:bg-rose-600 transition-all active:scale-95 border-2 border-white z-10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            const url = promptForImageLink("Paste a public Dropbox image link for the branding watermark/logo:", formData.watermarkUrl);
                            if (!url) return;
                            setFormData(prev => ({ ...prev, watermarkUrl: url }));
                          }}
                          className="absolute -bottom-2 -right-2 h-8 w-8 bg-emerald-500 rounded-xl text-white flex items-center justify-center shadow-lg hover:bg-emerald-600 transition-all active:scale-95 border-2 border-white"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Branding logo link (Dropbox)</label>
                      <input
                        value={formData.watermarkUrl || ""}
                        onChange={(e) => setFormData(prev => ({ ...prev, watermarkUrl: e.target.value }))}
                        type="url"
                        placeholder="Paste Dropbox link…"
                        className="ui-input-tight mt-2"
                      />
                    </div>
                  </div>

                  {formData.watermarkUrl && (
                    <div className="space-y-6 animate-in fade-in zoom-in duration-300">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Placement Preview</label>
                          <button 
                            type="button"
                            onClick={() => setFormData({ ...formData, watermarkSettings: { x: 50, y: 50, scale: 100, opacity: 60 } })}
                            className="text-[9px] font-bold text-primary uppercase tracking-widest flex items-center gap-1 hover:underline"
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                            Reset
                          </button>
                        </div>
                        
                        <div
                          ref={previewContainerRef}
                          className="relative aspect-video bg-slate-100 rounded-none overflow-hidden shadow-inner border border-slate-200 group/preview"
                        >
                          <img 
                            src="https://dl.dropboxusercontent.com/scl/fi/mzjrz6m62l612jum9igq8/DJI_20251105125442_0935_D_1.jpg?rlkey=rsqothjdn13uket5g51nf56dg&raw=1" 
                            className="w-full h-full object-cover" 
                            alt="Placement demo"
                          />
                          
                          <div 
                            ref={watermarkRef}
                            className="absolute cursor-move group/logo"
                            style={{
                              left: `${formData.watermarkSettings.x}%`,
                              top: `${formData.watermarkSettings.y}%`,
                              transform: 'translate(-50%, -50%)',
                              width: `${(formData.watermarkSettings.scale / 100) * 120}px`,
                              opacity: formData.watermarkSettings.opacity / 100,
                            }}
                            onMouseDown={(e) => {
                              const container = e.currentTarget.parentElement;
                              if (!container) return;
                              
                              const onMouseMove = (moveEvent: MouseEvent) => {
                                const rect = container.getBoundingClientRect();
                                const rawX = ((moveEvent.clientX - rect.left) / rect.width) * 100;
                                const rawY = ((moveEvent.clientY - rect.top) / rect.height) * 100;

                                const wmRect = watermarkRef.current?.getBoundingClientRect();
                                const wmW = wmRect?.width || 0;
                                const wmH = wmRect?.height || 0;
                                const halfW = rect.width ? (wmW / 2 / rect.width) * 100 : 0;
                                const halfH = rect.height ? (wmH / 2 / rect.height) * 100 : 0;

                                const x = Math.max(halfW, Math.min(100 - halfW, rawX));
                                const y = Math.max(halfH, Math.min(100 - halfH, rawY));
                                
                                setFormData(prev => ({
                                  ...prev,
                                  watermarkSettings: {
                                    ...prev.watermarkSettings,
                                    x,
                                    y
                                  }
                                }));
                              };
                              
                              const onMouseUp = () => {
                                document.removeEventListener('mousemove', onMouseMove);
                                document.removeEventListener('mouseup', onMouseUp);
                              };
                              
                              document.addEventListener('mousemove', onMouseMove);
                              document.addEventListener('mouseup', onMouseUp);
                            }}
                          >
                            <img src={formData.watermarkUrl} className="w-full h-auto pointer-events-none" alt="Watermark" />
                            <div className="absolute -inset-2 border-2 border-emerald-500/50 border-dashed rounded-lg opacity-0 group-logo:opacity-100 transition-opacity pointer-events-none" />
                          </div>

                          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity">
                            <div className="px-4 py-2 bg-black/40 backdrop-blur-md rounded-full text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
                              <Move className="h-3 w-3" />
                              Drag to Position
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Opacity</label>
                            <span className="text-[10px] font-black text-slate-900">{formData.watermarkSettings.opacity}%</span>
                          </div>
                          <input 
                            type="range"
                            min="10"
                            max="100"
                            value={formData.watermarkSettings.opacity}
                            onChange={(e) => setFormData({
                              ...formData,
                              watermarkSettings: { ...formData.watermarkSettings, opacity: parseInt(e.target.value) }
                            })}
                            className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                          />
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scale</label>
                            <span className="text-[10px] font-black text-slate-900">{formData.watermarkSettings.scale}%</span>
                          </div>
                          <input 
                            type="range"
                            min="20"
                            max="200"
                            value={formData.watermarkSettings.scale}
                            onChange={(e) => setFormData({
                              ...formData,
                              watermarkSettings: { ...formData.watermarkSettings, scale: parseInt(e.target.value) }
                            })}
                            className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex flex-col gap-1">
                  <h4 className="text-sm font-bold text-slate-900">Personal Price List</h4>
                  <p className="text-xs text-slate-500">Set custom rates for this client. Leave blank to use standard pricing.</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {services.map((service) => {
                    const override = formData.priceOverrides[service.id];
                    const isDisabled = formData.disabledServices.includes(service.id);
                    return (
                      <div key={service.id} className={cn(
                        "flex items-center justify-between p-5 rounded-[28px] border transition-all",
                        isDisabled 
                          ? "bg-slate-50/50 border-slate-100 opacity-60" 
                          : "bg-slate-50 border-slate-100 group hover:bg-white hover:shadow-xl hover:shadow-slate-100 hover:border-emerald-200"
                      )}>
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "h-10 w-10 rounded-2xl flex items-center justify-center transition-all shadow-sm",
                            isDisabled ? "bg-slate-100 text-slate-300" : "bg-white text-slate-400 group-hover:text-primary group-hover:bg-primary/5"
                          )}>
                            <Tag className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{service.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Standard: ${Number(service.price).toFixed(2)}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-6">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const current = formData.disabledServices;
                                const next = current.includes(service.id)
                                  ? current.filter(id => id !== service.id)
                                  : [...current, service.id];
                                setFormData({ ...formData, disabledServices: next });
                              }}
                              className={cn(
                                "w-10 h-5 rounded-full transition-all relative shrink-0",
                                isDisabled ? "bg-slate-200" : "bg-emerald-500"
                              )}
                            >
                              <div className={cn(
                                "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                                isDisabled ? "left-1" : "left-6"
                              )} />
                            </button>
                            <span className="text-[8px] font-black uppercase tracking-tighter text-slate-400">
                              {isDisabled ? "Hidden" : "Visible"}
                            </span>
                          </div>

                          <div className="relative w-32">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300" />
                            <input 
                              type="number" 
                              step="0.01"
                              value={override || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                const newOverrides = { ...formData.priceOverrides };
                                if (val === "") {
                                  delete newOverrides[service.id];
                                } else {
                                  newOverrides[service.id] = parseFloat(val);
                                }
                                setFormData({ ...formData, priceOverrides: newOverrides });
                              }}
                              placeholder="Special Rate"
                              className="w-full h-10 pl-8 pr-4 bg-white border border-slate-200 rounded-xl text-xs font-black text-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </form>
        </div>

        <div className="px-10 py-8 border-t border-slate-100 flex items-center justify-end gap-6">
          <button onClick={onClose} className="text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors">
            Cancel
          </button>
          <button 
            type="submit"
            form="client-form"
            disabled={isSubmitting}
            className="h-12 px-8 rounded-full bg-[#10B981] text-white font-bold shadow-lg shadow-emerald-500/20 hover:bg-[#059669] transition-all active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : formData.id ? "Update Client" : "Create Client Profile"}
          </button>
        </div>
      </div>
    </>
  );
}
