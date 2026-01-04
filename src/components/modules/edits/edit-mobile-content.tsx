"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink,
  ChevronRight,
  Filter,
  Image as ImageIcon,
  MessageSquare
} from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

interface EditMobileContentProps {
  initialRequests: any[];
  userRole: string;
}

export function EditMobileContent({ initialRequests, userRole }: EditMobileContentProps) {
  const [filter, setFilter] = useState<string>("ALL");

  const filteredRequests = initialRequests.filter(req => {
    if (filter === "ALL") return true;
    return req.status === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "NEW": return "bg-blue-50 text-blue-600 border-blue-100";
      case "IN_PROGRESS": return "bg-amber-50 text-amber-600 border-amber-100";
      case "COMPLETED": return "bg-emerald-50 text-emerald-600 border-emerald-100";
      case "CANCELLED": return "bg-slate-50 text-slate-400 border-slate-100";
      default: return "bg-slate-50 text-slate-600 border-slate-100";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "NEW": return AlertCircle;
      case "COMPLETED": return CheckCircle2;
      default: return Clock;
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="px-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          {["ALL", "NEW", "IN_PROGRESS", "COMPLETED"].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-all",
                filter === tab 
                  ? "bg-slate-900 text-white border-slate-900 shadow-md" 
                  : "bg-white text-slate-500 border-slate-100"
              )}
            >
              {tab.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="px-6 space-y-4">
        {filteredRequests.length > 0 ? (
          filteredRequests.map((req) => {
            const StatusIcon = getStatusIcon(req.status);
            return (
              <div key={req.id} className="p-5 rounded-[32px] bg-white border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black uppercase tracking-wider text-slate-400">
                        {req.gallery?.title || "Gallery"}
                      </h4>
                      {req.gallery?.invoices?.[0] && (
                        <span className="px-1.5 py-0.5 bg-rose-50 text-rose-500 text-[8px] font-black uppercase tracking-widest rounded border border-rose-100 animate-in fade-in">
                          Invoiced
                        </span>
                      )}
                    </div>
                    <p className="text-base font-bold text-slate-900 line-clamp-2">
                      {req.note}
                    </p>
                  </div>
                  <div className={cn("px-3 py-1 rounded-lg border text-[10px] font-black flex items-center gap-1.5 shrink-0", getStatusColor(req.status))}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {req.status}
                  </div>
                </div>

                <div className="flex items-center gap-4 py-2">
                  {req.thumbnailUrl ? (
                    <div className="h-16 w-16 rounded-2xl overflow-hidden bg-slate-50 ring-1 ring-slate-100 shrink-0">
                      <img src={req.thumbnailUrl} className="h-full w-full object-cover" alt="Request" />
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-200 shrink-0">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {req.selectedTags.map((st: any) => (
                        <span key={st.id} className="px-2 py-0.5 bg-slate-50 text-slate-500 text-[10px] font-bold rounded-md">
                          {st.editTag.name}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] font-medium text-slate-400">
                      Requested {format(new Date(req.createdAt), "MMM d, h:mma")}
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3 border-t border-slate-50">
                  <Link 
                    href={`/gallery/${req.galleryId}`}
                    className="flex-1 h-12 bg-slate-50 rounded-2xl flex items-center justify-center gap-2 text-slate-600 text-xs font-bold"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open Gallery
                  </Link>
                  <button className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                    <MessageSquare className="h-5 w-5" />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState 
            icon={Filter}
            title="No edit requests found"
            description="Requests for retouching and post-production will appear here once submitted."
            className="mt-12"
          />
        )}
      </div>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}

