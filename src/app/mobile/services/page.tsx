import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { 
  Wrench,
  Plus
} from "lucide-react";
import { MobileSearchButton } from "@/components/app/mobile-search-button";
import { ServiceMobileContent } from "@/components/modules/services/service-mobile-content";

export default async function AppServicesPage() {
  const session = await auth();
  const tPrisma = await getTenantPrisma();

  // Fetch all services for the tenant
  const dbServices = await tPrisma.service.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { bookingServices: true }
      }
    }
  });

  const serializedServices = dbServices.map((s: any) => ({
    id: String(s.id),
    name: String(s.name),
    description: String(s.description || ""),
    price: Number(s.price),
    durationMinutes: Number(s.durationMinutes),
    usage: s._count.bookingServices > 0 ? 85 : 0, // Keep consistency with desktop mock
    iconName: s.icon || "CAMERA",
    slotType: s.slotType || null,
    active: s.active ?? true,
    clientVisible: s.clientVisible ?? true,
    settings: s.settings || {},
    isFavorite: (s.settings as any)?.isFavorite || false,
    status: s.active ? "ACTIVE" : "INACTIVE"
  }));

  return (
    <div className="animate-in fade-in duration-700 pb-32 min-h-screen bg-white">
      {/* Locked Header */}
      <div className="sticky top-12 z-40 px-6 pt-6 pb-4 flex items-center justify-between bg-white/90 backdrop-blur-md border-b border-slate-50">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Services
          </h1>
          <p className="text-sm font-medium text-slate-400">Manage production packages</p>
        </div>
        <div className="flex items-center gap-3">
          <MobileSearchButton />
          <button className="h-14 w-14 rounded-[24px] bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/20 transition-all active:scale-95">
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="mt-8">
        <ServiceMobileContent 
          initialServices={serializedServices} 
        />
      </div>
    </div>
  );
}

