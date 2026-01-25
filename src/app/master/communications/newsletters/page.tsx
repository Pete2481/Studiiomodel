import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AppProviders } from "@/components/layout/app-providers";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { MasterNewsletterComposer } from "@/components/master/communications/master-newsletter-composer";
import { format } from "date-fns";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MasterNewslettersPage() {
  await headers();
  const session = await auth();

  if (!session || !session.user.isMasterAdmin) {
    redirect("/login");
  }

  const user = {
    name: session.user.name || "System Admin",
    role: "MASTER_ADMIN",
    initials: session.user.name?.split(" ").map((n) => n[0]).join("") || "MA",
    avatarUrl: session.user.image || null,
  };

  const filteredNav = permissionService.getFilteredNav(
    { role: user.role as any, isMasterMode: true },
    UNIFIED_NAV_CONFIG,
  );

  const [tenants, newsletters] = await Promise.all([
    prisma.tenant.findMany({
      where: { deletedAt: null, contactEmail: { not: null } },
      select: { id: true, name: true, contactEmail: true },
      orderBy: { name: "asc" },
    }),
    prisma.newsletter.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { recipients: true },
    }),
  ]);

  const tenantRows = tenants
    .filter((t) => Boolean(t.contactEmail))
    .map((t) => ({
      id: String(t.id),
      name: String(t.name),
      contactEmail: String(t.contactEmail),
    }));

  const newsletterRows = newsletters.map((n) => {
    const sent = n.status === "SENT";
    const sentAt = n.sentAt ? new Date(n.sentAt) : null;
    const total = n.recipients.length;
    const ok = n.recipients.filter((r) => r.status === "SENT").length;
    const failed = n.recipients.filter((r) => r.status === "FAILED").length;
    return {
      id: String(n.id),
      subject: String(n.subject),
      status: String(n.status),
      createdAt: new Date(n.createdAt),
      sentAt,
      totals: { total, ok, failed },
      sent,
    };
  });

  return (
    <AppProviders>
      <DashboardShell
        navSections={filteredNav}
        user={user}
        title="Newsletters"
        subtitle="Send platform updates to selected studio contact emails."
        isMasterMode={true}
      >
        <div className="animate-in fade-in duration-500 space-y-10 pb-20 pt-8">
          <MasterNewsletterComposer tenants={tenantRows} defaultTestEmail={session.user.email || ""} />

        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-10 py-8 border-b border-slate-50 bg-slate-50/30">
            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Newsletter History</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Recent sends and delivery status.
            </p>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-slate-50">
                <th className="px-10 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Subject</th>
                <th className="px-10 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Status</th>
                <th className="px-10 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Created</th>
                <th className="px-10 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Sent</th>
                <th className="px-10 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 text-right">
                  Delivery
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {newsletterRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-10 py-16 text-center text-sm font-bold text-slate-400">
                    No newsletters yet.
                  </td>
                </tr>
              ) : (
                newsletterRows.map((n) => (
                  <tr key={n.id} className="hover:bg-slate-50/30 transition-all duration-300">
                    <td className="px-10 py-5">
                      <Link href={`/master/communications/newsletters/${n.id}`} className="font-bold text-slate-900 hover:text-primary transition-colors">
                        {n.subject}
                      </Link>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{n.id}</div>
                    </td>
                    <td className="px-10 py-5">
                      <span
                        className={
                          n.sent
                            ? "inline-flex items-center rounded-full px-4 py-1.5 text-[10px] font-bold tracking-widest bg-emerald-50 text-emerald-600"
                            : "inline-flex items-center rounded-full px-4 py-1.5 text-[10px] font-bold tracking-widest bg-slate-50 text-slate-500"
                        }
                      >
                        {n.status}
                      </span>
                    </td>
                    <td className="px-10 py-5">
                      <div className="text-sm font-bold text-slate-700">{format(n.createdAt, "dd MMM yyyy")}</div>
                    </td>
                    <td className="px-10 py-5">
                      <div className="text-sm font-bold text-slate-700">
                        {n.sentAt ? format(n.sentAt, "dd MMM yyyy p") : "—"}
                      </div>
                    </td>
                    <td className="px-10 py-5 text-right">
                      <div className="text-sm font-bold text-slate-900">
                        {n.totals.ok}/{n.totals.total}
                      </div>
                      {n.totals.failed > 0 && (
                        <div className="text-[10px] font-bold uppercase tracking-wider text-rose-500">
                          {n.totals.failed} failed
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </div>
      </DashboardShell>
    </AppProviders>
  );
}


