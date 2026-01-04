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
      
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <ServicesDataWrapper />
      </Suspense>
    </div>
  );
}

async function ServicesDataWrapper() {
  const tPrisma = await getTenantPrisma();

  const dbServices = await tPrisma.service.findMany({
    orderBy: { name: 'asc' }
  });

  const initialServices = dbServices.map(s => ({
    id: String(s.id),
    name: String(s.name),
    description: String(s.description || ""),
    price: Number(s.price),
    durationMinutes: Number(s.durationMinutes),
    icon: String(s.icon || "CAMERA"),
    active: !!s.active,
    slotType: s.slotType || null,
    clientVisible: s.clientVisible !== false,
    settings: s.settings || {}
  }));

  return <ServicePageContent initialServices={initialServices} />;
}
