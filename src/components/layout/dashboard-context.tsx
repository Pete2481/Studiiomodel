"use client";

import React, { createContext, useContext, useState, ReactNode, useMemo } from "react";

interface DashboardContextType {
  activeModal: string | null;
  setActiveModal: (modal: string | null) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  title: string;
  setTitle: (title: string) => void;
  subtitle: string;
  setSubtitle: (subtitle: string) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [title, setTitle] = useState("Dashboard");
  const [subtitle, setSubtitle] = useState("Welcome to your studio.");

  const value = useMemo(() => ({
    activeModal,
    setActiveModal,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    title,
    setTitle,
    subtitle,
    setSubtitle,
  }), [activeModal, isSidebarCollapsed, isMobileMenuOpen, title, subtitle]);

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
}
