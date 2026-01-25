"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { calendarScopeKey, getCachedReference, setCachedReference, type CalendarReferenceData } from "@/lib/calendar-client-cache";

const CalendarViewV2 = dynamic(() => import("./calendar-view-v2").then((m) => m.CalendarViewV2), {
  ssr: false,
  loading: () => <div className="h-[70vh] bg-slate-100 rounded-[32px] animate-pulse" />,
});

export function BookingsCalendarV2PageContent(props: {
  user: any;
  tenantTimezone: string;
  tenantLat?: number | null;
  tenantLon?: number | null;
  sunSlotsAddress?: string | null;
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
  const scopeKey = calendarScopeKey({
    tenantTimezone: props.tenantTimezone,
    calendarSecret: props.calendarSecret || "",
    role: props.user?.role || "",
    clientId: props.user?.clientId || "",
    agentId: props.user?.agentId || "",
    teamMemberId: props.user?.teamMemberId || "",
  });

  const [reference, setReference] = useState<CalendarReferenceData>(() => {
    if (typeof window === "undefined") {
      return { clients: [], services: [], teamMembers: [], agents: [] };
    }
    const cached = getCachedReference(scopeKey);
    return cached || { clients: [], services: [], teamMembers: [], agents: [] };
  });
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const load = async () => {
      try {
        const res = await fetch("/api/tenant/calendar/reference");
        const data = await res.json().catch(() => ({}));
        const nextRef = {
          clients: Array.isArray(data?.clients) ? data.clients : [],
          services: Array.isArray(data?.services) ? data.services : [],
          teamMembers: Array.isArray(data?.teamMembers) ? data.teamMembers : [],
          agents: Array.isArray(data?.agents) ? data.agents : [],
        };
        setReference(nextRef);
        setCachedReference(scopeKey, nextRef);
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


