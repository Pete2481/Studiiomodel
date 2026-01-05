"use client";

import React, { useState, useEffect } from "react";
import { 
  Receipt, 
  Search, 
  Plus, 
  Download, 
  TrendingUp,
  Clock,
  AlertCircle,
  Settings2,
  ChevronDown,
  Bell,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InvoiceList } from "./invoice-list";
import Link from "next/link";
import { updateTenantInvoicingSettings } from "@/app/actions/tenant-settings";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { InvoicePreviewModal } from "./invoice-preview-modal";

interface InvoicePageContentProps {
  invoices: any[];
  role?: string;
  isActionLocked?: boolean;
  tenantSettings?: any;
}

export function InvoicePageContent({ 
  invoices, 
  role = "TENANT_ADMIN",
  isActionLocked = false,
  tenantSettings
}: InvoicePageContentProps) {
  const isClient = role === "CLIENT";
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"pending" | "paid">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // 1. Handle deep-linking to an invoice via search param
  useEffect(() => {
    const invoiceId = searchParams.get("invoiceId");
    if (invoiceId) {
      const invoice = invoices.find(i => i.id === invoiceId);
      if (invoice) {
        setSelectedInvoice(invoice);
        setIsPreviewOpen(true);
      }
      
      // Silent cleanup
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("invoiceId");
      const cleanUrl = pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [searchParams, pathname, invoices]);

  // Filters & Pagination state
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Define what counts as "Active" vs "Archived"
  const DUE_TERM_OPTIONS = [
    { label: "Same Day", value: 0 },
    { label: "Within 7 days", value: 7 },
    { label: "Within 15 days", value: 15 },
    { label: "Within 30 days", value: 30 },
    { label: "Within 45 days", value: 45 },
    { label: "Within 60 days", value: 60 },
    { label: "Within 90 days", value: 90 },
  ];

  // Settings states
  const [autoReminders, setAutoReminders] = useState(tenantSettings?.autoInvoiceReminders || false);
  const [dueDays, setDueDays] = useState(tenantSettings?.invoiceDueDays || 7);

  const handleToggleAutoReminders = async () => {
    if (isActionLocked || isUpdating) return;
    const newVal = !autoReminders;
    setAutoReminders(newVal);
    setIsUpdating(true);
    try {
      const result = await updateTenantInvoicingSettings({
        ...tenantSettings,
        taxRate: Number(tenantSettings.taxRate) * 100, // Action expects percentage
        autoInvoiceReminders: newVal,
        invoiceDueDays: dueDays
      });
      if (!result.success) {
        setAutoReminders(!newVal);
        alert(result.error);
      }
    } catch (err) {
      console.error("Toggle error:", err);
      setAutoReminders(!newVal);
      alert("Failed to update settings. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDueDaysChange = async (days: number) => {
    if (isActionLocked || isUpdating) return;
    const prevDays = dueDays;
    setDueDays(days);
    setIsUpdating(true);
    const result = await updateTenantInvoicingSettings({
      ...tenantSettings,
      taxRate: Number(tenantSettings.taxRate) * 100,
      autoInvoiceReminders: autoReminders,
      invoiceDueDays: days
    });
    if (!result.success) {
      setDueDays(prevDays);
      alert(result.error);
    }
    setIsUpdating(false);
  };

  // Define what counts as "Active" vs "Archived"
  const activeInvoices = invoices.filter(inv => inv.status !== "CANCELLED");
  const pendingInvoices = activeInvoices.filter(inv => inv.status !== "PAID");
  const paidInvoices = activeInvoices.filter(inv => inv.status === "PAID");

  const filteredInvoices = (activeTab === "pending" ? pendingInvoices : paidInvoices).filter(inv => {
    const searchStr = `${inv.number} ${inv.client?.businessName || ''} ${inv.client?.name || ''}`.toLowerCase();
    const matchesSearch = searchStr.includes(searchQuery.toLowerCase());
    
    let matchesStatus = true;
    if (statusFilter !== "ALL") {
      if (statusFilter === "OVERDUE") {
        matchesStatus = inv.status !== "PAID" && inv.dueAt && new Date(inv.dueAt) < new Date(new Date().setHours(0,0,0,0));
      } else {
        matchesStatus = inv.status === statusFilter;
      }
    }
    
    return matchesSearch && matchesStatus;
  });

  const totalEntries = filteredInvoices.length;
  const totalPages = Math.ceil(totalEntries / pageSize);
  const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const totalPending = pendingInvoices.reduce((acc, inv) => acc + inv.total, 0);
  const totalPaid = paidInvoices.reduce((acc, inv) => acc + inv.total, 0);
  const overdueCount = pendingInvoices.filter(inv => inv.dueAt && new Date(inv.dueAt) < today).length;

  const debtorsMap = pendingInvoices.reduce((acc: any, inv) => {
    const name = inv.client?.businessName || inv.client?.name || "Unknown";
    acc[name] = (acc[name] || 0) + inv.total;
    return acc;
  }, {});

  const debtorsList = Object.entries(debtorsMap).sort((a: any, b: any) => b[1] - a[1]);
  const topDebtor = debtorsList.length > 0 ? debtorsList[0] : null;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto pb-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <Receipt className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">
              {isClient ? "My Invoices" : "Invoice Management"}
            </h1>
          </div>
          <p className="text-sm font-bold text-slate-400 pl-[52px]">
            {isClient ? "Download copies of your invoices and track payments." : "Manage your studio billings and track payments."}
          </p>
        </div>
        
        {!isClient && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-white border border-slate-100 rounded-2xl p-1 shadow-sm gap-1">
              <div className="flex items-center gap-2 px-3 py-1.5 border-r border-slate-50">
                <div className="relative flex items-center">
                  <button 
                    onClick={handleToggleAutoReminders}
                    disabled={isUpdating}
                    className={cn(
                      "h-5 w-9 rounded-full transition-all relative shrink-0 flex items-center justify-center",
                      autoReminders ? "bg-primary shadow-[0_0_8px_var(--primary-soft)]" : "bg-slate-200"
                    )}
                  >
                    {isUpdating ? (
                      <Loader2 className="h-3 w-3 animate-spin text-white" />
                    ) : (
                      <div className={cn(
                        "absolute top-1 left-1 h-3 w-3 bg-white rounded-full transition-transform",
                        autoReminders ? "translate-x-4" : "translate-x-0"
                      )} />
                    )}
                  </button>
                </div>
                <div className="flex flex-col -space-y-0.5">
                  <span className="text-[9px] font-black text-slate-900 uppercase tracking-tight">Auto Reminders</span>
                  <span className={cn("text-[8px] font-bold uppercase", autoReminders ? "text-primary" : "text-slate-400")}>
                    {autoReminders ? "Active" : "Disabled"}
                  </span>
                </div>
              </div>

              <div className="relative group px-2 py-1.5 flex items-center gap-2 min-w-[140px]">
                <div className="flex flex-col -space-y-0.5 flex-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Due Terms</span>
                  <select 
                    value={dueDays}
                    onChange={(e) => handleDueDaysChange(Number(e.target.value))}
                    disabled={isUpdating}
                    className="appearance-none bg-transparent border-none p-0 text-[10px] font-black text-slate-900 focus:ring-0 cursor-pointer w-full uppercase"
                  >
                    {DUE_TERM_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <ChevronDown className="h-3 w-3 text-slate-300" />
              </div>
            </div>

            <button className="h-12 px-6 rounded-2xl bg-white border border-slate-100 text-slate-600 font-bold text-xs flex items-center gap-2 hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button 
              onClick={() => {
                if (isActionLocked) {
                  window.location.href = "/tenant/settings?tab=billing";
                  return;
                }
                window.location.href = "/tenant/invoices/new";
              }}
              className={cn(
                "h-12 px-8 rounded-2xl bg-primary text-white font-black text-xs flex items-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20",
                isActionLocked && "opacity-50 grayscale hover:grayscale-0 transition-all"
              )}
            >
              <Plus className="h-5 w-5" />
              {isActionLocked ? "SUB REQUIRED" : "CREATE INVOICE"}
            </button>
          </div>
        )}
      </div>

      {!isClient && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 shadow-inner">
                <Clock className="h-6 w-6" />
              </div>
              <div className="px-3 py-1 bg-amber-50 text-amber-600 text-[10px] font-black uppercase rounded-full tracking-wider border border-amber-100">Pending</div>
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900">${totalPending.toLocaleString()}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Outstanding Balance</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center text-emerald-500 shadow-inner">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase rounded-full tracking-wider border border-primary/20">Received</div>
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900">${totalPaid.toLocaleString()}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total Revenue (Paid)</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 shadow-inner">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="px-3 py-1 bg-rose-50 text-rose-600 text-[10px] font-black uppercase rounded-full tracking-wider border border-rose-100">Overdue</div>
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900">{overdueCount} Invoices</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Requiring Attention</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 shadow-inner">
                <Receipt className="h-6 w-6" />
              </div>
              <div className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase rounded-full tracking-wider border border-indigo-100">Top Debtor</div>
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 truncate">{topDebtor ? topDebtor[0] : "None"}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                {topDebtor ? `Owing $${(topDebtor[1] as number).toLocaleString()}` : "All clear!"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden p-8 space-y-8 min-h-[600px]">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
          <div className="flex bg-slate-100/50 p-1.5 rounded-[22px] w-full lg:w-fit border border-slate-100 shadow-inner">
            <button
              onClick={() => setActiveTab("pending")}
              className={cn(
                "px-8 py-2.5 rounded-[18px] text-xs font-black transition-all",
                activeTab === "pending" 
                  ? "bg-white text-slate-900 shadow-md shadow-slate-200/50" 
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              {isClient ? "OUTSTANDING" : "PENDING INVOICES"} ({pendingInvoices.length})
            </button>
            <button
              onClick={() => setActiveTab("paid")}
              className={cn(
                "px-8 py-2.5 rounded-[18px] text-xs font-black transition-all",
                activeTab === "paid" 
                  ? "bg-white text-slate-900 shadow-md shadow-slate-200/50" 
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              {isClient ? "PAID" : "PAID INVOICES"} ({paidInvoices.length})
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
            <div className="relative group w-full sm:w-48">
              <select 
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-14 pl-5 pr-10 bg-slate-50 border-none rounded-[24px] text-xs font-black text-slate-900 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none appearance-none uppercase tracking-widest"
              >
                <option value="ALL">Select Status</option>
                <option value="DRAFT">Draft</option>
                <option value="SENT">Sent</option>
                <option value="OVERDUE">Overdue</option>
                <option value="PAID">Paid</option>
              </select>
              <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 pointer-events-none" />
            </div>

            <div className="relative group w-full sm:w-48">
              <select 
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="w-full h-14 pl-5 pr-10 bg-slate-50 border-none rounded-[24px] text-xs font-black text-slate-900 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none appearance-none uppercase tracking-widest"
              >
                <option value={10}>Show 10 Entries</option>
                <option value={25}>Show 25 Entries</option>
                <option value={50}>Show 50 Entries</option>
                <option value={100}>Show 100 Entries</option>
              </select>
              <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 pointer-events-none" />
            </div>

            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
              <input 
                type="text"
                placeholder="Search by invoice # or client..."
                className="w-full h-14 pl-12 pr-6 bg-slate-50 border-none rounded-[24px] text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        <InvoiceList invoices={paginatedInvoices} role={role} />

        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-slate-50">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalEntries)} of {totalEntries} entries
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="h-10 px-4 rounded-xl bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all disabled:opacity-30 disabled:hover:bg-slate-50"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i + 1}
                  onClick={() => setCurrentPage(i + 1)}
                  className={cn(
                    "h-10 w-10 rounded-xl text-[10px] font-black transition-all",
                    currentPage === i + 1 
                      ? "bg-primary text-white shadow-lg shadow-primary/20" 
                      : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                  )}
                >
                  {i + 1}
                </button>
              ))}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="h-10 px-4 rounded-xl bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all disabled:opacity-30 disabled:hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <InvoicePreviewModal 
        isOpen={isPreviewOpen} 
        onClose={() => setIsPreviewOpen(false)} 
        invoice={selectedInvoice} 
      />
    </div>
  );
}
