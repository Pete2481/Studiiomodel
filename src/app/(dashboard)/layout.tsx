import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma, checkSubscriptionStatus } from "@/lib/tenant-guard";
import { getNavCounts } from "@/lib/nav-utils";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    if (session?.user?.isMasterAdmin) {
      redirect("/master");
    }
    redirect("/login");
  }

  const tenantId = session.user.tenantId;
  const sessionUser = session.user as any;

  // 1. Fetch Shared Shell Data (Parallel)
  let tenant = null;
  let navCounts = { bookings: 0, galleries: 0, edits: 0 };
  let isSubscribed = false;

  try {
    [tenant, navCounts, isSubscribed] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, logoUrl: true, brandColor: true, slug: true }
      }),
      getNavCounts(tenantId, sessionUser.id, sessionUser.role, sessionUser.agentId, sessionUser.clientId, sessionUser.permissions),
      checkSubscriptionStatus(tenantId)
    ]);
  } catch (error) {
    console.error("Layout Data Fetch Error:", error);
    // Safety fallback
    isSubscribed = true; 
  }

  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {}
  };

  return (
    <DashboardShell 
      user={user}
      workspaceName={tenant?.name || "Studiio Tenant"}
      workspaceSlug={tenant?.slug}
      logoUrl={tenant?.logoUrl || undefined}
      brandColor={tenant?.brandColor || undefined}
      isActionLocked={!isSubscribed}
      navCounts={navCounts}
    >
      {children}
    </DashboardShell>
  );
}
