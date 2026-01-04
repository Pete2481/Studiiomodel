import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { BookingsPageContent } from "@/components/bookings/bookings-page-content";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";

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
      
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <BookingsDataWrapper sessionUser={sessionUser} isGlobal={isGlobal} />
      </Suspense>
    </div>
  );
}

async function BookingsDataWrapper({ sessionUser, isGlobal }: { sessionUser: any, isGlobal: boolean }) {
  const tenantId = sessionUser.tenantId;
  const tPrisma = isGlobal && sessionUser.isMasterAdmin ? prisma : await getTenantPrisma();

  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {}
  };

  // Real data fetching
  const [dbBookings, dbClients, dbServices, dbTeamMembers, dbAgents, tenant] = await Promise.all([
    tPrisma.booking.findMany({
      where: { deletedAt: null },
      orderBy: { startAt: 'desc' },
      take: 50,
      include: {
        client: { select: { id: true, name: true, businessName: true } },
        property: { select: { id: true, name: true } },
        services: { include: { service: { select: { name: true } } } },
        assignments: { include: { teamMember: { select: { id: true, displayName: true, avatarUrl: true } } } },
      }
    }),
    tPrisma.client.findMany({ where: { deletedAt: null }, select: { id: true, name: true, businessName: true, avatarUrl: true } }),
    tPrisma.service.findMany({ where: { active: true } }),
    tPrisma.teamMember.findMany({ where: { deletedAt: null } }),
    tPrisma.agent.findMany({ where: { deletedAt: null } }),
    tPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, businessHours: true, settings: true, sunriseSlotTime: true, duskSlotTime: true, sunriseSlotsPerDay: true, duskSlotsPerDay: true }
    })
  ]);

  const customStatuses = (tenant?.settings as any)?.bookingStatuses || [
    "Tenanted Property", "Owner Occupied", "Empty (Keys at office)"
  ];

  const bookings = dbBookings.map(b => {
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
      services: (b.services || []).map(s => ({ serviceId: String(s.serviceId), name: String(s.service?.name || "Unknown Service") })),
      assignments: (b.assignments || []).map(a => ({ teamMemberId: String(a.teamMemberId), teamMember: { displayName: String(a.teamMember?.displayName || "To assign"), avatarUrl: a.teamMember?.avatarUrl ? String(a.teamMember.avatarUrl) : null } }))
    };
  });

  const clients = dbClients.map(c => ({ id: String(c.id), name: String(c.name), businessName: String(c.businessName || ""), avatarUrl: c.avatarUrl ? String(c.avatarUrl) : null }));
  const services = dbServices.map(s => ({ id: String(s.id), name: String(s.name), price: Number(s.price), durationMinutes: Number(s.durationMinutes), icon: String(s.icon || "CAMERA"), slotType: s.slotType || null, clientVisible: s.clientVisible !== false, isFavorite: (s.settings as any)?.isFavorite || false }));
  const teamMembers = dbTeamMembers.map(m => ({ id: String(m.id), displayName: String(m.displayName), avatarUrl: m.avatarUrl || null }));
  const agents = dbAgents.map(a => ({ id: String(a.id), name: String(a.name), clientId: String(a.clientId), avatarUrl: a.avatarUrl || null }));

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
