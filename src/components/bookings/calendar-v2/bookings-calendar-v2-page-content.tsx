"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const CalendarViewV2 = dynamic(() => import("./calendar-view-v2").then((m) => m.CalendarViewV2), {
  ssr: false,
  loading: () => <div className="h-[70vh] bg-slate-100 rounded-[32px] animate-pulse" />,
});

type CalendarReferenceData = {
  clients: any[];
  services: any[];
  teamMembers: any[];
  agents: any[];
};

export function BookingsCalendarV2PageContent(props: {
  user: any;
  tenantTimezone: string;
  tenantLat?: number | null;
  tenantLon?: number | null;
  customStatuses?: string[];
  businessHours?: any;
  calendarSecret?: string | null;
  aiLogisticsEnabled?: boolean;
  slotSettings?: {
    sunriseSlotTime: string;
    duskSlotTime: string;
    sunriseSlotsPerDay: number;
    duskSlotsPerDay: number;
  };
}) {
  const [reference, setReference] = useState<CalendarReferenceData>({
    clients: [],
    services: [],
    teamMembers: [],
    agents: [],
  });
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const load = async () => {
      try {
        const res = await fetch("/api/tenant/calendar/reference");
        const data = await res.json().catch(() => ({}));
        setReference({
          clients: Array.isArray(data?.clients) ? data.clients : [],
          services: Array.isArray(data?.services) ? data.services : [],
          teamMembers: Array.isArray(data?.teamMembers) ? data.teamMembers : [],
          agents: Array.isArray(data?.agents) ? data.agents : [],
        });
      } catch (e) {
        console.error("[CALENDAR_V2] Reference fetch failed:", e);
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (window as any).requestIdleCallback(() => load(), { timeout: 1500 });
    } else {
      setTimeout(() => load(), 250);
    }
  }, []);

  return <CalendarViewV2 {...props} reference={reference} />;
}


