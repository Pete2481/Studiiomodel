"use client";

import React, { useState } from "react";
import { X, Sun, Moon, Plus, Trash2, Check, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleSlotPlaceholder, updateSlotSettings } from "@/app/actions/slot-management";
import { format } from "date-fns";

interface SlotManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSettings: {
    sunriseSlotTime: string;
    duskSlotTime: string;
    sunriseSlotsPerDay: number;
    duskSlotsPerDay: number;
  };
  currentDate: Date;
}

export function SlotManagementModal({ isOpen, onClose, tenantSettings, currentDate }: SlotManagementModalProps) {
  const [settings, setSettings] = useState(tenantSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"SETTINGS" | "OVERRIDE">("OVERRIDE");

  if (!isOpen) return null;

  const handleToggleSlot = async (type: "SUNRISE" | "DUSK", action: "ADD" | "REMOVE") => {
    setIsSaving(true);
    try {
      const res = await toggleSlotPlaceholder({
        date: currentDate,
        slotType: type,
        action
      });
      if (res.success) {
        // We don't necessarily close here, as they might want to add multiple
        alert(`${type} slot ${action === "ADD" ? "added" : "removed"} for ${format(currentDate, "MMM d")}`);
      } else {
        alert(res.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const res = await updateSlotSettings(settings);
      if (res.success) {
        onClose();
      } else {
        alert(res.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Slot Management</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Sunrise & Dusk Rules</p>
          </div>
          <button onClick={onClose} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-white text-slate-400 transition-colors shadow-sm">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-100 bg-white">
          <button 
            onClick={() => setActiveTab("OVERRIDE")}
            className={cn(
              "flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all",
              activeTab === "OVERRIDE" ? "text-primary border-b-2 border-primary bg-primary/5" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Daily Overrides
          </button>
          <button 
            onClick={() => setActiveTab("SETTINGS")}
            className={cn(
              "flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all",
              activeTab === "SETTINGS" ? "text-primary border-b-2 border-primary bg-primary/5" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Global Rules
          </button>
        </div>

        <div className="p-8 space-y-8">
          {activeTab === "OVERRIDE" ? (
            <div className="space-y-6">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Manage slots for {format(currentDate, "EEEE, MMMM d")}</p>
                
                <div className="space-y-4">
                  {/* Sunrise Override */}
                  <div className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500">
                        <Sun className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-bold text-slate-700">Sunrise Slot</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleToggleSlot("SUNRISE", "REMOVE")}
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors"
                        title="Block/Remove Slot"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleToggleSlot("SUNRISE", "ADD")}
                        className="h-8 w-12 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 font-black text-[10px] hover:bg-emerald-100 transition-colors"
                        title="Add Extra Slot"
                      >
                        +ADD
                      </button>
                    </div>
                  </div>

                  {/* Dusk Override */}
                  <div className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500">
                        <Moon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-bold text-slate-700">Dusk Slot</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleToggleSlot("DUSK", "REMOVE")}
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors"
                        title="Block/Remove Slot"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleToggleSlot("DUSK", "ADD")}
                        className="h-8 w-12 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 font-black text-[10px] hover:bg-emerald-100 transition-colors"
                        title="Add Extra Slot"
                      >
                        +ADD
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] font-bold text-slate-400 italic text-center px-4 leading-relaxed">
                Adding a slot creates a "NO CLIENT" placeholder on the calendar for this specific day. Removing a slot deletes any unused placeholders.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Sunrise Rule</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400">Time</span>
                    <input 
                      type="time" 
                      value={settings.sunriseSlotTime}
                      onChange={(e) => setSettings({...settings, sunriseSlotTime: e.target.value})}
                      className="ui-input-tight w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400">Default Slots</span>
                    <input 
                      type="number" 
                      min="0"
                      max="5"
                      value={settings.sunriseSlotsPerDay}
                      onChange={(e) => setSettings({...settings, sunriseSlotsPerDay: parseInt(e.target.value)})}
                      className="ui-input-tight w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Dusk Rule</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400">Time</span>
                    <input 
                      type="time" 
                      value={settings.duskSlotTime}
                      onChange={(e) => setSettings({...settings, duskSlotTime: e.target.value})}
                      className="ui-input-tight w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400">Default Slots</span>
                    <input 
                      type="number" 
                      min="0"
                      max="5"
                      value={settings.duskSlotsPerDay}
                      onChange={(e) => setSettings({...settings, duskSlotsPerDay: parseInt(e.target.value)})}
                      className="ui-input-tight w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-4">
          <button 
            onClick={onClose}
            className="text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
          >
            {activeTab === "SETTINGS" ? "Cancel" : "Close"}
          </button>
          {activeTab === "SETTINGS" && (
            <button 
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="h-12 px-8 rounded-full bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? "Saving..." : (
                <>
                  <Check className="h-4 w-4" />
                  Save Rules
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

