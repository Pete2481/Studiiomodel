"use client";

import React, { useState, useEffect } from "react";
import { DashboardShell } from "../../../../components/layout/dashboard-shell";
import { AppProviders } from "@/components/layout/app-providers";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "../../../../lib/nav-config";
import { 
  Building2, 
  Mail, 
  Phone, 
  ArrowLeft,
  Globe,
  Loader2,
  CheckCircle2,
  Save
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const NewTenantPage = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    settings: ""
  });

  useEffect(() => {
    const generatedSlug = formData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    
    setFormData(prev => ({ ...prev, slug: generatedSlug }));
  }, [formData.name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/master/tenants", {
        method: "POST",
        body: JSON.stringify(formData),
        headers: { "Content-Type": "application/json" }
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to create studio");

      router.push("/master");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const user = {
    name: "System Admin",
    role: "MASTER_ADMIN" as const,
    initials: "MA"
  };

  const filteredNav = permissionService.getFilteredNav(
    { role: user.role, isMasterMode: true },
    UNIFIED_NAV_CONFIG
  );

  return (
    <AppProviders>
      <DashboardShell 
        navSections={filteredNav} 
        user={user}
        title="Create Workspace"
        subtitle="Onboard a new studio team to the platform."
        isMasterMode={true}
      >
        <div className="max-w-4xl mx-auto space-y-8">
        <Link href="/master" className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-900 uppercase tracking-widest transition-colors">
          <ArrowLeft className="h-3 w-3" /> Back to dashboard
        </Link>

        <form onSubmit={handleSubmit} className="bg-white rounded-[48px] border border-slate-100 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="p-10 md:p-12 space-y-12">
            {error && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-bold flex gap-3 animate-in fade-in zoom-in-95">
                <CheckCircle2 className="h-5 w-5 rotate-180" /> {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1 text-xs">Studio Name</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                    <Building2 className="h-4.5 w-4.5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
                    <div className="w-[1px] h-4 bg-slate-100" />
                  </div>
                  <input 
                    type="text" 
                    required
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Studiio Sydney"
                    className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50/50 pl-14 pr-4 text-[15px] font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-[8px] focus:ring-slate-900/5 placeholder:text-slate-300 placeholder:font-medium"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] text-xs">URL Slug</label>
                  <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Auto Fill</span>
                </div>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                    <Globe className="h-4.5 w-4.5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
                    <div className="w-[1px] h-4 bg-slate-100" />
                  </div>
                  <input 
                    type="text" 
                    required
                    value={formData.slug}
                    onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                    placeholder="studiio-syd"
                    className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50/50 pl-14 pr-4 text-[15px] font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-[8px] focus:ring-slate-900/5 placeholder:text-slate-300 placeholder:font-medium"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1 text-xs">Primary User Name</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                    <Save className="h-4.5 w-4.5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
                    <div className="w-[1px] h-4 bg-slate-100" />
                  </div>
                  <input 
                    type="text" 
                    required
                    value={formData.contactName}
                    onChange={(e) => setFormData(prev => ({ ...prev, contactName: e.target.value }))}
                    placeholder="e.g. Peter Hogan"
                    className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50/50 pl-14 pr-4 text-[15px] font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-[8px] focus:ring-slate-900/5 placeholder:text-slate-300 placeholder:font-medium"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1 text-xs">Primary User Email</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                    <Mail className="h-4.5 w-4.5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
                    <div className="w-[1px] h-4 bg-slate-100" />
                  </div>
                  <input 
                    type="email" 
                    required
                    value={formData.contactEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, contactEmail: e.target.value }))}
                    placeholder="admin@studio.com"
                    className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50/50 pl-14 pr-4 text-[15px] font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-[8px] focus:ring-slate-900/5 placeholder:text-slate-300 placeholder:font-medium"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1 text-xs">Contact Phone</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                    <Phone className="h-4.5 w-4.5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
                    <div className="w-[1px] h-4 bg-slate-100" />
                  </div>
                  <input 
                    type="text" 
                    value={formData.contactPhone}
                    onChange={(e) => setFormData(prev => ({ ...prev, contactPhone: e.target.value }))}
                    placeholder="+61 400 000 000"
                    className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50/50 pl-14 pr-4 text-[15px] font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-[8px] focus:ring-slate-900/5 placeholder:text-slate-300 placeholder:font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1 text-xs">Initial Settings</label>
              <div className="relative group">
                <textarea 
                  value={formData.settings}
                  onChange={(e) => setFormData(prev => ({ ...prev, settings: e.target.value }))}
                  placeholder="Additional notes or configuration JSON..."
                  className="w-full min-h-[160px] p-6 rounded-3xl border border-slate-100 bg-slate-50/50 text-[15px] font-medium text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white focus:ring-[8px] focus:ring-slate-900/5 placeholder:text-slate-300 resize-none"
                />
              </div>
            </div>
          </div>

          <div className="px-10 py-8 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-6">
            <Link href="/master" className="text-xs font-bold text-slate-400 hover:text-slate-900 uppercase tracking-[0.2em] transition-colors">
              Cancel
            </Link>
            <button 
              type="submit" 
              disabled={loading}
              className="h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl px-10 font-bold text-sm transition-all flex items-center gap-3 shadow-xl shadow-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <>
                  <Save className="h-4.5 w-4.5" /> Create Tenant
                </>
              )}
            </button>
          </div>
        </form>
        </div>
      </DashboardShell>
    </AppProviders>
  );
};

export default NewTenantPage;
