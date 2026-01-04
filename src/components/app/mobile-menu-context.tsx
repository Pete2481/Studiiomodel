"use client";

import React, { createContext, useContext, useState } from "react";
import { MobileMenuDrawer } from "./mobile-menu-drawer";

interface MobileMenuContextType {
  openMenu: () => void;
  closeMenu: () => void;
}

const MobileMenuContext = createContext<MobileMenuContextType | undefined>(undefined);

export function MobileMenuProvider({ children }: { children: React.ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const openMenu = () => setIsMenuOpen(true);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <MobileMenuContext.Provider value={{ openMenu, closeMenu }}>
      {children}
      <MobileMenuDrawer isOpen={isMenuOpen} onClose={closeMenu} />
    </MobileMenuContext.Provider>
  );
}

export function useMobileMenu() {
  const context = useContext(MobileMenuContext);
  if (context === undefined) {
    throw new Error("useMobileMenu must be used within a MobileMenuProvider");
  }
  return context;
}

