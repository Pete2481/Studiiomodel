"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function NavigationPrefetcher() {
  const router = useRouter();

  useEffect(() => {
    // Prefetch the most important pages immediately
    const links = [
      "/tenant/calendar",
      "/tenant/bookings",
      "/tenant/galleries",
      "/tenant/clients",
      "/tenant/services",
      "/tenant/photographers"
    ];

    links.forEach(link => {
      router.prefetch(link);
    });
  }, [router]);

  return null;
}

