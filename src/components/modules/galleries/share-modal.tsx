"use client";

import React, { useState } from "react";
import { X, Copy, Check, Share2, Mail, Globe, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  galleryTitle: string;
  shareUrl: string;
  tenantName: string;
}

export function ShareModal({ isOpen, onClose, galleryTitle, shareUrl, tenantName }: ShareModalProps) {
  const [copied, setCopy] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopy(true);
    setTimeout(() => setCopy(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: galleryTitle,
          text: `Check out the production assets for ${galleryTitle} by ${tenantName}`,
          url: shareUrl,
        });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      
      <div className="relative bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Share Collaboration</p>
            <h3 className="text-xl font-bold text-slate-900 tracking-tight">Share this Gallery</h3>
          </div>
          <button 
            onClick={onClose}
            className="h-12 w-12 rounded-full hover:bg-white flex items-center justify-center text-slate-400 transition-colors shadow-sm"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-10 space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-slate-400 shrink-0">
                <Globe className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Public Access Link</p>
                <p className="text-sm font-bold text-slate-900 truncate">{shareUrl}</p>
              </div>
              <button 
                onClick={handleCopy}
                className={cn(
                  "h-12 px-6 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 shrink-0 shadow-sm",
                  copied ? "bg-emerald-500 text-white" : "bg-white text-slate-900 hover:bg-slate-50 border border-slate-100"
                )}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={handleNativeShare}
              className="flex flex-col items-center gap-3 p-6 rounded-[32px] border border-slate-100 hover:border-primary/20 hover:bg-primary/[0.02] transition-all group"
            >
              <div className="h-14 w-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-primary transition-all shadow-sm">
                <Share2 className="h-6 w-6" />
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-slate-900">Device Share</p>
                <p className="text-[9px] font-medium text-slate-400 mt-0.5">AirDrop, SMS, etc.</p>
              </div>
            </button>

            <a 
              href={`mailto:?subject=${encodeURIComponent(`Collaboration Gallery: ${galleryTitle}`)}&body=${encodeURIComponent(`Hi,\n\nYou can view the production assets for ${galleryTitle} here: ${shareUrl}\n\nProduction by ${tenantName}`)}`}
              className="flex flex-col items-center gap-3 p-6 rounded-[32px] border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/[0.3] transition-all group"
            >
              <div className="h-14 w-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-emerald-500 transition-all shadow-sm">
                <Mail className="h-6 w-6" />
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-slate-900">Email Link</p>
                <p className="text-[9px] font-medium text-slate-400 mt-0.5">Send to contacts</p>
              </div>
            </a>
          </div>

          <div className="p-6 bg-slate-900 rounded-[32px] text-white space-y-3 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <Send className="h-12 w-12" />
            </div>
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">Production Pro-Tip</h4>
            <p className="text-xs leading-relaxed font-medium opacity-90">
              Send this link to your clients or agents. They don't need a password to view or favourite these assets.
            </p>
          </div>
        </div>

        <div className="px-10 py-6 border-t border-slate-100 bg-slate-50/50 flex justify-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
            Secure Collaboration by Studiio.au
          </p>
        </div>
      </div>
    </div>
  );
}

