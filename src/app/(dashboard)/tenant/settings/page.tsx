import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SettingsPageContent } from "@/components/modules/settings/settings-page-content";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";

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

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="System Settings" 
        subtitle="Configure your studio's branding, contact information, and platform integrations." 
      />
      
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <SettingsDataWrapper session={session} tenantId={tenantId} />
      </Suspense>
    </div>
  );
}

async function SettingsDataWrapper({ session, tenantId }: { session: any, tenantId: string }) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) {
    redirect("/login");
  }

  const user = {
    name: session.user.name || "User",
    role: (session.user as any).role || "CLIENT",
    initials: session.user.name?.split(' ').map((n: string) => n[0]).join('') || "U"
  };

  return (
    <div className="space-y-10">
      <SettingsPageContent 
        tenant={JSON.parse(JSON.stringify(tenant))} 
        user={user} 
      />
    </div>
  );
}
