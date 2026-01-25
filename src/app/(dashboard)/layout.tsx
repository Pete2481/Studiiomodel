import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AppProviders } from "@/components/layout/app-providers";
import { Suspense } from "react";
import { PageLoader } from "@/components/ui/page-loader";

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
    avatarUrl: (sessionUser.image && sessionUser.image.length < 5000) ? sessionUser.image : null,
    permissions: sessionUser.permissions || {}
  };

  // We wrap the shell data fetching in a separate component so the Shell can render INSTANTLY
  return (
    <AppProviders>
      <Suspense fallback={<DashboardShellPlaceholder user={user} />}>
        <ShellDataWrapper tenantId={tenantId} user={user} sessionUser={sessionUser}>
          {children}
        </ShellDataWrapper>
      </Suspense>
    </AppProviders>
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
  let isSubscribed = true; // Default to true to not lock UI while loading

  try {
    [tenant, isSubscribed] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, logoUrl: true, brandColor: true, slug: true }
      }),
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
      workspaceName="Loading…"
      workspaceSlug={undefined}
      logoUrl={undefined}
      brandColor={undefined}
      isActionLocked={false}
    >
      <PageLoader message="Loading your workspace…" />
    </DashboardShell>
  );
}
