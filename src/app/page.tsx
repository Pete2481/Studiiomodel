import { DashboardShell } from "@/components/layout/dashboard-shell";
import { permissionService } from "@/lib/permission-service";
import { UNIFIED_NAV_CONFIG } from "@/lib/nav-config";
import { MetricCards, type MetricSummary } from "@/components/dashboard/metric-cards";
import { DashboardGalleries } from "@/components/dashboard/dashboard-galleries";
import { BookingList, type BookingListBooking } from "@/components/dashboard/booking-list";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDropboxUrl, cn } from "@/lib/utils";
import Link from "next/link";
import { Plus } from "lucide-react";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";
import { Hint } from "@/components/ui";
import { headers } from "next/headers";

import { getNavCounts } from "@/lib/nav-utils";

export const dynamic = "force-dynamic";

export default async function TenantDashboard() {
  // Explicitly call headers() to ensure dynamic rendering context in Next.js 15
  await headers();
  
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  // Redirect Master Admin to their own panel if they land here
  if (session.user.role === "MASTER_ADMIN" || session.user.isMasterAdmin) {
    if (!session.user.tenantId) {
      redirect("/master");
    }
  }

  // Redirect Editors to their only module
  if (session.user.role === "EDITOR" || session.user.role === "TEAM_MEMBER") {
    redirect("/tenant/edits");
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    redirect("/login");
  }

  // Fetch Tenant Branding
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, logoUrl: true, slug: true, brandColor: true }
  });

  const user = {
    name: session.user.name || "User",
    role: session.user.role as any || "CLIENT",
    clientId: (session.user as any).clientId || null,
    agentId: (session.user as any).agentId || null,
    initials: session.user.name?.split(' ').map(n => n[0]).join('') || "U",
    permissions: (session.user as any).permissions || {}
  };

  // Branding: If Agent or Client, fetch their Agency name
  let dashboardTitle = tenant?.name ? `${tenant.name} Operations` : "Tenant Operations";
  if (user.role === "AGENT" || user.role === "CLIENT") {
    if (user.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: user.clientId },
        select: { businessName: true, name: true }
      });
      if (client) {
        dashboardTitle = client.businessName || client.name;
      }
    }
  }

  // Permissions: For AGENTS, check if they are restricted to their own jobs
  let bookingWhere: any = { tenantId, deletedAt: null };
  let galleryWhere: any = { tenantId, deletedAt: null };
  let invoiceWhere: any = { tenantId, deletedAt: null };
  let editWhere: any = { tenantId };

  if (user.role === "AGENT" && user.clientId) {
    // If agent doesn't have "seeAll" permission, restrict to their own ID
    if (!user.permissions?.seeAll) {
      bookingWhere.agentId = user.agentId;
      galleryWhere.agentId = user.agentId;
      // Filter edits by those linked to their galleries
      editWhere.gallery = { agentId: user.agentId };
    } else {
      // They HAVE seeAll, but we still restrict to their agency
      bookingWhere.clientId = user.clientId;
      galleryWhere.clientId = user.clientId;
      editWhere.clientId = user.clientId;
    }
  } else if (user.role === "CLIENT" && user.clientId) {
    bookingWhere.clientId = user.clientId;
    galleryWhere.clientId = user.clientId;
    invoiceWhere.clientId = user.clientId;
    editWhere.clientId = user.clientId;
  }

  // Fetch real metrics
  const [
    editRequestsCount, 
    completedOrdersCount, 
    pendingBookingsCount, 
    pendingInvoicesCount,
    undeliveredGalleriesCount,
    navCounts
  ] = await Promise.all([
    prisma.editRequest.count({ where: { ...editWhere, status: 'NEW' } }),
    prisma.gallery.count({ where: { ...galleryWhere, status: 'DELIVERED' } }),
    prisma.booking.count({ 
      where: { 
        ...bookingWhere, 
        status: { in: ['REQUESTED', 'PENCILLED'] },
        isPlaceholder: false,
        clientId: { not: null }
      } 
    }),
    prisma.invoice.count({ where: { ...invoiceWhere, status: { not: 'PAID' } } }),
    prisma.gallery.count({ where: { ...galleryWhere, status: { in: ['DRAFT', 'READY'] } } }),
    getNavCounts(tenantId, session.user.id, user.role, user.agentId, user.clientId, user.permissions)
  ]);

  const metrics: MetricSummary = {
    editRequests: Number(editRequestsCount),
    completedOrders: Number(completedOrdersCount),
    pendingBookings: Number(pendingBookingsCount),
    pendingInvoices: Number(pendingInvoicesCount),
    undeliveredGalleries: Number(undeliveredGalleriesCount)
  };

  const isSubscribed = await checkSubscriptionStatus(tenantId);

  // Fetch real galleries
  const dbGalleries = await prisma.gallery.findMany({
    where: galleryWhere,
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: {
      client: { select: { id: true, name: true, businessName: true } },
      property: { select: { id: true, name: true } },
      media: { 
        select: { thumbnailUrl: true, url: true }, 
        take: 10 
      },
      services: { include: { service: true } },
      favorites: { select: { id: true } },
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
  });

  const galleries = dbGalleries.map(g => {
    const galleryMedia = g.media.map(m => formatDropboxUrl(String(m.thumbnailUrl || m.url)));
    const bannerUrl = g.bannerImageUrl ? formatDropboxUrl(g.bannerImageUrl) : null;
    const allMedia = Array.from(new Set([
      bannerUrl,
      ...galleryMedia
    ])).filter(Boolean) as string[];

    return {
      id: String(g.id),
      title: String(g.title),
      clientId: String(g.clientId),
      bookingId: g.bookingId ? String(g.bookingId) : undefined,
      agentId: g.agentId ? String(g.agentId) : undefined,
      property: String(g.property?.name || g.title),
      client: String(g.client?.businessName || g.client?.name || "Unknown"),
      status: String(g.status),
      isLocked: g.isLocked,
      watermarkEnabled: g.watermarkEnabled,
      bannerImageUrl: g.bannerImageUrl,
      metadata: g.metadata,
      serviceIds: g.services.map(s => s.service.id),
      mediaCount: Number((g.metadata as any)?.imageCount || 0),
      videoCount: (g.metadata as any)?.videoLinks?.length || 0,
      favoriteCount: g.favorites.length,
      photographers: g.booking?.assignments?.map(a => a.teamMember.displayName).join(", ") || "No team assigned",
      cover: bannerUrl || galleryMedia[0] || "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
      allMedia: allMedia.length > 0 ? allMedia : [bannerUrl || galleryMedia[0] || "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80"]
    };
  });

  // Fetch all dependencies for the drawer (same as galleries page)
  const [dbClients, dbBookings, dbAgents, dbServices, dbTeamMembers, allGalleries] = await Promise.all([
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
    }),
    prisma.teamMember.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, displayName: true, avatarUrl: true }
    }),
    prisma.gallery.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, title: true }
    })
  ]);

  const clients = dbClients.map(c => ({ id: String(c.id), name: String(c.name) }));
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
  const galleryList = allGalleries.map(g => ({ id: String(g.id), title: String(g.title) }));
  const teamMembers = dbTeamMembers.map(m => ({ id: String(m.id), displayName: String(m.displayName), avatarUrl: m.avatarUrl ? String(m.avatarUrl) : null }));

  // Re-fetch bookings for the list section
  const dbBookingsList = await prisma.booking.findMany({
    where: bookingWhere,
    orderBy: { startAt: 'asc' },
    take: 5,
    include: {
      client: { select: { name: true, businessName: true, settings: true } },
      property: { select: { name: true } },
      services: { include: { service: { select: { name: true } } } },
      assignments: { include: { teamMember: { select: { displayName: true } } } },
    }
  });

  const bookings: BookingListBooking[] = dbBookingsList.map(b => {
    let status = b.status.toLowerCase();
    if (status === 'approved') status = 'confirmed';
    if (status === 'penciled') status = 'pencilled';

    return {
      id: String(b.id),
      title: String(b.title),
      address: String(b.property?.name || b.title),
      clientName: String(b.client?.name || "Unknown"),
      clientBusinessName: String((b.client as any)?.businessName || b.client?.name || "Unknown"),
      serviceNames: b.services.map(s => String(s.service.name)),
      photographers: b.assignments.map(a => String(a.teamMember.displayName)).join(", "),
      status: (status as any),
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString()
    };
  });

  return (
    <DashboardShell 
      user={user}
      title={dashboardTitle}
      workspaceName={tenant?.name || dashboardTitle}
      workspaceSlug={tenant?.slug}
      logoUrl={tenant?.logoUrl || undefined}
      brandColor={tenant?.brandColor || undefined}
      subtitle={user.role === "TENANT_ADMIN" || user.role === "ADMIN" 
        ? `Monitor ${tenant?.name || 'studio'} bookings, assets, and team performance.`
        : `Welcome back to the ${tenant?.name || 'studio'} dashboard, ${user.name}`}
      isMasterMode={false}
      clients={clients}
      agents={dbAgents.map(a => ({ id: String(a.id), name: String(a.name), clientId: String(a.clientId) }))}
      galleries={galleryList}
      isActionLocked={!isSubscribed}
      navCounts={navCounts}
    >
      <div className="space-y-12">
        <MetricCards metrics={metrics} />

        <DashboardGalleries 
          initialGalleries={galleries}
          clients={dbClients}
          bookings={bookingsData}
          agents={dbAgents}
          services={services}
          user={user}
          isActionLocked={!isSubscribed}
        />

        <section className="space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Booking pipeline</h2>
              <p className="text-sm font-medium text-slate-500">
                Track upcoming shoots and allocate the right agents in real time.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link 
                href="/tenant/calendar"
                className="h-10 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 rounded-full px-5 text-xs font-bold transition-all active:scale-95 flex items-center justify-center"
              >
                Calendar view
              </Link>
                      {user.role !== "CLIENT" && (
                        <Hint 
                          title="Schedule" 
                          content="Book a new photography or media session. This will appear on your shared team calendar."
                        >
                          <Link 
                            href={!isSubscribed ? "/tenant/settings?tab=billing" : "/tenant/calendar?action=new"}
                            className={cn(
                              "h-10 bg-primary hover:opacity-90 text-white rounded-full px-5 text-xs font-bold transition-all shadow-lg shadow-primary/20 active:scale-95 flex items-center justify-center gap-2",
                              !isSubscribed && "opacity-50 grayscale hover:grayscale-0 transition-all"
                            )}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {!isSubscribed ? "Subscription Required" : "New Appointment"}
                          </Link>
                        </Hint>
                      )}
            </div>
          </header>
          <BookingList bookings={bookings} />
        </section>
      </div>
    </DashboardShell>
  );
}
