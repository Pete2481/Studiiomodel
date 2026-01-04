"use client";

import React, { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateGalleryStatus } from "@/app/actions/gallery";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

interface GalleryStatusDropdownProps {
  galleryId: string;
  currentStatus: string;
  user: any;
}

export function GalleryStatusDropdown({ galleryId, currentStatus, user }: GalleryStatusDropdownProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const statuses = [
    { value: 'DRAFT', label: 'DRAFT', color: 'bg-slate-100 text-slate-600 border-slate-200' },
    { value: 'READY', label: 'READY', color: 'bg-emerald-500 text-white border-emerald-400' },
    { value: 'DELIVERED', label: 'DELIVERED', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    { value: 'ARCHIVED', label: 'ARCHIVED', color: 'bg-slate-800 text-white border-slate-700' },
  ];

  const handleStatusClick = (newStatus: string) => {
    if (newStatus === currentStatus) {
      setIsOpen(false);
      return;
    }
    setPendingStatus(newStatus);
    setShowConfirm(true);
    setIsOpen(false);
  };

  const handleConfirmUpdate = async () => {
    if (!pendingStatus) return;
    
    setIsUpdating(true);
    setShowConfirm(false);
    try {
      const res = await updateGalleryStatus(galleryId, pendingStatus);
      if (!res.success) {
        alert(res.error || "Failed to update status");
      }
    } catch (err) {
      console.error("Status update error:", err);
      alert("An unexpected error occurred");
    } finally {
      setIsUpdating(false);
      setPendingStatus(null);
    }
  };

  const currentConfig = statuses.find(s => s.value === currentStatus) || statuses[0];

  if (user.role === "CLIENT") {
    return (
      <span className={cn(
        "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm border whitespace-nowrap",
        currentConfig.color
      )}>
        {currentStatus}
      </span>
    );
  }

  return (
    <>
      <div className="relative">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          disabled={isUpdating}
          className={cn(
            "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm border transition-all flex items-center gap-1.5 hover:scale-105 active:scale-95 disabled:opacity-50 whitespace-nowrap",
            currentConfig.color
          )}
        >
          {isUpdating ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : (
            currentStatus
          )}
          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
            <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-100 py-1 min-w-[120px] z-30 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
              {statuses.map((s) => (
                <button
                  key={s.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStatusClick(s.value);
                  }}
                  className={cn(
                    "w-full px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest transition-colors",
                    currentStatus === s.value ? "bg-slate-50 text-primary" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmationModal 
        isOpen={showConfirm}
        onClose={() => {
          setShowConfirm(false);
          setPendingStatus(null);
        }}
        onConfirm={handleConfirmUpdate}
        title={pendingStatus === 'DELIVERED' ? "Deliver Gallery?" : "Update Status?"}
        message={pendingStatus === 'DELIVERED' 
          ? "This will notify the client that their production is ready for viewing. Are you sure you want to proceed?" 
          : `You are about to change the status of this gallery to ${pendingStatus}. Proceed?`}
        confirmLabel={pendingStatus === 'DELIVERED' ? "Deliver Now" : "Confirm Update"}
        variant={pendingStatus === 'DELIVERED' ? "success" : "info"}
      />
    </>
  );
}

