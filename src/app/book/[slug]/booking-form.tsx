"use client";

import React, { useState } from "react";
import { 
  User, 
  Building2, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Plus,
  Home
} from "lucide-react";
import { cn } from "@/lib/utils";
import { submitPublicBooking } from "@/app/actions/public-booking";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";

interface BookingFormProps {
  tenantSlug: string;
  tenantName: string;
}

export function BookingForm({ tenantSlug, tenantName }: BookingFormProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    clientName: "",
    businessName: "",
    email: "",
    phone: "",
    shootTitle: "",
    address: "",
    date: "",
    notes: ""
  });

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const result = await submitPublicBooking({
        ...formData,
        tenantSlug
      });
      
      if (result.success) {
        setIsSuccess(true);
      } else {
        alert(result.error || "Something went wrong. Please try again.");
      }
    } catch (err) {
      console.error(err);
      alert("Submission failed. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="bg-white rounded-[48px] p-10 shadow-2xl shadow-slate-200 border border-slate-50 text-center space-y-8 animate-in zoom-in duration-500">
        <div className="h-24 w-24 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto ring-8 ring-emerald-500/5">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <div className="space-y-3">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Booking Requested!</h2>
          <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-xs mx-auto">
            Thanks {formData.clientName.split(' ')[0]}! We've received your request for <strong>{formData.shootTitle}</strong>. 
            The team at {tenantName} will review and confirm shortly.
          </p>
        </div>
        <div className="pt-4">
          <button 
            onClick={() => window.location.reload()}
            className="text-xs font-black text-[var(--primary)] uppercase tracking-widest hover:underline"
          >
            Submit another request
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-[48px] p-8 md:p-10 shadow-2xl shadow-slate-200 border border-slate-50 space-y-8 relative overflow-hidden">
      
      {/* Step Progress */}
      <div className="flex items-center gap-2 mb-4">
        {[1, 2, 3].map((s) => (
          <div 
            key={s} 
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all duration-500",
              step >= s ? "bg-[var(--primary)]" : "bg-slate-100"
            )}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
          <div className="space-y-1">
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Agency Details</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Let's start with who you are.</p>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                <input 
                  required
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="w-full h-14 pl-12 pr-6 rounded-2xl bg-slate-50 border border-transparent focus:bg-white focus:border-[var(--primary)] focus:ring-4 focus:ring-primary-soft transition-all text-sm font-bold text-slate-900 outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Agency / Business</label>
              <div className="relative">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                <input 
                  required
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  placeholder="e.g. Ray White Byron Bay"
                  className="w-full h-14 pl-12 pr-6 rounded-2xl bg-slate-50 border border-transparent focus:bg-white focus:border-[var(--primary)] focus:ring-4 focus:ring-primary-soft transition-all text-sm font-bold text-slate-900 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                  <input 
                    required
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john@agency.com"
                    className="w-full h-14 pl-12 pr-6 rounded-2xl bg-slate-50 border border-transparent focus:bg-white focus:border-[var(--primary)] focus:ring-4 focus:ring-primary-soft transition-all text-sm font-bold text-slate-900 outline-none"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Phone</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                  <input 
                    required
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="0400 000 000"
                    className="w-full h-14 pl-12 pr-6 rounded-2xl bg-slate-50 border border-transparent focus:bg-white focus:border-[var(--primary)] focus:ring-4 focus:ring-primary-soft transition-all text-sm font-bold text-slate-900 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <button 
            type="button"
            onClick={nextStep}
            disabled={!formData.clientName || !formData.businessName || !formData.email || !formData.phone}
            className="w-full h-16 rounded-[24px] bg-[var(--primary)] text-white text-sm font-black uppercase tracking-widest shadow-xl shadow-primary-soft hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
          >
            Continue to Session
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
          <div className="space-y-1">
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Project Details</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Where and what are we shooting?</p>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Shoot Title / ID</label>
              <div className="relative">
                <Home className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                <input 
                  required
                  value={formData.shootTitle}
                  onChange={(e) => setFormData({ ...formData, shootTitle: e.target.value })}
                  placeholder="e.g. 14 Mahogany Drive (Standard)"
                  className="w-full h-14 pl-12 pr-6 rounded-2xl bg-slate-50 border border-transparent focus:bg-white focus:border-[var(--primary)] focus:ring-4 focus:ring-primary-soft transition-all text-sm font-bold text-slate-900 outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Property Address</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 z-10" />
                <AddressAutocomplete 
                  required
                  value={formData.address}
                  onChange={(val) => setFormData({ ...formData, address: val })}
                  placeholder="Search property address..."
                  className="w-full h-14 pl-12 pr-6 rounded-2xl bg-slate-50 border border-transparent focus:bg-white focus:border-[var(--primary)] focus:ring-4 focus:ring-primary-soft transition-all text-sm font-bold text-slate-900 outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Preferred Date</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                <input 
                  required
                  type="date"
                  value={formData.date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full h-14 pl-12 pr-6 rounded-2xl bg-slate-50 border border-transparent focus:bg-white focus:border-[var(--primary)] focus:ring-4 focus:ring-primary-soft transition-all text-sm font-bold text-slate-900 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              type="button"
              onClick={prevStep}
              className="flex-1 h-16 rounded-[24px] border border-slate-200 text-slate-400 font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              Back
            </button>
            <button 
              type="button"
              onClick={nextStep}
              disabled={!formData.shootTitle || !formData.address || !formData.date}
              className="flex-[2] h-16 rounded-[24px] bg-[var(--primary)] text-white text-sm font-black uppercase tracking-widest shadow-xl shadow-primary-soft hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
            >
              Almost Done
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
          <div className="space-y-1">
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Final Details</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Anything else we should know?</p>
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Special Instructions</label>
            <div className="relative">
              <MessageSquare className="absolute left-4 top-6 h-4 w-4 text-slate-300" />
              <textarea 
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="e.g. Code for lockbox is 1234. Please focus on the pool area."
                className="w-full h-40 pl-12 pr-6 py-6 rounded-[32px] bg-slate-50 border border-transparent focus:bg-white focus:border-[var(--primary)] focus:ring-4 focus:ring-primary-soft transition-all text-sm font-bold text-slate-900 outline-none resize-none"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              type="button"
              onClick={prevStep}
              className="flex-1 h-16 rounded-[24px] border border-slate-200 text-slate-400 font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              Back
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="flex-[2] h-16 rounded-[24px] bg-[var(--primary)] text-white text-sm font-black uppercase tracking-widest shadow-xl shadow-primary-soft hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  Confirm Request
                  <Plus className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

    </form>
  );
}

