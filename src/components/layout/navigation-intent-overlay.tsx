"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CameraLoader } from "@/components/ui/camera-loader";

function NavigationIntentOverlayContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  // Hide when navigation completes (route changes).
  useEffect(() => {
    if (!visible) return;
    setVisible(false);
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, [pathname, searchParams, visible]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      // Only primary pointer / no modifiers (avoid new-tab, etc.)
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const el = e.target as Element | null;
      const anchor = el?.closest?.("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      const hrefAttr = anchor.getAttribute("href");
      if (!hrefAttr) return;
      if (hrefAttr.startsWith("#")) return;
      if (hrefAttr.startsWith("mailto:") || hrefAttr.startsWith("tel:")) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      // Only same-origin navigations.
      if (url.origin !== window.location.origin) return;

      // If it's only a hash change on the current page, don't show loader.
      const current = new URL(window.location.href);
      const samePathAndQuery = url.pathname === current.pathname && url.search === current.search;
      if (samePathAndQuery && url.hash && url.hash !== current.hash) return;

      setVisible(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setVisible(false), 8000);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-white/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6">
        <CameraLoader size="md" color="var(--primary)" className="text-primary" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 animate-pulse">
          Loading…
        </p>
      </div>
    </div>
  );
}

export function NavigationIntentOverlay() {
  // `useSearchParams` requires Suspense in Next App Router.
  return (
    <Suspense fallback={null}>
      <NavigationIntentOverlayContent />
    </Suspense>
  );
}


