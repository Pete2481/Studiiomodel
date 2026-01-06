"use client";

import React, { useState } from "react";
import { X, ArrowRight, Calendar, ImageIcon, Paintbrush, AlertCircle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Local type - no mock data dependency
export type MetricSummary = {
  editRequests: number;
  completedOrders: number;
  pendingBookings: number;
  pendingInvoices: number;
  undeliveredGalleries: number;
};

type MetricCardProps = {
  label: string;
  value: string;
  trendLabel?: string;
  onClick?: () => void;
  isAttention?: boolean;
};

const metricPalette = [
  "from-rose-500/10 to-rose-500/0 text-rose-600 border-rose-100",
  "from-emerald-400/10 to-emerald-400/0 text-emerald-600",
  "from-amber-400/10 to-amber-400/0 text-amber-600",
  "from-sky-400/10 to-sky-400/0 text-sky-600",
] as const;

export function MetricCards({ metrics }: { metrics: MetricSummary }) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const attentionTotal = metrics.pendingBookings + metrics.undeliveredGalleries + metrics.editRequests;

  const rows: MetricCardProps[] = [
    {
      label: "Attention required",
      value: attentionTotal.toString(),
      trendLabel: "Critical action items",
      onClick: () => setShowBreakdown(true),
      isAttention: true
    },
    {
      label: "Completed orders",
      value: metrics.completedOrders.toLocaleString(),
      trendLabel: "Lifetime fulfilments",
    },
    {
      label: "Bookings pending",
      value: metrics.pendingBookings.toString(),
      trendLabel: "Awaiting confirmations",
    },
    {
      label: "Pending invoices",
      value: metrics.pendingInvoices.toString(),
      trendLabel: "Requires follow-up",
    },
  ];

  return (
    <>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 w-full auto-rows-fr">
        {rows.map((row, index) => {
          const palette = metricPalette[index % metricPalette.length];
          return (
            <article
              key={row.label}
              onClick={row.onClick}
              className={cn(
                "relative overflow-hidden rounded-[24px] md:rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg cursor-default w-full min-w-0 flex flex-col justify-center",
                row.onClick && "cursor-pointer active:scale-[0.98]",
                row.isAttention && attentionTotal > 0 && "border-rose-200 ring-2 ring-rose-500/5 shadow-rose-100"
              )}
            >
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-60", palette)} />
              <div className="relative space-y-3 min-w-0">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <p className={cn(
                    "text-[10px] md:text-[11px] font-bold uppercase tracking-widest text-slate-500/70 truncate",
                    row.isAttention && attentionTotal > 0 && "text-rose-600"
                  )}>{row.label}</p>
                  {row.isAttention && attentionTotal > 0 && (
                    <span className="flex h-2 w-2 flex-none rounded-full bg-rose-500 animate-pulse" />
                  )}
                </div>
                <p className={cn(
                  "text-2xl md:text-3xl font-black text-slate-900 truncate",
                  row.isAttention && attentionTotal > 0 && "text-rose-600 italic"
                )}>{row.value}</p>
                {row.trendLabel ? <p className="text-[10px] md:text-[11px] font-medium text-slate-500 leading-tight truncate">{row.trendLabel}</p> : null}
              </div>
            </article>
          );
        })}
      </div>

      {/* Breakdown Popup */}
      {showBreakdown && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div 
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300" 
            onClick={() => setShowBreakdown(false)} 
          />
          
          <div className="relative w-full max-w-md bg-white rounded-[40px] shadow-[0_32px_128px_-12px_rgba(0,0,0,0.2)] border border-slate-100 overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-200">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Ops Required</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Immediate Attention Needed</p>
                </div>
              </div>
              <button 
                onClick={() => setShowBreakdown(false)}
                className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-white text-slate-400 transition-all shadow-sm"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-8 space-y-4">
              <BreakdownItem 
                icon={Calendar}
                label="Unconfirmed Bookings"
                count={metrics.pendingBookings}
                href="/tenant/bookings?status=REQUESTED"
                color="text-amber-600 bg-amber-50"
              />
              <BreakdownItem 
                icon={ImageIcon}
                label="Undelivered Galleries"
                count={metrics.undeliveredGalleries}
                href="/tenant/galleries"
                color="text-emerald-600 bg-emerald-50"
              />
              <BreakdownItem 
                icon={Paintbrush}
                label="New Edit Requests"
                count={metrics.editRequests}
                href="/tenant/edits"
                color="text-sky-600 bg-sky-50"
              />
            </div>

            <div className="p-8 bg-slate-50/50 border-t border-slate-50">
              <button 
                onClick={() => setShowBreakdown(false)}
                className="w-full h-14 rounded-2xl bg-slate-900 text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BreakdownItem({ icon: Icon, label, count, href, color }: any) {
  if (count === 0) return null;

  return (
    <Link 
      href={href}
      className="group flex items-center justify-between p-4 rounded-3xl border border-slate-100 bg-white hover:border-slate-200 hover:shadow-lg hover:shadow-slate-100 transition-all active:scale-[0.98]"
    >
      <div className="flex items-center gap-4">
        <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-black text-slate-900 uppercase italic tracking-tight">{label}</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{count} Items</p>
        </div>
      </div>
      <div className="h-10 w-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-colors">
        <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}
