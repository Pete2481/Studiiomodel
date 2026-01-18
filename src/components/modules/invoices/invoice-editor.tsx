"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Receipt, 
  ArrowLeft, 
  Save, 
  Send, 
  Plus, 
  Trash2, 
  Building2, 
  Calendar, 
  DollarSign, 
  Percent,
  ChevronDown,
  Layout,
  FileText,
  AlertCircle,
  Search,
  Check,
  User,
  Camera,
  Video,
  Wrench,
  Sun,
  Box,
  Edit3,
  Plane
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { format, addDays } from "date-fns";
import { useRouter } from "next/navigation";
import { upsertInvoice, getNextInvoiceNumberAction } from "@/app/actions/invoice";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  serviceId?: string | null;
}

interface InvoiceEditorProps {
  clients: any[];
  services: any[];
  bookings: any[];
  initialData?: any;
  prefillData?: any;
  tenant?: any;
  isActionLocked?: boolean;
}

export function InvoiceEditor({ clients, services, bookings, initialData, prefillData, tenant, isActionLocked = false }: InvoiceEditorProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tenantSettings = (tenant?.settings as any) || {};
  const isTaxInclusive = tenant?.taxInclusive ?? true;

  // Custom Dropdown States
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [isBookingDropdownOpen, setIsBookingDropdownOpen] = useState(false);
  const [bookingSearchQuery, setBookingSearchQuery] = useState("");
  const [activeServiceDropdownId, setActiveServiceDropdownId] = useState<string | null>(null);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");

  const IconMap: Record<string, any> = {
    CAMERA: Camera,
    DRONE: Plane,
    VIDEO: Video,
    FILETEXT: FileText,
    SERVICE: Wrench,
    SUNSET: Sun,
    PACKAGE: Box,
    "EDIT PEN": Edit3,
    PERSON: User
  };

  const [formData, setFormData] = useState({
    id: initialData?.id || null,
    number: initialData?.number || "",
    clientId: initialData?.clientId || prefillData?.clientId || "",
    bookingId: initialData?.bookingId || prefillData?.bookingId || "",
    address: initialData?.address || prefillData?.address || "",
    issuedAt: initialData?.issuedAt ? format(new Date(initialData.issuedAt), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
    dueAt: initialData?.dueAt ? format(new Date(initialData.dueAt), "yyyy-MM-dd") : format(addDays(new Date(), tenant?.invoiceDueDays ?? 7), "yyyy-MM-dd"),
    status: initialData?.status || "DRAFT",
    discount: initialData?.discount || 0,
    taxRate: initialData?.taxRate !== undefined ? initialData.taxRate : (tenant?.taxRate !== null ? Number(tenant.taxRate) : 0.1),
    paidAmount: initialData?.paidAmount || 0,
    paymentTerms: initialData?.paymentTerms || (tenant?.accountName ? `Account Name: ${tenant.accountName}\nBSB: ${tenant.bsb || ""}  Account: ${tenant.accountNumber || ""}` : ""),
    clientNotes: initialData?.clientNotes || "Thank you for your business!",
    invoiceTerms: initialData?.invoiceTerms || tenant?.invoiceTerms || "",
    internalNotes: initialData?.internalNotes || "",
    galleryId: initialData?.galleryId || prefillData?.galleryId || "",
    lineItems:
      initialData?.lineItems?.map((li: any, i: number) => ({ ...li, id: li.id || `li-${i}` })) ||
      prefillData?.lineItems?.map((li: any, i: number) => ({ ...li, id: li.id || `li-${i}` })) || [
        { id: "li-0", description: "", quantity: 1, unitPrice: 0 }
      ]
  });

  // AUTO-CALCULATE DUE DATE based on Issue Date and Tenant Terms
  useEffect(() => {
    // Only auto-fill if we are creating a NEW invoice or if specific fields change
    if (!initialData && formData.issuedAt) {
      const days = tenant?.invoiceDueDays ?? 7;
      const newDueAt = addDays(new Date(formData.issuedAt), days);
      setFormData(prev => ({
        ...prev,
        dueAt: format(newDueAt, "yyyy-MM-dd")
      }));
    }
  }, [formData.issuedAt, tenant?.invoiceDueDays, initialData]);

  useEffect(() => {
    if (!initialData) {
      const fetchNextNumber = async () => {
        const result = await getNextInvoiceNumberAction();
        if (result.success) {
          setFormData(prev => ({ ...prev, number: result.number || "" }));
        }
      };
      fetchNextNumber();
    }
  }, [initialData]);

  const handleLineItemChange = (id: string, updates: Partial<LineItem>) => {
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.map((item: any) => item.id === id ? { ...item, ...updates } : item)
    }));
  };

  const addLineItem = () => {
    setFormData(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, { id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0 }]
    }));
  };

  const removeLineItem = (id: string) => {
    if (formData.lineItems.length === 1) return;
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter((item: any) => item.id !== id)
    }));
  };

  const handleServiceSelect = (id: string, serviceId: string) => {
    const service = services.find(s => s.id === serviceId);
    if (service) {
      // Check for price overrides if a client is selected
      let unitPrice = Number(service.price);
      if (formData.clientId) {
        const client = clients.find(c => c.id === formData.clientId);
        const priceOverrides = (client?.settings as any)?.priceOverrides || {};
        if (priceOverrides[serviceId] !== undefined) {
          unitPrice = Number(priceOverrides[serviceId]);
        }
      }

      handleLineItemChange(id, { 
        serviceId, 
        description: service.name, 
        unitPrice: unitPrice 
      });
    }
  };

  const handleBookingSelect = (bookingId: string) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (booking) {
      setFormData(prev => ({ ...prev, bookingId, address: booking.address }));
    } else {
      setFormData(prev => ({ ...prev, bookingId: "", address: "" }));
    }
  };

  const totals = useMemo(() => {
    const subtotal = formData.lineItems.reduce((acc: number, item: any) => acc + (item.quantity * item.unitPrice), 0);
    const discountAmount = formData.discount;
    const amountAfterDiscount = Math.max(0, subtotal - discountAmount);
    
    let taxAmount = 0;
    let total = 0;
    let exTaxSubtotal = 0;

    if (isTaxInclusive) {
      // Standard in Australia: Price includes GST
      total = amountAfterDiscount;
      taxAmount = total * (formData.taxRate / (1 + formData.taxRate));
      exTaxSubtotal = total - taxAmount;
    } else {
      // US style: Price + Tax
      exTaxSubtotal = amountAfterDiscount;
      taxAmount = exTaxSubtotal * formData.taxRate;
      total = exTaxSubtotal + taxAmount;
    }

    const balance = total - formData.paidAmount;

    return { subtotal, taxAmount, total, balance, exTaxSubtotal };
  }, [formData.lineItems, formData.discount, formData.taxRate, formData.paidAmount, isTaxInclusive]);

  const handleSubmit = async (status: string) => {
    if (!formData.clientId) {
      setError("Please select a client");
      return;
    }
    if (!formData.number) {
      setError("Invoice number is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await upsertInvoice({ ...formData, status });
    if (result.success) {
      if (formData.galleryId) {
        router.push("/tenant/galleries");
      } else {
        router.push("/tenant/invoices");
      }
    } else {
      setError(result.error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-[1400px] mx-auto pb-24 animate-in fade-in duration-500">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => router.back()}
            className="h-12 w-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all hover:shadow-lg hover:shadow-slate-100 active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">
              {initialData ? "Edit Invoice" : "Create New Invoice"}
            </h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Studio Billing Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              if (isActionLocked) {
                window.location.href = "/tenant/settings?tab=billing";
                return;
              }
              handleSubmit("DRAFT");
            }}
            disabled={isSubmitting}
            className={cn(
              "h-12 px-6 rounded-2xl bg-white border border-slate-100 text-slate-600 font-black text-xs flex items-center gap-2 hover:bg-slate-50 transition-all active:scale-95 shadow-sm disabled:opacity-50",
              isActionLocked && "opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all"
            )}
          >
            <Save className="h-4 w-4" />
            {isActionLocked ? "SUB REQUIRED" : "SAVE AS DRAFT"}
          </button>
          <button 
            onClick={() => {
              if (isActionLocked) {
                window.location.href = "/tenant/settings?tab=billing";
                return;
              }
              handleSubmit("SENT");
            }}
            disabled={isSubmitting}
            className={cn(
              "h-12 px-8 rounded-2xl bg-primary text-white font-black text-xs flex items-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20 disabled:opacity-50",
              isActionLocked && "opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all"
            )}
          >
            <Send className="h-4 w-4" />
            {isActionLocked ? "SUB REQUIRED" : "SAVE & SEND"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-sm font-bold animate-in slide-in-from-top-2 duration-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-8 items-start">
        {/* Main Editor Card */}
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[800px]">
          {/* Form Content */}
          <div className="p-10 space-y-10 flex-1">
            {/* Invoice Info Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Invoice Number</label>
                <div className="relative">
                  <Receipt className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                  <input 
                    type="text"
                    value={formData.number}
                    onChange={(e) => setFormData(prev => ({ ...prev, number: e.target.value }))}
                    placeholder="INV-1001"
                    className="w-full h-12 pl-12 pr-4 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Issue Date</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                  <input 
                    type="date"
                    value={formData.issuedAt}
                    onChange={(e) => setFormData(prev => ({ ...prev, issuedAt: e.target.value }))}
                    className="w-full h-12 pl-12 pr-4 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Due Date</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                  <input 
                    type="date"
                    value={formData.dueAt}
                    onChange={(e) => setFormData(prev => ({ ...prev, dueAt: e.target.value }))}
                    className="w-full h-12 pl-12 pr-4 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Billing Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-50">
              <div className="space-y-2 relative">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Bill To Client</label>
                
                {/* Custom Client Selector */}
                <div 
                  onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                  className={cn(
                    "h-12 px-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between bg-slate-50",
                    isClientDropdownOpen ? "ring-2 ring-emerald-500/20" : "hover:bg-slate-100"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {formData.clientId ? (
                      (() => {
                        const client = clients.find(c => c.id === formData.clientId);
                        return (
                          <>
                            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 overflow-hidden">
                              {client?.avatarUrl ? (
                                <img src={client.avatarUrl} className="h-full w-full object-cover" alt={client.businessName || client.name} />
                              ) : (
                                <User className="h-3.5 w-3.5" />
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-bold text-slate-900 truncate">
                                {client?.businessName || client?.name || "Select client..."}
                              </span>
                              {client?.businessName && (
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                  {client.name}
                                </span>
                              )}
                            </div>
                          </>
                        );
                      })()
                    ) : (
                      <div className="flex items-center gap-3 text-slate-400">
                        <Building2 className="h-4 w-4" />
                        <span className="text-sm font-bold">Select a client...</span>
                      </div>
                    )}
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform duration-300", isClientDropdownOpen && "rotate-180")} />
                </div>

                {/* Client Dropdown Menu */}
                {isClientDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsClientDropdownOpen(false)} 
                    />
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-2 border-b border-slate-50">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <input 
                            type="text"
                            autoFocus
                            placeholder="Search directory..."
                            value={clientSearchQuery}
                            onChange={(e) => setClientSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs focus:ring-0 placeholder:text-slate-400"
                          />
                        </div>
                      </div>
                      <div className="max-h-[240px] overflow-y-auto custom-scrollbar py-1">
                        {clients
                          .filter(c => 
                            c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) || 
                            (c.businessName && c.businessName.toLowerCase().includes(clientSearchQuery.toLowerCase()))
                          )
                          .map(c => {
                            const isSelected = formData.clientId === c.id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setFormData({ ...formData, clientId: c.id });
                                  setIsClientDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors group",
                                  isSelected ? "bg-primary/10/50" : "hover:bg-slate-50"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0 shadow-inner overflow-hidden">
                                    {c.avatarUrl ? (
                                      <img src={c.avatarUrl} className="h-full w-full object-cover" alt={c.businessName || c.name} />
                                    ) : (
                                      <User className="h-4 w-4" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className={cn(
                                      "text-sm font-bold truncate transition-colors",
                                      isSelected ? "text-primary" : "text-slate-700 group-hover:text-slate-900"
                                    )}>
                                      {c.businessName || c.name}
                                    </p>
                                    {c.businessName && (
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                        {c.name}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {isSelected && (
                                  <Check className="h-4 w-4 text-primary animate-in zoom-in duration-200" />
                                )}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-2 relative">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Property Address</label>
                
                {/* Custom Booking/Address Selector */}
                <div 
                  onClick={() => setIsBookingDropdownOpen(!isBookingDropdownOpen)}
                  className={cn(
                    "h-12 px-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between bg-slate-50",
                    isBookingDropdownOpen ? "ring-2 ring-emerald-500/20" : "hover:bg-slate-100"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {formData.bookingId ? (
                      (() => {
                        const booking = bookings.find(b => b.id === formData.bookingId);
                        return (
                          <>
                            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                              <Layout className="h-3.5 w-3.5" />
                            </div>
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {booking?.address || "Selected Booking"}
                            </span>
                          </>
                        );
                      })()
                    ) : formData.address ? (
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                          <FileText className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-sm font-bold text-slate-900 truncate">{formData.address}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-slate-400">
                        <Layout className="h-4 w-4" />
                        <span className="text-sm font-bold">Select property...</span>
                      </div>
                    )}
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform duration-300", isBookingDropdownOpen && "rotate-180")} />
                </div>

                {/* Booking Dropdown Menu */}
                {isBookingDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsBookingDropdownOpen(false)} 
                    />
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-2 border-b border-slate-50">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <input 
                            type="text"
                            autoFocus
                            placeholder="Search addresses..."
                            value={bookingSearchQuery}
                            onChange={(e) => setBookingSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs focus:ring-0 placeholder:text-slate-400"
                          />
                        </div>
                      </div>
                      <div className="max-h-[240px] overflow-y-auto custom-scrollbar py-1">
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, bookingId: "", address: "" });
                            setIsBookingDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                        >
                          <div className="h-8 w-8 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center shrink-0">
                            <FileText className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-bold text-slate-500 italic">Manual Address (Clear selection)</span>
                        </button>

                        {bookings
                          .filter(b => b.clientId === formData.clientId)
                          .filter(b => b.address.toLowerCase().includes(bookingSearchQuery.toLowerCase()))
                          .map(b => {
                            const isSelected = formData.bookingId === b.id;
                            return (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => {
                                  handleBookingSelect(b.id);
                                  setIsBookingDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors group",
                                  isSelected ? "bg-primary/10/50" : "hover:bg-slate-50"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                                    <Layout className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className={cn(
                                      "text-sm font-bold truncate transition-colors",
                                      isSelected ? "text-primary" : "text-slate-700 group-hover:text-slate-900"
                                    )}>
                                      {b.address}
                                    </p>
                                  </div>
                                </div>
                                {isSelected && (
                                  <Check className="h-4 w-4 text-primary animate-in zoom-in duration-200" />
                                )}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  </>
                )}

                <div className="mt-2">
                  <AddressAutocomplete 
                    value={formData.address}
                    onChange={(val) => setFormData(prev => ({ ...prev, address: val }))}
                    placeholder="Enter property address..."
                    className="w-full h-12 px-4 bg-slate-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
                  />
                  {formData.bookingId && (
                    <p className="text-[9px] font-bold text-slate-400 mt-1 pl-1 italic">
                      Linked to booking. You can override this address for the invoice if needed.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="pt-4 border-t border-slate-50">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-4 block">Line Items</label>
              
              <div className="space-y-4">
                {formData.lineItems.map((item: any, index: number) => (
                  <div key={item.id} className="grid grid-cols-[1fr_120px_150px_48px] gap-4 items-start animate-in slide-in-from-left duration-300 relative" style={{ animationDelay: `${index * 50}ms` }}>
                    <div className="space-y-2">
                      <div className="relative">
                        {/* Custom Service Selector */}
                        <div 
                          onClick={() => setActiveServiceDropdownId(activeServiceDropdownId === item.id ? null : item.id)}
                          className={cn(
                            "h-11 px-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between bg-slate-50",
                            activeServiceDropdownId === item.id ? "ring-2 ring-emerald-500/20" : "hover:bg-slate-100"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {item.serviceId ? (
                              (() => {
                                const service = services.find(s => s.id === item.serviceId);
                                const Icon = IconMap[service?.icon?.toUpperCase() || "CAMERA"] || Camera;
                                return (
                                  <>
                                    <div className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                                      <Icon className="h-3.5 w-3.5" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-900 truncate">
                                      {service?.name || "Quick Add Service..."}
                                    </span>
                                  </>
                                );
                              })()
                            ) : (
                              <span className="text-xs text-slate-400 font-bold">Quick Add Service...</span>
                            )}
                          </div>
                          <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-300", activeServiceDropdownId === item.id && "rotate-180")} />
                        </div>

                        {/* Service Dropdown Menu */}
                        {activeServiceDropdownId === item.id && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setActiveServiceDropdownId(null)} 
                            />
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="p-2 border-b border-slate-50">
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                  <input 
                                    type="text"
                                    autoFocus
                                    placeholder="Search services..."
                                    value={serviceSearchQuery}
                                    onChange={(e) => setServiceSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-[10px] focus:ring-0 placeholder:text-slate-400"
                                  />
                                </div>
                              </div>
                              <div className="max-h-[200px] overflow-y-auto custom-scrollbar py-1">
                                {services
                                  .filter(s => s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase()))
                                  .map(s => {
                                    const isSelected = item.serviceId === s.id;
                                    const Icon = IconMap[s.icon?.toUpperCase() || "CAMERA"] || Camera;
                                    return (
                                      <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => {
                                          handleServiceSelect(item.id, s.id);
                                          setActiveServiceDropdownId(null);
                                        }}
                                        className={cn(
                                          "w-full flex items-center justify-between px-4 py-2 text-left transition-colors group",
                                          isSelected ? "bg-primary/10/50" : "hover:bg-slate-50"
                                        )}
                                      >
                                        <div className="flex items-center gap-3 min-w-0">
                                          <div className="h-7 w-7 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                                            <Icon className="h-4 w-4" />
                                          </div>
                                          <div className="min-w-0">
                                            <p className={cn(
                                              "text-xs font-bold truncate transition-colors",
                                              isSelected ? "text-primary" : "text-slate-700 group-hover:text-slate-900"
                                            )}>
                                              {s.name}
                                            </p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                              ${Number(s.price).toFixed(2)}
                                            </p>
                                          </div>
                                        </div>
                                        {isSelected && (
                                          <Check className="h-3.5 w-3.5 text-primary" />
                                        )}
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      <input 
                        type="text"
                        value={item.description}
                        onChange={(e) => handleLineItemChange(item.id, { description: e.target.value })}
                        placeholder="Description"
                        className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
                      />
                    </div>
                    <div className="relative">
                      <input 
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleLineItemChange(item.id, { quantity: parseInt(e.target.value) || 0 })}
                        className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none text-center"
                      />
                    </div>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300" />
                      <input 
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => handleLineItemChange(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                        className={cn(
                          "w-full h-11 pl-10 pr-4 bg-slate-50 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none",
                          formData.clientId && (() => {
                            const client = clients.find(c => c.id === formData.clientId);
                            const overrides = (client?.settings as any)?.priceOverrides || {};
                            return overrides[item.serviceId || ""] !== undefined;
                          })() && "text-emerald-600 bg-emerald-50/50"
                        )}
                      />
                      {formData.clientId && (() => {
                        const client = clients.find(c => c.id === formData.clientId);
                        const overrides = (client?.settings as any)?.priceOverrides || {};
                        return overrides[item.serviceId || ""] !== undefined;
                      })() && (
                        <div className="absolute -top-2 -right-1">
                          <div className="h-4 px-1.5 rounded-full bg-emerald-500 text-[8px] font-black text-white flex items-center justify-center shadow-sm">
                            CUSTOM
                          </div>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => removeLineItem(item.id)}
                      className="h-11 w-11 flex items-center justify-center rounded-xl bg-rose-50 text-rose-400 hover:bg-rose-100 hover:text-rose-600 transition-all active:scale-90"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button 
                onClick={addLineItem}
                className="mt-6 h-11 px-6 rounded-xl bg-slate-50 text-slate-500 font-bold text-xs flex items-center gap-2 hover:bg-slate-100 hover:text-slate-900 transition-all active:scale-95"
              >
                <Plus className="h-4 w-4" />
                ADD LINE ITEM
              </button>
            </div>

            {/* Terms & Notes Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-50">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Payment Terms</label>
                  <textarea 
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData(prev => ({ ...prev, paymentTerms: e.target.value }))}
                    rows={4}
                    placeholder="Enter bank details and payment instructions..."
                    className="w-full p-4 bg-slate-50 border-none rounded-2xl text-xs font-medium focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Client Notes</label>
                  <textarea 
                    value={formData.clientNotes}
                    onChange={(e) => setFormData(prev => ({ ...prev, clientNotes: e.target.value }))}
                    rows={4}
                    className="w-full p-4 bg-slate-50 border-none rounded-2xl text-xs font-medium focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Invoice Terms & Conditions</label>
                  <textarea 
                    value={formData.invoiceTerms}
                    onChange={(e) => setFormData(prev => ({ ...prev, invoiceTerms: e.target.value }))}
                    rows={4}
                    placeholder="Global terms and conditions for this invoice..."
                    className="w-full p-4 bg-slate-50 border-none rounded-2xl text-[10px] font-medium text-slate-500 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none resize-none italic"
                  />
                </div>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Internal Memo (Studio Only)</label>
                  <textarea 
                    value={formData.internalNotes}
                    onChange={(e) => setFormData(prev => ({ ...prev, internalNotes: e.target.value }))}
                    rows={9}
                    placeholder="Private notes for the studio team..."
                    className="w-full p-4 bg-slate-50 border-none rounded-2xl text-xs font-medium focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none resize-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Summary Area */}
        <div className="space-y-6">
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8 space-y-6 sticky top-8">
            <div className="flex items-center gap-3 pb-6 border-b border-slate-50">
              <div className="h-10 w-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900">Payment Summary</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Real-time Totals</p>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-400 uppercase tracking-widest">Subtotal</span>
                <span className="text-slate-900">${totals.subtotal.toFixed(2)}</span>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-slate-400 uppercase tracking-widest">Discount ($)</span>
                  <div className="relative w-28">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-300" />
                    <input 
                      type="number"
                      step="0.01"
                      value={formData.discount}
                      onChange={(e) => setFormData(prev => ({ ...prev, discount: parseFloat(e.target.value) || 0 }))}
                      className="w-full h-9 pl-8 pr-3 bg-slate-50 border-none rounded-xl text-xs font-black text-right focus:ring-2 focus:ring-rose-500/10 transition-all outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-slate-400 uppercase tracking-widest">{(tenant?.taxLabel || tenantSettings.taxLabel) || "Tax"} Rate (%)</span>
                  <div className="relative w-28">
                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-300" />
                    <input 
                      type="number"
                      step="0.1"
                      value={formData.taxRate * 100}
                      onChange={(e) => setFormData(prev => ({ ...prev, taxRate: (parseFloat(e.target.value) || 0) / 100 }))}
                      className="w-full h-9 pl-8 pr-3 bg-slate-50 border-none rounded-xl text-xs font-black text-right focus:ring-2 focus:ring-emerald-500/10 transition-all outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center text-[10px] font-bold border-t border-slate-50 pt-4">
                <div className="flex flex-col">
                  <span className="text-slate-400 uppercase tracking-widest">Includes {(tenant?.taxLabel || tenantSettings.taxLabel) || "Tax"}</span>
                  {isTaxInclusive && <span className="text-[8px] text-slate-400 font-medium lowercase italic">(tax included in price)</span>}
                </div>
                <span className="text-slate-900">${totals.taxAmount.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-xs font-black text-slate-900 uppercase tracking-widest">GRAND TOTAL</span>
                <span className="text-xl font-black text-primary tracking-tight">${totals.total.toFixed(2)}</span>
              </div>

              {initialData && (
                <div className="space-y-4 pt-6 border-t border-slate-50 mt-4">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-slate-400 uppercase tracking-widest">Paid Amount</span>
                    <div className="relative w-28">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-300" />
                      <input 
                        type="number"
                        step="0.01"
                        value={formData.paidAmount}
                        onChange={(e) => setFormData(prev => ({ ...prev, paidAmount: parseFloat(e.target.value) || 0 }))}
                        className="w-full h-9 pl-8 pr-3 bg-primary/10 border-none rounded-xl text-xs font-black text-right text-emerald-700 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-slate-900 rounded-2xl p-4 mt-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Balance Due</span>
                    <span className="text-lg font-black text-white tracking-tight">${totals.balance.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-6 space-y-3">
              <button 
                onClick={() => router.push("/tenant/invoices")}
                className="w-full py-3 rounded-2xl bg-white border border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500 hover:border-rose-100 hover:bg-rose-50 transition-all flex items-center justify-center gap-2"
              >
                DISCARD CHANGES
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

