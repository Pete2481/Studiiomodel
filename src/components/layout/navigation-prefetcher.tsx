"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";

export function NavigationPrefetcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only run the idle prefetch on the dashboard route so it doesn't compete
    // with other heavy page loads (e.g. Calendar).
    if (pathname !== "/") return;

    // Dashboard-first UX:
    // - Do NOT prefetch everything on login; it competes with the dashboard load.
    // - Prefetch only the highest-use routes after an idle delay.
    const links = ["/tenant/calendar", "/tenant/galleries"];

    const run = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      const conn: any = typeof navigator !== "undefined" ? (navigator as any).connection : null;
      if (conn?.saveData) return;

      links.forEach((link) => router.prefetch(link));
    };

    const delayMs = 4000;
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    timeoutId = window.setTimeout(() => {
      if (typeof (window as any).requestIdleCallback === "function") {
        idleId = (window as any).requestIdleCallback(run, { timeout: 1500 });
      } else {
        run();
      }
    }, delayMs);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (idleId && typeof (window as any).cancelIdleCallback === "function") {
        (window as any).cancelIdleCallback(idleId);
      }
    };
  }, [router, pathname]);

  return null;
}

