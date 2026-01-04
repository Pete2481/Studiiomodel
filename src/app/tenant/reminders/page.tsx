import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ReminderTemplateEditor } from "@/components/reminders/reminder-template-editor";
import { redirect } from "next/navigation";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { permissionService } from "@/lib/permission-service";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  await headers();
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { name: true, logoUrl: true, settings: true, brandColor: true }
  });

  const settings = (tenant?.settings as any) || {};
  const reminderTemplate = settings.reminderTemplate;

  const filteredNav = permissionService.getFilteredNav(
    { 
      role: session.user.role as any,
      permissions: (session.user as any).permissions
    },
    UNIFIED_NAV_CONFIG
  );

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
      title="Booking Reminders"
      subtitle="Configure automated notifications to keep your clients informed and prepared."
    >
      <ReminderTemplateEditor initialTemplate={reminderTemplate} />
    </DashboardShell>
  );
}
