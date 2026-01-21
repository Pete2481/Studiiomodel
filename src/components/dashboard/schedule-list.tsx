"use client";

import { format } from "date-fns";
import { ChevronRight, MapPin, User, Clock } from "lucide-react";
import Link from "next/link";

export type ScheduleItem = {
  id: string;
  title: string;
  address: string;
  clientName: string;
  startTime: string;
  endTime: string;
  status: "CONFIRMED" | "REQUESTED" | "PENCILED";
  color?: string;
};

const statusColors = {
  CONFIRMED: {
    bg: "bg-emerald-50 text-emerald-600 border-emerald-100",
    dot: "bg-emerald-500",
    label: "CONFIRMED"
  },
  REQUESTED: {
    bg: "bg-amber-50 text-amber-600 border-amber-100",
    dot: "bg-amber-500",
    label: "REQUESTED"
  },
  PENCILED: {
    bg: "bg-slate-50 text-slate-600 border-slate-100",
    dot: "bg-slate-500",
    label: "PENCILED"
  }
};

interface ScheduleListProps {
  items: ScheduleItem[];
}

export function ScheduleList({ items }: ScheduleListProps) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Upcoming Schedule</h2>
        <Link
          href="/tenant/bookings"
          prefetch={false}
          className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-slate-900 transition-colors flex items-center gap-2"
        >
          View Calendar ➔
        </Link>
      </div>

      <div className="space-y-4">
        {items.map((item) => {
          const colors = statusColors[item.status] || statusColors.CONFIRMED;
          
          return (
            <div 
              key={item.id}
              className="group flex items-center justify-between rounded-[32px] border border-slate-100 bg-white p-8 shadow-sm transition-all duration-300 hover:shadow-2xl hover:border-slate-200 cursor-pointer"
            >
              <div className="flex items-center gap-8">
                {/* Status Bar */}
                <div className={`h-16 w-1.5 rounded-full ${colors.dot} shadow-[0_0_12px_rgba(0,0,0,0.1)]`} />

                <div className="space-y-2">
                  <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-emerald-600 transition-colors">
                    {item.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-6 text-[11px] font-bold text-slate-400 uppercase tracking-tight">
                    <span className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5" /> {item.address}
                    </span>
                    <span className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5" /> {item.clientName}
                    </span>
                    <span className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" /> {item.startTime} – {item.endTime}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <span className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] border ${colors.bg}`}>
                  {colors.label}
                </span>
                <button className="h-12 w-12 rounded-full flex items-center justify-center text-slate-200 group-hover:bg-slate-50 group-hover:text-slate-900 transition-all">
                  <ChevronRight className="h-6 w-6" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
