import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { formatDropboxUrl } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";
import { GalleryPageContent } from "@/components/modules/galleries/gallery-page-content";

export const dynamic = "force-dynamic";

export default async function GalleriesPage(props: {
  searchParams: Promise<{ page?: string; global?: string }>
}) {
  const session = await auth();
  const searchParams = await props.searchParams;
  const isGlobal = searchParams.global === "true";
  const page = parseInt(searchParams.page || "1");

  if (!session) {
    redirect("/login");
  }

  const sessionUser = session.user as any;

  return (
    <div className="space-y-12">
      <ShellSettings 
        title="Galleries" 
        subtitle="Manage your photography assets and client deliveries." 
      />
      
      <Suspense fallback={<GalleriesSkeleton />}>
        <GalleriesDataWrapper sessionUser={sessionUser} isGlobal={isGlobal} page={page} />
      </Suspense>
    </div>
  );
}

function GalleriesSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className="h-64 bg-slate-100 rounded-[32px]" />
        ))}
      </div>
    </div>
  );
}

async function GalleriesDataWrapper({ sessionUser, isGlobal, page }: { sessionUser: any, isGlobal: boolean, page: number }) {
  const limit = 8;
  const skip = (page - 1) * limit;
  const tPrisma = isGlobal && sessionUser.isMasterAdmin ? prisma : await getTenantPrisma();
  const { role, clientId } = sessionUser;

  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {}
  };

  const galleryWhere: any = { deletedAt: null };
  const canViewAll = sessionUser.role === "TENANT_ADMIN" || sessionUser.role === "ADMIN";
  if (!canViewAll) {
    if (role === "CLIENT") galleryWhere.clientId = clientId;
    else if (role === "AGENT") {
      if (sessionUser.permissions?.canViewAllAgencyGalleries) galleryWhere.clientId = clientId;
      else galleryWhere.agentId = sessionUser.agentId;
    }
  }

  const [dbGalleries, totalCount, dbClients, dbBookings, dbAgents, dbServices] = await Promise.all([
    tPrisma.gallery.findMany({
      where: galleryWhere, orderBy: { createdAt: 'desc' }, skip, take: limit,
      include: {
        client: { select: { id: true, name: true, businessName: true } },
        property: { select: { id: true, name: true } },
        media: { select: { thumbnailUrl: true, url: true }, take: 1 },
        services: { include: { service: true } },
        favorites: { select: { id: true } },
        invoices: { select: { id: true, status: true, number: true, tenantId: true } },
        booking: { include: { assignments: { include: { teamMember: { select: { displayName: true } } } } } }
      }
    }),
    tPrisma.gallery.count({ where: galleryWhere }),
    tPrisma.client.findMany({ 
      where: !canViewAll && clientId ? { id: clientId, deletedAt: null } : { deletedAt: null }, 
      select: { id: true, name: true, businessName: true, avatarUrl: true, settings: true } 
    }),
    tPrisma.booking.findMany({ 
      where: !canViewAll && clientId ? { clientId, deletedAt: null } : { deletedAt: null },
      select: { id: true, title: true, clientId: true, property: { select: { name: true } }, services: { include: { service: true } } } 
    }),
    tPrisma.agent.findMany({ 
      where: !canViewAll && clientId ? { clientId, deletedAt: null } : { deletedAt: null },
      select: { id: true, name: true, clientId: true, avatarUrl: true } 
    }),
    tPrisma.service.findMany({ where: { deletedAt: null }, select: { id: true, name: true, price: true, icon: true } })
  ]);

  const galleries = dbGalleries.map(g => ({
    id: String(g.id), title: String(g.title), clientId: String(g.clientId), bookingId: g.bookingId ? String(g.bookingId) : undefined, agentId: g.agentId ? String(g.agentId) : undefined,
    property: String(g.property?.name || g.title), client: String(g.client?.businessName || g.client?.name || "Unknown"), status: String(g.status), isLocked: (g as any).isLocked, watermarkEnabled: (g as any).watermarkEnabled, bannerImageUrl: g.bannerImageUrl, metadata: g.metadata, serviceIds: g.services.map(s => s.service.id), mediaCount: Number((g.metadata as any)?.imageCount || 0), videoCount: (g.metadata as any)?.videoLinks?.length || 0, favoriteCount: g.favorites.length, photographers: g.booking?.assignments?.map(a => a.teamMember.displayName).join(", ") || "No team assigned", invoice: g.invoices[0] || null, createdAt: g.createdAt,
    cover: formatDropboxUrl(g.bannerImageUrl || String(g.media[0]?.thumbnailUrl || g.media[0]?.url || "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80"))
  }));

  const bookingsData = dbBookings.map(b => ({
    id: String(b.id), title: String(b.title), clientId: String(b.clientId), property: b.property,
    services: b.services.map(s => ({ ...s, service: { ...s.service, price: Number(s.service.price) } }))
  }));

  return (
    <GalleryPageContent 
      galleries={galleries}
      clients={dbClients.map(c => ({
        id: String(c.id),
        name: String(c.name),
        businessName: String(c.businessName || ""),
        avatarUrl: c.avatarUrl ? String(c.avatarUrl) : null,
        disabledServices: (c.settings as any)?.disabledServices || []
      }))}
      bookings={bookingsData}
      agents={dbAgents}
      services={dbServices.map(s => ({ id: String(s.id), name: String(s.name), price: Number(s.price), icon: s.icon }))}
      user={user}
      pagination={{ total: totalCount, page, limit }}
    />
  );
}
