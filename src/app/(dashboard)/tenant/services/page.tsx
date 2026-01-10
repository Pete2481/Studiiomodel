import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";
import { ServicePageContent } from "@/components/modules/services/service-page-content";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="Service Catalogue" 
        subtitle="Manage the packages your team delivers, track usage, and keep pricing aligned." 
      />
      
      <Suspense fallback={<ServicesSkeleton />}>
        <ServicesDataWrapper />
      </Suspense>
    </div>
  );
}

function ServicesSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="h-10 w-64 bg-slate-100 rounded-full" />
        <div className="h-10 w-32 bg-slate-100 rounded-full" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-32 bg-slate-100 rounded-[32px]" />
        ))}
      </div>
    </div>
  );
}

async function ServicesDataWrapper() {
  const tPrisma = await getTenantPrisma();

  const dbServices = await tPrisma.service.findMany({
    orderBy: { name: 'asc' }
  });

  const initialServices = dbServices.map((s: any) => ({
    id: String(s.id),
    name: String(s.name),
    description: String(s.description || ""),
    price: Number(s.price),
    durationMinutes: Number(s.durationMinutes),
    icon: String(s.icon || "CAMERA"),
    status: s.active ? 'ACTIVE' : 'INACTIVE',
    isFavorite: (s.settings as any)?.isFavorite || false,
    slotType: s.slotType || null,
    clientVisible: s.clientVisible !== false,
    settings: s.settings || {}
  }));

  return <ServicePageContent initialServices={initialServices} />;
}
