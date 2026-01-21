import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { ShellSettings } from "@/components/layout/shell-settings";

export const dynamic = "force-dynamic";

export default async function WipPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const prisma = (await getTenantPrisma()) as any;

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
    </div>
  );
}


