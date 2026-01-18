import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { BookingsCalendarV2PageContent } from "@/components/bookings/calendar-v2/bookings-calendar-v2-page-content";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export default async function CalendarPage(props: {
  searchParams: Promise<{ global?: string }>
}) {
  const session = await auth();
  const searchParams = await props.searchParams;
  const isGlobal = searchParams.global === "true";

  if (!session) {
    redirect("/login");
  }

  const sessionUser = session.user as any;

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="Booking calendar" 
      />
      
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarV2DataWrapper sessionUser={sessionUser} isGlobal={isGlobal} />
      </Suspense>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="h-10 w-64 bg-slate-100 rounded-full" />
        <div className="flex gap-2">
          <div className="h-10 w-24 bg-slate-100 rounded-full" />
          <div className="h-10 w-32 bg-slate-100 rounded-full" />
        </div>
      </div>
      <div className="h-[70vh] bg-slate-100 rounded-[32px]" />
    </div>
  );
}

async function CalendarV2DataWrapper({ sessionUser, isGlobal }: { sessionUser: any, isGlobal: boolean }) {
  const tPrisma = (isGlobal && sessionUser.isMasterAdmin ? prisma : await getTenantPrisma()) as any;

  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    teamMemberId: sessionUser.teamMemberId || null,
    initials: sessionUser.name?.split(" ").map((n: string) => n[0]).join("") || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {},
  };

  const [tenant, currentMember] = await Promise.all([
    tPrisma.tenant.findUnique({
      where: { id: sessionUser.tenantId as string },
      select: {
        id: true,
        timezone: true,
        bookingStatuses: true,
        businessHours: true,
        sunriseSlotTime: true,
        duskSlotTime: true,
        sunriseSlotsPerDay: true,
        duskSlotsPerDay: true,
        calendarSecret: true,
        settings: true,
        aiLogisticsEnabled: true,
      },
    }),
    sessionUser.teamMemberId
      ? prisma.teamMember.findUnique({
          where: { id: sessionUser.teamMemberId },
          select: { calendarSecret: true },
        })
      : null,
  ]);

  let calendarSecret =
    sessionUser.role === "TENANT_ADMIN" || sessionUser.role === "ADMIN"
      ? ((tenant as any)?.calendarSecret || currentMember?.calendarSecret || null)
      : (currentMember?.calendarSecret || (tenant as any)?.calendarSecret || null);

  // Client portal: use a CLIENT-specific secret so the feed includes only that agency's bookings.
  if (String(sessionUser.role || "") === "CLIENT" && sessionUser.clientId) {
    const c = await tPrisma.client.findUnique({
      where: { id: String(sessionUser.clientId) },
      select: { settings: true },
    });
    const existing = (c?.settings as any)?.calendarSecret ? String((c.settings as any).calendarSecret) : "";
    if (existing) {
      calendarSecret = existing;
    } else {
      const newSecret = randomUUID();
      await tPrisma.client.update({
        where: { id: String(sessionUser.clientId) },
        data: { settings: { ...((c?.settings as any) || {}), calendarSecret: newSecret } },
      });
      calendarSecret = newSecret;
    }
  }

  const customStatuses = (tenant as any)?.bookingStatuses || (tenant as any)?.settings?.bookingStatuses || [
    "Tenanted Property", "Owner Occupied", "Empty (Keys at office)"
  ];

  const settings = (((tenant as any)?.settings) || {}) as any;
  const sunSlotsAddress = settings?.sunSlotsAddress ? String(settings.sunSlotsAddress) : "";
  const tenantLat = settings?.sunSlotsLat != null ? Number(settings.sunSlotsLat) : null;
  const tenantLon = settings?.sunSlotsLon != null ? Number(settings.sunSlotsLon) : null;

  return (
    <BookingsCalendarV2PageContent
      user={user}
      tenantTimezone={(tenant as any)?.timezone || "Australia/Sydney"}
      tenantLat={tenantLat}
      tenantLon={tenantLon}
      sunSlotsAddress={sunSlotsAddress}
      customStatuses={customStatuses}
      businessHours={(tenant as any)?.businessHours || null}
      calendarSecret={calendarSecret}
      aiLogisticsEnabled={(tenant as any)?.aiLogisticsEnabled || false}
      slotSettings={{
        sunriseSlotTime: (tenant as any)?.sunriseSlotTime || "06:00",
        duskSlotTime: (tenant as any)?.duskSlotTime || "18:30",
        sunriseSlotsPerDay: (tenant as any)?.sunriseSlotsPerDay || 1,
        duskSlotsPerDay: (tenant as any)?.duskSlotsPerDay || 1
      }}
    />
  );
}
