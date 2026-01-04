"use client";

import { useState, useEffect } from "react";
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Building2, 
  Camera, 
  CreditCard, 
  Cloud,
  CheckCircle2,
  Rocket,
  ArrowRight,
  Loader2,
  Paintbrush,
  Receipt
} from "lucide-react";
import { getOnboardingProgress, dismissWelcomeAction } from "@/app/actions/onboarding";
import { updateTenantBranding, updateTenantInvoicingSettings } from "@/app/actions/tenant-settings";
import { cn } from "@/lib/utils";

export function OnboardingWizard() {
  const [data, setData] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form States
  const [branding, setBranding] = useState({ name: "", brandColor: "#94a3b8", logoUrl: "" });
  const [invoice, setInvoice] = useState({ 
    abn: "", 
    accountName: "", 
    bsb: "", 
    accountNumber: "", 
    invoiceTerms: "Payment due within 7 days. Thank you!",
    taxLabel: "GST",
    taxRate: 10
  });

  const fetchStatus = async () => {
    const progress = await getOnboardingProgress();
    setData(progress);
    setLoading(false);
    
    // Auto-open if not all completed and welcome not dismissed
    if (progress && !progress.isAllCompleted && !progress.hasDismissedWelcome) {
      setIsOpen(true);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleDismiss = async () => {
    setIsOpen(false);
    await dismissWelcomeAction();
  };

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const saveBranding = async () => {
    setSaving(true);
    await updateTenantBranding(branding);
    setSaving(false);
    handleNext();
  };

  const saveInvoicing = async () => {
    setSaving(true);
    await updateTenantInvoicingSettings(invoice);
    setSaving(false);
    handleNext();
  };

  if (loading || !isOpen) return null;

  const totalSteps = 4;
  const progress = (step / totalSteps) * 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
      <div className="bg-white w-full max-w-2xl rounded-[48px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-500">
        
        {/* Progress Bar */}
        <div className="h-2 w-full bg-slate-100 relative">
          <div 
            className="h-full bg-indigo-500 transition-all duration-500" 
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-10 md:p-14 relative">
          <button 
            onClick={handleDismiss}
            className="absolute top-8 right-8 h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-50 transition-colors text-slate-300 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600 mb-4">
                <Rocket className="h-10 w-10" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tight">Welcome to Studiio!</h2>
                <p className="text-slate-500 font-medium">Let's get your studio set up for success in under 60 seconds.</p>
              </div>
              <button 
                onClick={handleNext}
                className="h-16 w-full bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-3"
              >
                Let's Start <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Step 1: Branding */}
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Paintbrush className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Studio Branding</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Make it yours</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Brand Color</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="color" 
                      value={branding.brandColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, brandColor: e.target.value }))}
                      className="h-14 w-20 rounded-2xl border border-slate-100 bg-white cursor-pointer"
                    />
                    <input 
                      type="text" 
                      value={branding.brandColor}
                      onChange={(e) => setBranding(prev => ({ ...prev, brandColor: e.target.value }))}
                      className="flex-1 h-14 rounded-2xl border border-slate-100 bg-slate-50 pl-4 font-bold text-slate-900 outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Logo URL (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="https://..."
                    value={branding.logoUrl}
                    onChange={(e) => setBranding(prev => ({ ...prev, logoUrl: e.target.value }))}
                    className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50 pl-4 font-bold text-slate-900 outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={handleBack} className="h-14 px-8 rounded-2xl border border-slate-100 font-bold text-slate-400 uppercase tracking-widest text-xs">Back</button>
                <button 
                  onClick={saveBranding} 
                  disabled={saving}
                  className="flex-1 h-14 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3"
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Next Step"}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Invoicing */}
          {step === 2 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Receipt className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Invoice Details</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Get paid correctly</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">ABN</label>
                  <input 
                    type="text" 
                    value={invoice.abn}
                    onChange={(e) => setInvoice(prev => ({ ...prev, abn: e.target.value }))}
                    className="w-full h-12 rounded-xl border border-slate-100 bg-slate-50 px-4 font-bold text-slate-900"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Account Name</label>
                  <input 
                    type="text" 
                    value={invoice.accountName}
                    onChange={(e) => setInvoice(prev => ({ ...prev, accountName: e.target.value }))}
                    className="w-full h-12 rounded-xl border border-slate-100 bg-slate-50 px-4 font-bold text-slate-900"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">BSB</label>
                  <input 
                    type="text" 
                    value={invoice.bsb}
                    onChange={(e) => setInvoice(prev => ({ ...prev, bsb: e.target.value }))}
                    className="w-full h-12 rounded-xl border border-slate-100 bg-slate-50 px-4 font-bold text-slate-900"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Account Number</label>
                  <input 
                    type="text" 
                    value={invoice.accountNumber}
                    onChange={(e) => setInvoice(prev => ({ ...prev, accountNumber: e.target.value }))}
                    className="w-full h-12 rounded-xl border border-slate-100 bg-slate-50 px-4 font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={handleBack} className="h-14 px-8 rounded-2xl border border-slate-100 font-bold text-slate-400 uppercase tracking-widest text-xs">Back</button>
                <button 
                  onClick={saveInvoicing} 
                  disabled={saving}
                  className="flex-1 h-14 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3"
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Next Step"}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Dropbox */}
          {step === 3 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Cloud className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Cloud Integration</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Automated Delivery</p>
                </div>
              </div>

              <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 text-center space-y-4">
                <p className="text-sm font-medium text-slate-600 leading-relaxed">
                  Studiio works best when connected to Dropbox. We can automatically create folders and deliver your high-res assets to your clients.
                </p>
                <Link 
                  href="/tenant/settings?tab=data" 
                  onClick={handleDismiss}
                  className="inline-flex h-12 px-8 bg-[#0061FF] text-white rounded-xl font-bold text-xs uppercase tracking-widest items-center gap-2 shadow-lg shadow-blue-500/20"
                >
                  Connect Dropbox Later
                </Link>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={handleBack} className="h-14 px-8 rounded-2xl border border-slate-100 font-bold text-slate-400 uppercase tracking-widest text-xs">Back</button>
                <button 
                  onClick={handleNext} 
                  className="flex-1 h-14 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs"
                >
                  Final Step
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Finish */}
          {step === 4 && (
            <div className="text-center space-y-8 animate-in fade-in zoom-in-95">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-4">
                <CheckCircle2 className="h-12 w-12" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tight">You're All Set!</h2>
                <p className="text-slate-500 font-medium max-w-[300px] mx-auto">
                  Your studio is ready. Follow the checklist in the top-right corner to finish any remaining bits.
                </p>
              </div>
              <button 
                onClick={handleDismiss}
                className="h-16 w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3"
              >
                Go to Dashboard <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

import Link from "next/link";

