import { DashboardShell } from "@/components/layout/dashboard-shell";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma, checkSubscriptionStatus } from "@/lib/tenant-guard";
import { ServicePageContent } from "@/components/modules/services/service-page-content";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  await headers();
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    redirect("/login");
  }

  const tPrisma = await getTenantPrisma();

  const user = {
    name: session.user.name || "User",
    role: (session.user as any).role || "CLIENT",
    clientId: (session.user as any).clientId || null,
    agentId: (session.user as any).agentId || null,
    initials: session.user.name?.split(' ').map(n => n[0]).join('') || "U",
    avatarUrl: session.user.image || null,
    permissions: (session.user as any).permissions || {}
  };

  const isSubscribed = await checkSubscriptionStatus(tenantId);

  const filteredNav = JSON.parse(JSON.stringify(permissionService.getFilteredNav(
    { role: user.role, isMasterMode: false },
    UNIFIED_NAV_CONFIG
  )));

  // Real data fetching
  const [dbServices, tenant] = await Promise.all([
    tPrisma.service.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { bookingServices: true }
        }
      }
    }),
    tPrisma.tenant.findUnique({
      where: { id: session.user.tenantId as string },
      select: { id: true, name: true, logoUrl: true, brandColor: true }
    })
  ]);

  const services = dbServices.map((s: any) => ({
    id: String(s.id),
    name: String(s.name),
    description: String(s.description),
    price: Number(s.price),
    durationMinutes: Number(s.durationMinutes),
    usage: s._count.bookingServices > 0 ? 85 : 0, // Mock usage % for now
    iconName: s.icon || "Camera",
    slotType: s.slotType || null,
    active: s.active ?? true,
    clientVisible: s.clientVisible ?? true,
    settings: s.settings || {},
    isFavorite: (s.settings as any)?.isFavorite || false,
    status: s.active ? "ACTIVE" : "INACTIVE"
  }));

  return (
    <DashboardShell 
      navSections={filteredNav} 
      user={JSON.parse(JSON.stringify(user))}
      workspaceName={(tenant as any)?.name || "Studiio Tenant"}
      logoUrl={(tenant as any)?.logoUrl || undefined}
      brandColor={(tenant as any)?.brandColor || undefined}
      title="Service Catalogue"
      subtitle="Manage the packages your team delivers, track usage, and keep pricing aligned."
      isActionLocked={!isSubscribed}
    >
      <ServicePageContent 
        initialServices={JSON.parse(JSON.stringify(services))} 
        isActionLocked={!isSubscribed}
      />
    </DashboardShell>
  );
}
