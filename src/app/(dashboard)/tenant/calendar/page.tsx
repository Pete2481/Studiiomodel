import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { BookingsPageContent } from "@/components/bookings/bookings-page-content";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";

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
        subtitle="Colour-coded bookings, drag-in favourites, and fast rescheduling for your production days." 
      />
      
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarDataWrapper sessionUser={sessionUser} isGlobal={isGlobal} />
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
      <div className="h-[60vh] bg-slate-100 rounded-[32px]" />
    </div>
  );
}

async function CalendarDataWrapper({ sessionUser, isGlobal }: { sessionUser: any, isGlobal: boolean }) {
  const tPrisma = (isGlobal && sessionUser.isMasterAdmin ? prisma : await getTenantPrisma()) as any;

  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {}
  };

  // SSR only what we need for the initial calendar shell.
  // Reference data (clients/services/team/agents) loads client-side after first paint.
  const [tenant, currentMember] = await Promise.all([
    tPrisma.tenant.findUnique({
      where: { id: sessionUser.tenantId as string },
      select: {
        id: true,
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

  const calendarSecret = (sessionUser.role === "TENANT_ADMIN" || sessionUser.role === "ADMIN")
    ? ((tenant as any)?.calendarSecret || currentMember?.calendarSecret || null)
    : (currentMember?.calendarSecret || (tenant as any)?.calendarSecret || null);

  const customStatuses = (tenant as any)?.bookingStatuses || (tenant as any)?.settings?.bookingStatuses || [
    "Tenanted Property", "Owner Occupied", "Empty (Keys at office)"
  ];

  // IMPORTANT: We no longer SSR-load large booking sets. Calendar bookings load by visible range client-side
  // via `/api/tenant/calendar/bookings` to make initial load instant.
  const bookings: any[] = [];

  const clients: any[] = [];
  const services: any[] = [];
  const teamMembers: any[] = [];
  const agents: any[] = [];

  return (
    <BookingsPageContent 
      mode="calendar"
      initialBookings={bookings}
      clients={clients}
      services={services}
      teamMembers={teamMembers}
      agents={agents}
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
      user={user}
    />
  );
}
