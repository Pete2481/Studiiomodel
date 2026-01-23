import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { ShellSettings } from "@/components/layout/shell-settings";
import { permissionService } from "@/lib/permission-service";
import { WipBookingsList } from "@/components/wip/wip-bookings-list";

export const dynamic = "force-dynamic";

export default async function WipPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const sessionUser = session.user as any;
  const role = String(sessionUser?.role || "");
  const isClientOrAgent = role === "CLIENT" || role === "AGENT";
  const canEditWip = !isClientOrAgent && permissionService.can(sessionUser, "viewBookings");

  const prisma = (await getTenantPrisma()) as any;
  const now = new Date();

  const bookingWhereBase: any = {
    tenantId,
    deletedAt: null,
    isPlaceholder: false,
    endAt: { lt: now },
    status: { notIn: ["CANCELLED", "DECLINED", "BLOCKED"] },
  };

  // Role scoping (client/agent view is read-only and limited)
  const bookingWhereScoped: any = {
    ...bookingWhereBase,
    ...(role === "CLIENT" && sessionUser?.clientId ? { clientId: String(sessionUser.clientId) } : {}),
    ...(role === "AGENT" && sessionUser?.agentId ? { agentId: String(sessionUser.agentId) } : {}),
  };

  const [tenantTimezoneRow, bookings] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } }),
    prisma.booking.findMany({
      where: bookingWhereScoped,
      orderBy: { endAt: "desc" },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        metadata: true,
        client: { select: { id: true, name: true, businessName: true } },
        property: { select: { id: true, name: true } },
      },
      take: 200,
    }),
  ]);

  const tenantTimezone = String(tenantTimezoneRow?.timezone || "Australia/Sydney");

  const [unfinishedGalleries, newEditRequests, uninvoicedCompletedBookings] = await Promise.all([
    prisma.gallery.count({
      where: { tenantId, deletedAt: null, status: { in: ["DRAFT", "READY"] } },
    }),
    prisma.editRequest.count({
      where: { tenantId, status: "NEW" },
    }),
    prisma.booking.count({
      where: {
        tenantId,
        deletedAt: null,
        isPlaceholder: false,
        clientId: { not: null },
        status: "COMPLETED",
        invoices: { none: { deletedAt: null } },
      },
    }),
  ]);

  return (
    <div className="space-y-12">
      <ShellSettings
        title="Work In Progress"
        subtitle="A live checklist of items that need attention across your studio."
      />

      {!isClientOrAgent && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="ui-card border-slate-100 p-8 space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Galleries not finished
            </div>
            <div className="text-4xl font-black text-slate-900">{unfinishedGalleries}</div>
            <Link className="text-sm font-bold text-primary" href="/tenant/galleries" prefetch={false}>
              View Galleries →
            </Link>
          </div>

          <div className="ui-card border-slate-100 p-8 space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Bookings not invoiced (completed)
            </div>
            <div className="text-4xl font-black text-slate-900">{uninvoicedCompletedBookings}</div>
            <Link className="text-sm font-bold text-primary" href="/tenant/bookings" prefetch={false}>
              View Bookings →
            </Link>
          </div>

          <div className="ui-card border-slate-100 p-8 space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              New edit requests
            </div>
            <div className="text-4xl font-black text-slate-900">{newEditRequests}</div>
            <Link className="text-sm font-bold text-primary" href="/tenant/edits" prefetch={false}>
              View Edit Requests →
            </Link>
          </div>
        </div>
      )}

      <WipBookingsList
        timezone={tenantTimezone}
        canEdit={canEditWip}
        bookings={(bookings || []).map((b: any) => ({
          id: String(b.id),
          startAt: b.startAt instanceof Date ? b.startAt.toISOString() : String(b.startAt || ""),
          endAt: b.endAt instanceof Date ? b.endAt.toISOString() : String(b.endAt || ""),
          status: String(b.status || ""),
          metadata: (b.metadata && typeof b.metadata === "object") ? b.metadata : {},
          client: b.client ? { id: String(b.client.id), name: String(b.client.name || ""), businessName: String(b.client.businessName || "") } : null,
          property: b.property ? { id: String(b.property.id), name: String(b.property.name || "") } : null,
        }))}
      />
    </div>
  );
}


