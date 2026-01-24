import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTenantPrisma, getSessionTenantId } from "@/lib/tenant-guard";
import { formatDropboxUrl } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";
import { Loader2 } from "lucide-react";
import { GalleryPageContent } from "@/components/modules/galleries/gallery-page-content";
import { permissionService } from "@/lib/permission-service";

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
  const limit = 25;
  const skip = (page - 1) * limit;
  const tPrisma = (isGlobal && sessionUser.isMasterAdmin ? prisma : await getTenantPrisma()) as any;
  const { role, clientId } = sessionUser;
  const tenantId = isGlobal ? "global" : await getSessionTenantId();

  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role || "CLIENT",
    tenantId: tenantId ? String(tenantId) : null,
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: sessionUser.image || null,
    permissions: sessionUser.permissions || {}
  };

  const galleryWhere: any = { deletedAt: null };
  const canViewAll = sessionUser.role === "TENANT_ADMIN" || sessionUser.role === "ADMIN";

  // Module access guard
  if (!canViewAll && !permissionService.can(sessionUser, "viewGalleries")) {
    redirect("/");
  }

  if (!canViewAll) {
    if (role === "CLIENT") galleryWhere.clientId = clientId;
    else if (role === "AGENT") {
      if (sessionUser.permissions?.canViewAllAgencyGalleries) galleryWhere.clientId = clientId;
      else galleryWhere.agentId = sessionUser.agentId;
    }
    else if (role === "PHOTOGRAPHER") {
      const canSeeAll = permissionService.can(sessionUser, "viewAllGalleries");
      if (!canSeeAll) {
        const teamMemberId = sessionUser.teamMemberId ? String(sessionUser.teamMemberId) : "";
        if (!teamMemberId) {
          // No assignment identity -> no galleries.
          galleryWhere.id = "__none__";
        } else {
          galleryWhere.booking = {
            assignments: { some: { teamMemberId } },
          };
        }
      }
    }
  }

  const [dbGalleries, totalCount] = await Promise.all([
    tPrisma.gallery.findMany({
      where: galleryWhere, orderBy: { createdAt: 'desc' }, skip, take: limit,
      include: {
        client: { select: { id: true, name: true, businessName: true } },
        property: { select: { id: true, name: true } },
        media: { select: { thumbnailUrl: true, url: true }, take: 1 },
        agent: { select: { name: true } },
        services: { select: { serviceId: true } },
        _count: { select: { favorites: true } },
        invoices: { select: { id: true, status: true, number: true, tenantId: true }, orderBy: { createdAt: "desc" }, take: 1 },
        booking: { include: { assignments: { include: { teamMember: { select: { displayName: true } } } } } },
      }
    }),
    tPrisma.gallery.count({ where: galleryWhere }),
  ]);

  const galleries = dbGalleries.map((g: any) => ({
    id: String(g.id), title: String(g.title), clientId: g.clientId ? String(g.clientId) : "", bookingId: g.bookingId ? String(g.bookingId) : undefined, agentId: g.agentId ? String(g.agentId) : undefined,
    agentName: g.agent?.name ? String(g.agent.name) : null,
    otcName: (g as any).otcName || null,
    otcEmail: (g as any).otcEmail || null,
    otcPhone: (g as any).otcPhone || null,
    otcNotes: (g as any).otcNotes || null,
    property: String(g.property?.name || g.title), client: String(g.client?.businessName || g.client?.name || (g as any).otcName || "One-Time Client"), status: String(g.status), isLocked: (g as any).isLocked, watermarkEnabled: (g as any).watermarkEnabled, bannerImageUrl: g.bannerImageUrl, metadata: g.metadata, serviceIds: (g.services || []).map((s: any) => String(s.serviceId)), mediaCount: Number((g.metadata as any)?.imageCount || 0), videoCount: (g.metadata as any)?.videoLinks?.length || 0, favoriteCount: Number(g?._count?.favorites || 0), photographers: g.booking?.assignments?.map((a: any) => a.teamMember.displayName).join(", ") || "No team assigned", invoice: g.invoices?.[0] || null, createdAt: g.createdAt,
    cover: formatDropboxUrl(g.bannerImageUrl || String(g.media[0]?.thumbnailUrl || g.media[0]?.url || "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80"))
  }));

  return (
    <GalleryPageContent 
      galleries={galleries}
      user={user}
      pagination={{ total: totalCount, page, limit }}
    />
  );
}
