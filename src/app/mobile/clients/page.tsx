import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { redirect } from "next/navigation";
import { 
  Users,
  Plus
} from "lucide-react";
import { MobileSearchButton } from "@/components/app/mobile-search-button";
import { ClientMobileContent } from "@/components/modules/clients/client-mobile-content";

export default async function AppClientsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tPrisma = await getTenantPrisma();

  // Fetch all clients for the tenant
  const clients = await tPrisma.client.findMany({
    where: { deletedAt: null },
    orderBy: { businessName: 'asc' },
    include: {
      _count: {
        select: {
          bookings: true,
          galleries: true,
        }
      }
    }
  });

  // Fetch services for price overrides in the drawer
  const services = await tPrisma.service.findMany({
    where: { deletedAt: null, active: true },
    orderBy: { name: 'asc' }
  });

  const serializedClients = clients.map(c => ({
    id: String(c.id),
    name: String(c.name),
    businessName: String(c.businessName || ""),
    email: String(c.email || ""),
    phone: String(c.phone || ""),
    status: String(c.status),
    avatarUrl: c.avatarUrl || null,
    bookings: Number(c._count.bookings),
    galleries: Number(c._count.galleries),
    avatar: c.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.businessName || c.name)}&background=random`
  }));

  const serializedServices = services.map(s => ({
    id: s.id,
    name: s.name,
    price: Number(s.price)
  }));

  return (
    <div className="animate-in fade-in duration-700 pb-32 min-h-screen bg-white">
      {/* Locked Header */}
      <div className="sticky top-12 z-40 px-6 pt-6 pb-4 flex items-center justify-between bg-white/90 backdrop-blur-md border-b border-slate-50">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Clients
          </h1>
          <p className="text-sm font-medium text-slate-400">Manage agencies & contacts</p>
        </div>
        <div className="flex items-center gap-3">
          <MobileSearchButton />
          <button className="h-14 w-14 rounded-[24px] bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/20 transition-all active:scale-95">
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="mt-8">
        <ClientMobileContent 
          initialClients={serializedClients} 
          services={serializedServices}
        />
      </div>
    </div>
  );
}

