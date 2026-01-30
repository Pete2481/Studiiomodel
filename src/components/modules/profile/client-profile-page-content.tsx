"use client";

import React, { useMemo, useState } from "react";
import { Mail, Phone, Building2, User, Save, Lock, Image as ImageIcon, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn, formatDropboxUrl } from "@/lib/utils";
import { updateMyClientProfile } from "@/app/actions/profile";
import { setMyPassword } from "@/app/actions/password";

type Initial = {
  id: string;
  name: string;
  businessName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  watermarkUrl: string;
  accountsEmail: string;
};

export function ClientProfilePageContent({ initial }: { initial: Initial }) {
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [form, setForm] = useState({
    name: initial.name || "",
    businessName: initial.businessName || "",
    phone: initial.phone || "",
    accountsEmail: initial.accountsEmail || "",
    avatarUrl: initial.avatarUrl || "",
    watermarkUrl: initial.watermarkUrl || "",
  });

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  const avatarPreview = useMemo(() => {
    const v = String(form.avatarUrl || "").trim();
    if (!v) return null;
    return formatDropboxUrl(v);
  }, [form.avatarUrl]);

  const brandPreview = useMemo(() => {
    const v = String(form.watermarkUrl || "").trim();
    if (!v) return null;
    return formatDropboxUrl(v);
  }, [form.watermarkUrl]);

  return (
    <div className="space-y-10">
      {message && (
        <div
          className={cn(
            "p-4 rounded-[20px] flex items-center justify-between border animate-in zoom-in duration-300",
            message.type === "success"
              ? "bg-primary/10 border-primary/20 text-emerald-800"
              : "bg-rose-50 border-rose-100 text-rose-800",
          )}
        >
          <div className="flex items-center gap-3">
            {message.type === "success" ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            <span className="text-sm font-bold">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="p-1 hover:bg-black/5 rounded-full transition-colors">
            ✕
          </button>
        </div>
      )}

      {/* Profile */}
      <div className="ui-card space-y-8 border-slate-100 p-10">
        <div className="flex items-start justify-between border-b border-slate-50 pb-8">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Profile</h2>
            <p className="text-sm font-medium text-slate-500">These details show on invoices, galleries, and communications.</p>
          </div>
          <div className="h-14 w-14 rounded-[20px] bg-slate-900 flex items-center justify-center text-white">
            <User className="h-7 w-7" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Agency / Business Name</label>
              <div className="relative">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                <input
                  value={form.businessName}
                  onChange={(e) => setForm((p) => ({ ...p, businessName: e.target.value }))}
                  type="text"
                  placeholder="Ray White Real Estate"
                  className="ui-input-tight pl-12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Primary Contact Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  type="text"
                  placeholder="Shae Reuss"
                  className="ui-input-tight pl-12"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Portal Email (login)</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                  <input
                    value={initial.email}
                    readOnly
                    className="ui-input-tight pl-12 bg-slate-50 cursor-not-allowed opacity-70"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Phone</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    type="tel"
                    placeholder="0412 345 678"
                    className="ui-input-tight pl-12"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Accounts Email (invoices)</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                <input
                  value={form.accountsEmail}
                  onChange={(e) => setForm((p) => ({ ...p, accountsEmail: e.target.value }))}
                  type="text"
                  placeholder="accounts@agency.com, ap@agency.com"
                  className="ui-input-tight pl-12 text-xs"
                />
              </div>
              <p className="text-[11px] text-slate-500 font-medium ml-1">
                Comma-separated allowed. Invoices will be sent to this address instead of the portal email.
              </p>
            </div>
          </div>

          <div className="space-y-8">
            <div className="p-8 rounded-[32px] bg-slate-50 border border-slate-100 space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-900">Profile image</h4>
                  <p className="text-xs text-slate-500">Paste a public https link or Dropbox link.</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                  {avatarPreview ? (
                    <img src={avatarPreview} className="h-full w-full object-cover" alt="Profile preview" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-slate-300" />
                  )}
                </div>
              </div>
              <input
                value={form.avatarUrl}
                onChange={(e) => setForm((p) => ({ ...p, avatarUrl: e.target.value }))}
                type="url"
                placeholder="https://…"
                className="ui-input-tight"
              />
            </div>

            <div className="p-8 rounded-[32px] bg-slate-50 border border-slate-100 space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-900">Branding logo</h4>
                  <p className="text-xs text-slate-500">This can be used for watermarking / branding.</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                  {brandPreview ? (
                    <img src={brandPreview} className="h-full w-full object-cover" alt="Brand preview" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-slate-300" />
                  )}
                </div>
              </div>
              <input
                value={form.watermarkUrl}
                onChange={(e) => setForm((p) => ({ ...p, watermarkUrl: e.target.value }))}
                type="url"
                placeholder="https://…"
                className="ui-input-tight"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            disabled={isSaving}
            onClick={async () => {
              setIsSaving(true);
              setMessage(null);
              const res = await updateMyClientProfile(form);
              setIsSaving(false);
              if (res.success) setMessage({ type: "success", text: "Profile updated." });
              else setMessage({ type: "error", text: res.error || "Failed to update profile." });
            }}
            className="ui-button-primary flex items-center gap-2 px-8"
            style={{ boxShadow: `0 10px 15px -3px var(--primary-soft)` }}
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>

      {/* Password */}
      <div className="ui-card space-y-8 border-slate-100 p-10">
        <div className="flex items-start justify-between border-b border-slate-50 pb-8">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Password</h2>
            <p className="text-sm font-medium text-slate-500">Your password is global per email and works across all workspaces.</p>
          </div>
          <div className="h-14 w-14 rounded-[20px] bg-slate-900 flex items-center justify-center text-white">
            <Lock className="h-7 w-7" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Current password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
              className="ui-input-tight"
              placeholder="Required if you already set one"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={pw.next}
              onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
              className="ui-input-tight"
              placeholder="At least 8 characters"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={pw.confirm}
              onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
              className="ui-input-tight"
              placeholder="Re-enter new password"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            disabled={isSaving}
            onClick={async () => {
              if (pw.next.length < 8) return setMessage({ type: "error", text: "Password must be at least 8 characters." });
              if (pw.next !== pw.confirm) return setMessage({ type: "error", text: "New password and confirmation do not match." });

              setIsSaving(true);
              setMessage(null);
              const res = await setMyPassword({ currentPassword: pw.current || undefined, newPassword: pw.next });
              setIsSaving(false);
              if (res.success) {
                setPw({ current: "", next: "", confirm: "" });
                setMessage({ type: "success", text: "Password saved." });
              } else {
                setMessage({ type: "error", text: res.error || "Failed to save password." });
              }
            }}
            className="ui-button-primary flex items-center gap-2 px-8"
            style={{ boxShadow: `0 10px 15px -3px var(--primary-soft)` }}
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

