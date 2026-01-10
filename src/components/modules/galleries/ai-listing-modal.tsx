"use client";

import React, { useState, useEffect } from "react";
import { 
  X, 
  Sparkles, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  Layout,
  ExternalLink,
  Eye,
  Send,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CameraLoader } from "@/components/ui/camera-loader";
import { generateListingCopy, saveGalleryCopy } from "@/app/actions/listing-copy";

interface AIListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  galleryTitle: string;
  initialCopy?: string;
  isPublished?: boolean;
}

export function AIListingModal({ 
  isOpen, 
  onClose, 
  galleryId, 
  galleryTitle,
  initialCopy = "",
  isPublished = false
}: AIListingModalProps) {
  const [copy, setCopy] = useState(initialCopy);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPublishedState, setIsPublishedState] = useState(isPublished);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setStatus("idle");

    try {
      const result = await generateListingCopy(galleryId);
      if (result.success && result.copy) {
        setCopy(result.copy as string);
      } else {
        setError(result.error || "Failed to generate copy.");
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (publish: boolean = false) => {
    setIsSaving(true);
    setError(null);

    try {
      const result = await saveGalleryCopy(galleryId, copy, publish);
      if (result.success) {
        setStatus("success");
        setIsPublishedState(publish);
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setError(result.error || "Failed to save.");
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyClipboard = () => {
    navigator.clipboard.writeText(copy);
    alert("Copy copied to clipboard!");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-4xl bg-white rounded-[40px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
        {/* Header */}
        <div className="px-8 py-8 border-b border-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/10 shadow-inner">
              <Sparkles className="h-6 w-6 fill-current" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">AI Listing Genius</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{galleryTitle}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all border border-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          {/* Main Workspace */}
          <div className="flex-1 flex flex-col p-8 gap-6 overflow-hidden">
            {!copy && !isGenerating ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
                <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-200">
                  <Layout className="h-10 w-10" />
                </div>
                <div className="max-w-md space-y-2">
                  <h4 className="text-lg font-bold text-slate-900 tracking-tight">Generate Professional Copy</h4>
                  <p className="text-sm font-medium text-slate-400">
                    Our AI will analyze your gallery images, floor plans, and property address to write a high-end listing mirrored after your best Byron Bay copy.
                  </p>
                </div>
                <button
                  onClick={handleGenerate}
                  className="h-14 px-8 rounded-2xl bg-slate-900 text-white font-black uppercase text-[11px] tracking-widest hover:scale-105 transition-all shadow-xl flex items-center gap-3 active:scale-95"
                >
                  <Sparkles className="h-4 w-4 fill-current text-primary" />
                  Launch Engine
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4 min-h-0">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Listing Draft</p>
                  <div className="flex items-center gap-2">
                    {status === "success" && (
                      <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-full animate-in slide-in-from-right-2">
                        <CheckCircle2 className="h-3 w-3" />
                        Saved
                      </span>
                    )}
                    <button 
                      onClick={handleCopyClipboard}
                      className="h-8 px-3 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all border border-slate-100"
                    >
                      <Copy className="h-3 w-3" />
                      Copy to Clipboard
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 relative border border-slate-100 rounded-[32px] overflow-hidden bg-slate-50/30">
                  <textarea
                    value={copy}
                    onChange={(e) => setCopy(e.target.value)}
                    className="w-full h-full p-8 text-sm font-medium text-slate-700 bg-transparent border-none focus:ring-0 resize-none leading-relaxed custom-scrollbar"
                    placeholder="AI writing magic..."
                  />
                  {isGenerating && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-500">
                      <CameraLoader size="lg" className="text-primary mb-8" />
                      <h4 className="text-xl font-bold text-slate-900 tracking-tight mb-2">Analyzing Assets...</h4>
                      <p className="text-xs font-medium text-slate-400 max-w-[240px] leading-relaxed uppercase tracking-widest">
                        We're inspecting your photos and floor plans to craft the perfect story.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 flex items-center gap-3 text-rose-500 animate-in zoom-in-95">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="text-[10px] font-bold uppercase tracking-widest">{error}</p>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-8 border-t border-slate-50 bg-slate-50/50 flex items-center justify-between shrink-0">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="h-12 px-6 rounded-xl text-slate-400 hover:text-slate-900 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Regenerate
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleSave(false)}
                disabled={isSaving || !copy}
                className="h-12 px-6 rounded-2xl bg-white text-slate-900 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all border border-slate-200 flex items-center gap-2 shadow-sm"
              >
                {isSaving && !isPublishedState ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Save className="h-3.5 w-3.5 text-slate-400" />
                )}
                Save Draft
              </button>
              
              <button
                onClick={() => handleSave(true)}
                disabled={isSaving || !copy}
                className={cn(
                  "h-12 px-8 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center gap-2 shadow-lg",
                  isPublishedState 
                    ? "bg-emerald-500 text-white shadow-emerald-200" 
                    : "bg-slate-900 text-white shadow-slate-200 hover:bg-slate-800"
                )}
              >
                {isSaving && isPublishedState ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isPublishedState ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Send className="h-3.5 w-3.5 text-primary" />
                )}
                {isPublishedState ? "Published to Gallery" : "Publish to Gallery"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


