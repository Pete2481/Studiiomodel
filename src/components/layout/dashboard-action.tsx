"use client";

import React, { ReactNode } from "react";
import { useDashboard } from "./dashboard-context";

interface DashboardActionProps {
  children: ReactNode;
  type: "gallery" | "appointment" | "invoice" | "client";
  className?: string;
}

export function DashboardAction({ children, type, className }: DashboardActionProps) {
  const { setActiveModal } = useDashboard();

  return (
    <button 
      onClick={() => setActiveModal(type)} 
      className={className}
    >
      {children}
    </button>
  );
}

