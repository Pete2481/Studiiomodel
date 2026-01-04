import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { 
  Play, 
  Share2, 
  ChevronRight,
  ImageIcon
} from "lucide-react";
import Link from "next/link";
import { formatDropboxUrl } from "@/lib/utils";
import { MobileSearchButton } from "@/components/app/mobile-search-button";
import { MobileAddGallery } from "@/components/app/mobile-add-gallery";
import { prisma } from "@/lib/prisma";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";
import { permissionService } from "@/lib/permission-service";
import { headers } from "next/headers";
import { AutoFadeCover } from "@/components/ui/auto-fade-cover";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  await headers();
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const tPrisma = await getTenantPrisma();
  const clientId = (session?.user as any)?.clientId;
  const tenantId = session?.user?.tenantId;
  const userRole = session?.user?.role;

  if (!tenantId) return null;

  const isSubscribed = await checkSubscriptionStatus(tenantId);
  const isActionLocked = !isSubscribed;

  const canViewAgencyGalleries = permissionService.can(session?.user, "canViewAllAgencyGalleries");
  const agentId = (session?.user as any)?.agentId;

  // Build query - tenantId is automatically injected by tPrisma
  const baseWhere: any = {
    deletedAt: null,
  };

  if (clientId) {
    if (userRole === "AGENT" && !canViewAgencyGalleries && agentId) {
      baseWhere.agentId = agentId;
    } else {
      baseWhere.clientId = clientId;
    }
  }

  // Fetch dependencies for the Add Gallery drawer
  const canAddGallery = userRole !== "CLIENT" && userRole !== "EDITOR";
  let drawerData: any = { clients: [], bookings: [], agents: [], services: [] };

  if (canAddGallery) {
    const [dbClients, dbBookings, dbAgents, dbServices] = await Promise.all([
      prisma.client.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true, businessName: true, avatarUrl: true }
      }),
      prisma.booking.findMany({
        where: { tenantId, deletedAt: null },
        select: { 
          id: true, 
          title: true, 
          clientId: true,
          property: { select: { name: true } },
          services: { include: { service: true } }
        }
      }),
      prisma.agent.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true, clientId: true, avatarUrl: true }
      }),
      prisma.service.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true, price: true, icon: true }
      })
    ]);

    drawerData = {
      clients: dbClients.map(c => ({ id: String(c.id), name: String(c.name), businessName: c.businessName, avatarUrl: c.avatarUrl })),
      bookings: dbBookings.map(b => ({
        id: String(b.id),
        title: String(b.title),
        clientId: String(b.clientId),
        property: b.property,
        services: b.services.map(s => ({
          ...s,
          service: {
            ...s.service,
            price: Number(s.service.price)
          }
        }))
      })),
      agents: dbAgents.map(a => ({ id: String(a.id), name: String(a.name), clientId: String(a.clientId), avatarUrl: a.avatarUrl })),
      services: dbServices.map(s => ({
        id: String(s.id),
        name: String(s.name),
        price: Number(s.price),
        icon: s.icon
      }))
    };
  }

  // Fetch latest delivery for Hero
  const latestGallery = await tPrisma.gallery.findFirst({
    where: {
      ...baseWhere,
      status: "DELIVERED",
    },
    orderBy: { updatedAt: "desc" },
    include: {
      property: true,
      media: {
        take: 10,
        orderBy: { createdAt: "asc" }
      }
    }
  });

  // Fetch all other galleries
  const dbGalleries = await tPrisma.gallery.findMany({
    where: baseWhere,
    orderBy: { updatedAt: "desc" },
    include: {
      property: true,
      media: {
        take: 10,
        orderBy: { createdAt: "asc" }
      }
    }
  });

  const galleries = dbGalleries.map(g => {
    const galleryMedia = g.media.map(m => formatDropboxUrl(String(m.thumbnailUrl || m.url)));
    const bannerUrl = g.bannerImageUrl ? formatDropboxUrl(g.bannerImageUrl) : null;
    const allMedia = Array.from(new Set([
      bannerUrl,
      ...galleryMedia
    ])).filter(Boolean) as string[];

    return {
      ...g,
      cover: bannerUrl || galleryMedia[0] || "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
      allMedia: allMedia.length > 0 ? allMedia : [bannerUrl || galleryMedia[0] || "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80"]
    };
  });

  return (
    <div className="animate-in fade-in duration-700 pb-32 min-h-screen bg-white">
      {/* Locked Header */}
      <div className="sticky top-12 z-[100] px-6 pt-6 pb-4 flex items-center justify-between bg-white/95 backdrop-blur-md border-b border-slate-50">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Home
          </h1>
          <p className="text-sm font-medium text-slate-400">Welcome back, {session?.user?.name?.split(' ')[0]}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <MobileSearchButton variant="square" />
        </div>
      </div>

      <div className="mt-8 space-y-8">
        {/* Hero Section - Latest Delivery */}
        {latestGallery && (
          <section className="px-6">
            <Link href={`/gallery/${latestGallery.id}`} className="block group">
              <div className="relative h-[400px] w-full rounded-[40px] overflow-hidden shadow-2xl shadow-primary/20 ring-1 ring-slate-200">
                <AutoFadeCover 
                  images={latestGallery.media.length > 0 
                    ? latestGallery.media.map(m => formatDropboxUrl(String(m.thumbnailUrl || m.url)))
                    : [formatDropboxUrl(latestGallery.bannerImageUrl || "")]
                  }
                  title={latestGallery.title}
                  fallback={formatDropboxUrl(latestGallery.bannerImageUrl || latestGallery.media[0]?.thumbnailUrl || latestGallery.media[0]?.url || "")}
                  className="group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />
                
                <div className="absolute bottom-8 left-8 right-8">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-3 py-1 bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full shadow-lg">
                      Latest Delivery
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-1">
                    {latestGallery.property?.name || latestGallery.title}
                  </h2>
                  <p className="text-slate-300 text-sm font-medium mb-6">
                    {format(latestGallery.updatedAt, "MMM d, yyyy")}
                  </p>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-14 bg-white rounded-2xl flex items-center justify-center gap-2 text-slate-900 font-bold shadow-xl transition-all active:scale-95">
                      <Play className="h-4 w-4 fill-current" />
                      View Experience
                    </div>
                    <button className="h-14 w-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white ring-1 ring-white/30 transition-all active:scale-95">
                      <Share2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* Gallery Grid */}
        <section className="px-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Your Properties</h3>
            <button className="text-xs font-bold text-primary flex items-center gap-1">
              See all <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {galleries.map((gallery, idx) => (
              <Link key={gallery.id} href={`/gallery/${gallery.id}`} className="block group">
                <div className="space-y-3">
                  <div className="aspect-square w-full rounded-[32px] overflow-hidden bg-slate-50 ring-1 ring-slate-100 relative shadow-sm transition-all group-hover:shadow-xl group-hover:-translate-y-1">
                    {idx === 0 ? (
                      <AutoFadeCover 
                        images={gallery.allMedia}
                        title={gallery.title}
                        fallback={gallery.cover}
                        className="group-hover:scale-110 transition-transform duration-700"
                        interval={5000} // Slightly slower for the grid
                      />
                    ) : (
                      gallery.cover && gallery.cover !== "" ? (
                        <img 
                          src={gallery.cover} 
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                          alt={gallery.title}
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-slate-200">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      )
                    )}
                    <div className="absolute top-3 right-3">
                      <div className={cn(
                        "px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider shadow-lg",
                        gallery.status === "DELIVERED" ? "bg-emerald-500 text-white" : "bg-slate-900/60 backdrop-blur-md text-white"
                      )}>
                        {gallery.status}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {gallery.property?.name || gallery.title}
                    </p>
                    <p className="text-[10px] font-medium text-slate-400">
                      {format(gallery.createdAt, "MMM d")}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Floating Add Gallery Button */}
      {canAddGallery && (
        <div className="fixed bottom-24 right-6 z-[100]">
          <MobileAddGallery 
            clients={drawerData.clients}
            bookings={drawerData.bookings}
            agents={drawerData.agents}
            services={drawerData.services}
            isActionLocked={isActionLocked}
          />
        </div>
      )}
    </div>
  );
}

// Helper for classes
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
