import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { DashboardSummaryClient } from "@/components/dashboard/dashboard-summary-client";
import { headers } from "next/headers";
import { ShellSettings } from "@/components/layout/shell-settings";

export const dynamic = "force-dynamic";

export default async function TenantDashboard() {
  await headers();
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    redirect("/login");
  }

  const sessionUser = session.user as any;
  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role as any || "CLIENT",
    tenantId,
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: (sessionUser.image && sessionUser.image.length < 5000) ? sessionUser.image : null,
    permissions: sessionUser.permissions || {}
  };

  const dashboardTitle = "Operations";
  const dashboardSubtitle = user.role === "TENANT_ADMIN" || user.role === "ADMIN"
    ? "Monitor bookings, assets, and team performance."
    : `Welcome back, ${user.name}`;

  return (
    <div className="space-y-8 md:space-y-12 w-full max-w-full overflow-x-hidden">
      <ShellSettings title={dashboardTitle} subtitle={dashboardSubtitle} />

      <DashboardSummaryClient tenantId={tenantId} user={user} />
    </div>
  );
}
