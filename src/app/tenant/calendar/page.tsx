import { DashboardShell } from "@/components/layout/dashboard-shell";
import { permissionService } from "@/lib/permission-service";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma, checkSubscriptionStatus } from "@/lib/tenant-guard";
import { getNavCounts } from "@/lib/nav-utils";
import { BookingsPageContent } from "@/components/bookings/bookings-page-content";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CalendarPage(props: {
  searchParams: Promise<{ global?: string }>
}) {
  await headers();
  const session = await auth();
  const searchParams = await props.searchParams;
  const isGlobal = searchParams.global === "true";

  if (!session) {
    redirect("/login");
  }

  const sessionUser = session.user as any;

  const tPrisma = isGlobal && sessionUser.isMasterAdmin ? prisma : await getTenantPrisma();
  const { permissions, role, id: userId, teamMemberId, clientId, agentId } = sessionUser;

  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {}
  };

  // 1. VIEW CALENDAR Check
  if (!permissionService.can(sessionUser, "viewCalendar")) {
    redirect("/");
  }

  // 2. Resolve Visibility Scoping
  const canViewAll = permissionService.can(sessionUser, "viewAllBookings");
  const canViewDetails = permissionService.can(sessionUser, "viewBookings");
  const canViewBlanked = permissionService.can(sessionUser, "viewBlankedBookings");

  // If they can't even see blanked, they shouldn't be here (already covered by viewCalendar check mostly, but being safe)
  if (!canViewDetails && !canViewBlanked) {
    redirect("/");
  }

  // Fetching Logic with Scoping
  const bookingWhere: any = { deletedAt: null };
  if (!canViewAll) {
    // Scope to user's own data
    if (role === "CLIENT") {
      bookingWhere.clientId = clientId;
    } else if (role === "AGENT") {
      bookingWhere.agentId = agentId;
    } else if (teamMemberId) {
      bookingWhere.assignments = {
        some: { teamMemberId }
      };
    }
  }

  const isSubscribed = await checkSubscriptionStatus(sessionUser.tenantId as string);
  const navCounts = await getNavCounts(sessionUser.tenantId as string, userId, role, agentId, clientId, permissions);

  // Real data fetching
  const [dbBookings, dbClients, dbServices, dbTeamMembers, dbAgents, tenant] = await Promise.all([
    tPrisma.booking.findMany({
      where: bookingWhere,
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
    // ... rest of fetching ...
    tPrisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, businessName: true, avatarUrl: true }
    }),
    tPrisma.service.findMany({
      where: { active: true },
    }),
    tPrisma.teamMember.findMany({
      where: { deletedAt: null },
    }),
    tPrisma.agent.findMany({
      where: { deletedAt: null },
    }),
    tPrisma.tenant.findUnique({
      where: { id: sessionUser.tenantId as string },
      select: { 
        id: true, 
        name: true, 
        logoUrl: true, 
        brandColor: true, 
        bookingStatuses: true, 
        businessHours: true, 
        sunriseSlotTime: true, 
        duskSlotTime: true, 
        sunriseSlotsPerDay: true, 
        duskSlotsPerDay: true, 
        calendarSecret: true,
        settings: true
      }
    })
  ]);

  const customStatuses = (tenant as any)?.bookingStatuses || (tenant as any)?.settings?.bookingStatuses || [
    "Tenanted Property",
    "Owner Occupied",
    "Empty (Keys at office)"
  ];

  // SERIALIZE EVERYTHING: Ensure no Date or Decimal objects reach the client
  const bookings = (dbBookings as any[]).map(b => {
    // 1. Strict Date Validation - Skip broken records that cause RangeError
    const startAt = b.startAt instanceof Date && !isNaN(b.startAt.getTime()) ? b.startAt.toISOString() : null;
    const endAt = b.endAt instanceof Date && !isNaN(b.endAt.getTime()) ? b.endAt.toISOString() : null;
    if (!startAt || !endAt) return null;

    // 2. Strict ID/Status validation
    let status = (b.status || "REQUESTED").toLowerCase();
    if (status === 'approved') status = 'confirmed';

    // 3. ANONYMIZATION Logic (Blanked Bookings)
    const isAnonymized = !canViewDetails && canViewBlanked;
    
    return {
      id: String(b.id),
      title: isAnonymized ? "Booked Slot" : String(b.title || (b.isPlaceholder ? (b.slotType + " SLOT") : "Booking")),
      startAt,
      endAt,
      status: status as any,
      propertyStatus: isAnonymized ? "" : (b.propertyStatus || ""),
      clientId: isAnonymized ? null : (b.clientId ? String(b.clientId) : null),
      agentId: isAnonymized ? null : (b.agentId ? String(b.agentId) : null),
      client: (isAnonymized || !b.client) ? null : { 
        name: String(b.client.name || ""),
        businessName: String(b.client.businessName || "")
      },
      property: (isAnonymized || !b.property) ? { name: "Private Location" } : { 
        name: String(b.property.name || "TBC") 
      },
      internalNotes: isAnonymized ? "" : String(b.internalNotes || ""),
      clientNotes: isAnonymized ? "" : String(b.clientNotes || ""),
      isPlaceholder: !!b.isPlaceholder,
      slotType: (b as any).slotType || null,
      services: isAnonymized ? [] : (b.services || []).map((s: any) => ({ 
        serviceId: String(s.serviceId),
        name: String(s.service?.name || "Unknown Service")
      })),
      assignments: (b.assignments || []).map((a: any) => ({ 
        teamMemberId: String(a.teamMemberId),
        teamMember: {
          displayName: isAnonymized ? "Assigned" : String(a.teamMember?.displayName || "To assign"),
          avatarUrl: (isAnonymized || !a.teamMember?.avatarUrl) ? null : String(a.teamMember.avatarUrl)
        }
      }))
    };
  }).filter(Boolean);

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
    slotType: (s as any).slotType || null,
    clientVisible: (s as any).clientVisible !== false,
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

  let workspaceName = "Studiio Tenant";
  if (role === "CLIENT" && clientId) {
    const client = dbClients.find(c => c.id === clientId);
    if (client) {
      workspaceName = client.businessName || client.name;
    }
  }

  return (
    <DashboardShell 
      user={JSON.parse(JSON.stringify(user))}
      workspaceName={tenant?.name || workspaceName}
      logoUrl={tenant?.logoUrl || undefined}
      brandColor={tenant?.brandColor || undefined}
      title="Booking calendar"
      subtitle="Colour-coded bookings, drag-in favourites, and fast rescheduling for your production days."
      navCounts={navCounts}
    >
      <div className="space-y-12">
        <BookingsPageContent 
          mode="calendar"
          initialBookings={JSON.parse(JSON.stringify(bookings))}
          clients={JSON.parse(JSON.stringify(clients))}
          services={JSON.parse(JSON.stringify(services))}
          teamMembers={JSON.parse(JSON.stringify(teamMembers))}
          agents={JSON.parse(JSON.stringify(agents))}
          customStatuses={JSON.parse(JSON.stringify(customStatuses))}
          businessHours={(tenant as any)?.businessHours || null}
          calendarSecret={(tenant as any)?.calendarSecret || null}
          slotSettings={{
            sunriseSlotTime: (tenant as any)?.sunriseSlotTime || "06:00",
            duskSlotTime: (tenant as any)?.duskSlotTime || "18:30",
            sunriseSlotsPerDay: (tenant as any)?.sunriseSlotsPerDay || 1,
            duskSlotsPerDay: (tenant as any)?.duskSlotsPerDay || 1
          }}
          user={JSON.parse(JSON.stringify(user))}
        />
      </div>
    </DashboardShell>
  );
}

