"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { GalleryDrawer } from "../modules/galleries/gallery-drawer";
import { cn } from "@/lib/utils";

interface MobileAddGalleryProps {
  clients: any[];
  bookings: any[];
  agents: any[];
  services: any[];
  isActionLocked?: boolean;
}

export function MobileAddGallery({ 
  clients, 
  bookings, 
  agents, 
  services,
  isActionLocked = false
}: MobileAddGalleryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <button 
        onClick={() => {
          if (isActionLocked) {
            window.location.href = "/tenant/settings?tab=billing";
            return;
          }
          setIsOpen(true);
        }}
        className={cn(
          "h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center shadow-2xl shadow-primary/40 active:scale-90 transition-all border border-white/20",
          isActionLocked && "opacity-50 grayscale"
        )}
      >
        <Plus className="h-6 w-6 stroke-[3px]" />
      </button>

      {mounted && createPortal(
        <GalleryDrawer 
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          clients={clients}
          bookings={bookings}
          agents={agents}
          services={services}
          onRefresh={() => window.location.reload()}
        />,
        document.body
      )}
    </>
  );
}

