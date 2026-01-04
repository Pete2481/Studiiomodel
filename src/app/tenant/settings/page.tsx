import { DashboardShell } from "@/components/layout/dashboard-shell";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SettingsPageContent } from "@/components/modules/settings/settings-page-content";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    redirect("/login");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) {
    redirect("/login");
  }

  const user = {
    name: session.user.name || "User",
    role: (session.user as any).role || "CLIENT",
    initials: session.user.name?.split(' ').map(n => n[0]).join('') || "U"
  };

  return (
    <DashboardShell 
      user={JSON.parse(JSON.stringify(user))}
      workspaceName={tenant?.name || "Studiio Tenant"}
      workspaceSlug={tenant?.slug || ""}
      logoUrl={tenant?.logoUrl || undefined}
      brandColor={tenant?.brandColor || undefined}
      title="System Settings"
      subtitle="Configure your studio's branding, contact information, and platform integrations."
    >
      <div className="space-y-10">
        <SettingsPageContent 
          tenant={JSON.parse(JSON.stringify(tenant))} 
          user={JSON.parse(JSON.stringify(user))} 
        />
      </div>
    </DashboardShell>
  );
}

