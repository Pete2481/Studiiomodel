"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, ChevronDown, Camera, ShieldCheck, Mail, Phone, User, Globe, Trash2, Plus, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

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

const PERMISSION_OPTIONS = [
  { key: "viewCalendar", label: "View Calendar" },
  { key: "viewBookings", label: "View Bookings" },
  { key: "viewBlankedBookings", label: "View Blanked Bookings" },
  { key: "viewAllBookings", label: "View All Bookings" },
  { key: "viewAllGalleries", label: "View All Galleries" },
  { key: "deleteGallery", label: "Delete Gallery" },
  { key: "viewInvoices", label: "View Invoices" },
  { key: "manageGalleries", label: "Manage Galleries" },
  { key: "manageServices", label: "Manage Services" },
];

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

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (member && member.id) {
      // Auto-generate a secret for existing members who don't have one yet
      const secret = member.calendarSecret || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      setFormData({
        id: member.id,
        displayName: member.name || "",
        email: member.email || "",
        phone: member.phone || "",
        role: member.role || "PHOTOGRAPHER",
        avatarUrl: member.avatar || "",
        status: member.status || "ACTIVE",
        calendarSecret: secret,
        permissions: member.permissions || {},
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
        permissions: {
          viewCalendar: true,
          viewBookings: true,
          viewAllBookings: true,
          viewAllGalleries: true,
        },
      });
      setPreviewUrl(null);
    }
  }, [member]);

  if (!mounted) return null;

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
                    <img src={previewUrl} className="h-full w-full object-cover" alt="Profile preview" />
                  ) : (
                    <Camera className="h-10 w-10 text-slate-300" />
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
                <p className="text-xs text-slate-500">Toggle access for this team member.</p>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {PERMISSION_OPTIONS.map((opt) => (
                  <label 
                    key={opt.key}
                    className={cn(
                      "flex items-center justify-between px-4 py-3 rounded-2xl border transition-all cursor-pointer",
                      formData.permissions[opt.key] 
                        ? "border-emerald-500 bg-emerald-50/30" 
                        : "border-slate-100 bg-white hover:border-slate-200"
                    )}
                  >
                    <span className={cn(
                      "text-[11px] font-bold uppercase tracking-tight",
                      formData.permissions[opt.key] ? "text-slate-900" : "text-slate-500"
                    )}>
                      {opt.label}
                    </span>
                    <input 
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                      checked={!!formData.permissions[opt.key]}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          permissions: {
                            ...formData.permissions,
                            [opt.key]: e.target.checked
                          }
                        });
                      }}
                    />
                  </label>
                ))}
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

