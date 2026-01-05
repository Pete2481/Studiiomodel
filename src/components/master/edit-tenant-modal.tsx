"use client";

import { useState } from "react";
import { X, Save, Building2, Mail, Phone, Loader2 } from "lucide-react";
import { updateTenantAction } from "@/app/actions/master";

interface EditTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: {
    id: string;
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    slug: string;
  };
}

export function EditTenantModal({ isOpen, onClose, tenant }: EditTenantModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: tenant.name,
    contactEmail: tenant.contactEmail || "",
    contactPhone: tenant.contactPhone || "",
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await updateTenantAction(tenant.id, formData);
      if (result.success) {
        onClose();
      } else {
        setError(result.error || "Failed to update tenant");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-8 border-b border-slate-50">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Edit Tenant</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Studio ID: {tenant.id}</p>
          </div>
          <button onClick={onClose} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-50 transition-colors text-slate-400 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {error && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-[13px] font-bold">
              {error}
            </div>
          )}

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Studio Name</label>
              <div className="relative group">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-slate-900 transition-colors" />
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full h-12 rounded-2xl border border-slate-100 bg-slate-50/50 pl-11 pr-4 text-sm font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white"
                />
              </div>
            </div>

            <div className="space-y-2 opacity-60">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Studio Slug (Not Editable)</label>
              <div className="relative group">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                <input 
                  type="text" 
                  readOnly
                  value={tenant.slug}
                  className="w-full h-12 rounded-2xl border border-slate-100 bg-slate-50/50 pl-11 pr-4 text-sm font-bold text-slate-400 outline-none cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Contact Email</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-slate-900 transition-colors" />
                <input 
                  type="email" 
                  required
                  value={formData.contactEmail}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                  className="w-full h-12 rounded-2xl border border-slate-100 bg-slate-50/50 pl-11 pr-4 text-sm font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Contact Phone</label>
              <div className="relative group">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-slate-900 transition-colors" />
                <input 
                  type="tel" 
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  className="w-full h-12 rounded-2xl border border-slate-100 bg-slate-50/50 pl-11 pr-4 text-sm font-bold text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-50">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 h-12 rounded-2xl border border-slate-100 font-bold text-[13px] text-slate-600 hover:bg-slate-50 transition-all active:scale-95"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="flex-1 h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold text-[13px] shadow-xl shadow-slate-900/10 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

