"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, ChevronDown, Camera, ShieldCheck, Mail, Phone, User, Globe, Trash2, Plus, Copy } from "lucide-react";
import { cn, formatDropboxUrl } from "@/lib/utils";
import { adminSetUserPasswordByEmail } from "@/app/actions/password";

interface TeamMemberDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  member?: any; // Can be null for new member
  onSave: (data: any) => Promise<void>;
}

const ROLE_OPTIONS = [
  { value: "PHOTOGRAPHER", label: "Photographer", description: "Shoot & upload access" },
  { value: "EDITOR", label: "Editor", description: "Culling & post-production" },
  { value: "ADMIN", label: "Admin", description: "Full tenant management" },
  { value: "ACCOUNTS", label: "Accounts", description: "Billing & invoices only" },
];

type PermissionKey =
  | "viewCalendar"
  | "viewBookings"
  | "viewAllBookings"
  | "viewGalleries"
  | "viewAllGalleries"
  | "viewInvoices"
  | "manageGalleries"
  | "manageServices"
  | "deleteGallery";

const PERMISSIONS: Record<
  PermissionKey,
  { label: string; help: string }
> = {
  viewCalendar: {
    label: "Calendar",
    help: "See the calendar grid and booking times.",
  },
  viewBookings: {
    label: "Bookings",
    help: "Open the bookings page and view booking details.",
  },
  viewAllBookings: {
    label: "See all bookings",
    help: "When off, they should only see jobs assigned to them.",
  },
  viewGalleries: {
    label: "Galleries",
    help: "Access the galleries module and view job galleries.",
  },
  viewAllGalleries: {
    label: "See all galleries",
    help: "When off, they should only see galleries for jobs assigned to them.",
  },
  viewInvoices: {
    label: "Invoices",
    help: "Access invoices and billing information.",
  },
  manageGalleries: {
    label: "Manage galleries",
    help: "Create/edit galleries and delivery settings.",
  },
  manageServices: {
    label: "Manage services",
    help: "Edit the service catalogue and pricing.",
  },
  deleteGallery: {
    label: "Delete gallery",
    help: "Hard delete a gallery. Use sparingly.",
  },
};

export function TeamMemberDrawer({
  isOpen,
  onClose,
  member,
  onSave,
}: TeamMemberDrawerProps) {
  const [formData, setFormData] = useState({
    id: "",
    displayName: "",
    email: "",
    phone: "",
    role: "PHOTOGRAPHER",
    avatarUrl: "",
    status: "ACTIVE",
    calendarSecret: "",
    permissions: {} as Record<string, boolean>,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [mounted, setMounted] = useState(false);

  const getDefaultPermissionsForRole = (role: string): Record<string, boolean> => {
    const r = String(role || "PHOTOGRAPHER").toUpperCase();
    if (r === "ADMIN") {
      return {
        viewCalendar: true,
        viewBookings: true,
        viewAllBookings: true,
        viewGalleries: true,
        viewAllGalleries: true,
        viewInvoices: true,
        manageGalleries: true,
        manageServices: true,
        deleteGallery: true,
      };
    }
    if (r === "EDITOR") {
      return {
        viewCalendar: false,
        viewBookings: false,
        viewAllBookings: false,
        viewGalleries: true,
        viewAllGalleries: true,
        viewInvoices: false,
        manageGalleries: true,
        manageServices: false,
        deleteGallery: false,
      };
    }
    if (r === "ACCOUNTS") {
      return {
        viewCalendar: true,
        viewBookings: true,
        viewAllBookings: true,
        viewGalleries: false,
        viewAllGalleries: false,
        viewInvoices: true,
        manageGalleries: false,
        manageServices: false,
        deleteGallery: false,
      };
    }
    // PHOTOGRAPHER default: access on, assigned-only scope.
    return {
      viewCalendar: true,
      viewBookings: true,
      viewAllBookings: false,
      viewGalleries: true,
      viewAllGalleries: false,
      viewInvoices: false,
      manageGalleries: false,
      manageServices: false,
      deleteGallery: false,
    };
  };

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (member && member.id) {
      // Auto-generate a secret for existing members who don't have one yet
      const secret = member.calendarSecret || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const roleForDefaults = String(member.role || "PHOTOGRAPHER");
      const mergedPerms = { ...getDefaultPermissionsForRole(roleForDefaults), ...(member.permissions || {}) };
      
      setFormData({
        id: member.id,
        displayName: member.name || "",
        email: member.email || "",
        phone: member.phone || "",
        role: member.role || "PHOTOGRAPHER",
        avatarUrl: member.avatar || "",
        status: member.status || "ACTIVE",
        calendarSecret: secret,
        permissions: mergedPerms,
      });
      setPreviewUrl(member.avatar || null);
    } else {
      setFormData({
        id: "",
        displayName: "",
        email: "",
        phone: "",
        role: "PHOTOGRAPHER",
        avatarUrl: "",
        status: "ACTIVE",
        calendarSecret: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        permissions: getDefaultPermissionsForRole("PHOTOGRAPHER"),
      });
      setPreviewUrl(null);
    }
  }, [member]);

  if (!mounted) return null;

  const setPerm = (key: PermissionKey, next: boolean) => {
    setFormData((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: next,
      },
    }));
  };

  const PermToggle = (props: { k: PermissionKey }) => {
    const meta = PERMISSIONS[props.k];
    const checked = !!formData.permissions[props.k];
    return (
      <label
        className={cn(
          "flex items-start justify-between gap-4 px-5 py-4 rounded-2xl border transition-all cursor-pointer",
          checked ? "border-emerald-500 bg-emerald-50/30" : "border-slate-100 bg-white hover:border-slate-200"
        )}
      >
        <span className="min-w-0">
          <span className={cn("block text-[11px] font-black uppercase tracking-tight", checked ? "text-slate-900" : "text-slate-600")}>
            {meta.label}
          </span>
          <span className="block mt-1 text-[11px] font-medium text-slate-500 leading-snug">
            {meta.help}
          </span>
        </span>
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
          checked={checked}
          onChange={(e) => setPerm(props.k, e.target.checked)}
        />
      </label>
    );
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
        // In a real app, you'd upload this to S3/Cloudinary/etc.
        // For now we'll store the base64 or just a placeholder
        setFormData(prev => ({ ...prev, avatarUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px] transition-all duration-500 ease-in-out",
          isOpen ? "opacity-100 visible" : "opacity-0 pointer-events-none invisible"
        )}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className={cn(
        "fixed inset-y-0 right-0 z-[101] w-full max-w-[540px] bg-white shadow-2xl flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        
        {/* Header */}
        <div className="px-10 py-8 flex items-start justify-between border-b border-slate-50">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
              {formData.id ? "EDIT TEAM MEMBER" : "INVITE TEAM MEMBER"}
            </p>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {formData.id ? "Update profile" : "Add to roster"}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-400 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto px-10 pb-10 space-y-10 custom-scrollbar mt-8">
          <form id="team-form" onSubmit={handleSubmit} className="space-y-10">
            
            {/* Profile Picture Section */}
            <div className="flex flex-col items-center justify-center py-4">
              <div className="relative group">
                <div className="h-32 w-32 rounded-[40px] bg-slate-100 overflow-hidden border-4 border-white shadow-xl flex items-center justify-center">
                  {previewUrl ? (
                    <img src={formatDropboxUrl(previewUrl)} className="h-full w-full object-cover" alt="Profile preview" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-emerald-50 text-emerald-600 font-bold text-2xl uppercase">
                      {formData.displayName?.split(" ").map((n: any) => n[0]).join("").slice(0, 2) || <Camera className="h-10 w-10 text-slate-300" />}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 h-10 w-10 bg-emerald-500 rounded-2xl text-white flex items-center justify-center shadow-lg hover:bg-emerald-600 transition-all active:scale-95 border-2 border-white"
                >
                  <Plus className="h-5 w-5" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleImageChange}
                />
              </div>
              <p className="mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Upload Profile Photo</p>
            </div>

            {/* Basic Info */}
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                  <input 
                    required
                    value={formData.displayName}
                    onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                    type="text" 
                    placeholder="Aidan Cartwright" 
                    className="ui-input-tight pl-12" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Role</label>
                  <div className="relative">
                    <select 
                      value={formData.role}
                      onChange={(e) => setFormData({...formData, role: e.target.value})}
                      className="ui-input-tight appearance-none bg-white pr-10"
                    >
                      {ROLE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Status</label>
                  <div className="relative">
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                      className="ui-input-tight appearance-none bg-white pr-10"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                  <input 
                    required
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="aidan@studiio.com" 
                    className="ui-input-tight pl-12" 
                  />
                </div>
              </div>

              {/* Portal Password (admin sets temporary password; user can change later) */}
              <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-6">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-900">Portal Password</h4>
                  <p className="text-xs text-slate-400">
                    Sets a new password for this email (global per email). They can change it later in Settings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const targetEmail = String(formData.email || "").trim();
                    if (!targetEmail) return alert("Add an email first.");
                    const pw = window.prompt("Set a new temporary password (min 8 chars):", "");
                    if (pw === null) return;
                    if (pw.trim().length < 8) return alert("Password must be at least 8 characters.");
                    const res = await adminSetUserPasswordByEmail({ email: targetEmail, newPassword: pw.trim() });
                    if (!res.success) return alert(res.error || "Failed to set password.");
                    alert("Password saved.");
                  }}
                  className="h-11 px-5 rounded-2xl bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:text-emerald-600 hover:border-emerald-200 transition-all shadow-sm active:scale-95"
                >
                  Set Password
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                  <input 
                    name="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    type="tel" 
                    placeholder="0412 345 678" 
                    className="ui-input-tight pl-12" 
                  />
                </div>
              </div>
            </div>

            {/* Calendar Subscription */}
            {formData.id && (
              <div className="space-y-4 border-t border-slate-100 pt-8">
                <div className="flex flex-col gap-1">
                  <h4 className="text-sm font-bold text-slate-900">Calendar Subscription</h4>
                  <p className="text-xs text-slate-500">Sync only this member's assignments to their external calendar (Google, Outlook, Apple).</p>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex-1 px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 font-mono text-[10px] text-slate-500 truncate select-all">
                    {typeof window !== "undefined" ? `${window.location.origin}/api/calendar/feed/${formData.calendarSecret}` : ""}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/api/calendar/feed/${formData.calendarSecret}`;
                      navigator.clipboard.writeText(url);
                      alert("Subscription link copied to clipboard!");
                    }}
                    className="h-10 px-4 flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-emerald-500 hover:border-emerald-200 transition-all active:scale-95 shadow-sm"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy Link
                  </button>
                  <a
                    href={`webcal://${typeof window !== "undefined" ? window.location.host : ""}/api/calendar/feed/${formData.calendarSecret}`}
                    className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-2 hover:border-emerald-200 transition-all active:scale-95 shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Subscribe
                  </a>
                </div>
                {(!member || !member.calendarSecret) && (
                  <p className="text-[9px] text-amber-600 font-bold italic animate-pulse">
                    * This is a new link. Click "Save Changes" to activate it forever.
                  </p>
                )}
              </div>
            )}

            {/* Permissions Section */}
            <div className="space-y-6 border-t border-slate-100 pt-8">
              <div className="flex flex-col gap-1">
                <h4 className="text-sm font-bold text-slate-900">Permissions</h4>
                <p className="text-xs text-slate-500">Clear access rules for what this crew member can see and do.</p>
              </div>
              
              {/* Simple permissions */}
              <div className="space-y-3">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Access</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <PermToggle k="viewCalendar" />
                  <PermToggle k="viewBookings" />
                  <PermToggle k="viewGalleries" />
                  <PermToggle k="viewInvoices" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Scope</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <PermToggle k="viewAllBookings" />
                  <PermToggle k="viewAllGalleries" />
                </div>
              </div>

              {/* Advanced */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-slate-100 bg-white hover:border-slate-200 transition-all"
                >
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Advanced</span>
                  <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", showAdvanced && "rotate-180")} />
                </button>
                {showAdvanced && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <PermToggle k="manageGalleries" />
                    <PermToggle k="manageServices" />
                    <PermToggle k="deleteGallery" />
                  </div>
                )}
              </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="px-10 py-8 border-t border-slate-100 flex items-center justify-end gap-6">
          <button 
            onClick={onClose}
            className="text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit"
            form="team-form"
            disabled={isSubmitting}
            className="h-12 px-8 rounded-full bg-[#10B981] text-white font-bold shadow-lg shadow-emerald-500/20 hover:bg-[#059669] transition-all active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? "Inviting..." : formData.id ? "Save changes" : "Invite to team"}
          </button>
        </div>
      </div>
    </>
  );
}

// End of file

