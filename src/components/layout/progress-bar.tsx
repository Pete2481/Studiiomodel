"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function ProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Start progress on change
    setVisible(true);
    setProgress(30);

    const timer = setTimeout(() => {
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 200);
    }, 100);

    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] h-1 pointer-events-none">
      <div 
        className="h-full bg-primary transition-all duration-300 ease-out shadow-[0_0_10px_var(--primary)]"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

