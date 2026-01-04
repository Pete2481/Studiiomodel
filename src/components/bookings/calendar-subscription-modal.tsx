"use client";

import React, { useState } from "react";
import { X, Calendar, Copy, Check, Smartphone, Globe, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  secret: string | null;
}

export function CalendarSubscriptionModal({
  isOpen,
  onClose,
  secret,
}: CalendarSubscriptionModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Construct the full absolute URL
  const feedUrl = secret 
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/calendar/feed/${secret}`
    : "";

  const handleCopy = () => {
    if (!feedUrl) return;
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-xl bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Sync your calendar</h2>
          </div>
          <button 
            onClick={onClose} 
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-white text-slate-400 transition-colors shadow-sm"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          <p className="text-slate-500 font-medium leading-relaxed text-sm">
            Subscribe to your Studiio bookings directly from your iPhone, Google Calendar, or Outlook. This is a live feed that updates automatically as you schedule new jobs.
          </p>

          {/* The Link Box */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
              Your Secret Subscription Link
            </label>
            <div className="relative group">
              <div className="absolute inset-0 bg-primary/5 rounded-2xl blur-xl group-hover:bg-primary/10 transition-all duration-500" />
              <div className="relative flex items-center gap-3 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl">
                <input
                  readOnly
                  value={feedUrl}
                  className="flex-1 bg-transparent text-sm font-bold text-slate-600 outline-none overflow-hidden"
                />
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 rounded-xl px-4 h-9 bg-white text-slate-900 border border-slate-200 hover:border-primary/40 hover:text-primary transition-all shadow-sm active:scale-95 shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {copied ? "Copied!" : "Copy Link"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-5 bg-slate-50 rounded-[24px] border border-slate-100 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-white flex items-center justify-center shadow-sm">
                  <Smartphone className="h-4 w-4 text-slate-600" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-slate-900">iPhone / Mac</span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 leading-normal">
                Open <span className="font-bold text-slate-700 text-[10px]">Calendar app</span> → Add Account → Other → Add Subscribed Calendar. Paste the link.
              </p>
            </div>

            <div className="p-5 bg-slate-50 rounded-[24px] border border-slate-100 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-white flex items-center justify-center shadow-sm">
                  <Globe className="h-4 w-4 text-slate-600" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-slate-900">Google Calendar</span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 leading-normal">
                Click <span className="font-bold text-slate-700 text-[10px]">+</span> next to "Other calendars" → From URL. Note: Google takes 12-24 hrs to sync.
              </p>
            </div>
          </div>

          {/* Security Banner */}
          <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
            <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Shield className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-[10px] font-medium text-amber-800 leading-normal">
              <span className="font-black uppercase tracking-tighter mr-1">Security Note:</span> This link contains a unique key for your studio. Do not share it publicly as it allows anyone with the link to view your confirmed schedule.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end">
          <button 
            onClick={onClose}
            className="h-12 px-8 rounded-full bg-slate-900 text-white font-bold shadow-lg shadow-slate-200 hover:opacity-90 transition-all active:scale-95"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
