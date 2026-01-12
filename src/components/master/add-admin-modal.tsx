"use client";

import { useState } from "react";
import { UserPlus, Loader2, X, Shield } from "lucide-react";
import { addTenantAdminAction } from "@/app/actions/master";

interface AddAdminModalProps {
  tenantId: string;
  tenantName: string;
  defaultEmail?: string;
}

export function AddAdminModal({ tenantId, tenantName, defaultEmail }: AddAdminModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState(defaultEmail || "");
  const [name, setName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await addTenantAdminAction(tenantId, email, name);
      if (result.success) {
        alert("✅ Success! " + email + " can now log in.");
        setIsOpen(false);
      } else {
        alert(result.error || "Failed to add user");
      }
    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="h-9 w-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all border border-transparent hover:border-emerald-100"
        title="Quick Add Admin"
      >
        <UserPlus className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#b5d0c1]/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase italic tracking-tight leading-none">Add Admin Access</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{tenantName}</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center text-slate-300 hover:bg-white hover:text-slate-900 transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">User's Full Name</label>
                  <input 
                    type="text" 
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Peter Hogan"
                    className="w-full h-12 rounded-xl border border-slate-100 bg-slate-50/50 px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-900 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">User's Email</label>
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@email.com"
                    className="w-full h-12 rounded-xl border border-slate-100 bg-slate-50/50 px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-900 transition-all"
                  />
                </div>
              </div>

              <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex gap-3">
                <div className="h-5 w-5 shrink-0 text-amber-600 mt-0.5">ℹ️</div>
                <p className="text-[11px] font-medium text-amber-800 leading-relaxed">
                  Adding an admin user will allow them to log in to this studio instantly. They will receive a security code via email upon login.
                </p>
              </div>

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-[#b5d0c1] hover:bg-[#b5d0c1]/90 text-slate-900 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-900/10 active:scale-95 disabled:opacity-50 border border-white/60"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Authorize User"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

