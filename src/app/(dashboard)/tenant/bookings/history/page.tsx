import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { BookingsPageContent } from "@/components/bookings/bookings-page-content";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { startOfTodayInTimeZone } from "@/lib/timezone";
import { subDays } from "date-fns";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PastBookingsRangeFilter } from "@/components/bookings/past-bookings-range-filter";

export const dynamic = "force-dynamic";

export default async function PastBookingsPage(props: {
  searchParams: Promise<{ global?: string; rangeDays?: string; page?: string }>;
}) {
  const session = await auth();
  const searchParams = await props.searchParams;
  const isGlobal = searchParams.global === "true";

  if (!session) redirect("/login");

  const rangeDays = (() => {
    const v = Number(searchParams.rangeDays || 90);
    if (Number.isFinite(v) && (v === 30 || v === 90 || v === 365)) return v;
    return 90;
  })();
  const page = Math.max(1, Number(searchParams.page || 1) || 1);

  return (
    <div className="space-y-12">
      <ShellSettings title="Past Bookings" subtitle="Review completed and historical shoots." />

      <Suspense fallback={<HistorySkeleton />}>
        <PastBookingsDataWrapper sessionUser={session.user as any} isGlobal={isGlobal} rangeDays={rangeDays} page={page} />
      </Suspense>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="h-10 w-64 bg-slate-100 rounded-full" />
        <div className="h-10 w-40 bg-slate-100 rounded-full" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 bg-slate-100 rounded-[32px]" />
        ))}
      </div>
    </div>
  );
}

async function PastBookingsDataWrapper(props: {
  sessionUser: any;
  isGlobal: boolean;
  rangeDays: number;
  page: number;
}) {
  const { sessionUser, isGlobal, rangeDays, page } = props;
  const tenantId = sessionUser.tenantId;
  const tPrisma = (isGlobal && sessionUser.isMasterAdmin ? prisma : await getTenantPrisma()) as any;

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
  const rangeStart = subDays(todayStart, rangeDays);

  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(" ").map((n: string) => n[0]).join("") || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {},
  };

  // Visibility Scoping (same as /tenant/bookings)
  const bookingWhere: any = {
    deletedAt: null,
    startAt: { gte: rangeStart, lt: todayStart },
  };

  const canViewAll = sessionUser.role === "TENANT_ADMIN" || sessionUser.role === "ADMIN";
  if (!canViewAll) {
    if (sessionUser.role === "CLIENT") bookingWhere.clientId = sessionUser.clientId;
    else if (sessionUser.role === "AGENT") bookingWhere.agentId = sessionUser.agentId;
    else if (sessionUser.teamMemberId) bookingWhere.assignments = { some: { teamMemberId: sessionUser.teamMemberId } };
  }

  const pageSize = 50;
  const skip = (page - 1) * pageSize;

  const [totalCount, dbBookings, dbClients, dbServices, dbTeamMembers, dbAgents] = await Promise.all([
    tPrisma.booking.count({ where: bookingWhere }),
    tPrisma.booking.findMany({
      where: bookingWhere,
      orderBy: { startAt: "desc" },
      take: pageSize,
      skip,
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
      },
    }),
    tPrisma.client.findMany({
      where: !canViewAll && sessionUser.clientId ? { id: sessionUser.clientId, deletedAt: null } : { deletedAt: null },
      select: { id: true, name: true, businessName: true, avatarUrl: true, settings: true },
    }),
    tPrisma.service.findMany({
      where: { active: true },
      select: { id: true, name: true, price: true, durationMinutes: true, icon: true, slotType: true, clientVisible: true, settings: true },
    }),
    tPrisma.teamMember.findMany({
      where: { deletedAt: null },
      select: { id: true, displayName: true, avatarUrl: true },
    }),
    tPrisma.agent.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, clientId: true, avatarUrl: true },
    }),
  ]);

  const customStatuses = (tenant?.settings as any)?.bookingStatuses || ["Tenanted Property", "Owner Occupied", "Empty (Keys at office)"];

  const bookings = dbBookings.map((b: any) => {
    let status = String(b.status || "").toLowerCase();
    if (status === "approved") status = "confirmed";
    return {
      id: String(b.id),
      title: String(b.title),
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      status: status as any,
      propertyStatus: b.propertyStatus || "",
      clientId: b.clientId ? String(b.clientId) : null,
      agentId: b.agentId ? String(b.agentId) : null,
      client: { name: String(b.client?.name || "Unknown"), businessName: String(b.client?.businessName || "") },
      property: { name: String(b.property?.name || "TBC") },
      internalNotes: String(b.internalNotes || ""),
      clientNotes: String(b.clientNotes || ""),
      isPlaceholder: !!b.isPlaceholder,
      slotType: b.slotType || null,
      services: (b.services || []).map((s: any) => ({ serviceId: String(s.serviceId), name: String(s.service?.name || "Unknown Service") })),
      assignments: (b.assignments || []).map((a: any) => ({
        teamMemberId: String(a.teamMemberId),
        teamMember: { displayName: String(a.teamMember?.displayName || "To assign"), avatarUrl: a.teamMember?.avatarUrl ? String(a.teamMember.avatarUrl) : null },
      })),
    };
  });

  const clients = dbClients.map((c: any) => ({
    id: String(c.id),
    name: String(c.name),
    businessName: String(c.businessName || ""),
    avatarUrl: c.avatarUrl ? String(c.avatarUrl) : null,
    disabledServices: (c.settings as any)?.disabledServices || [],
  }));
  const services = dbServices.map((s: any) => ({
    id: String(s.id),
    name: String(s.name),
    price: Number(s.price),
    durationMinutes: Number(s.durationMinutes),
    icon: String(s.icon || "CAMERA"),
    slotType: s.slotType || null,
    clientVisible: s.clientVisible !== false,
    isFavorite: (s.settings as any)?.isFavorite || false,
  }));
  const teamMembers = dbTeamMembers.map((m: any) => ({ id: String(m.id), displayName: String(m.displayName), avatarUrl: m.avatarUrl || null }));
  const agents = dbAgents.map((a: any) => ({ id: String(a.id), name: String(a.name), clientId: String(a.clientId), avatarUrl: a.avatarUrl || null }));

  const totalPages = Math.max(1, Math.ceil(Number(totalCount || 0) / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const makeHref = (nextPage: number) => {
    const params = new URLSearchParams();
    params.set("rangeDays", String(rangeDays));
    params.set("page", String(nextPage));
    return `/tenant/bookings/history?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PastBookingsRangeFilter value={rangeDays} />
        <div className="flex items-center justify-between sm:justify-end gap-2">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Page {page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={makeHref(Math.max(1, page - 1))}
              aria-disabled={!hasPrev}
              className={cn(
                "h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all",
                !hasPrev && "pointer-events-none opacity-30"
              )}
            >
              Prev
            </Link>
            <Link
              href={makeHref(Math.min(totalPages, page + 1))}
              aria-disabled={!hasNext}
              className={cn(
                "h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all",
                !hasNext && "pointer-events-none opacity-30"
              )}
            >
              Next
            </Link>
          </div>
        </div>
      </div>

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
          duskSlotsPerDay: tenant?.duskSlotsPerDay || 1,
        }}
        user={user}
      />
    </div>
  );
}

