import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";
import { getNavCounts } from "@/lib/nav-utils";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Suspense } from "react";

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

  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {}
  };

  // We wrap the shell data fetching in a separate component so the Shell can render INSTANTLY
  return (
    <Suspense fallback={<DashboardShellPlaceholder user={user} />}>
      <ShellDataWrapper tenantId={tenantId} user={user} sessionUser={sessionUser}>
        {children}
      </ShellDataWrapper>
    </Suspense>
  );
}

async function ShellDataWrapper({ 
  tenantId, 
  user, 
  sessionUser, 
  children 
}: { 
  tenantId: string, 
  user: any, 
  sessionUser: any, 
  children: React.ReactNode 
}) {
  // 1. Fetch Shared Shell Data (Parallel)
  let tenant = null;
  let navCounts = { bookings: 0, galleries: 0, edits: 0 };
  let isSubscribed = true; // Default to true to not lock UI while loading

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
  }

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

// This is what the user sees for the first 100ms while the DB is hit
function DashboardShellPlaceholder({ user }: { user: any }) {
  return (
    <DashboardShell 
      user={user}
      workspaceName="Loading..."
      navCounts={{ bookings: 0, galleries: 0, edits: 0 }}
    >
      <div className="animate-pulse space-y-8">
        <div className="h-32 w-full bg-slate-100 rounded-[32px]" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-40 bg-slate-100 rounded-[32px]" />
          <div className="h-40 bg-slate-100 rounded-[32px]" />
          <div className="h-40 bg-slate-100 rounded-[32px]" />
        </div>
      </div>
    </DashboardShell>
  );
}
