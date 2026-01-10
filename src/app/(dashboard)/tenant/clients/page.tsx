import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";
import { ClientPageContent } from "@/components/modules/clients/client-page-content";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
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
        title="Client Agencies" 
        subtitle="Keep your agencies and key contacts in sync with portal access control." 
      />
      
      <Suspense fallback={<ClientsSkeleton />}>
        <ClientsDataWrapper tenantId={tenantId} />
      </Suspense>
    </div>
  );
}

function ClientsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="h-10 w-64 bg-slate-100 rounded-full" />
        <div className="h-10 w-32 bg-slate-100 rounded-full" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-48 bg-slate-100 rounded-[32px]" />
        ))}
      </div>
    </div>
  );
}

async function ClientsDataWrapper({ tenantId }: { tenantId: string }) {
  const tPrisma = await getTenantPrisma();

  const [dbClients, dbServices] = await Promise.all([
    tPrisma.client.findMany({
      where: { deletedAt: null },
      orderBy: { businessName: 'asc' },
      include: {
        _count: {
          select: {
            bookings: { where: { deletedAt: null } },
            galleries: { where: { deletedAt: null } }
          }
        }
      }
    }),
    tPrisma.service.findMany({
      where: { active: true },
      select: { id: true, name: true, price: true }
    })
  ]);

  const initialClients = dbClients.map(c => ({
    id: String(c.id),
    name: String(c.name),
    businessName: String(c.businessName || ""),
    email: String(c.email || ""),
    phone: String(c.phone || ""),
    avatarUrl: c.avatarUrl || null,
    status: String(c.status || "ACTIVE"),
    bookingCount: c._count.bookings,
    galleryCount: c._count.galleries,
    priceOverrides: (c.settings as any)?.priceOverrides || {},
    permissions: (c.settings as any)?.permissions || {},
    disabledServices: (c.settings as any)?.disabledServices || [],
    watermarkUrl: c.watermarkUrl || null,
    watermarkSettings: c.watermarkSettings || {},
    createdAt: c.createdAt.toISOString()
  }));

  const services = dbServices.map(s => ({
    id: String(s.id),
    name: String(s.name),
    price: Number(s.price)
  }));

  return <ClientPageContent initialClients={initialClients} services={services} />;
}
