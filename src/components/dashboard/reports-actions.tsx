"use client";

import React, { useState, useEffect } from "react";
import { Download, Calendar, Filter, X, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfWeek, startOfMonth, subMonths, subDays } from "date-fns";

interface ReportsActionsProps {
  tenantId: string;
}

export function ReportsActions({ tenantId }: ReportsActionsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [preset, setPreset] = useState("month");
  const [isDownloading, setIsDownloading] = useState(false);

  const applyPreset = (p: string) => {
    setPreset(p);
    const now = new Date();
    const to = format(now, "yyyy-MM-dd");
    let from = to;

    switch (p) {
      case "week":
        from = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
        break;
      case "month":
        from = format(startOfMonth(now), "yyyy-MM-dd");
        break;
      case "30d":
        from = format(subDays(now, 30), "yyyy-MM-dd");
        break;
      case "90d":
        from = format(subDays(now, 90), "yyyy-MM-dd");
        break;
      case "ytd":
        from = format(new Date(now.getFullYear(), 0, 1), "yyyy-MM-dd");
        break;
    }
    setDateFrom(from);
    setDateTo(to);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const qs = new URLSearchParams({ from: dateFrom, to: dateTo });
      const res = await fetch(`/api/tenant/${tenantId}/reports/pdf?${qs.toString()}`);
      if (!res.ok) throw new Error("Failed to generate PDF");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Performance-Report-${dateFrom}-to-${dateTo}.pdf`;
      link.click();
      setIsModalOpen(false);
    } catch (e) {
      alert("Error generating report");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsModalOpen(true)}
        className="ui-button-primary flex items-center gap-2 px-6"
      >
        <Download className="h-4 w-4" />
        Export PDF Report
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          
          <div className="relative w-full max-w-lg bg-white rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in duration-300">
            {/* Header */}
            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                  <Download className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Export Insights</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Select Date Range</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="h-10 w-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {/* Body */}
            <div className="p-8 space-y-8">
              {/* Presets */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'week', label: 'This Week' },
                  { id: 'month', label: 'This Month' },
                  { id: '30d', label: 'Last 30 Days' },
                  { id: '90d', label: 'Last 90 Days' },
                  { id: 'ytd', label: 'Year to Date' },
                  { id: 'custom', label: 'Custom' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    className={cn(
                      "px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all",
                      preset === p.id 
                        ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" 
                        : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Date Pickers */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">From</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                    <input 
                      type="date"
                      value={dateFrom}
                      onChange={(e) => { setDateFrom(e.target.value); setPreset('custom'); }}
                      className="w-full h-12 pl-12 pr-4 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">To</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                    <input 
                      type="date"
                      value={dateTo}
                      onChange={(e) => { setDateTo(e.target.value); setPreset('custom'); }}
                      className="w-full h-12 pl-12 pr-4 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 bg-slate-50/50 border-t border-slate-50 flex items-center justify-end gap-4">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-3 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleDownload}
                disabled={isDownloading}
                className="ui-button-primary px-8 py-3 flex items-center gap-2 shadow-xl shadow-primary/20 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {isDownloading ? "Generating..." : "Generate PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

