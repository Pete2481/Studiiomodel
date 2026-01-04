import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { redirect } from "next/navigation";
import { MobileSearchButton } from "@/components/app/mobile-search-button";
import { SettingsMobileContent } from "@/components/modules/settings/settings-mobile-content";

export default async function MobileSettingsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tPrisma = await getTenantPrisma();

  const tenant = await tPrisma.tenant.findUnique({
    where: { id: session?.user?.tenantId }
  });

  if (!tenant) return <div>Tenant not found</div>;

  return (
    <div className="animate-in fade-in duration-700 pb-32 min-h-screen bg-white">
      {/* Locked Header */}
      <div className="sticky top-12 z-40 px-6 pt-6 pb-4 flex items-center justify-between bg-white/90 backdrop-blur-md border-b border-slate-50">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Settings
          </h1>
          <p className="text-sm font-medium text-slate-400">Account & Preferences</p>
        </div>
        <MobileSearchButton />
      </div>

      <div className="mt-8">
        <SettingsMobileContent 
          tenant={JSON.parse(JSON.stringify(tenant))} 
          user={session?.user}
        />
      </div>
    </div>
  );
}

