"use client";

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";

interface GuideContextType {
  showHints: boolean;
  setShowHints: (show: boolean) => void;
  toggleHints: () => void;
}

const GuideContext = createContext<GuideContextType | undefined>(undefined);

export function GuideProvider({ children }: { children: React.ReactNode }) {
  const [showHints, setShowHints] = useState(false);

  // Persistence (optional, but nice)
  useEffect(() => {
    const saved = localStorage.getItem("studiio_show_hints");
    if (saved === "true") setShowHints(true);
  }, []);

  const handleSetShowHints = (show: boolean) => {
    setShowHints(show);
    localStorage.setItem("studiio_show_hints", String(show));
  };

  const toggleHints = () => handleSetShowHints(!showHints);

  const value = useMemo(() => ({ 
    showHints, 
    setShowHints: handleSetShowHints, 
    toggleHints 
  }), [showHints]);

  return (
    <GuideContext.Provider value={value}>
      {children}
    </GuideContext.Provider>
  );
}

export function useGuide() {
  const context = useContext(GuideContext);
  if (context === undefined) {
    throw new Error("useGuide must be used within a GuideProvider");
  }
  return context;
}

