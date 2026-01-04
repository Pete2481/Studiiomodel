"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { User } from "lucide-react";
import { APP_VERSION } from "@/lib/version";

export function MobileTopBar() {
  const { data: session } = useSession();
  
  if (!session?.user) return null;

  const initials = session.user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "U";

  return (
    <div className="fixed top-0 left-0 right-0 z-[50] bg-white/80 backdrop-blur-md border-b border-slate-50 px-6 h-12 flex items-center justify-between">
      {/* Version Tag */}
      <span className="absolute top-1 left-6 text-[8px] font-black text-rose-500 uppercase tracking-widest pointer-events-none">
        v{APP_VERSION}
      </span>

      <div className="flex items-center gap-3 relative">
        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
          {session.user.image && session.user.image !== "" ? (
            <img src={session.user.image} className="h-full w-full object-cover" alt="Profile" />
          ) : (
            <span className="text-[10px] font-black text-slate-400">{initials}</span>
          )}
        </div>
        <span className="text-[11px] font-black text-slate-900 uppercase tracking-widest truncate max-w-[150px]">
          {session.user.name}
        </span>
      </div>
      
      <div className="flex items-center">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse mr-2" />
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active</span>
      </div>
    </div>
  );
}

