"use client";

import React from "react";
import { X, Download, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: any;
}

export function InvoicePreviewModal({ isOpen, onClose, invoice }: InvoicePreviewModalProps) {
  if (!isOpen || !invoice) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-10 animate-in fade-in duration-200">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      <div className="relative z-10 flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl transition-all scale-in duration-300">
        <header className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/50 px-8 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Invoice {invoice.number}</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Preview Mode</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`/api/tenant/${invoice.tenantId}/invoices/${invoice.id}/pdf`}
              download={`Invoice-${invoice.number}.pdf`}
              className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95 sm:flex shadow-sm"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </a>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 active:scale-95"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="flex-1 bg-slate-100/50 p-0 sm:p-6 overflow-hidden">
          <div className="h-full w-full rounded-none border-0 bg-white shadow-inner sm:rounded-2xl sm:border sm:border-slate-200 overflow-hidden relative">
            <iframe 
              src={`/api/tenant/${invoice.tenantId}/invoices/${invoice.id}/pdf#toolbar=0&navpanes=0`} 
              title={`Invoice ${invoice.number}`}
              className="h-full w-full"
            />
            {/* Overlay if needed for specific logic */}
          </div>
        </div>
      </div>
    </div>
  );
}

