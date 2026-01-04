import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { redirect } from "next/navigation";
import { format, addDays, startOfToday, eachDayOfInterval } from "date-fns";
import { 
  ChevronLeft,
  ChevronRight,
  Plus
} from "lucide-react";
import { MobileCalendarView } from "@/components/app/mobile-calendar-view";
import { MobileSearchButton } from "@/components/app/mobile-search-button";

export default async function AppCalendarPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tPrisma = await getTenantPrisma();
  
  const user = {
    role: (session?.user as any)?.role,
    clientId: (session?.user as any)?.clientId,
    permissions: (session?.user as any)?.permissions || {}
  };

  // Fetch freshest permissions from DB to bypass stale JWT session tokens
  const tenantId = session?.user?.tenantId;
  if (tenantId) {
    const membership = await tPrisma.tenantMembership.findFirst({
      where: { 
        userId: session?.user?.id as string,
        tenantId: tenantId as string,
        clientId: user.clientId || undefined
      },
      select: { permissions: true }
    });
    if (membership && membership.permissions) {
      user.permissions = membership.permissions as any;
    }
  }

  // Fetch tenant settings for sunrise/dusk logic (automatically scoped by tPrisma session tenant)
  const tenant = await tPrisma.tenant.findUnique({
    where: { id: session?.user?.tenantId as string },
    select: {
      businessHours: true,
      sunriseSlotTime: true,
      duskSlotTime: true,
    }
  });

  // Fetch bookings for the next 30 days to show busy slots
  const start = startOfToday();
  const end = addDays(start, 30);

  const bookings = await tPrisma.booking.findMany({
    where: {
      startAt: { gte: start },
      endAt: { lte: end },
      deletedAt: null,
      status: { not: "CANCELLED" }
    },
    include: {
      client: { select: { name: true, businessName: true } },
      property: { select: { name: true, addressLine1: true } },
      services: {
        include: {
          service: {
            select: { name: true }
          }
        }
      },
      assignments: {
        include: {
          teamMember: {
            select: { displayName: true, avatarUrl: true }
          }
        }
      }
    }
  });

  // Fetch available services for the booking form
  const [services, clients, teamMembers] = await Promise.all([
    tPrisma.service.findMany({
      where: {
        active: true,
        deletedAt: null,
        ...(session?.user?.role === "CLIENT" ? { clientVisible: true } : {})
      },
      select: {
        id: true,
        name: true,
        price: true,
        icon: true,
      },
      orderBy: { name: "asc" }
    }),
    tPrisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, businessName: true },
      orderBy: { name: "asc" }
    }),
    tPrisma.teamMember.findMany({
      where: { deletedAt: null },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" }
    })
  ]);

  // Serialize services: Convert Decimal to Number for Client Components
  const serializedServices = services.map(s => ({
    ...s,
    price: Number(s.price)
  }));

  const serializedClients = clients.map(c => ({
    id: c.id,
    name: c.businessName || c.name
  }));

  const serializedTeamMembers = teamMembers.map(tm => ({
    id: tm.id,
    name: tm.displayName
  }));

  // Serialize for client component
  const serializedBookings = bookings.map(b => ({
    id: b.id,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    status: b.status,
    isPlaceholder: b.isPlaceholder,
    clientId: b.clientId,
    title: b.title,
    propertyName: b.property?.name,
    services: b.services.map((s: any) => s.service.name),
    teamMembers: b.assignments.map((a: any) => ({
      name: a.teamMember.displayName,
      avatarUrl: a.teamMember.avatarUrl
    }))
  }));

  return (
    <div className="fixed inset-0 top-12 bottom-16 flex flex-col bg-white animate-in fade-in duration-500 overflow-hidden">
      {/* iOS Style Header - Locked at top */}
      <div className="shrink-0 px-6 pt-6 pb-2 flex items-center justify-between bg-white border-b border-slate-50">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Availability
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Select a time to book</p>
        </div>
        <div className="flex items-center gap-3">
          <MobileSearchButton variant="circle" />
        </div>
      </div>

      {/* Main Calendar View - Fills remaining space and handles its own scroll */}
      <div className="flex-1 overflow-hidden">
        <MobileCalendarView 
          initialBookings={serializedBookings}
          user={user}
          businessHours={tenant?.businessHours}
          services={serializedServices}
          clients={serializedClients}
          teamMembers={serializedTeamMembers}
        />
      </div>
    </div>
  );
}

