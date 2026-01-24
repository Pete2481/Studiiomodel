import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { BookingsPageContent } from "@/components/bookings/bookings-page-content";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";
import { startOfTodayInTimeZone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function BookingsPage(props: {
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
        title="Production Operations" 
        subtitle="Track upcoming shoots and allocate the right agents in real time." 
      />
      
      <Suspense fallback={<BookingsSkeleton />}>
        <BookingsDataWrapper sessionUser={sessionUser} isGlobal={isGlobal} />
      </Suspense>
    </div>
  );
}

function BookingsSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="h-10 w-64 bg-slate-100 rounded-full" />
        <div className="flex gap-2">
          <div className="h-10 w-24 bg-slate-100 rounded-full" />
          <div className="h-10 w-32 bg-slate-100 rounded-full" />
        </div>
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-20 bg-slate-100 rounded-[32px]" />
        ))}
      </div>
    </div>
  );
}

async function BookingsDataWrapper({ sessionUser, isGlobal }: { sessionUser: any, isGlobal: boolean }) {
  const tenantId = sessionUser.tenantId;
  const tPrisma = (isGlobal && sessionUser.isMasterAdmin ? prisma : await getTenantPrisma()) as any;

  // Tenant timezone (used to ensure "today" starts in local studio timezone)
  const tenant = await tPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      timezone: true,
      businessHours: true,
      settings: true,
      sunriseSlotTime: true,
      duskSlotTime: true,
      sunriseSlotsPerDay: true,
      duskSlotsPerDay: true,
      aiLogisticsEnabled: true,
    },
  });

  const tenantTz = tenant?.timezone || "Australia/Sydney";
  const todayStart = startOfTodayInTimeZone(tenantTz);

  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {}
  };

  // Visibility Scoping
  const bookingWhere: any = { 
    deletedAt: null,
    startAt: { gte: todayStart },
  };
  // Booking feed should only show real bookings (never system placeholders).
  bookingWhere.isPlaceholder = false;

  const canViewAll = sessionUser.role === "TENANT_ADMIN" || sessionUser.role === "ADMIN";
  if (!canViewAll) {
    if (sessionUser.role === "CLIENT") bookingWhere.clientId = sessionUser.clientId;
    else if (sessionUser.role === "AGENT") bookingWhere.agentId = sessionUser.agentId;
    else if (sessionUser.teamMemberId) bookingWhere.assignments = { some: { teamMemberId: sessionUser.teamMemberId } };
  }

  // Real data fetching
  const [dbBookings, dbClients, dbServices, dbTeamMembers, dbAgents] = await Promise.all([
    tPrisma.booking.findMany({
      where: bookingWhere,
      orderBy: { startAt: 'asc' },
      take: 50,
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        status: true,
        propertyStatus: true,
        clientId: true,
        agentId: true,
        isPlaceholder: true,
        slotType: true,
        internalNotes: true,
        clientNotes: true,
        client: { select: { id: true, name: true, businessName: true } },
        property: { select: { id: true, name: true } },
        services: { select: { serviceId: true, service: { select: { name: true } } } },
        assignments: { select: { teamMemberId: true, teamMember: { select: { id: true, displayName: true, avatarUrl: true } } } },
      }
    }),
    tPrisma.client.findMany({ 
      where: !canViewAll && sessionUser.clientId ? { id: sessionUser.clientId, deletedAt: null } : { deletedAt: null }, 
      select: { id: true, name: true, businessName: true, avatarUrl: true, settings: true } 
    }),
    tPrisma.service.findMany({ 
      where: { active: true },
      select: { id: true, name: true, description: true, price: true, durationMinutes: true, icon: true, slotType: true, clientVisible: true, settings: true }
    }),
    tPrisma.teamMember.findMany({ 
      where: { deletedAt: null },
      select: { id: true, displayName: true, avatarUrl: true }
    }),
    tPrisma.agent.findMany({ 
      where: { deletedAt: null },
      select: { id: true, name: true, clientId: true, avatarUrl: true }
    }),
  ]);

  const customStatuses = (tenant?.settings as any)?.bookingStatuses || [
    "Tenanted Property", "Owner Occupied", "Empty (Keys at office)"
  ];

  const bookings = dbBookings.map((b: any) => {
    let status = b.status.toLowerCase();
    if (status === 'approved') status = 'confirmed';
    return {
      id: String(b.id),
      title: String(b.title),
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      status: status as any,
      propertyStatus: b.propertyStatus || "",
      clientId: String(b.clientId),
      agentId: b.agentId ? String(b.agentId) : null,
      client: { name: String(b.client?.name || "Unknown"), businessName: String(b.client?.businessName || "") },
      property: { name: String(b.property?.name || "TBC") },
      internalNotes: String(b.internalNotes || ""),
      clientNotes: String(b.clientNotes || ""),
      isPlaceholder: !!b.isPlaceholder,
      slotType: b.slotType || null,
      services: (b.services || []).map((s: any) => ({ serviceId: String(s.serviceId), name: String(s.service?.name || "Unknown Service") })),
      assignments: (b.assignments || []).map((a: any) => ({ teamMemberId: String(a.teamMemberId), teamMember: { displayName: String(a.teamMember?.displayName || "To assign"), avatarUrl: a.teamMember?.avatarUrl ? String(a.teamMember.avatarUrl) : null } }))
    };
  });

  const clients = dbClients.map((c: any) => ({ 
    id: String(c.id), 
    name: String(c.name), 
    businessName: String(c.businessName || ""), 
    avatarUrl: c.avatarUrl ? String(c.avatarUrl) : null,
    disabledServices: (c.settings as any)?.disabledServices || []
  }));
  const services = dbServices.map((s: any) => ({
    id: String(s.id),
    name: String(s.name),
    description: String(s.description || ""),
    price: Number(s.price),
    durationMinutes: Number(s.durationMinutes),
    icon: String(s.icon || "CAMERA"),
    slotType: s.slotType || null,
    clientVisible: s.clientVisible !== false,
    isFavorite: (s.settings as any)?.isFavorite || false,
  }));
  const teamMembers = dbTeamMembers.map((m: any) => ({ id: String(m.id), displayName: String(m.displayName), avatarUrl: m.avatarUrl || null }));
  const agents = dbAgents.map((a: any) => ({ id: String(a.id), name: String(a.name), clientId: String(a.clientId), avatarUrl: a.avatarUrl || null }));

  return (
    <BookingsPageContent 
      mode="list"
      initialBookings={bookings}
      clients={clients}
      services={services}
      teamMembers={teamMembers}
      agents={agents}
      customStatuses={customStatuses}
      businessHours={tenant?.businessHours || null}
      aiLogisticsEnabled={tenant?.aiLogisticsEnabled || false}
      slotSettings={{
        sunriseSlotTime: tenant?.sunriseSlotTime || "06:00",
        duskSlotTime: tenant?.duskSlotTime || "18:30",
        sunriseSlotsPerDay: tenant?.sunriseSlotsPerDay || 1,
        duskSlotsPerDay: tenant?.duskSlotsPerDay || 1
      }}
      user={user}
    />
  );
}
