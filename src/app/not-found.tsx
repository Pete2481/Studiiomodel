"use client";

import React from "react";
import { Search, Home, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = pathname?.startsWith("/mobile");

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="max-w-xl w-full text-center space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Visual Element */}
        <div className="relative inline-block">
          <div className="text-[180px] font-black text-slate-50 leading-none select-none">
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-24 w-24 rounded-[32px] bg-primary shadow-2xl shadow-primary/20 flex items-center justify-center text-white rotate-12">
              <Search className="h-10 w-10" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Page not found</h1>
          <p className="text-slate-500 text-lg leading-relaxed max-w-sm mx-auto">
            The shoot or page you're looking for has moved, or the link might be broken.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => router.back()}
            className="h-16 px-10 rounded-full bg-white border-2 border-slate-100 text-slate-900 font-black uppercase tracking-widest text-[10px] flex items-center gap-3 hover:border-primary/20 hover:bg-primary/5 transition-all active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
          
          <Link
            href={isMobile ? "/mobile" : "/"}
            className="h-16 px-10 rounded-full bg-primary text-white font-black uppercase tracking-widest text-[10px] flex items-center gap-3 shadow-xl shadow-primary/20 hover:opacity-90 transition-all active:scale-95"
          >
            <Home className="h-4 w-4" />
            {isMobile ? "App Home" : "Dashboard"}
          </Link>
        </div>

        {/* Brand Footer */}
        <div className="pt-12">
          <div className="h-8 w-px bg-slate-100 mx-auto" />
          <p className="mt-8 text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">
            Studiio Ecosystem
          </p>
        </div>
      </div>
    </div>
  );
}

