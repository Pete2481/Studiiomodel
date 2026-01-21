"use client";

import React from "react";
import dynamic from "next/dynamic";

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
  // Dashboard-first + calendar performance:
  // Do NOT auto-load reference data on mount. Fetch it only when a user opens
  // a drawer/action that requires clients/services/team/agents.
  return <CalendarViewV2 {...props} />;
}


