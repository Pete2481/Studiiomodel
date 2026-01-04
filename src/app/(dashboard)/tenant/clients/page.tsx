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
        title="Client Directory" 
        subtitle="Keep your agencies and key contacts in sync with portal access control." 
      />
      
      <Suspense fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
      }>
        <ClientsDataWrapper tenantId={tenantId} />
      </Suspense>
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
      select: { id: true, name: true }
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
    createdAt: c.createdAt.toISOString()
  }));

  const services = dbServices.map(s => ({
    id: String(s.id),
    name: String(s.name)
  }));

  return <ClientPageContent initialClients={initialClients} services={services} />;
}
