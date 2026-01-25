import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AppProviders } from "@/components/layout/app-providers";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WelcomeEmailEditor } from "@/components/master/communications/welcome-email-editor";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function MasterWelcomeEmailPage() {
  await headers();
  const session = await auth();

  if (!session || !session.user.isMasterAdmin) {
    redirect("/login");
  }

  const user = {
    name: session.user.name || "System Admin",
    role: "MASTER_ADMIN",
    initials: session.user.name?.split(" ").map((n) => n[0]).join("") || "MA",
    avatarUrl: session.user.image || null,
  };

  const filteredNav = permissionService.getFilteredNav(
    { role: user.role as any, isMasterMode: true },
    UNIFIED_NAV_CONFIG,
  );

  // Ensure config exists for first load
  const config = await prisma.systemConfig.upsert({
    where: { id: "system" },
    update: {},
    create: {
      id: "system",
      welcomeEmailSubject: "Welcome to Studiio",
      welcomeEmailBlocks: [
        {
          id: "intro",
          type: "text",
          content:
            "Hi @user_name,\\n\\nWelcome to @studio_name on Studiio.\\n\\nHere’s what Studiio does (in plain English):",
          width: 100,
        },
      ] as any,
    },
    select: { welcomeEmailSubject: true, welcomeEmailBlocks: true },
  });

  return (
    <AppProviders>
      <DashboardShell
        navSections={filteredNav}
        user={user}
        title="Welcome Email"
        subtitle="Edit the global welcome email sent to new studios."
        isMasterMode={true}
      >
        <div className="animate-in fade-in duration-500 space-y-10 pb-20 pt-8">
          <WelcomeEmailEditor
            initialTemplate={{
              subject: config.welcomeEmailSubject,
              blocks: (config.welcomeEmailBlocks as any) || [],
            }}
            defaultTestEmail={session.user.email || ""}
          />
        </div>
      </DashboardShell>
    </AppProviders>
  );
}


