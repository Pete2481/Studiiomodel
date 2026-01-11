"use client";

import React, { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Palette, 
  Globe, 
  Bell, 
  Database, 
  Cloud, 
  Shield, 
  Save, 
  Receipt,
  Upload, 
  CheckCircle2, 
  AlertCircle,
  Hash,
  X,
  ChevronDown,
  Mail,
  Lock,
  Server,
  Activity,
  CreditCard,
  ExternalLink,
  Sparkles,
  ArrowRight,
  Clock,
  Link as LinkIcon,
  Copy,
  Check,
  User,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { updateTenantBranding, updateTenantContactInfo, updateTenantInvoicingSettings, updateTenantNotificationSettings, updateTenantSecuritySettings, updateTenantStorageSettings, updateTenantLogisticsSettings, updateTenantCalendarSyncSettings, triggerCalendarSync } from "@/app/actions/tenant-settings";
import { createStripeCheckoutAction, createStripePortalAction } from "@/app/actions/stripe";
import { format, differenceInDays } from "date-fns";

interface SettingsPageContentProps {
  tenant: any;
  user: any;
  teamMember?: any;
}

const TIMEZONES = [
  "UTC",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Mexico_City",
  "America/Toronto",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Darwin",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Hobart",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Zurich",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Pacific/Auckland",
  "Pacific/Fiji",
  "Pacific/Honolulu"
];

const DEFAULT_INVOICE_TERMS = "All services are provided in accordance with standard industry practice. Payment is due within 7 days of the invoice date unless otherwise agreed in writing. Late payments may incur additional fees or suspension of services until the account is brought up to date. All imagery, video, and creative assets remain the property of the service provider until full payment has received, after which usage rights are granted to the client for their intended purpose. Revisions outside the agreed scope, additional services, or re-shoots may be charged separately. Cancellations made within 24 hours of a scheduled booking may incur a cancellation fee. By engaging our services, the client agrees to these terms and conditions.";

export function SettingsPageContent({ tenant, user, teamMember }: SettingsPageContentProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(teamMember ? "profile" : "branding");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const [formData, setFormData] = useState({
    name: tenant.name || "",
    logoUrl: tenant.logoUrl || "",
    brandColor: tenant.brandColor || "#94a3b8",
    contactEmail: tenant.contactEmail || "",
    contactPhone: tenant.contactPhone || "",
    accountEmail: tenant.accountEmail || "",
    address: tenant.address || "",
    city: tenant.city || "",
    postalCode: tenant.postalCode || "",
    timezone: tenant.timezone || "Australia/Sydney",
    currency: tenant.currency || "AUD",
    revenueTarget: tenant.revenueTarget || 100000,
    abn: tenant.abn || "",
    taxLabel: tenant.taxLabel || "GST",
    taxRate: tenant.taxRate !== null ? Number(tenant.taxRate) * 100 : 10,
    accountName: tenant.accountName || "",
    bsb: tenant.bsb || "",
    accountNumber: tenant.accountNumber || "",
    invoiceLogoUrl: tenant.invoiceLogoUrl || "",
    invoiceTerms: tenant.invoiceTerms || DEFAULT_INVOICE_TERMS,
    // SMTP Settings
    smtpHost: tenant.smtpHost || "",
    smtpPort: tenant.smtpPort || 465,
    smtpUser: tenant.smtpUser || "",
    smtpPass: tenant.smtpPass || "",
    smtpSecure: tenant.smtpSecure !== null ? tenant.smtpSecure : true,
    // Security & Compliance
    privacyPolicyUrl: tenant.privacyPolicyUrl || "",
    termsOfUseUrl: tenant.termsOfUseUrl || "",
    contactStudioUrl: tenant.contactStudioUrl || "",
    storageProvider: tenant.storageProvider || "DROPBOX",
    aiLogisticsEnabled: tenant.aiLogisticsEnabled || false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'Logo must be under 2MB' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, logoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveBranding = async () => {
    setIsSaving(true);
    setMessage(null);
    const result = await updateTenantBranding({
      name: formData.name,
      logoUrl: formData.logoUrl,
      brandColor: formData.brandColor
    });
    setIsSaving(false);
    if (result.success) {
      setMessage({ type: 'success', text: 'Branding updated successfully' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update' });
    }
  };

  const handleSaveContact = async () => {
    setIsSaving(true);
    setMessage(null);
    const result = await updateTenantContactInfo({
      contactEmail: formData.contactEmail,
      contactPhone: formData.contactPhone,
      accountEmail: formData.accountEmail,
      address: formData.address,
      city: formData.city,
      postalCode: formData.postalCode,
      timezone: formData.timezone,
      currency: formData.currency,
      revenueTarget: Number(formData.revenueTarget),
    });
    setIsSaving(false);
    if (result.success) {
      setMessage({ type: 'success', text: 'Contact info updated successfully' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update' });
    }
  };

  const handleSaveInvoicing = async () => {
    setIsSaving(true);
    setMessage(null);
    const result = await updateTenantInvoicingSettings({
      invoiceLogoUrl: formData.invoiceLogoUrl,
      invoiceTerms: formData.invoiceTerms,
      abn: formData.abn,
      taxLabel: formData.taxLabel,
      taxRate: Number(formData.taxRate),
      accountName: formData.accountName,
      bsb: formData.bsb,
      accountNumber: formData.accountNumber,
    });
    setIsSaving(false);
    if (result.success) {
      setMessage({ type: 'success', text: 'Invoicing settings updated successfully' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update' });
    }
  };

  const handleSaveNotifications = async () => {
    setIsSaving(true);
    setMessage(null);
    const result = await updateTenantNotificationSettings({
      smtpHost: formData.smtpHost,
      smtpPort: Number(formData.smtpPort),
      smtpUser: formData.smtpUser,
      smtpPass: formData.smtpPass,
      smtpSecure: formData.smtpSecure,
    });
    setIsSaving(false);
    if (result.success) {
      setMessage({ type: 'success', text: 'Email notification settings updated' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update' });
    }
  };

  const handleSaveSecurity = async () => {
    setIsSaving(true);
    setMessage(null);
    const result = await updateTenantSecuritySettings({
      privacyPolicyUrl: formData.privacyPolicyUrl,
      termsOfUseUrl: formData.termsOfUseUrl,
      contactStudioUrl: formData.contactStudioUrl,
    });
    setIsSaving(false);
    if (result.success) {
      setMessage({ type: 'success', text: 'Security settings updated successfully' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update' });
    }
  };

  const handleSaveLogistics = async () => {
    setIsSaving(true);
    setMessage(null);
    const result = await updateTenantLogisticsSettings({
      aiLogisticsEnabled: formData.aiLogisticsEnabled,
    });
    setIsSaving(false);
    if (result.success) {
      setMessage({ type: 'success', text: 'Scheduling settings updated successfully' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update' });
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-12">
      {/* Sidebar Nav */}
      <div className="space-y-2">
        {teamMember && (
          <SettingsTab 
            label="Personal Profile" 
            icon={<User className="h-4 w-4" />} 
            active={activeTab === "profile"} 
            onClick={() => setActiveTab("profile")}
          />
        )}
        {(user.role === "TENANT_ADMIN" || user.role === "ADMIN") && (
          <>
            <SettingsTab 
              label="Studio Branding" 
              icon={<Palette className="h-4 w-4" />} 
              active={activeTab === "branding"} 
              onClick={() => setActiveTab("branding")}
            />
            <SettingsTab 
              label="Contact Info" 
              icon={<Globe className="h-4 w-4" />} 
              active={activeTab === "contact"} 
              onClick={() => setActiveTab("contact")}
            />
            <SettingsTab 
              label="Invoicing & Terms" 
              icon={<Receipt className="h-4 w-4" />} 
              active={activeTab === "invoicing"} 
              onClick={() => setActiveTab("invoicing")}
            />
            <SettingsTab 
              label="Data & Storage" 
              icon={<Database className="h-4 w-4" />} 
              active={activeTab === "data"} 
              onClick={() => setActiveTab("data")}
            />
            <SettingsTab 
              label="Scheduling & AI" 
              icon={<Clock className="h-4 w-4" />} 
              active={activeTab === "scheduling"} 
              onClick={() => setActiveTab("scheduling")}
            />
            <SettingsTab 
              label="Integrations" 
              icon={<Cloud className="h-4 w-4" />} 
              active={activeTab === "integrations"} 
              onClick={() => setActiveTab("integrations")}
            />
            <SettingsTab 
              label="Notifications" 
              icon={<Bell className="h-4 w-4" />} 
              active={activeTab === "notifications"} 
              onClick={() => setActiveTab("notifications")}
            />
            <SettingsTab 
              label="Security" 
              icon={<Shield className="h-4 w-4" />} 
              active={activeTab === "security"} 
              onClick={() => setActiveTab("security")}
            />
            <SettingsTab 
              label="Plan & Billing" 
              icon={<CreditCard className="h-4 w-4" />} 
              active={activeTab === "billing"} 
              onClick={() => setActiveTab("billing")}
            />
            <SettingsTab 
              label="Public Booking" 
              icon={<LinkIcon className="h-4 w-4" />} 
              active={activeTab === "booking-link"} 
              onClick={() => setActiveTab("booking-link")}
            />
          </>
        )}
      </div>

      {/* Main Content Area */}
      <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
        
        {/* Status Message */}
        {message && (
          <div className={cn(
            "p-4 rounded-[20px] flex items-center justify-between border animate-in zoom-in duration-300",
            message.type === 'success' ? "bg-primary/10 border-primary/20 text-emerald-800" : "bg-rose-50 border-rose-100 text-rose-800"
          )}>
            <div className="flex items-center gap-3">
              {message.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              <span className="text-sm font-bold">{message.text}</span>
            </div>
            <button onClick={() => setMessage(null)} className="p-1 hover:bg-black/5 rounded-full transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {activeTab === "profile" && teamMember && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="ui-card space-y-10 border-slate-100 p-10">
              <div className="flex items-start justify-between border-b border-slate-50 pb-8">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Personal Profile</h2>
                  <p className="text-sm font-medium text-slate-500">Manage your account details and calendar preferences.</p>
                </div>
                <div className="h-14 w-14 rounded-[20px] bg-slate-900 flex items-center justify-center text-white">
                  {teamMember.avatarUrl ? (
                    <img src={teamMember.avatarUrl} className="h-full w-full object-cover rounded-[20px]" alt={teamMember.displayName} />
                  ) : (
                    <User className="h-7 w-7" />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                    <input type="text" readOnly value={teamMember.displayName} className="ui-input-tight bg-slate-50 cursor-not-allowed opacity-70" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                    <input type="text" readOnly value={teamMember.email} className="ui-input-tight bg-slate-50 cursor-not-allowed opacity-70" />
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="p-8 rounded-[32px] bg-slate-900 text-white space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                      <Clock className="h-12 w-12" />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Your Calendar Feed</h4>
                      <p className="text-xs font-medium leading-relaxed opacity-80 mt-2">
                        Subscribe to your personal assignments. This will ONLY show bookings assigned to you.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-2 bg-white/10 rounded-2xl border border-white/10 group hover:border-primary/30 transition-all">
                        <div className="flex-1 px-4 font-mono text-[10px] text-white/60 truncate">
                          {typeof window !== 'undefined' ? `${window.location.origin}/api/calendar/feed/${teamMember.calendarSecret}` : `.../api/calendar/feed/${teamMember.calendarSecret}`}
                        </div>
                        <button 
                          onClick={() => {
                            const url = `${window.location.origin}/api/calendar/feed/${teamMember.calendarSecret}`;
                            navigator.clipboard.writeText(url);
                            setMessage({ type: 'success', text: 'Personal feed link copied!' });
                          }}
                          className="h-10 px-4 rounded-xl bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:border-primary hover:text-primary transition-all shadow-sm flex items-center gap-2 active:scale-95"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </button>
                      </div>
                      <a 
                        href={`webcal://${typeof window !== "undefined" ? window.location.host : ""}/api/calendar/feed/${teamMember.calendarSecret}`}
                        className="w-full h-12 bg-primary hover:opacity-90 text-white rounded-2xl flex items-center justify-center gap-3 text-xs font-black uppercase tracking-widest transition-all active:scale-95"
                      >
                        <Plus className="h-4 w-4" />
                        Subscribe to Calendar
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "branding" && (
          <div className="space-y-8">
            <div className="ui-card space-y-8 border-slate-100">
              <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Studio Branding</h2>
                  <p className="text-sm font-medium text-slate-500">Personalize your workspace and client-facing materials.</p>
                </div>
                <button 
                  onClick={handleSaveBranding}
                  disabled={isSaving}
                  className="ui-button-primary flex items-center gap-2 px-6"
                  style={{ boxShadow: `0 10px 15px -3px var(--primary-soft)` }}
                >
                  <Save className="h-4 w-4" /> 
                  {isSaving ? "Saving..." : "Save Branding"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Logo Section */}
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Studio Logo</label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="relative group h-56 rounded-[32px] border-2 border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center gap-3 hover:border-emerald-400 hover:bg-primary/10 transition-all cursor-pointer overflow-hidden"
                  >
                    {formData.logoUrl ? (
                      <div className="relative w-full h-full p-8 flex items-center justify-center bg-white">
                        <img src={formData.logoUrl} className="max-w-full max-h-full object-contain" alt="Studio Logo" />
                        <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <div className="bg-white rounded-full p-3 shadow-xl scale-90 group-hover:scale-100 transition-transform">
                            <Upload className="h-5 w-5 text-slate-600" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="h-14 w-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-slate-300 group-hover:text-primary transition-colors">
                          <Upload className="h-6 w-6" />
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-slate-600">Click to upload logo</p>
                          <p className="text-[10px] text-slate-400 mt-1">Transparent PNG or SVG preferred</p>
                        </div>
                      </>
                    )}
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/*"
                      onChange={handleLogoUpload}
                    />
                  </div>
                </div>

                {/* Color Section */}
                <div className="space-y-6">
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Brand Primary Color</label>
                    <div className="flex items-center gap-4">
                      <div 
                        className="h-14 w-14 rounded-2xl shadow-inner border-2 border-white ring-1 ring-slate-100 shrink-0"
                        style={{ backgroundColor: formData.brandColor }}
                      />
                      <div className="flex-1 relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input 
                          type="text" 
                          value={formData.brandColor.replace('#', '')}
                          onChange={(e) => setFormData({ ...formData, brandColor: `#${e.target.value}` })}
                          maxLength={6}
                          className="ui-input-tight pl-9 font-mono uppercase"
                          placeholder="10B981"
                        />
                      </div>
                      <div className="relative">
                        <input 
                          type="color" 
                          value={formData.brandColor}
                          onChange={(e) => setFormData({ ...formData, brandColor: e.target.value })}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                          <Palette className="h-4 w-4 text-slate-500" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preview Section */}
                  <div className="p-6 rounded-[28px] bg-slate-50 border border-slate-100 space-y-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Button Preview</label>
                    <div className="space-y-3">
                      <button 
                        className="w-full py-3 rounded-2xl text-white text-xs font-black uppercase tracking-widest shadow-lg transition-transform active:scale-95"
                        style={{ 
                          backgroundColor: formData.brandColor,
                          boxShadow: `0 10px 15px -3px ${formData.brandColor}33`
                        }}
                      >
                        Sample Action
                      </button>
                      <p className="text-[10px] text-center font-medium text-slate-400">This color will be applied to all your primary actions.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6 pt-6 border-t border-slate-50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Studio Legal Name</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="ui-input-tight" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Public Subdomain</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        readOnly
                        value={tenant.slug}
                        className="ui-input-tight pr-32 bg-slate-50 cursor-not-allowed opacity-70" 
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase">.studiio.com</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "contact" && (
          <div className="space-y-8">
            {/* Studio Identity & Contact */}
            <div className="ui-card space-y-8 border-slate-100">
              <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Studio Identity & Contact</h2>
                  <p className="text-sm font-medium text-slate-500">Set the default contact details for client communications.</p>
                </div>
                <button 
                  onClick={handleSaveContact}
                  disabled={isSaving}
                  className="ui-button-primary flex items-center gap-2 px-6"
                  style={{ boxShadow: `0 10px 15px -3px var(--primary-soft)` }}
                >
                  <Save className="h-4 w-4" /> 
                  {isSaving ? "Saving..." : "Save Contact Info"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Studio Email Address</label>
                  <input 
                    type="email" 
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    className="ui-input-tight" 
                    placeholder="team@studio.au"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Contact Phone Number</label>
                  <input 
                    type="tel" 
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    className="ui-input-tight" 
                    placeholder="+61 400 000 000"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Account Email (Invoicing)</label>
                  <input 
                    type="email" 
                    value={formData.accountEmail}
                    onChange={(e) => setFormData({ ...formData, accountEmail: e.target.value })}
                    className="ui-input-tight" 
                    placeholder="accounts@studio.au"
                  />
                </div>
              </div>
            </div>

            {/* Physical Location & Regional */}
            <div className="ui-card space-y-8 border-slate-100">
              <div className="border-b border-slate-50 pb-6">
                <h2 className="text-lg font-bold text-slate-900">Physical Location & Regional</h2>
                <p className="text-sm font-medium text-slate-500">Configure your studio's physical address and regional preferences.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Street Address</label>
                  <AddressAutocomplete 
                    value={formData.address}
                    onChange={(val) => setFormData({ ...formData, address: val })}
                    className="ui-input-tight" 
                    placeholder="123 Studio Lane"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">City / Suburb</label>
                    <input 
                      type="text" 
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="ui-input-tight" 
                      placeholder="Sydney"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Postal Code</label>
                    <input 
                      type="text" 
                      value={formData.postalCode}
                      onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                      className="ui-input-tight" 
                      placeholder="2000"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Timezone</label>
                  <div className="relative">
                    <select 
                      value={formData.timezone}
                      onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                      className="ui-input-tight appearance-none bg-white pr-10"
                    >
                      {TIMEZONES.map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Currency</label>
                  <select 
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="ui-input-tight appearance-none bg-white"
                  >
                    <option value="AUD">AUD ($)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Annual Revenue Target</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">$</span>
                    <input 
                      type="number" 
                      value={formData.revenueTarget}
                      onChange={(e) => setFormData({ ...formData, revenueTarget: Number(e.target.value) })}
                      className="ui-input-tight pl-8" 
                      placeholder="100000"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "invoicing" && (
          <div className="space-y-8">
            {/* Invoice Branding & Terms */}
            <div className="ui-card space-y-8 border-slate-100">
              <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Invoicing & Terms</h2>
                  <p className="text-sm font-medium text-slate-500">Configure how your invoices look and what terms are applied.</p>
                </div>
                <button 
                  onClick={handleSaveInvoicing}
                  disabled={isSaving}
                  className="ui-button-primary flex items-center gap-2 px-6"
                  style={{ boxShadow: `0 10px 15px -3px var(--primary-soft)` }}
                >
                  <Save className="h-4 w-4" /> 
                  {isSaving ? "Saving..." : "Save Invoicing"}
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Invoice Logo */}
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Invoice-Specific Logo</label>
                  <div 
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e: any) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setFormData({ ...formData, invoiceLogoUrl: reader.result as string });
                          };
                          reader.readAsDataURL(file);
                        }
                      };
                      input.click();
                    }}
                    className="relative group h-48 rounded-[32px] border-2 border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center gap-3 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer overflow-hidden"
                  >
                    {formData.invoiceLogoUrl ? (
                      <div className="relative w-full h-full p-8 flex items-center justify-center bg-white">
                        <img src={formData.invoiceLogoUrl} className="max-w-full max-h-full object-contain" alt="Invoice Logo" />
                        <div className="absolute inset-0 bg-slate-900/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <div className="bg-white rounded-full p-3 shadow-xl">
                            <Upload className="h-5 w-5 text-slate-600" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-6">
                        <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-slate-300 group-hover:text-primary transition-colors mx-auto mb-3">
                          <Upload className="h-5 w-5" />
                        </div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Upload Custom Invoice Logo</p>
                        <p className="text-[10px] text-slate-400 mt-1 italic">Defaults to studio logo if empty</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Default Terms */}
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Default Invoice Terms</label>
                  <textarea 
                    value={formData.invoiceTerms}
                    onChange={(e) => setFormData({ ...formData, invoiceTerms: e.target.value })}
                    className="ui-input-tight h-48 py-4 resize-none leading-relaxed text-xs font-medium"
                    placeholder="Enter payment terms, cancellation policies, etc..."
                  />
                </div>
              </div>
            </div>

            {/* Tax & Bank Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Tax & Legal */}
              <div className="ui-card space-y-8 border-slate-100">
                <div className="border-b border-slate-50 pb-6">
                  <h2 className="text-lg font-bold text-slate-900">Tax & Legal</h2>
                  <p className="text-sm font-medium text-slate-500">Crucial details for accurate invoicing.</p>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">ABN Number</label>
                    <input 
                      type="text" 
                      value={formData.abn}
                      onChange={(e) => setFormData({ ...formData, abn: e.target.value })}
                      className="ui-input-tight" 
                      placeholder="72 600 082 460"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Tax Label</label>
                      <input 
                        type="text" 
                        value={formData.taxLabel}
                        onChange={(e) => setFormData({ ...formData, taxLabel: e.target.value })}
                        className="ui-input-tight" 
                        placeholder="GST"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Tax Rate (%)</label>
                      <input 
                        type="number" 
                        value={formData.taxRate}
                        onChange={(e) => setFormData({ ...formData, taxRate: Number(e.target.value) })}
                        className="ui-input-tight" 
                        placeholder="10"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              <div className="ui-card space-y-8 border-slate-100">
                <div className="border-b border-slate-50 pb-6">
                  <h2 className="text-lg font-bold text-slate-900">Bank Details</h2>
                  <p className="text-sm font-medium text-slate-500">Displayed on invoices for direct deposits.</p>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Account Name</label>
                    <input 
                      type="text" 
                      value={formData.accountName}
                      onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                      className="ui-input-tight" 
                      placeholder="Studio Name Pty Ltd"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">BSB Number</label>
                      <input 
                        type="text" 
                        value={formData.bsb}
                        onChange={(e) => setFormData({ ...formData, bsb: e.target.value })}
                        className="ui-input-tight" 
                        placeholder="000-000"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Account Number</label>
                      <input 
                        type="text" 
                        value={formData.accountNumber}
                        onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                        className="ui-input-tight" 
                        placeholder="00000000"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="space-y-8">
            <div className="ui-card space-y-8 border-slate-100">
              <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Email Notifications (SMTP)</h2>
                  <p className="text-sm font-medium text-slate-500">Configure your studio's outgoing mail server for automated notifications.</p>
                </div>
                <button 
                  onClick={handleSaveNotifications}
                  disabled={isSaving}
                  className="ui-button-primary flex items-center gap-2 px-6"
                  style={{ boxShadow: `0 10px 15px -3px var(--primary-soft)` }}
                >
                  <Save className="h-4 w-4" /> 
                  {isSaving ? "Saving..." : "Save SMTP Settings"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block flex items-center gap-2">
                    <Server className="h-3 w-3" /> SMTP Host
                  </label>
                  <input 
                    type="text" 
                    value={formData.smtpHost}
                    onChange={(e) => setFormData({ ...formData, smtpHost: e.target.value })}
                    className="ui-input-tight" 
                    placeholder="mail.studiio.au"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block flex items-center gap-2">
                    <Hash className="h-3 w-3" /> SMTP Port
                  </label>
                  <input 
                    type="number" 
                    value={formData.smtpPort}
                    onChange={(e) => setFormData({ ...formData, smtpPort: Number(e.target.value) })}
                    className="ui-input-tight" 
                    placeholder="465"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block flex items-center gap-2">
                    <Mail className="h-3 w-3" /> SMTP Username
                  </label>
                  <input 
                    type="text" 
                    value={formData.smtpUser}
                    onChange={(e) => setFormData({ ...formData, smtpUser: e.target.value })}
                    className="ui-input-tight" 
                    placeholder="team@studiio.au"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block flex items-center gap-2">
                    <Lock className="h-3 w-3" /> SMTP Password
                  </label>
                  <input 
                    type="password" 
                    value={formData.smtpPass}
                    onChange={(e) => setFormData({ ...formData, smtpPass: e.target.value })}
                    className="ui-input-tight" 
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-50">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setFormData({ ...formData, smtpSecure: !formData.smtpSecure })}
                    className={cn(
                      "h-6 w-11 rounded-full transition-colors relative",
                      formData.smtpSecure ? "bg-primary" : "bg-slate-200"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 left-1 h-4 w-4 bg-white rounded-full transition-transform",
                      formData.smtpSecure ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Secure Connection (SSL/TLS)</p>
                    <p className="text-xs font-medium text-slate-500">Recommended for most modern mail servers (Port 465).</p>
                  </div>
                </div>
              </div>

              {/* Notification Triggers */}
              <div className="space-y-6 pt-8">
                <div>
                  <h3 className="text-md font-bold text-slate-900">Active Notifications</h3>
                  <p className="text-sm font-medium text-slate-500">Automated emails that will be sent via this SMTP server.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <NotificationToggle label="New Bookings" active={true} />
                  <NotificationToggle label="Booking Confirmations" active={true} />
                  <NotificationToggle label="Invoices Sent" active={true} />
                  <NotificationToggle label="Gallery Delivery" active={true} />
                  <NotificationToggle label="Edit Request Updates" active={true} />
                  <NotificationToggle label="Statements" active={false} />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "data" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="ui-card border-slate-100 p-10 space-y-10">
              <div className="flex items-center justify-between border-b border-slate-50 pb-8">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Data & Storage</h2>
                  <p className="text-sm font-medium text-slate-500 max-w-md">Configure where your studio assets are stored and choose your primary provider.</p>
                </div>
                <div className="h-14 w-14 rounded-[20px] bg-slate-50 flex items-center justify-center text-slate-400">
                  <Database className="h-7 w-7" />
                </div>
              </div>

              {/* Primary Storage Selection */}
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Primary Storage Provider</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <StorageProviderCard 
                    id="DROPBOX"
                    label="Dropbox Business"
                    icon={<Cloud className="h-5 w-5" />}
                    active={formData.storageProvider === "DROPBOX"}
                    connected={!!tenant.dropboxConnectedAt}
                    onClick={async () => {
                      if (!tenant.dropboxConnectedAt) return;
                      setFormData({ ...formData, storageProvider: "DROPBOX" });
                      await updateTenantStorageSettings({ storageProvider: "DROPBOX" });
                      setMessage({ type: 'success', text: 'Dropbox set as primary storage' });
                    }}
                  />
                  <StorageProviderCard 
                    id="GOOGLE_DRIVE"
                    label="Google Drive"
                    icon={<Globe className="h-5 w-5" />}
                    active={formData.storageProvider === "GOOGLE_DRIVE"}
                    connected={!!tenant.googleDriveConnectedAt}
                    onClick={async () => {
                      if (!tenant.googleDriveConnectedAt) return;
                      setFormData({ ...formData, storageProvider: "GOOGLE_DRIVE" });
                      await updateTenantStorageSettings({ storageProvider: "GOOGLE_DRIVE" });
                      setMessage({ type: 'success', text: 'Google Drive set as primary storage' });
                    }}
                  />
                </div>
              </div>

              {/* Connection Management */}
              <div className="space-y-6 pt-10 border-t border-slate-50">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Manage Connections</h3>
                
                <div className="space-y-4">
                  {/* Dropbox Connection */}
                  <div className="flex items-center gap-4 p-6 rounded-[32px] bg-slate-50/50 border border-slate-100 group hover:border-blue-200 transition-all">
                    <div className="h-14 w-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-blue-600 shrink-0 border border-blue-50 group-hover:scale-110 transition-transform">
                      <Cloud className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900">Dropbox Business</h4>
                        {tenant.dropboxConnectedAt ? (
                          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[9px] font-black border border-blue-100 uppercase tracking-widest">Connected</span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-400 text-[9px] font-black border border-slate-200 uppercase tracking-widest">Disconnected</span>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-slate-500 truncate mt-1">
                        {tenant.dropboxConnectedAt 
                          ? `Linked to ${tenant.dropboxEmail || 'Dropbox account'} — Root: ${tenant.dropboxRootPath || '/Production/'}` 
                          : 'Professional cloud storage for large media assets.'}
                      </p>
                    </div>
                    
                    {tenant.dropboxConnectedAt ? (
                      <button 
                        onClick={async () => {
                          if (confirm("Disconnect Dropbox? This will stop all active syncs and fallback to standard storage.")) {
                            const res = await fetch('/api/auth/dropbox/disconnect', { method: 'POST' });
                            if (res.ok) window.location.reload();
                          }
                        }}
                        className="h-10 px-6 rounded-xl bg-white text-rose-500 text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:border-rose-200 hover:bg-rose-50 transition-all shadow-sm active:scale-95"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button 
                        onClick={() => window.location.href = '/api/auth/dropbox'}
                        className="h-10 px-8 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
                      >
                        Connect
                      </button>
                    )}
                  </div>

                  {/* Google Drive Connection */}
                  <div className="flex items-center gap-4 p-6 rounded-[32px] bg-slate-50/50 border border-slate-100 group hover:border-emerald-200 transition-all">
                    <div className="h-14 w-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-emerald-600 shrink-0 border border-emerald-50 group-hover:scale-110 transition-transform">
                      <Globe className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900">Google Drive</h4>
                        {tenant.googleDriveConnectedAt ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black border border-emerald-100 uppercase tracking-widest">Connected</span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-400 text-[9px] font-black border border-slate-200 uppercase tracking-widest">Disconnected</span>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-slate-500 truncate mt-1">
                        {tenant.googleDriveConnectedAt 
                          ? `Linked to ${tenant.googleDriveEmail || 'Google account'}` 
                          : 'Connect your Google Workspace or Personal Drive.'}
                      </p>
                    </div>
                    
                    {tenant.googleDriveConnectedAt ? (
                      <button 
                        onClick={async () => {
                          if (confirm("Disconnect Google Drive? Primary storage will fallback to Dropbox.")) {
                            const res = await fetch('/api/auth/google-drive/disconnect', { method: 'POST' });
                            if (res.ok) window.location.reload();
                          }
                        }}
                        className="h-10 px-6 rounded-xl bg-white text-rose-500 text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:border-rose-200 hover:bg-rose-50 transition-all shadow-sm active:scale-95"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button 
                        onClick={() => window.location.href = '/api/auth/google-drive'}
                        className="h-10 px-8 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 active:scale-95"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "scheduling" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="ui-card border-slate-100 p-10 space-y-10">
              <div className="flex items-center justify-between border-b border-slate-50 pb-8">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Scheduling & Logistics</h2>
                  <p className="text-sm font-medium text-slate-500 max-w-md">Enable AI-powered travel time analysis and dynamic sun-locked booking.</p>
                </div>
                <button 
                  onClick={handleSaveLogistics}
                  disabled={isSaving}
                  className="ui-button-primary flex items-center gap-2 px-6"
                  style={{ boxShadow: `0 10px 15px -3px var(--primary-soft)` }}
                >
                  <Save className="h-4 w-4" /> 
                  {isSaving ? "Saving..." : "Save Scheduling Settings"}
                </button>
              </div>

              <div className="space-y-8">
                <div className="flex items-center justify-between p-8 rounded-[32px] bg-slate-50 border border-slate-100 group transition-all hover:border-primary/20">
                  <div className="flex gap-6">
                    <div className="h-14 w-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-primary shrink-0 border border-primary/5 group-hover:scale-110 transition-transform">
                      <Sparkles className="h-7 w-7" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-lg font-bold text-slate-900">Fluid AI Logistics Engine</h4>
                      <p className="text-sm font-medium text-slate-500 max-w-lg leading-relaxed">
                        When enabled, manual Sunrise/Dusk slots are replaced with dynamic windows based on real-time sun data. 
                        The engine also calculates drive times between crew members to optimize your studio's efficiency.
                      </p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setFormData({ ...formData, aiLogisticsEnabled: !formData.aiLogisticsEnabled })}
                    className={cn(
                      "h-8 w-14 rounded-full transition-all relative shrink-0",
                      formData.aiLogisticsEnabled ? "bg-primary shadow-lg shadow-primary/20" : "bg-slate-200"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 left-1 h-6 w-6 bg-white rounded-full transition-transform shadow-sm",
                      formData.aiLogisticsEnabled ? "translate-x-6" : "translate-x-0"
                    )} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 rounded-[28px] border border-slate-100 space-y-4">
                    <div className="flex items-center gap-3 text-slate-900">
                      <Clock className="h-4 w-4" />
                      <span className="text-xs font-black uppercase tracking-widest">Travel Buffers</span>
                    </div>
                    <p className="text-xs font-medium text-slate-500 leading-relaxed">
                      AI will automatically prevent bookings that don't allow sufficient travel time between properties using the Google Maps Distance Matrix.
                    </p>
                  </div>
                  <div className="p-6 rounded-[28px] border border-slate-100 space-y-4">
                    <div className="flex items-center gap-3 text-slate-900">
                      <Palette className="h-4 w-4" />
                      <span className="text-xs font-black uppercase tracking-widest">Sun-Locked Timing</span>
                    </div>
                    <p className="text-xs font-medium text-slate-500 leading-relaxed">
                      Sunrise and Dusk shoots will be automatically fixed to the optimal light window (arrival ~25 mins before sunset/sunrise).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "security" && (
          <div className="space-y-8">
            <div className="ui-card space-y-8 border-slate-100">
              <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Security & Compliance</h2>
                  <p className="text-sm font-medium text-slate-500">Manage your legal links and public gallery footer information.</p>
                </div>
                <button 
                  onClick={handleSaveSecurity}
                  disabled={isSaving}
                  className="ui-button-primary flex items-center gap-2 px-6"
                  style={{ boxShadow: `0 10px 15px -3px var(--primary-soft)` }}
                >
                  <Save className="h-4 w-4" /> 
                  {isSaving ? "Saving..." : "Save Security Info"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block flex items-center gap-2">
                    <Shield className="h-3 w-3" /> Privacy Policy URL
                  </label>
                  <input 
                    type="text" 
                    value={formData.privacyPolicyUrl}
                    onChange={(e) => setFormData({ ...formData, privacyPolicyUrl: e.target.value })}
                    className="ui-input-tight" 
                    placeholder="https://studio.au/privacy"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block flex items-center gap-2">
                    <Lock className="h-3 w-3" /> Terms of Use URL
                  </label>
                  <input 
                    type="text" 
                    value={formData.termsOfUseUrl}
                    onChange={(e) => setFormData({ ...formData, termsOfUseUrl: e.target.value })}
                    className="ui-input-tight" 
                    placeholder="https://studio.au/terms"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block flex items-center gap-2">
                    <Mail className="h-3 w-3" /> Contact Studio URL
                  </label>
                  <input 
                    type="text" 
                    value={formData.contactStudioUrl}
                    onChange={(e) => setFormData({ ...formData, contactStudioUrl: e.target.value })}
                    className="ui-input-tight" 
                    placeholder="https://studio.au/contact"
                  />
                </div>
              </div>

              <div className="p-6 bg-slate-900 rounded-[32px] text-white space-y-3 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
                  <Shield className="h-12 w-12" />
                </div>
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">Compliance Pro-Tip</h4>
                <p className="text-xs leading-relaxed font-medium opacity-90">
                  These links will appear in the footer of your public galleries. If left empty, generic Studiio links will be used as fallbacks.
                </p>
              </div>
            </div>
          </div>
        )}

        {(activeTab === "integrations") && (
          <div className="ui-card flex flex-col items-center justify-center py-24 text-center border-slate-100">
            <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center mb-6">
              <Database className="h-8 w-8 text-slate-200" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Coming Soon</h3>
            <p className="text-sm font-medium text-slate-500 max-w-sm mt-2">We're working hard to bring advanced {activeTab} features to your studio dashboard.</p>
          </div>
        )}

        {activeTab === "billing" && (
          <div className="space-y-8">
            {/* ... rest of billing tab ... */}
          </div>
        )}

        {activeTab === "booking-link" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="ui-card space-y-10 border-slate-100 p-10">
              <div className="flex items-start justify-between border-b border-slate-50 pb-8">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Public Booking Funnel</h2>
                  <p className="text-sm font-medium text-slate-500">Share this link with new clients to automate your intake and booking process.</p>
                </div>
                <div className="h-14 w-14 rounded-[20px] bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                  <Sparkles className="h-7 w-7" />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12">
                <div className="space-y-8">
                  {/* Link Box */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Your Unique Booking URL</label>
                    <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-[24px] border border-slate-100 group hover:border-primary/30 transition-all">
                      <div className="flex-1 px-4 font-mono text-xs text-slate-600 truncate">
                        {typeof window !== 'undefined' ? `${window.location.origin}/book/${tenant.slug}` : `studiio.com/book/${tenant.slug}`}
                      </div>
                      <button 
                        onClick={() => {
                          const url = `${window.location.origin}/book/${tenant.slug}`;
                          navigator.clipboard.writeText(url);
                          setMessage({ type: 'success', text: 'Link copied to clipboard!' });
                        }}
                        className="h-12 px-6 rounded-2xl bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:border-primary hover:text-primary transition-all shadow-sm flex items-center gap-2 active:scale-95"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Link
                      </button>
                    </div>
                  </div>

                  <div className="p-8 rounded-[32px] bg-slate-900 text-white space-y-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                      <Activity className="h-12 w-12" />
                    </div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">How it works</h4>
                    <ul className="space-y-4">
                      {[
                        "Clients open your link on any device (optimised for iPhone/Android).",
                        "They enter their agency details and shoot requirements.",
                        "A new Client profile is automatically created in your system.",
                        "The appointment appears on your calendar as 'Requested' for your approval."
                      ].map((text, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <div className="h-5 w-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</div>
                          <p className="text-xs font-medium leading-relaxed opacity-80">{text}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="aspect-square rounded-[40px] bg-white border border-slate-100 shadow-xl flex flex-col items-center justify-center p-8 text-center group hover:scale-[1.02] transition-transform cursor-pointer">
                    <div className="h-full w-full bg-slate-50 rounded-[24px] flex items-center justify-center mb-4 relative overflow-hidden">
                      {/* Fake QR code placeholder */}
                      <div className="grid grid-cols-4 gap-1 opacity-20">
                        {Array.from({ length: 16 }).map((_, i) => (
                          <div key={i} className={cn("h-4 w-4 bg-slate-900 rounded-[2px]", Math.random() > 0.5 ? "opacity-100" : "opacity-0")} />
                        ))}
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <ExternalLink className="h-8 w-8 text-slate-300 group-hover:text-primary group-hover:scale-110 transition-all" />
                      </div>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Share QR Code</p>
                    <p className="text-[9px] text-slate-400 mt-1 italic">Scan to open on mobile</p>
                  </div>

                  <div className="p-6 rounded-[32px] border border-slate-100 bg-slate-50/50">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 mb-2">Pro Tip</h4>
                    <p className="text-[10px] leading-relaxed text-slate-500 font-medium">
                      Add this link to your email signature or Instagram bio to let clients book shoots while you sleep.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanFeature({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <CheckCircle2 className="h-3 w-3" />
      </div>
      <span className="text-xs font-bold text-slate-600">{label}</span>
    </div>
  );
}

function SettingsTab({ label, icon, active, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-5 py-4 rounded-[24px] text-sm font-bold transition-all duration-300 group",
        active 
          ? "bg-[var(--primary)] text-white shadow-xl translate-x-1" 
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      )}
      style={active ? { boxShadow: `0 10px 15px -3px var(--primary-soft)` } : {}}
    >
      <div className={cn(
        "h-8 w-8 rounded-xl flex items-center justify-center transition-colors",
        active ? "bg-white/20" : "bg-slate-50 group-hover:bg-[var(--primary)] group-hover:text-white"
      )}>
        {icon}
      </div>
      {label}
    </button>
  );
}

function NotificationToggle({ label, active }: { label: string, active: boolean }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
      <div className="flex items-center gap-3">
        <Activity className={cn("h-4 w-4", active ? "text-primary" : "text-slate-300")} />
        <span className="text-sm font-bold text-slate-700">{label}</span>
      </div>
      <div className={cn(
        "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
        active ? "bg-primary/10 text-emerald-600" : "bg-slate-100 text-slate-400"
      )}>
        {active ? "Active" : "Disabled"}
      </div>
    </div>
  );
}

function StorageProviderCard({ id, label, icon, active, connected, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      disabled={!connected}
      className={cn(
        "relative flex flex-col items-start gap-4 p-6 rounded-[32px] border transition-all text-left group",
        active 
          ? "bg-white border-primary shadow-xl ring-4 ring-primary/5 translate-y-[-2px]" 
          : connected 
            ? "bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50 opacity-80" 
            : "bg-slate-50 border-slate-100 opacity-40 cursor-not-allowed"
      )}
    >
      <div className={cn(
        "h-12 w-12 rounded-2xl flex items-center justify-center transition-all",
        active ? "bg-primary text-white scale-110" : "bg-slate-50 text-slate-400 group-hover:text-slate-600"
      )}>
        {icon}
      </div>
      
      <div>
        <h4 className={cn("text-xs font-black uppercase tracking-widest", active ? "text-slate-900" : "text-slate-500")}>{label}</h4>
        <p className="text-[10px] font-medium text-slate-400 mt-1">
          {active ? "Currently Active" : connected ? "Available" : "Not Connected"}
        </p>
      </div>

      {active && (
        <div className="absolute top-4 right-4 h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center animate-in zoom-in duration-300">
          <Check className="h-3.5 w-3.5" strokeWidth={4} />
        </div>
      )}
    </button>
  );
}
