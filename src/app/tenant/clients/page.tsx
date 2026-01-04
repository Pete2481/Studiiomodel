import { DashboardShell } from "@/components/layout/dashboard-shell";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  Globe, 
  MoreVertical, 
  UserPlus, 
  ShieldCheck,
  Building2,
  CalendarDays,
  ExternalLink
} from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma, checkSubscriptionStatus } from "@/lib/tenant-guard";
import { headers } from "next/headers";

import { ClientPageContent } from "@/components/modules/clients/client-page-content";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
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
  const [dbClients, tenant, dbServices] = await Promise.all([
    tPrisma.client.findMany({
      where: { deletedAt: null },
      orderBy: { businessName: 'asc' },
      include: {
        _count: {
          select: {
            bookings: true,
            galleries: true,
          }
        }
      }
    }),
    tPrisma.tenant.findUnique({
      where: { id: session.user.tenantId as string },
      select: { name: true, logoUrl: true }
    }),
    tPrisma.service.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: 'asc' }
    })
  ]);

  const services = dbServices.map(s => ({
    id: s.id,
    name: s.name,
    price: Number(s.price)
  }));

  const clients = dbClients.map(c => ({
    id: String(c.id),
    name: String(c.name),
    businessName: String(c.businessName || ""),
    contact: String(c.name),
    email: String(c.email || "No email"),
    phone: String(c.phone || "No phone"),
    status: String(c.status),
    avatarUrl: c.avatarUrl || null,
    watermarkUrl: c.watermarkUrl || "",
    watermarkSettings: c.watermarkSettings || null,
    permissions: (c.settings as any)?.permissions || null,
    priceOverrides: (c.settings as any)?.priceOverrides || {},
    bookings: Number(c._count.bookings),
    galleries: Number(c._count.galleries),
    avatar: c.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.businessName || c.name)}&background=random`
  }));

  return (
    <DashboardShell 
      navSections={filteredNav} 
      user={JSON.parse(JSON.stringify(user))}
      workspaceName={tenant?.name || "Studiio Tenant"}
      logoUrl={tenant?.logoUrl || undefined}
      title="Client Directory"
      subtitle="Keep your agencies and key contacts in sync with portal access control."
      isActionLocked={!isSubscribed}
    >
      <ClientPageContent 
        initialClients={JSON.parse(JSON.stringify(clients))} 
        services={JSON.parse(JSON.stringify(services))}
        isActionLocked={!isSubscribed}
      />
    </DashboardShell>
  );
}

// Helper for classes
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
