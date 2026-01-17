"use client";

import React, { useState, useEffect } from "react";
import { X, Camera, Zap, Video, FileText, Wrench, ChevronDown, Sun, Box, Edit3, User, Plane, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getServiceIconStyle } from "@/lib/service-icons";

interface ServiceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  service?: any;
  onSave: (data: any) => Promise<void>;
}

const ICON_OPTIONS = [
  { name: "CAMERA", icon: Camera },
  { name: "DRONE", icon: Plane },
  { name: "VIDEO", icon: Video },
  { name: "FILETEXT", icon: FileText },
  { name: "SERVICE", icon: Wrench },
  { name: "SUNSET", icon: Sun },
  { name: "PACKAGE", icon: Box },
  { name: "EDIT PEN", icon: Edit3 },
  { name: "PERSON", icon: User },
];

export function ServiceDrawer({ isOpen, onClose, service, onSave }: ServiceDrawerProps) {
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    description: "",
    price: "",
    durationMinutes: "60",
    icon: "CAMERA",
    active: true,
    clientVisible: true,
    includeTax: true,
    slotType: null as string | null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) setMounted(true);
  }, [isOpen]);

  useEffect(() => {
    if (service && service.id) {
      setFormData({
        id: service.id,
        name: service.name || "",
        description: service.description || "",
        price: String(service.price || ""),
        durationMinutes: String(service.durationMinutes || "60"),
        icon: service.icon?.toUpperCase() || "CAMERA",
        active: service.active ?? true,
        clientVisible: service.clientVisible ?? true,
        includeTax: (service.settings as any)?.includeTax ?? true,
        slotType: service.slotType || null,
      });
    } else {
      setFormData({
        id: "",
        name: "",
        description: "",
        price: "",
        durationMinutes: "60",
        icon: "CAMERA",
        active: true,
        clientVisible: true,
        includeTax: true,
        slotType: null,
      });
    }
  }, [service, isOpen]);

  if (!mounted) return null;

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
          "fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px] transition-all duration-500",
          isOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
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
              {formData.id ? "EDIT SERVICE" : "NEW SERVICE"}
            </p>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {formData.id ? "Update package" : "Add to catalogue"}
            </h2>
          </div>
          <button onClick={onClose} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-10 py-10 custom-scrollbar">
          <form id="service-form" onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Service Name</label>
              <input 
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g. Standard Day Shoot" 
                className="ui-input-tight" 
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</label>
              <textarea 
                required
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="What's included in this package?" 
                className="ui-input-tight h-32 py-4 resize-none" 
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Base Price ($)</label>
                  <input 
                    required
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                    placeholder="0.00" 
                    className="ui-input-tight" 
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer group ml-1">
                  <input 
                    type="checkbox"
                    checked={formData.includeTax}
                    onChange={(e) => setFormData({...formData, includeTax: e.target.checked})}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-[11px] font-bold text-slate-500 group-hover:text-slate-900 transition-colors">Including tax</span>
                </label>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Duration (Mins)</label>
                <input 
                  required
                  type="number"
                  value={formData.durationMinutes}
                  onChange={(e) => setFormData({...formData, durationMinutes: e.target.value})}
                  placeholder="60" 
                  className="ui-input-tight" 
                />
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Icon</label>
              <div className="grid grid-cols-5 gap-3">
                {ICON_OPTIONS.map((opt) => (
                  (() => {
                    const iconStyle = getServiceIconStyle(opt.name);
                    const isActive = formData.icon === opt.name;
                    return (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => setFormData({...formData, icon: opt.name})}
                    className={cn(
                      "h-16 flex flex-col items-center justify-center rounded-2xl transition-all gap-2 px-1 ring-1",
                      isActive
                        ? "border-emerald-500 ring-emerald-200 shadow-sm"
                        : "border-slate-100 ring-slate-100 hover:border-slate-200",
                      iconStyle.bg,
                      iconStyle.text
                    )}
                  >
                    <opt.icon className="h-4 w-4" />
                    <span className="text-[8px] font-bold uppercase tracking-tight text-center leading-none">{opt.name}</span>
                  </button>
                    );
                  })()
                ))}
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-50">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Specialized Slot Logic</label>
              <div className="flex items-center gap-3">
                {[
                  { id: null, label: "None / Standard", icon: Zap },
                  { id: "SUNRISE", label: "Sunrise Only", icon: Sun },
                  { id: "DUSK", label: "Dusk Only", icon: Moon }
                ].map((slot) => {
                  const Icon = slot.icon || Zap;
                  const isActive = formData.slotType === slot.id;
                  return (
                    <button
                      key={slot.id || 'none'}
                      type="button"
                      onClick={() => setFormData({...formData, slotType: slot.id})}
                      className={cn(
                        "flex-1 h-12 rounded-2xl border flex items-center justify-center gap-2 transition-all",
                        isActive 
                          ? "bg-amber-50 border-amber-500 text-amber-700 shadow-sm" 
                          : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                      )}
                    >
                      <Icon className={cn("h-3 w-3", isActive ? "text-amber-600" : "text-slate-300")} />
                      <span className="text-[10px] font-black uppercase tracking-widest">{slot.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[9px] font-bold text-slate-400 italic leading-relaxed">
                Linking a service to a specialized slot ensures it appears first when booking Sunrise or Dusk times on the calendar.
              </p>
            </div>

            <div className="pt-4 flex items-center gap-10">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div 
                  onClick={() => setFormData({...formData, active: !formData.active})}
                  className={cn(
                    "w-12 h-6 rounded-full p-1 transition-colors duration-300",
                    formData.active ? "bg-emerald-500" : "bg-slate-200"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm",
                    formData.active ? "translate-x-6" : "translate-x-0"
                  )} />
                </div>
                <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">
                  {formData.active ? "Service is Active" : "Service is Inactive"}
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <div 
                  onClick={() => setFormData({...formData, clientVisible: !formData.clientVisible})}
                  className={cn(
                    "w-12 h-6 rounded-full p-1 transition-colors duration-300 border border-slate-100",
                    formData.clientVisible ? "bg-white" : "bg-slate-200"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full transition-transform duration-300 shadow-sm",
                    formData.clientVisible ? "translate-x-6 bg-emerald-500" : "translate-x-0 bg-white"
                  )} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-emerald-500 transition-colors">
                  Client View
                </span>
              </label>
            </div>
          </form>
        </div>

        <div className="px-10 py-8 border-t border-slate-100 flex items-center justify-end gap-6">
          <button onClick={onClose} className="text-sm font-bold text-slate-500 hover:text-slate-700">Cancel</button>
          <button 
            type="submit" 
            form="service-form"
            disabled={isSubmitting}
            className="h-12 px-8 rounded-full bg-[#10B981] text-white font-bold shadow-lg shadow-emerald-500/20 hover:bg-[#059669] transition-all active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : formData.id ? "Update Service" : "Create Service"}
          </button>
        </div>
      </div>
    </>
  );
}

