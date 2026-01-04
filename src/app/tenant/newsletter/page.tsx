import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { NewsletterEditor } from "@/components/reminders/newsletter-editor";
import { redirect } from "next/navigation";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { permissionService } from "@/lib/permission-service";
import { sendNewsletter } from "@/app/actions/newsletter";

export default async function NewsletterPage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  // Fetch clients for the multi-select
  const clients = await prisma.client.findMany({
    where: { 
      tenantId: session.user.tenantId,
      deletedAt: null 
    },
    select: {
      id: true,
      name: true,
      businessName: true
    },
    orderBy: {
      businessName: "asc"
    }
  });

  const formattedClients = clients.map(c => ({
    id: c.id,
    name: c.businessName || c.name
  }));

  const filteredNav = permissionService.getFilteredNav(
    { 
      role: session.user.role as any,
      permissions: (session.user as any).permissions
    },
    UNIFIED_NAV_CONFIG
  );

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { name: true, logoUrl: true, brandColor: true }
  });

  return (
    <DashboardShell 
      navSections={filteredNav} 
      user={{
        name: session.user.name || "User",
        role: session.user.role || "TENANT_ADMIN",
        initials: session.user.name?.split(' ').map(n => n[0]).join('') || "U"
      }}
      workspaceName={tenant?.name || "Studiio Tenant"}
      logoUrl={tenant?.logoUrl || undefined}
      brandColor={tenant?.brandColor || undefined}
      title="Newsletter Broadcast"
      subtitle="Send updates, news, and announcements directly to your clients."
    >
      <NewsletterEditor 
        clients={formattedClients} 
        onSend={sendNewsletter}
      />
    </DashboardShell>
  );
}
