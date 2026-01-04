import { DashboardShell } from "@/components/layout/dashboard-shell";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { Plus, Search, Filter, Image as ImageIcon, Video, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { formatDropboxUrl } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

import { checkSubscriptionStatus } from "@/lib/tenant-guard";
import { getNavCounts } from "@/lib/nav-utils";

import { GalleryPageContent } from "@/components/modules/galleries/gallery-page-content";

export const dynamic = "force-dynamic";

export default async function GalleriesPage(props: {
  searchParams: Promise<{ page?: string; global?: string }>
}) {
  const session = await auth();
  const searchParams = await props.searchParams;
  const isGlobal = searchParams.global === "true";
  const page = parseInt(searchParams.page || "1");
  const limit = 8;
  const skip = (page - 1) * limit;

  if (!session) {
    redirect("/login");
  }

  const sessionUser = session.user as any;
  const tenantId = sessionUser.tenantId;
  if (!tenantId && !sessionUser.isMasterAdmin) {
    redirect("/login");
  }

  const tPrisma = isGlobal && sessionUser.isMasterAdmin ? prisma : await getTenantPrisma();
  const { role, clientId, permissions } = sessionUser;

  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {}
  };

  // 1. Resolve Visibility Scoping
  const canViewAll = permissionService.can(sessionUser, "viewAllGalleries");
  const canViewAgencyGalleries = permissionService.can(sessionUser, "canViewAllAgencyGalleries");
  
  // Fetching Logic with Scoping
  const galleryWhere: any = { deletedAt: null };
  if (!canViewAll) {
    if (role === "CLIENT") {
      galleryWhere.clientId = clientId;
    } else if (role === "AGENT") {
      if (canViewAgencyGalleries) {
        galleryWhere.clientId = clientId;
      } else {
        galleryWhere.agentId = sessionUser.agentId;
      }
    }
  }

  const isSubscribed = tenantId ? await checkSubscriptionStatus(tenantId) : true;
  const navCounts = tenantId ? await getNavCounts(tenantId, sessionUser.id, role, user.agentId, user.clientId, user.permissions) : { bookings: 0, galleries: 0, edits: 0 };

  // Fetch all dependencies for the drawer
  const [dbGalleries, totalCount, dbClients, dbBookings, dbAgents, dbServices, tenant] = await Promise.all([
    tPrisma.gallery.findMany({
      where: galleryWhere,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        client: { select: { id: true, name: true, businessName: true } },
        property: { select: { id: true, name: true } },
        media: { select: { thumbnailUrl: true, url: true }, take: 1 },
        services: { include: { service: true } },
        favorites: { select: { id: true } },
        invoices: {
          select: { id: true, status: true, number: true, tenantId: true }
        },
        booking: {
          include: {
            assignments: {
              include: {
                teamMember: { select: { displayName: true } }
              }
            }
          }
        }
      }
    }),
    tPrisma.gallery.count({ where: { deletedAt: null } }),
    tPrisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, businessName: true, avatarUrl: true }
    }),
    tPrisma.booking.findMany({
      where: { deletedAt: null },
      select: { 
        id: true, 
        title: true, 
        clientId: true,
        property: { select: { name: true } },
        services: { include: { service: true } }
      }
    }),
    tPrisma.agent.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, clientId: true, avatarUrl: true }
    }),
    tPrisma.service.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, price: true, icon: true }
    }),
    tPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, logoUrl: true, brandColor: true }
    })
  ]);

  const galleries = dbGalleries.map(g => ({
    id: String(g.id),
    title: String(g.title),
    clientId: String(g.clientId),
    bookingId: g.bookingId ? String(g.bookingId) : undefined,
    agentId: g.agentId ? String(g.agentId) : undefined,
    property: String(g.property?.name || g.title),
    client: String(g.client?.businessName || g.client?.name || "Unknown"),
    status: String(g.status),
    isLocked: (g as any).isLocked,
    watermarkEnabled: (g as any).watermarkEnabled,
    bannerImageUrl: g.bannerImageUrl,
    metadata: g.metadata,
    serviceIds: g.services.map(s => s.service.id),
    mediaCount: Number((g.metadata as any)?.imageCount || 0),
    videoCount: (g.metadata as any)?.videoLinks?.length || 0,
    favoriteCount: g.favorites.length,
    photographers: g.booking?.assignments?.map(a => a.teamMember.displayName).join(", ") || "No team assigned",
    invoice: g.invoices[0] || null,
    createdAt: g.createdAt,
    cover: formatDropboxUrl(g.bannerImageUrl || String(g.media[0]?.thumbnailUrl || g.media[0]?.url || "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80"))
  }));

  console.log("[DEBUG] Formatted Gallery Covers:", galleries.map(g => ({ title: g.title, cover: g.cover })));

  const services = dbServices.map(s => ({
    id: String(s.id),
    name: String(s.name),
    price: Number(s.price),
    icon: s.icon
  }));

  const bookingsData = dbBookings.map(b => ({
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
  }));

  // Branding: If Agent or Client, fetch their Agency name
  let workspaceName = "Studiio Tenant";
  if (user.role === "AGENT" || user.role === "CLIENT") {
    const clientId = (session.user as any).clientId;
    if (clientId) {
      const client = dbClients.find(c => c.id === clientId);
      if (client) {
        workspaceName = client.businessName || client.name;
      }
    }
  }

  return (
    <DashboardShell 
      user={user}
      workspaceName={(tenant as any)?.name || workspaceName}
      logoUrl={(tenant as any)?.logoUrl || undefined}
      brandColor={(tenant as any)?.brandColor || undefined}
      title="Galleries"
      subtitle="Manage your photography assets and client deliveries."
      isActionLocked={!isSubscribed}
      navCounts={navCounts}
    >
      <GalleryPageContent 
        galleries={galleries}
        clients={dbClients}
        bookings={bookingsData}
        agents={dbAgents}
        services={services}
        user={user}
        pagination={{
          total: totalCount,
          page,
          limit
        }}
        isActionLocked={!isSubscribed}
      />
    </DashboardShell>
  );
}

