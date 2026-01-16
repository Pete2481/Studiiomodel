import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DashboardSummaryClient } from "@/components/dashboard/dashboard-summary-client";
import { headers } from "next/headers";
import { Suspense } from "react";
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

  return (
    <div className="space-y-8 md:space-y-12 w-full max-w-full overflow-x-hidden">
      {/* Title & Subtitle update immediately */}
      <Suspense fallback={<DashboardHeaderSkeleton />}>
        <DashboardHeader tenantId={tenantId} user={user} />
      </Suspense>

      <DashboardSummaryClient tenantId={tenantId} user={user} />
    </div>
  );
}

function DashboardHeaderSkeleton() {
  return <ShellSettings title="Operations" subtitle="Loading your workspace…" />;
}

async function DashboardHeader({ tenantId, user }: { tenantId: string, user: any }) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true }
  });

  let dashboardTitle = tenant?.name ? `${tenant.name} Operations` : "Operations";
  if ((user.role === "AGENT" || user.role === "CLIENT") && user.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: user.clientId },
      select: { businessName: true, name: true }
    });
    if (client) {
      dashboardTitle = client.businessName || client.name;
    }
  }

  const dashboardSubtitle = user.role === "TENANT_ADMIN" || user.role === "ADMIN" 
    ? `Monitor ${tenant?.name || 'studio'} bookings, assets, and team performance.`
    : `Welcome back, ${user.name}`;

  return <ShellSettings title={dashboardTitle} subtitle={dashboardSubtitle} />;
}
