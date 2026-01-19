"use client";

import React, { useState } from "react";
import { X, Clock, Check, Sunrise, Sunset, Minus, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateTenantBusinessHours } from "@/app/actions/tenant-settings";
import { cleanupLegacySunPlaceholders } from "@/app/actions/slot-management";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";

interface BusinessHoursModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialHours: any;
  aiLogisticsEnabled?: boolean;
  initialSunSlotsAddress?: string | null;
}

const DAYS = [
  { id: 0, label: "Sunday" },
  { id: 1, label: "Monday" },
  { id: 2, label: "Tuesday" },
  { id: 3, label: "Wednesday" },
  { id: 4, label: "Thursday" },
  { id: 5, label: "Friday" },
  { id: 6, label: "Saturday" },
];

export function BusinessHoursModal({ isOpen, onClose, initialHours, aiLogisticsEnabled = false, initialSunSlotsAddress = "" }: BusinessHoursModalProps) {
  const [hours, setHours] = useState(initialHours || {
    "0": { open: false, start: "09:00", end: "17:00" },
    "1": { open: true, start: "09:00", end: "17:00" },
    "2": { open: true, start: "09:00", end: "17:00" },
    "3": { open: true, start: "09:00", end: "17:00" },
    "4": { open: true, start: "09:00", end: "17:00" },
    "5": { open: true, start: "09:00", end: "17:00" },
    "6": { open: true, start: "09:00", end: "17:00" },
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [sunSlotsAddress, setSunSlotsAddress] = useState<string>(String(initialSunSlotsAddress || ""));

  if (!isOpen) return null;

  const handleToggle = (dayId: number) => {
    setHours({
      ...hours,
      [dayId]: { ...hours[dayId], open: !hours[dayId].open }
    });
  };

  const handleTimeChange = (dayId: number, field: 'start' | 'end', value: string) => {
    setHours({
      ...hours,
      [dayId]: { ...hours[dayId], [field]: value }
    });
  };

  const handleSlotChange = (dayId: number, type: 'sunrise' | 'dusk', delta: number) => {
    const current = hours[dayId]?.[type] || 0;
    const next = Math.max(0, Math.min(3, current + delta));
    setHours({
      ...hours,
      [dayId]: { ...hours[dayId], [type]: next }
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await updateTenantBusinessHours({ hours, sunSlotsAddress });
      if (res.success) {
        if ((res as any)?.warning) {
          alert(String((res as any).warning));
        }
        onClose();
      } else {
        alert(res.error);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save business hours");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCleanupLegacy = async () => {
    const ok = typeof window !== "undefined"
      ? window.confirm("Cleanup legacy Sunrise/Dusk placeholders?\n\nThis removes old duplicated placeholder bookings created by the previous system. V2 will keep generating the correct slots from Max AM/PM.")
      : false;
    if (!ok) return;
    setIsCleaning(true);
    try {
      const res = await cleanupLegacySunPlaceholders();
      if ((res as any)?.success) {
        alert(`Cleanup complete: removed ${(res as any)?.deletedCount ?? 0} legacy placeholder(s).`);
      } else {
        alert((res as any)?.error || "Cleanup failed.");
      }
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
        <LoadingOverlay isVisible={isSaving} message="Updating your hours..." />
        
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {aiLogisticsEnabled ? "Studio Business Hours" : "Business Hours & Sun Slots"}
          </h2>
          <button onClick={onClose} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-white text-slate-400 transition-colors shadow-sm">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Sun slots base address</div>
            <AddressAutocomplete
              value={sunSlotsAddress}
              onChange={(v) => setSunSlotsAddress(v)}
              placeholder="Enter the suburb/street used for Sunrise/Dusk times"
              className="w-full rounded-3xl border border-slate-200 px-5 py-4 text-sm font-semibold focus:outline-none focus:ring-0 bg-white"
            />
            <div className="text-[11px] text-slate-500">
              Used to calculate Sunrise/Dusk times. If blank (or geocoding fails), Sunrise/Dusk slots will be disabled in testing mode.
            </div>
          </div>

          {/* Header Row */}
          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 pb-2 border-b border-slate-50">
            <div className="min-w-[120px]">Day</div>
            <div className="flex-1">Business Hours</div>
            <div className="w-24 text-center flex items-center justify-center gap-1.5">
              <Sunrise className="h-3 w-3 text-amber-400" />
              {aiLogisticsEnabled ? "Max AM" : "Sunrise"}
            </div>
            <div className="w-24 text-center flex items-center justify-center gap-1.5">
              <Sunset className="h-3 w-3 text-indigo-400" />
              {aiLogisticsEnabled ? "Max PM" : "Dusk"}
            </div>
          </div>

          {DAYS.map((day) => {
            const config = hours[day.id] || { open: true, start: "09:00", end: "17:00", sunrise: 0, dusk: 0 };
            return (
              <div key={day.id} className="flex items-center gap-4 py-1">
                <div className="flex items-center gap-4 min-w-[120px]">
                  <button
                    onClick={() => handleToggle(day.id)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      config.open ? "bg-primary" : "bg-slate-200"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        config.open ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                  <span className={cn(
                    "text-sm font-bold transition-colors",
                    config.open ? "text-slate-900" : "text-slate-400"
                  )}>
                    {day.label}
                  </span>
                </div>

                <div className="flex-1">
                  {config.open ? (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
                      <input 
                        type="time" 
                        value={config.start}
                        onChange={(e) => handleTimeChange(day.id, 'start', e.target.value)}
                        className="ui-input-tight h-10 w-28 px-3 text-xs"
                      />
                      <span className="text-slate-300 font-bold">-</span>
                      <input 
                        type="time" 
                        value={config.end}
                        onChange={(e) => handleTimeChange(day.id, 'end', e.target.value)}
                        className="ui-input-tight h-10 w-28 px-3 text-xs"
                      />
                    </div>
                  ) : (
                    <div className="h-10 flex items-center">
                      <span className="px-3 py-1 bg-slate-100 text-slate-400 rounded-full text-[10px] font-black uppercase tracking-widest">Closed</span>
                    </div>
                  )}
                </div>

                {/* Sunrise Slot Counter */}
                <div className="w-24 flex items-center justify-center gap-3">
                  <button 
                    onClick={() => handleSlotChange(day.id, 'sunrise', -1)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95 transition-all"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className={cn(
                    "text-sm font-black w-4 text-center",
                    config.sunrise > 0 ? "text-amber-500" : "text-slate-300"
                  )}>
                    {config.sunrise || 0}
                  </span>
                  <button 
                    onClick={() => handleSlotChange(day.id, 'sunrise', 1)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95 transition-all"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>

                {/* Dusk Slot Counter */}
                <div className="w-24 flex items-center justify-center gap-3">
                  <button 
                    onClick={() => handleSlotChange(day.id, 'dusk', -1)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95 transition-all"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className={cn(
                    "text-sm font-black w-4 text-center",
                    config.dusk > 0 ? "text-indigo-500" : "text-slate-300"
                  )}>
                    {config.dusk || 0}
                  </span>
                  <button 
                    onClick={() => handleSlotChange(day.id, 'dusk', 1)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95 transition-all"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleCleanupLegacy}
            disabled={isSaving || isCleaning}
            className={cn(
              "h-11 px-5 rounded-full border border-slate-200 bg-white text-slate-700 text-xs font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 active:scale-95 transition-all",
              (isSaving || isCleaning) && "opacity-50 pointer-events-none"
            )}
          >
            {isCleaning ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cleaning…
              </span>
            ) : (
              "Cleanup legacy sun slots"
            )}
          </button>
          <div className="flex items-center justify-end gap-4">
          <button 
            onClick={onClose}
            className="text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving || isCleaning}
            className="h-12 px-8 rounded-full bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>Save Settings</span>
              </>
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

