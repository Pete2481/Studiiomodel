import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AppProviders } from "@/components/layout/app-providers";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import Link from "next/link";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function MasterNewsletterDetailPage(props: {
  params: Promise<{ newsletterId: string }>;
}) {
  await headers();
  const session = await auth();
  if (!session || !session.user.isMasterAdmin) redirect("/login");

  const { newsletterId } = await props.params;

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

  const newsletter = await prisma.newsletter.findUnique({
    where: { id: newsletterId },
    include: {
      recipients: {
        include: { tenant: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!newsletter) {
    return (
      <AppProviders>
        <DashboardShell navSections={filteredNav} user={user} title="Newsletter" subtitle="Not found" isMasterMode={true}>
          <div className="py-16">
            <p className="text-sm font-bold text-slate-500">Newsletter not found.</p>
            <Link className="text-sm font-bold text-primary" href="/master/communications/newsletters">
              Back to newsletters
            </Link>
          </div>
        </DashboardShell>
      </AppProviders>
    );
  }

  const totals = {
    total: newsletter.recipients.length,
    sent: newsletter.recipients.filter((r) => r.status === "SENT").length,
    failed: newsletter.recipients.filter((r) => r.status === "FAILED").length,
    pending: newsletter.recipients.filter((r) => r.status === "PENDING").length,
  };

  return (
    <AppProviders>
      <DashboardShell
        navSections={filteredNav}
        user={user}
        title="Newsletter Delivery"
        subtitle="Per-studio delivery status."
        isMasterMode={true}
      >
        <div className="animate-in fade-in duration-500 space-y-10 pb-20 pt-8">
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subject</div>
              <div className="text-xl font-black text-slate-900 tracking-tight">{newsletter.subject}</div>
              <div className="text-xs font-bold text-slate-400">
                Created {format(new Date(newsletter.createdAt), "dd MMM yyyy p")}
                {newsletter.sentAt ? ` • Sent ${format(new Date(newsletter.sentAt), "dd MMM yyyy p")}` : ""}
              </div>
            </div>
            <Link
              href="/master/communications/newsletters"
              className="h-10 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 rounded-full px-5 text-xs font-bold transition-all active:scale-95 flex items-center justify-center"
            >
              Back
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
            <Stat label="Total" value={totals.total} />
            <Stat label="Sent" value={totals.sent} tone="good" />
            <Stat label="Failed" value={totals.failed} tone={totals.failed > 0 ? "bad" : "muted"} />
            <Stat label="Pending" value={totals.pending} tone="muted" />
          </div>
        </div>

        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-10 py-8 border-b border-slate-50 bg-slate-50/30">
            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">Recipients</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Studio contact emails selected for this send.
            </p>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-slate-50">
                <th className="px-10 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Studio</th>
                <th className="px-10 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Email</th>
                <th className="px-10 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Status</th>
                <th className="px-10 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Sent At</th>
                <th className="px-10 py-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {newsletter.recipients.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/30 transition-all duration-300">
                  <td className="px-10 py-5">
                    <div className="font-bold text-slate-900">{r.tenant?.name || "—"}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{r.tenantId || ""}</div>
                  </td>
                  <td className="px-10 py-5">
                    <div className="text-sm font-bold text-slate-700">{r.email}</div>
                  </td>
                  <td className="px-10 py-5">
                    <span
                      className={
                        r.status === "SENT"
                          ? "inline-flex items-center rounded-full px-4 py-1.5 text-[10px] font-bold tracking-widest bg-emerald-50 text-emerald-600"
                          : r.status === "FAILED"
                            ? "inline-flex items-center rounded-full px-4 py-1.5 text-[10px] font-bold tracking-widest bg-rose-50 text-rose-600"
                            : "inline-flex items-center rounded-full px-4 py-1.5 text-[10px] font-bold tracking-widest bg-slate-50 text-slate-500"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-10 py-5">
                    <div className="text-sm font-bold text-slate-700">
                      {r.sentAt ? format(new Date(r.sentAt), "dd MMM yyyy p") : "—"}
                    </div>
                  </td>
                  <td className="px-10 py-5">
                    <div className="text-xs font-medium text-slate-500">{r.error || "—"}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </DashboardShell>
    </AppProviders>
  );
}

function Stat(props: { label: string; value: number; tone?: "good" | "bad" | "muted" }) {
  const { label, value, tone = "muted" } = props;
  const cls =
    tone === "good"
      ? "text-emerald-600"
      : tone === "bad"
        ? "text-rose-600"
        : "text-slate-900";
  return (
    <div className="rounded-[28px] border border-slate-100 bg-slate-50/40 p-5">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</div>
      <div className={`text-2xl font-black mt-2 ${cls}`}>{value}</div>
    </div>
  );
}


