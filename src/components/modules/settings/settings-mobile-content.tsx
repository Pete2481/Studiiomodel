"use client";

import React from "react";
import { 
  User, 
  Building, 
  Bell, 
  Shield, 
  CreditCard,
  LogOut,
  ChevronRight,
  Palette,
  Mail,
  Smartphone
} from "lucide-react";
import { signOut } from "next-auth/react";

interface SettingsMobileContentProps {
  tenant: any;
  user: any;
}

export function SettingsMobileContent({ tenant, user }: SettingsMobileContentProps) {
  const sections = [
    {
      title: "Profile",
      items: [
        { label: "My Account", icon: User, value: user.name, color: "text-blue-500", bg: "bg-blue-50" },
        { label: "Notifications", icon: Bell, value: "Push & Email", color: "text-amber-500", bg: "bg-amber-50" },
      ]
    },
    {
      title: "Studio",
      items: [
        { label: "Branding", icon: Palette, value: tenant.name, color: "text-emerald-500", bg: "bg-emerald-50" },
        { label: "Contact Info", icon: Mail, value: tenant.contactEmail, color: "text-purple-500", bg: "bg-purple-50" },
        { label: "App Settings", icon: Smartphone, value: "PWA & Mobile", color: "text-pink-500", bg: "bg-pink-50" },
      ]
    },
    {
      title: "Security & Billing",
      items: [
        { label: "Privacy & Security", icon: Shield, color: "text-slate-500", bg: "bg-slate-50" },
        { label: "Subscription", icon: CreditCard, value: "Pro Plan", color: "text-indigo-500", bg: "bg-indigo-50" },
      ]
    }
  ];

  return (
    <div className="space-y-8 pb-10">
      {/* Profile Header */}
      <div className="px-6 flex items-center gap-4">
        <div className="h-20 w-20 rounded-[32px] bg-slate-100 flex items-center justify-center border border-slate-200 overflow-hidden shadow-xl shadow-slate-100">
          {user.image ? (
            <img src={user.image} className="h-full w-full object-cover" alt="Profile" />
          ) : (
            <span className="text-2xl font-black text-slate-400">
              {user.name?.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-black text-slate-900">{user.name}</h2>
          <p className="text-xs font-bold text-primary uppercase tracking-widest">{user.role}</p>
          <p className="text-[11px] font-medium text-slate-400">{user.email}</p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-8 px-6">
        {sections.map((section) => (
          <div key={section.title} className="space-y-3">
            <h3 className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              {section.title}
            </h3>
            <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
              {section.items.map((item, idx) => (
                <button
                  key={item.label}
                  className={cn(
                    "w-full px-5 py-4 flex items-center justify-between transition-all active:bg-slate-50",
                    idx !== section.items.length - 1 && "border-b border-slate-50"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", item.bg)}>
                      <item.icon className={cn("h-5 w-5", item.color)} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-900">{item.label}</p>
                      {item.value && <p className="text-[10px] font-medium text-slate-400">{item.value}</p>}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        ))}

        <button
          onClick={() => signOut()}
          className="w-full h-16 bg-red-50 rounded-[24px] flex items-center justify-center gap-3 text-red-600 font-black uppercase tracking-widest text-xs border border-red-100 shadow-sm active:scale-[0.98] transition-all mt-4"
        >
          <LogOut className="h-5 w-5" />
          Sign Out of Studiio
        </button>
      </div>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}

