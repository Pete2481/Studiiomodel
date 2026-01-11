import { MetricCards, type MetricSummary } from "@/components/dashboard/metric-cards";
import { DashboardGalleries } from "@/components/dashboard/dashboard-galleries";
import { BookingList, type BookingListBooking } from "@/components/dashboard/booking-list";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDropboxUrl, cn } from "@/lib/utils";
import Link from "next/link";
import { Plus, Loader2 } from "lucide-react";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";
import { Hint } from "@/components/ui";
import { headers } from "next/headers";
import { Suspense } from "react";
import { ShellSettings } from "@/components/layout/shell-settings";

export const dynamic = "force-dynamic";

export default async function TenantDashboard() {
  await headers();
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    redirect("/login");
  }

  const sessionUser = session.user as any;
  const user = {
    name: sessionUser.name || "User",
    role: sessionUser.role as any || "CLIENT",
    clientId: sessionUser.clientId || null,
    agentId: sessionUser.agentId || null,
    initials: sessionUser.name?.split(' ').map((n: string) => n[0]).join('') || "U",
    avatarUrl: (sessionUser.image && sessionUser.image.length < 5000) ? sessionUser.image : null,
    permissions: sessionUser.permissions || {}
  };

  // 1. Permissions scoping
  let bookingWhere: any = { tenantId, deletedAt: null };
  let galleryWhere: any = { tenantId, deletedAt: null };
  let invoiceWhere: any = { tenantId, deletedAt: null };
  let editWhere: any = { tenantId };

  if (user.role === "AGENT" && user.clientId) {
    if (!user.permissions?.seeAll) {
      bookingWhere.agentId = user.agentId;
      galleryWhere.agentId = user.agentId;
      editWhere.gallery = { agentId: user.agentId };
    } else {
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

  return (
    <div className="space-y-8 md:space-y-12 w-full max-w-full overflow-x-hidden">
      {/* Title & Subtitle update immediately */}
      <DashboardHeader tenantId={tenantId} user={user} />

      <div className="grid gap-8 md:gap-12 w-full">
        <Suspense fallback={<MetricCardsSkeleton />}>
          <MetricCardsWrapper 
            tenantId={tenantId} 
            editWhere={editWhere}
            galleryWhere={galleryWhere}
            bookingWhere={bookingWhere}
            invoiceWhere={invoiceWhere}
          />
        </Suspense>

        <Suspense fallback={<GalleriesSkeleton />}>
          <GalleriesWrapper 
            tenantId={tenantId} 
            galleryWhere={galleryWhere} 
            user={user}
          />
        </Suspense>

        <Suspense fallback={<BookingPipelineSkeleton />}>
          <BookingPipelineWrapper 
            tenantId={tenantId} 
            bookingWhere={bookingWhere} 
            user={user}
          />
        </Suspense>
      </div>
    </div>
  );
}

async function DashboardHeader({ tenantId, user }: { tenantId: string, user: any }) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true }
  });

  let dashboardTitle = tenant?.name ? `${tenant.name} Operations` : "Operations";
  if ((user.role === "AGENT" || user.role === "CLIENT") && user.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: user.clientId },
      select: { businessName: true, name: true }
    });
    if (client) {
      dashboardTitle = client.businessName || client.name;
    }
  }

  const dashboardSubtitle = user.role === "TENANT_ADMIN" || user.role === "ADMIN" 
    ? `Monitor ${tenant?.name || 'studio'} bookings, assets, and team performance.`
    : `Welcome back, ${user.name}`;

  return <ShellSettings title={dashboardTitle} subtitle={dashboardSubtitle} />;
}

async function MetricCardsWrapper({ tenantId, editWhere, galleryWhere, bookingWhere, invoiceWhere }: any) {
  const [
    editRequestsCount, completedOrdersCount, pendingBookingsCount, pendingInvoicesCount, undeliveredGalleriesCount
  ] = await Promise.all([
    prisma.editRequest.count({ where: { ...editWhere, status: 'NEW' } }),
    prisma.gallery.count({ where: { ...galleryWhere, status: 'DELIVERED' } }),
    prisma.booking.count({ where: { ...bookingWhere, status: { in: ['REQUESTED', 'PENCILLED'] }, isPlaceholder: false, clientId: { not: null } } }),
    prisma.invoice.count({ where: { ...invoiceWhere, status: { not: 'PAID' } } }),
    prisma.gallery.count({ where: { ...galleryWhere, status: { in: ['DRAFT', 'READY'] } } }),
  ]);

  const metrics: MetricSummary = {
    editRequests: Number(editRequestsCount),
    completedOrders: Number(completedOrdersCount),
    pendingBookings: Number(pendingBookingsCount),
    pendingInvoices: Number(pendingInvoicesCount),
    undeliveredGalleries: Number(undeliveredGalleriesCount)
  };

  return <MetricCards metrics={metrics} />;
}

async function GalleriesWrapper({ tenantId, galleryWhere, user }: any) {
  const [dbGalleries, isSubscribed] = await Promise.all([
    prisma.gallery.findMany({ 
      where: galleryWhere, 
      orderBy: { createdAt: 'desc' }, 
      take: 12, 
      select: {
        id: true,
        title: true,
        status: true,
        isLocked: true,
        watermarkEnabled: true,
        bannerImageUrl: true,
        clientId: true,
        agentId: true,
        bookingId: true,
        metadata: true,
        client: { select: { id: true, name: true, businessName: true } },
        property: { select: { id: true, name: true } },
        media: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          select: { url: true, thumbnailUrl: true }
        },
        services: { select: { service: { select: { id: true } } } },
        _count: { select: { favorites: true } },
        booking: { 
          select: { 
            assignments: { 
              select: { 
                teamMember: { select: { displayName: true } } 
              } 
            } 
          } 
        }
      }
    }),
    checkSubscriptionStatus(tenantId)
  ]);

  const galleries = dbGalleries.map(g => {
    const bannerUrl = g.bannerImageUrl ? formatDropboxUrl(g.bannerImageUrl) : null;
    const firstMediaUrl = g.media[0] ? formatDropboxUrl(String(g.media[0].thumbnailUrl || g.media[0].url)) : null;
    const safeMetadata = g.metadata ? (g.metadata as any) : {};

    return {
      id: String(g.id), 
      title: String(g.title), 
      clientId: String(g.clientId), 
      bookingId: g.bookingId ? String(g.bookingId) : undefined, 
      agentId: g.agentId ? String(g.agentId) : undefined,
      property: String(g.property?.name || g.title), 
      client: String(g.client?.businessName || g.client?.name || "Unknown"), 
      status: String(g.status), 
      isLocked: !!g.isLocked, 
      watermarkEnabled: !!g.watermarkEnabled, 
      bannerImageUrl: g.bannerImageUrl || null, 
      // Pick only the minimal fields from metadata to avoid large JSON payload
      metadata: safeMetadata,
      mediaCount: Number(safeMetadata.imageCount || 0), 
      videoCount: Number(safeMetadata.videoLinks?.length || 0), 
      favoriteCount: Number(g._count.favorites), 
      photographers: g.booking?.assignments?.map(a => String(a.teamMember.displayName)).join(", ") || "No team assigned",
      cover: bannerUrl || firstMediaUrl || "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
      serviceIds: g.services.map(s => String(s.service.id)),
    };
  });

  return (
    <DashboardGalleries 
      initialGalleries={galleries}
      user={user}
      isActionLocked={!isSubscribed}
    />
  );
}

async function BookingPipelineWrapper({ tenantId, bookingWhere, user }: any) {
  const [dbBookingsList, isSubscribed] = await Promise.all([
    prisma.booking.findMany({
      where: bookingWhere, 
      orderBy: { startAt: 'asc' }, 
      take: 5,
      include: { 
        client: { select: { name: true, businessName: true } }, 
        property: { select: { name: true } }, 
        services: { include: { service: { select: { name: true } } } }, 
        assignments: { include: { teamMember: { select: { displayName: true } } } } 
      }
    }),
    checkSubscriptionStatus(tenantId)
  ]);

  const bookings: BookingListBooking[] = dbBookingsList.map(b => {
    let status = b.status.toLowerCase();
    if (status === 'approved') status = 'confirmed';
    return {
      id: String(b.id), 
      title: String(b.title), 
      address: String(b.property?.name || b.title), 
      clientName: String(b.client?.name || "Unknown"), 
      clientBusinessName: String(b.client?.businessName || b.client?.name || "Unknown"),
      serviceNames: b.services.map(s => String(s.service.name)), 
      photographers: b.assignments.map(a => String(a.teamMember.displayName)).join(", "),
      status: (status as any), 
      startAt: b.startAt.toISOString(), 
      endAt: b.endAt.toISOString()
    };
  });

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Booking pipeline</h2>
          <p className="text-sm font-medium text-slate-500">Track upcoming shoots and allocate the right agents in real time.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/tenant/calendar" className="h-10 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 rounded-full px-5 text-xs font-bold transition-all active:scale-95 flex items-center justify-center">Calendar view</Link>
          {user.role !== "CLIENT" && (
            <Hint title="Schedule" content="Book a new photography or media session.">
              <Link href={!isSubscribed ? "/tenant/settings?tab=billing" : "/tenant/calendar?action=new"} className={cn("h-10 bg-primary hover:opacity-90 text-white rounded-full px-5 text-xs font-bold transition-all shadow-lg shadow-primary/20 active:scale-95 flex items-center justify-center gap-2", !isSubscribed && "opacity-50 grayscale hover:grayscale-0")}>
                <Plus className="h-3.5 w-3.5" />{!isSubscribed ? "Subscription Required" : "New Appointment"}
              </Link>
            </Hint>
          )}
        </div>
      </header>
      <BookingList bookings={bookings} />
    </section>
  );
}

function MetricCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 w-full">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="h-32 bg-slate-100 rounded-[32px] animate-pulse border border-slate-50" />
      ))}
    </div>
  );
}

function GalleriesSkeleton() {
  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-100 rounded-lg animate-pulse" />
          <div className="h-4 w-64 bg-slate-50 rounded-lg animate-pulse" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-24 bg-slate-100 rounded-full animate-pulse" />
          <div className="h-10 w-32 bg-slate-100 rounded-full animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex flex-col overflow-hidden rounded-[32px] border border-slate-100 bg-white">
            <div className="aspect-[4/3] bg-slate-100 animate-pulse" />
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <div className="h-5 w-3/4 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-3 w-1/2 bg-slate-50 rounded-lg animate-pulse" />
              </div>
              <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                <div className="flex gap-2">
                  <div className="h-4 w-8 bg-slate-50 rounded animate-pulse" />
                  <div className="h-4 w-8 bg-slate-50 rounded animate-pulse" />
                </div>
                <div className="h-4 w-16 bg-slate-50 rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookingPipelineSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-slate-100 rounded-lg animate-pulse" />
          <div className="h-4 w-64 bg-slate-50 rounded-lg animate-pulse" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-32 bg-slate-100 rounded-full animate-pulse" />
          <div className="h-10 w-40 bg-slate-100 rounded-full animate-pulse" />
        </div>
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-slate-100 rounded-[32px] animate-pulse border border-slate-50" />
        ))}
      </div>
    </div>
  );
}
