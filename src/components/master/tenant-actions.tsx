"use client";

import { useState } from "react";
import { MoreVertical, Edit3, Trash2, ShieldAlert } from "lucide-react";
import { EditTenantModal } from "./edit-tenant-modal";
import { cn } from "@/lib/utils";

interface TenantActionsProps {
  tenant: {
    id: string;
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    slug: string;
  };
}

export function TenantActions({ tenant }: TenantActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "h-10 w-10 flex items-center justify-center rounded-xl hover:bg-white hover:border-slate-200 hover:shadow-sm transition-all text-slate-400 hover:text-slate-900 border border-transparent",
          isOpen && "bg-white border-slate-200 shadow-sm text-slate-900"
        )}
      >
        <MoreVertical className="h-4.5 w-4.5" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[40]" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl border border-slate-100 shadow-2xl shadow-slate-900/10 p-2 z-[50] animate-in fade-in slide-in-from-top-2 duration-200">
            <button 
              onClick={() => {
                setIsOpen(false);
                setIsEditModalOpen(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors text-sm font-bold"
            >
              <Edit3 className="h-4 w-4" />
              Edit Details
            </button>
            
            <button 
              onClick={() => {
                setIsOpen(false);
                alert("Archive feature coming soon");
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-rose-50 text-rose-400 hover:text-rose-600 transition-colors text-sm font-bold"
            >
              <ShieldAlert className="h-4 w-4" />
              Archive Studio
            </button>
          </div>
        </>
      )}

      <EditTenantModal 
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        tenant={tenant}
      />
    </div>
  );
}

