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
  const { role, teamMemberId, clientId, agentId } = sessionUser;

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
  // We now fetch ALL bookings for the tenant to show "Limited Availability"
  // but we will mask the data for anything not owned by the current user.
  const bookingWhere: any = { 
    deletedAt: null,
    startAt: {
      gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    },
    endAt: {
      lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    }
  };

  const canViewAll = sessionUser.role === "TENANT_ADMIN" || sessionUser.role === "ADMIN";
  
  // Real data fetching
  const [dbBookings, dbClients, dbServices, dbTeamMembers, dbAgents, tenant, currentMember] = await Promise.all([
    tPrisma.booking.findMany({
      where: bookingWhere,
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
      where: !canViewAll && clientId ? { id: clientId, deletedAt: null } : { deletedAt: null }, 
      select: { id: true, name: true, businessName: true, avatarUrl: true, settings: true } 
    }),
    tPrisma.service.findMany({ 
      where: { active: true },
      select: { id: true, name: true, price: true, durationMinutes: true, icon: true, slotType: true, clientVisible: true, settings: true }
    }),
    tPrisma.teamMember.findMany({ 
      where: { deletedAt: null },
      select: { id: true, displayName: true, avatarUrl: true }
    }),
    tPrisma.agent.findMany({ 
      where: !canViewAll && clientId ? { clientId, deletedAt: null } : { deletedAt: null },
      select: { id: true, name: true, clientId: true, avatarUrl: true }
    }),
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
        settings: true
      }
    }),
    sessionUser.teamMemberId ? prisma.teamMember.findUnique({
      where: { id: sessionUser.teamMemberId },
      select: { calendarSecret: true }
    }) : null
  ]);

  const calendarSecret = (sessionUser.role === "TENANT_ADMIN" || sessionUser.role === "ADMIN")
    ? ((tenant as any)?.calendarSecret || currentMember?.calendarSecret || null)
    : (currentMember?.calendarSecret || (tenant as any)?.calendarSecret || null);

  const customStatuses = (tenant as any)?.bookingStatuses || (tenant as any)?.settings?.bookingStatuses || [
    "Tenanted Property", "Owner Occupied", "Empty (Keys at office)"
  ];

  const bookings = (dbBookings as any[]).map(b => {
    const startAt = b.startAt instanceof Date && !isNaN(b.startAt.getTime()) ? b.startAt.toISOString() : null;
    const endAt = b.endAt instanceof Date && !isNaN(b.endAt.getTime()) ? b.endAt.toISOString() : null;
    if (!startAt || !endAt) return null;

    // 1. Determine Ownership
    let isOwned = canViewAll;
    if (!isOwned) {
      if (role === "CLIENT" && b.clientId === clientId) isOwned = true;
      else if (role === "AGENT" && b.agentId === agentId) isOwned = true;
      else if (teamMemberId && b.assignments.some((a: any) => a.teamMemberId === teamMemberId)) isOwned = true;
    }

    // 2. If NOT owned, mask the data as "LIMITED AVAILABILITY"
    if (!isOwned && !b.isPlaceholder) {
      return {
        id: String(b.id),
        title: "LIMITED AVAILABILITY",
        startAt, endAt,
        status: "blocked" as any, // Grey status
        propertyStatus: "",
        clientId: null,
        agentId: null,
        client: null,
        property: { name: "RESTRICTED" },
        internalNotes: "",
        clientNotes: "",
        isPlaceholder: false,
        slotType: null,
        services: [],
        assignments: []
      };
    }

    // 3. Standard mapping for owned or admin bookings
    let status = (b.status || "REQUESTED").toLowerCase();
    if (status === 'approved') status = 'confirmed';
    
    return {
      id: String(b.id),
      title: String(b.title || (b.isPlaceholder ? (b.slotType + " SLOT") : "Booking")),
      startAt, endAt, status: status as any,
      propertyStatus: b.propertyStatus || "",
      clientId: b.clientId ? String(b.clientId) : null,
      agentId: b.agentId ? String(b.agentId) : null,
      client: !b.client ? null : { name: String(b.client.name || ""), businessName: String(b.client.businessName || "") },
      property: !b.property ? { name: "TBC" } : { name: String(b.property.name || "TBC") },
      internalNotes: String(b.internalNotes || ""),
      clientNotes: String(b.clientNotes || ""),
      isPlaceholder: !!b.isPlaceholder,
      slotType: (b as any).slotType || null,
      services: (b.services || []).map((s: any) => ({ serviceId: String(s.serviceId), name: String(s.service?.name || "Unknown Service") })),
      assignments: (b.assignments || []).map((a: any) => ({ teamMemberId: String(a.teamMemberId), teamMember: { displayName: String(a.teamMember?.displayName || "To assign"), avatarUrl: a.teamMember?.avatarUrl || null } }))
    };
  }).filter(Boolean);

  const clients = dbClients.map(c => ({ 
    id: String(c.id), 
    name: String(c.name), 
    businessName: String(c.businessName || ""), 
    avatarUrl: c.avatarUrl || null,
    disabledServices: (c.settings as any)?.disabledServices || []
  }));
  const services = dbServices.map(s => ({ id: String(s.id), name: String(s.name), price: Number(s.price), durationMinutes: Number(s.durationMinutes), icon: String(s.icon || "CAMERA"), slotType: (s as any).slotType || null, clientVisible: (s as any).clientVisible !== false, isFavorite: (s.settings as any)?.isFavorite || false }));
  const teamMembers = dbTeamMembers.map(m => ({ id: String(m.id), displayName: String(m.displayName), avatarUrl: m.avatarUrl || null }));
  const agents = dbAgents.map(a => ({ id: String(a.id), name: String(a.name), clientId: String(a.clientId), avatarUrl: a.avatarUrl || null }));

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
