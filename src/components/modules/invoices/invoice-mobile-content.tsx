"use client";

import React, { useState } from "react";
import { 
  Plus, 
  Search, 
  Receipt, 
  MoreVertical, 
  Trash2, 
  Edit2,
  ChevronRight,
  MoreHorizontal,
  Send,
  Calendar,
  Building2,
  CreditCard,
  ExternalLink,
  Eye,
  ArrowUpRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { format } from "date-fns";

interface InvoiceMobileContentProps {
  initialInvoices: any[];
  role: string;
}

export function InvoiceMobileContent({ initialInvoices, role }: InvoiceMobileContentProps) {
  const router = useRouter();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [searchQuery, setSearchQuery] = useState("");
  const [isActionsOpen, setIsActionsOpen] = useState<string | null>(null);

  const filteredInvoices = invoices.filter(inv => 
    inv.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.client?.businessName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.client?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'SENT': return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'OVERDUE': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'DRAFT': return 'bg-slate-50 text-slate-500 border-slate-100';
      default: return 'bg-slate-50 text-slate-500 border-slate-100';
    }
  };

  return (
    <div className="space-y-6 px-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <input 
          type="text" 
          placeholder="Search by invoice # or client..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-14 bg-slate-50 border-none rounded-2xl pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-primary/20 transition-all shadow-sm" 
        />
      </div>

      {/* Invoice Cards */}
      <div className="space-y-4">
        {filteredInvoices.length > 0 ? (
          filteredInvoices.map((invoice) => (
            <div 
              key={invoice.id}
              className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
              onClick={() => router.push(role === 'CLIENT' ? `/gallery/${invoice.galleryId}` : `/tenant/invoices/${invoice.id}`)}
            >
              <div className="p-6">
                {/* Card Header */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center shrink-0 shadow-inner ring-1 ring-slate-100">
                      <Receipt className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base font-black text-slate-900 truncate leading-tight">
                        {invoice.number}
                      </h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {invoice.client?.businessName || invoice.client?.name || "No Client"}
                      </p>
                    </div>
                  </div>
                  
                  <div className={cn(
                    "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border",
                    getStatusColor(invoice.status)
                  )}>
                    {invoice.status}
                  </div>
                </div>

                {/* Amount & Address Row */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50">
                    <div className="flex items-center gap-2 text-emerald-600 mb-1">
                      <CreditCard className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Total</span>
                    </div>
                    <p className="text-xl font-black text-slate-900">${invoice.total.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50">
                    <div className="flex items-center gap-2 text-primary mb-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Issued</span>
                    </div>
                    <p className="text-sm font-black text-slate-900 truncate">
                      {invoice.issuedAt ? format(new Date(invoice.issuedAt), "MMM d, yyyy") : "Draft"}
                    </p>
                  </div>
                </div>

                {/* Property Address */}
                {invoice.address && (
                  <div className="mb-6 px-4 py-3 bg-slate-50/30 rounded-2xl border border-slate-50 flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-slate-200" />
                    <p className="text-xs font-bold text-slate-500 truncate">{invoice.address}</p>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="flex gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(role === 'CLIENT' ? `/gallery/${invoice.galleryId}` : `/tenant/invoices/${invoice.id}/edit`);
                    }}
                    className="flex-1 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center gap-3 font-bold text-sm transition-all active:scale-95 shadow-sm shadow-slate-900/10"
                  >
                    {role === 'CLIENT' ? <Eye className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
                    {role === 'CLIENT' ? 'View Invoice' : 'Edit Details'}
                  </button>
                  <button 
                    className="h-14 w-14 rounded-2xl bg-primary text-white flex items-center justify-center active:scale-95 transition-all shadow-sm shadow-primary/10"
                  >
                    <ArrowUpRight className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Status Footer */}
              <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    invoice.status === 'PAID' ? "bg-emerald-500" : invoice.status === 'OVERDUE' ? "bg-rose-500 animate-pulse" : "bg-blue-500"
                  )} />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    {invoice.dueAt ? `Due ${format(new Date(invoice.dueAt), "MMM d")}` : "No due date"}
                  </span>
                </div>
                {invoice.paidAmount > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
                    <CreditCard className="h-3 w-3" />
                    PARTIAL PAID
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <EmptyState 
            icon={Receipt}
            title={searchQuery ? "No matching invoices" : "No invoices found"}
            description={searchQuery 
              ? "Try adjusting your search terms or filters." 
              : "Generate invoices from delivered galleries to start your collection cycle."}
            action={role !== 'CLIENT' && !searchQuery ? {
              label: "New Invoice",
              onClick: () => router.push("/tenant/invoices/new"),
              icon: Plus
            } : undefined}
          />
        )}
      </div>
    </div>
  );
}

