"use client";

import React, { createContext, useContext, useState } from "react";
import { MobileSearchModal } from "./mobile-search-modal";

interface MobileSearchContextType {
  openSearch: () => void;
  closeSearch: () => void;
}

const MobileSearchContext = createContext<MobileSearchContextType | undefined>(undefined);

export function MobileSearchProvider({ children }: { children: React.ReactNode }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const openSearch = () => setIsSearchOpen(true);
  const closeSearch = () => setIsSearchOpen(false);

  return (
    <MobileSearchContext.Provider value={{ openSearch, closeSearch }}>
      {children}
      <MobileSearchModal isOpen={isSearchOpen} onClose={closeSearch} />
    </MobileSearchContext.Provider>
  );
}

export function useMobileSearch() {
  const context = useContext(MobileSearchContext);
  if (context === undefined) {
    throw new Error("useMobileSearch must be used within a MobileSearchProvider");
  }
  return context;
}

