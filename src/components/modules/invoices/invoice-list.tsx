"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  MoreVertical, 
  Eye, 
  Download, 
  Check, 
  Mail, 
  Trash2, 
  Edit2, 
  Building2,
  CalendarDays,
  Receipt
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfToday } from "date-fns";
import { updateInvoiceStatus, deleteInvoice, sendInvoiceReminder } from "@/app/actions/invoice";
import { InvoicePreviewModal } from "./invoice-preview-modal";

interface InvoiceListProps {
  invoices: any[];
  role?: string;
  selection?: {
    selectedIds: Set<string>;
    onToggle: (id: string, checked: boolean) => void;
    onToggleAll: (checked: boolean) => void;
    allSelected: boolean;
    someSelected: boolean;
    disabled?: boolean;
  };
}

export function InvoiceList({ invoices, role = "TENANT_ADMIN", selection }: InvoiceListProps) {
  const router = useRouter();
  const isClient = role === "CLIENT";
  const selectionEnabled = !!selection && !isClient;
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const today = startOfToday();

  const handleMarkPaid = async (id: string) => {
    if (confirm("Mark this invoice as paid?")) {
      setIsProcessing(id);
      const result = await updateInvoiceStatus(id, "PAID");
      if (!result.success) alert(result.error);
      setIsProcessing(null);
    }
    setIsActionsOpen(null);
  };

  const handleMarkUnpaid = async (id: string) => {
    if (confirm("Revert this invoice to unpaid status?")) {
      setIsProcessing(id);
      const result = await updateInvoiceStatus(id, "SENT");
      if (!result.success) alert(result.error);
      setIsProcessing(null);
    }
    setIsActionsOpen(null);
  };

  const handleSendReminder = async (id: string) => {
    setIsProcessing(id);
    const result = await sendInvoiceReminder(id);
    if (result.success) {
      alert("Reminder sent!");
    } else {
      alert(result.error);
    }
    setIsProcessing(null);
    setIsActionsOpen(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this invoice?")) {
      setIsProcessing(id);
      const result = await deleteInvoice(id);
      if (!result.success) alert(result.error);
      setIsProcessing(null);
    }
    setIsActionsOpen(null);
  };

  const handlePreview = (invoice: any) => {
    setSelectedInvoice(invoice);
    setIsPreviewOpen(true);
    setIsActionsOpen(null);
  };

  return (
    <div className="space-y-3">
      {selectionEnabled && (
        <div
          className={cn(
            "hidden lg:grid lg:gap-4 lg:items-center px-8 py-3 rounded-[24px] border border-slate-100 bg-slate-50/50",
            "lg:grid-cols-[0.4fr_1.2fr_2fr_1.2fr_1.2fr_1.2fr_1.2fr_0.8fr_0.5fr]"
          )}
        >
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={selection!.allSelected}
              ref={(el) => {
                if (el) el.indeterminate = selection!.someSelected && !selection!.allSelected;
              }}
              disabled={selection?.disabled}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => selection!.onToggleAll(e.target.checked)}
              className="h-4 w-4 rounded border-slate-200 text-primary focus:ring-primary/20 disabled:opacity-50"
              aria-label="Select all invoices on this page"
            />
          </div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice</div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dates</div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Seen</div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right pr-1">More</div>
        </div>
      )}
      {invoices.map((invoice) => {
        const isOverdue = invoice.status !== 'PAID' && invoice.dueAt && new Date(invoice.dueAt) < today;
        
        return (
          <div 
            key={invoice.id} 
            className={cn(
              "group grid grid-cols-1 gap-4 items-center px-8 py-5 rounded-[32px] border transition-all relative cursor-pointer",
              invoice.status === 'PAID' ? "bg-emerald-50/30 border-emerald-100 hover:border-emerald-300" :
              invoice.status === 'SENT' ? "bg-white border-slate-100 hover:border-sky-300" :
              isOverdue ? "bg-rose-50/20 border-rose-100 hover:border-rose-300" :
              "bg-white border-slate-100 hover:border-primary/40",
              isClient 
                ? "lg:grid-cols-[1.2fr_2fr_1.2fr_1.2fr_1.2fr_1.2fr_0.5fr]" 
                : selectionEnabled
                  ? "lg:grid-cols-[0.4fr_1.2fr_2fr_1.2fr_1.2fr_1.2fr_1.2fr_0.8fr_0.5fr]"
                  : "lg:grid-cols-[1.2fr_2fr_1.2fr_1.2fr_1.2fr_1.2fr_0.8fr_0.5fr]"
            )}
            onClick={() => handlePreview(invoice)}
          >
            {/* Select */}
            {selectionEnabled && (
              <div className="flex items-center justify-start lg:justify-center">
                <input
                  type="checkbox"
                  checked={selection!.selectedIds.has(invoice.id)}
                  disabled={selection?.disabled}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => selection!.onToggle(invoice.id, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-200 text-primary focus:ring-primary/20 disabled:opacity-50"
                  aria-label={`Select invoice ${invoice.number}`}
                />
              </div>
            )}

            {/* Invoice # */}
            <div className="flex items-center gap-4">
              <div className={cn(
                "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner transition-colors",
                invoice.status === 'PAID' ? "bg-primary/10 text-primary" : "bg-slate-50 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary"
              )}>
                <Receipt className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-900 truncate">{invoice.number}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">Invoice</p>
              </div>
            </div>

            {/* Client & Address */}
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-slate-900 truncate group-hover:text-primary transition-colors">
                {invoice.client?.businessName || invoice.client?.name}
              </h4>
              <p className="text-[10px] font-medium text-slate-400 truncate mt-0.5">{invoice.address}</p>
            </div>

            {/* Dates */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                <CalendarDays className="h-3 w-3" /> Issued {format(new Date(invoice.issuedAt), "dd MMM")}
              </div>
              <div className={cn(
                "text-[10px] font-bold uppercase tracking-tighter",
                isOverdue ? "text-rose-500" : "text-slate-400"
              )}>
                Due {format(new Date(invoice.dueAt), "dd MMM")}
              </div>
            </div>

            {/* Amount */}
            <div>
              <p className="text-sm font-bold text-slate-900">${invoice.total.toFixed(2)}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">Total Amount</p>
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1.5">
              {isOverdue ? (
                <span className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[9px] font-black bg-rose-50 text-rose-600 border border-rose-100 uppercase tracking-wider w-fit animate-pulse">
                  OVERDUE
                </span>
              ) : (
                <span className={cn(
                  "inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[9px] font-bold border uppercase tracking-wider w-fit",
                  invoice.status === 'PAID' ? "bg-primary/10 text-primary border-primary/20" : 
                  invoice.status === 'SENT' ? "bg-sky-50 text-sky-600 border-sky-100" :
                  "bg-amber-50 text-amber-600 border-amber-100"
                )}>
                  {invoice.status}
                </span>
              )}
            </div>

            {/* Action Slot */}
            <div className="flex items-center">
              {!isClient && invoice.status !== 'PAID' && (
                <button 
                  onClick={(e) => { e.stopPropagation(); handleMarkPaid(invoice.id); }}
                  disabled={isProcessing === invoice.id}
                  className="h-10 px-4 rounded-xl bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all active:scale-95 disabled:opacity-50"
                >
                  {isProcessing === invoice.id ? "..." : "Mark as Paid"}
                </button>
              )}
              {!isClient && invoice.status === 'PAID' && (
                <button 
                  onClick={(e) => { e.stopPropagation(); handleMarkUnpaid(invoice.id); }}
                  disabled={isProcessing === invoice.id}
                  className="h-10 px-4 rounded-xl bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isProcessing === invoice.id ? "..." : "Mark Unpaid"}
                </button>
              )}
              {isClient && invoice.status !== 'PAID' && (
                <button 
                  onClick={(e) => { e.stopPropagation(); alert("Payment integration coming soon!"); }}
                  className="h-10 px-4 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20"
                >
                  Pay now
                </button>
              )}
            </div>

            {/* Viewed Indicator */}
            {!isClient && (
              <div className="flex items-center justify-center">
                {invoice.viewedAt ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-full border border-primary/20">
                    <Eye className="h-3 w-3 text-primary" />
                    <span className="text-[9px] font-bold text-primary uppercase tracking-widest">Viewed</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100">
                    <Eye className="h-3 w-3 text-slate-300" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Unseen</span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 relative">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsActionsOpen(isActionsOpen === invoice.id ? null : invoice.id);
                }}
                className="h-9 w-9 flex items-center justify-center rounded-full border border-slate-100 hover:bg-slate-50 text-slate-400 hover:text-slate-900 transition-all"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {isActionsOpen === invoice.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setIsActionsOpen(null); }} />
                  <div className="absolute right-0 top-10 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-20 animate-in fade-in zoom-in duration-150">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePreview(invoice); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" /> View Invoice
                    </button>
                    {!isClient && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); router.push(`/tenant/invoices/${invoice.id}/edit`); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit Invoice
                      </button>
                    )}
                    <a 
                      href={`/api/tenant/${invoice.tenantId}/invoices/${invoice.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" /> Download PDF
                    </a>
                    {!isClient && invoice.status !== 'PAID' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleSendReminder(invoice.id); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-sky-600 hover:bg-sky-50 transition-colors"
                      >
                        <Mail className="h-3.5 w-3.5" /> Send Reminder
                      </button>
                    )}
                    {!isClient && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(invoice.id); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors border-t border-slate-50 mt-1 pt-2"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete Invoice
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}

      {invoices.length === 0 && (
        <div className="py-20 text-center text-slate-400 text-sm font-medium border-2 border-dashed border-slate-100 rounded-[40px]">
          No invoices found in this section.
        </div>
      )}

      <InvoicePreviewModal 
        isOpen={isPreviewOpen} 
        onClose={() => setIsPreviewOpen(false)} 
        invoice={selectedInvoice} 
      />
    </div>
  );
}
