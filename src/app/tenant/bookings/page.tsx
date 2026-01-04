import { DashboardShell } from "@/components/layout/dashboard-shell";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma, checkSubscriptionStatus } from "@/lib/tenant-guard";
import { getNavCounts } from "@/lib/nav-utils";
import { BookingsPageContent } from "@/components/bookings/bookings-page-content";
import { prisma } from "@/lib/prisma";

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

  // Master Admin can view without a tenant context if in global mode
  const tenantId = sessionUser.tenantId;
  if (!tenantId && !sessionUser.isMasterAdmin) {
    redirect("/login");
  }

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

  // Fetch freshest permissions from DB to bypass stale JWT session tokens
  if (tenantId) {
    const membership = await tPrisma.tenantMembership.findFirst({
      where: { 
        userId: sessionUser.id,
        tenantId: tenantId,
        clientId: user.clientId || undefined
      },
      select: { permissions: true }
    });
    if (membership && membership.permissions) {
      user.permissions = membership.permissions as any;
    }
  }

  const isSubscribed = tenantId ? await checkSubscriptionStatus(tenantId) : true;
  const navCounts = tenantId ? await getNavCounts(tenantId, sessionUser.id, user.role, user.agentId, user.clientId, user.permissions) : { bookings: 0, galleries: 0, edits: 0 };

  // Branding: If Agent or Client, fetch their Agency name
  let workspaceName = isGlobal ? "Master Control" : "Studiio Tenant";
  if (user.role === "AGENT" || user.role === "CLIENT") {
    if (user.clientId) {
      const client = await tPrisma.client.findUnique({
        where: { id: user.clientId },
        select: { businessName: true, name: true }
      });
      if (client) {
        workspaceName = client.businessName || client.name;
      }
    }
  }

  const filteredNav = JSON.parse(JSON.stringify(permissionService.getFilteredNav(
    { role: user.role, isMasterMode: false },
    UNIFIED_NAV_CONFIG
  )));

  // Real data fetching
  const [dbBookings, dbClients, dbServices, dbTeamMembers, dbAgents, tenant] = await Promise.all([
    tPrisma.booking.findMany({
      where: { 
        deletedAt: null,
      },
      include: {
        client: { select: { id: true, name: true, businessName: true } },
        property: { select: { id: true, name: true } },
        services: {
          include: {
            service: { select: { name: true } }
          }
        },
        assignments: {
          include: {
            teamMember: { select: { id: true, displayName: true, avatarUrl: true } }
          }
        },
      }
    }),
    tPrisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, businessName: true, avatarUrl: true }
    }),
    tPrisma.service.findMany({
      where: { active: true },
      select: { 
        id: true, 
        name: true, 
        price: true, 
        durationMinutes: true, 
        icon: true, 
        slotType: true,
        clientVisible: true,
        settings: true 
      }
    }),
    tPrisma.teamMember.findMany({
      where: { deletedAt: null },
      select: { id: true, displayName: true, avatarUrl: true }
    }),
    tPrisma.agent.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, clientId: true, avatarUrl: true }
    }),
    tPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { 
        name: true,
        logoUrl: true,
        brandColor: true,
        settings: true, 
        businessHours: true,
        sunriseSlotTime: true,
        duskSlotTime: true,
        sunriseSlotsPerDay: true,
        duskSlotsPerDay: true
      }
    })
  ]);

  const customStatuses = (tenant?.settings as any)?.bookingStatuses || [
    "Tenanted Property",
    "Owner Occupied",
    "Empty (Keys at office)"
  ];

  // SERIALIZE EVERYTHING: Ensure no Date or Decimal objects reach the client
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
      client: { 
        name: String(b.client?.name || "Unknown"),
        businessName: String(b.client?.businessName || "")
      },
      property: { 
        name: String(b.property?.name || "TBC") 
      },
      internalNotes: String(b.internalNotes || ""),
      clientNotes: String(b.clientNotes || ""),
      isPlaceholder: !!b.isPlaceholder,
      slotType: b.slotType || null,
      services: (b.services || []).map(s => ({ 
        serviceId: String(s.serviceId),
        name: String(s.service?.name || "Unknown Service")
      })),
      assignments: (b.assignments || []).map(a => ({ 
        teamMemberId: String(a.teamMemberId),
        teamMember: {
          displayName: String(a.teamMember?.displayName || "To assign"),
          avatarUrl: a.teamMember?.avatarUrl ? String(a.teamMember.avatarUrl) : null
        }
      }))
    };
  });

  const clients = dbClients.map(c => ({ 
    id: String(c.id), 
    name: String(c.name),
    businessName: String(c.businessName || ""),
    avatarUrl: c.avatarUrl ? String(c.avatarUrl) : null
  }));

  const services = dbServices.map(s => ({ 
    id: String(s.id), 
    name: String(s.name), 
    price: Number(s.price),
    durationMinutes: Number(s.durationMinutes),
    icon: String(s.icon || "CAMERA"),
    slotType: s.slotType || null,
    clientVisible: s.clientVisible !== false,
    isFavorite: (s.settings as any)?.isFavorite || false
  }));

  const teamMembers = dbTeamMembers.map(m => ({ 
    id: String(m.id), 
    displayName: String(m.displayName), 
    avatarUrl: m.avatarUrl ? String(m.avatarUrl) : null 
  }));

  const agents = dbAgents.map(a => ({
    id: String(a.id),
    name: String(a.name),
    clientId: String(a.clientId),
    avatarUrl: a.avatarUrl ? String(a.avatarUrl) : null
  }));

  return (
    <DashboardShell 
      user={JSON.parse(JSON.stringify(user))}
      workspaceName={tenant?.name || workspaceName}
      logoUrl={tenant?.logoUrl || undefined}
      brandColor={tenant?.brandColor || undefined}
      title={`${tenant?.name || "Tenant"} Operations`}
      subtitle="Track upcoming shoots and allocate the right agents in real time."
      isActionLocked={!isSubscribed}
      navCounts={navCounts}
    >
      <div className="space-y-12">
        <BookingsPageContent 
          mode="list"
          initialBookings={JSON.parse(JSON.stringify(bookings))}
          clients={JSON.parse(JSON.stringify(clients))}
          services={JSON.parse(JSON.stringify(services))}
          teamMembers={JSON.parse(JSON.stringify(teamMembers))}
          agents={JSON.parse(JSON.stringify(agents))}
          customStatuses={JSON.parse(JSON.stringify(customStatuses))}
          businessHours={tenant?.businessHours || null}
          slotSettings={{
            sunriseSlotTime: tenant?.sunriseSlotTime || "06:00",
            duskSlotTime: tenant?.duskSlotTime || "18:30",
            sunriseSlotsPerDay: tenant?.sunriseSlotsPerDay || 1,
            duskSlotsPerDay: tenant?.duskSlotsPerDay || 1
          }}
          user={JSON.parse(JSON.stringify(user))}
          isActionLocked={!isSubscribed}
        />
      </div>
    </DashboardShell>
  );
}
