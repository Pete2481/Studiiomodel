import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscriptionStatus } from "@/lib/tenant-guard";
import { startOfTodayInTimeZone } from "@/lib/timezone";
import { formatDropboxUrl } from "@/lib/utils";
import { cached, tenantTag } from "@/lib/server-cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const startedAt = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = String(session.user.tenantId);
    const sessionUser = session.user as any;
    const role = String(sessionUser.role || "CLIENT");
    const agentId = sessionUser.agentId ? String(sessionUser.agentId) : "";
    const clientId = sessionUser.clientId ? String(sessionUser.clientId) : "";
    const seeAll = !!sessionUser.permissions?.seeAll;
    const includeGalleries = new URL(req.url).searchParams.get("includeGalleries") !== "0";

    const payload = await cached(
      "api:dashboardSummary",
      [tenantId, role, agentId, clientId, seeAll, includeGalleries ? "g1" : "g0"],
      async () => {
        const user = {
          name: sessionUser.name || "User",
          role: (sessionUser.role as any) || "CLIENT",
          tenantId,
          clientId: sessionUser.clientId || null,
          agentId: sessionUser.agentId || null,
          initials: sessionUser.name?.split(" ").map((n: string) => n[0]).join("") || "U",
          avatarUrl: (sessionUser.image && sessionUser.image.length < 5000) ? sessionUser.image : null,
          permissions: sessionUser.permissions || {},
        };

        // Permissions scoping (match /(dashboard)/page.tsx)
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

        const [tenant, isSubscribed] = await Promise.all([
          prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true, timezone: true },
          }),
          checkSubscriptionStatus(tenantId),
        ]);

        const isActionLocked = !isSubscribed;
        const tenantTz = tenant?.timezone || "Australia/Sydney";

        const ops: any[] = [
          prisma.editRequest.count({ where: { ...editWhere, status: "NEW" } }),
          prisma.gallery.count({ where: { ...galleryWhere, status: "DELIVERED" } }),
          prisma.booking.count({
            where: {
              ...bookingWhere,
              status: { in: ["REQUESTED", "PENCILLED"] },
              isPlaceholder: false,
              clientId: { not: null },
            },
          }),
          prisma.invoice.count({ where: { ...invoiceWhere, status: { not: "PAID" } } }),
          prisma.gallery.count({ where: { ...galleryWhere, status: { in: ["DRAFT", "READY"] } } }),
        ];

        if (includeGalleries) {
          ops.push(
            prisma.gallery.findMany({
              where: galleryWhere,
              orderBy: { createdAt: "desc" },
              take: 12,
              select: {
                id: true,
                title: true,
                status: true,
                isLocked: true,
                watermarkEnabled: true,
                bannerImageUrl: true,
                clientId: true,
                otcName: true,
                otcEmail: true,
                otcPhone: true,
                otcNotes: true,
                agentId: true,
                bookingId: true,
                metadata: true,
                client: { select: { id: true, name: true, businessName: true } },
                property: { select: { id: true, name: true } },
                media: {
                  take: 1,
                  orderBy: { createdAt: "asc" },
                  select: { url: true, thumbnailUrl: true },
                },
                _count: { select: { favorites: true } },
                booking: {
                  select: {
                    assignments: {
                      select: { teamMember: { select: { displayName: true } } },
                    },
                  },
                },
              },
            }),
          );
        }

        ops.push(
          prisma.booking.findMany({
            where: {
              ...bookingWhere,
              startAt: { gte: startOfTodayInTimeZone(tenantTz) },
              // Never show system placeholders in booking feeds.
              isPlaceholder: false,
            },
            orderBy: { startAt: "asc" },
            take: 5,
            include: {
              client: { select: { name: true, businessName: true } },
              property: { select: { name: true } },
              services: { include: { service: { select: { name: true } } } },
              assignments: { include: { teamMember: { select: { displayName: true } } } },
            },
          }),
        );

        const results = await prisma.$transaction(ops);

        const editRequestsCount = results[0];
        const completedOrdersCount = results[1];
        const pendingBookingsCount = results[2];
        const pendingInvoicesCount = results[3];
        const undeliveredGalleriesCount = results[4];

        const dbGalleries = includeGalleries ? results[5] : [];
        const dbBookingsList = includeGalleries ? results[6] : results[5];

        const metrics = {
          editRequests: Number(editRequestsCount),
          completedOrders: Number(completedOrdersCount),
          pendingBookings: Number(pendingBookingsCount),
          pendingInvoices: Number(pendingInvoicesCount),
          undeliveredGalleries: Number(undeliveredGalleriesCount),
        };

        const featuredGalleries = includeGalleries
          ? dbGalleries.map((g: any) => {
          const safeMetadata = g.metadata ? (g.metadata as any) : {};
          const bannerUrl = g.bannerImageUrl ? formatDropboxUrl(g.bannerImageUrl) : null;
          const firstMediaUrl = g.media?.[0] ? formatDropboxUrl(String(g.media[0].thumbnailUrl || g.media[0].url)) : null;

          return {
            id: String(g.id),
            title: String(g.title),
            clientId: g.clientId ? String(g.clientId) : "",
            otcName: (g as any).otcName || null,
            otcEmail: (g as any).otcEmail || null,
            otcPhone: (g as any).otcPhone || null,
            otcNotes: (g as any).otcNotes || null,
            bookingId: g.bookingId ? String(g.bookingId) : undefined,
            agentId: g.agentId ? String(g.agentId) : undefined,
            property: String(g.property?.name || g.title),
            client: String(g.client?.businessName || g.client?.name || (g as any).otcName || "One-Time Client"),
            status: String(g.status),
            isLocked: !!g.isLocked,
            watermarkEnabled: !!g.watermarkEnabled,
            bannerImageUrl: g.bannerImageUrl || null,
            metadata: safeMetadata,
            mediaCount: Number(safeMetadata.imageCount || 0),
            videoCount: Number(safeMetadata.videoLinks?.length || 0),
            favoriteCount: Number(g._count?.favorites || 0),
            photographers: g.booking?.assignments?.map((a: any) => String(a.teamMember.displayName)).join(", ") || "No team assigned",
            cover: bannerUrl || firstMediaUrl || "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
          };
        })
          : [];

        const bookingPipeline = dbBookingsList.map((b: any) => {
          let status = String(b.status || "").toLowerCase();
          if (status === "approved") status = "confirmed";
          return {
            id: String(b.id),
            title: String(b.title),
            address: String(b.property?.name || b.title),
            clientName: String(b.client?.name || "Unknown"),
            clientBusinessName: String(b.client?.businessName || b.client?.name || "Unknown"),
            serviceNames: (b.services || []).map((s: any) => String(s.service.name)),
            photographers: (b.assignments || []).map((a: any) => String(a.teamMember.displayName)).join(", "),
            status,
            startAt: b.startAt.toISOString(),
            endAt: b.endAt.toISOString(),
          };
        });

        return {
          success: true,
          tenantId,
          isActionLocked,
          metrics,
          featuredGalleries,
          bookingPipeline,
        };
      },
      { revalidateSeconds: 30, tags: [tenantTag(tenantId), `tenant:${tenantId}:dashboard`] },
    );

    console.log(
      `[api/dashboard/summary] tenant=${tenantId} includeGalleries=${includeGalleries ? "1" : "0"} durationMs=${Date.now() - startedAt}`,
    );
    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("[dashboard/summary] error", err);
    return NextResponse.json(
      { success: false, error: String(err?.message || "Failed to load dashboard summary") },
      { status: 500 },
    );
  }
}


