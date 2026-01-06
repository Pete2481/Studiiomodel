import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SidebarSkeleton } from "@/components/layout/sidebar-skeleton";
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
    avatarUrl: (sessionUser.image && sessionUser.image.length < 5000) ? sessionUser.image : null,
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
    <div className="flex min-h-screen bg-slate-50">
      {/* Ghost Sidebar */}
      <aside className="w-24 lg:w-72 border-r border-slate-200 bg-white hidden lg:block">
        <SidebarSkeleton isCollapsed={false} />
      </aside>
      
      {/* Ghost Main Content */}
      <main className="flex-1 min-w-0">
        <header className="h-20 bg-white/80 border-b border-slate-200 px-10 flex items-center justify-between backdrop-blur-md">
          <div className="h-6 w-48 bg-slate-100 rounded animate-pulse" />
          <div className="flex gap-4">
            <div className="h-10 w-32 bg-slate-100 rounded-xl animate-pulse" />
            <div className="h-10 w-10 bg-slate-100 rounded-full animate-pulse" />
          </div>
        </header>
        <div className="p-10 max-w-[1600px] mx-auto space-y-12">
          <div className="h-32 w-full bg-slate-100 rounded-[40px] animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-40 bg-slate-100 rounded-[40px] animate-pulse" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
