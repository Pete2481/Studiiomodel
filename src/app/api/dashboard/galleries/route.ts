import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { cached, tenantTag } from "@/lib/server-cache";
import { formatDropboxUrl } from "@/lib/utils";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
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

    const payload = await cached(
      "api:dashboardGalleries",
      [tenantId, role, agentId, clientId, seeAll],
      async () => {
        const user = {
          role,
          clientId: sessionUser.clientId || null,
          agentId: sessionUser.agentId || null,
          permissions: sessionUser.permissions || {},
        };

        let galleryWhere: any = { tenantId, deletedAt: null };

        if (user.role === "AGENT" && user.clientId) {
          if (!user.permissions?.seeAll) {
            galleryWhere.agentId = user.agentId;
          } else {
            galleryWhere.clientId = user.clientId;
          }
        } else if (user.role === "CLIENT" && user.clientId) {
          galleryWhere.clientId = user.clientId;
        }

        const dbGalleries = await prisma.gallery.findMany({
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
        });

        const featuredGalleries = dbGalleries.map((g: any) => {
          const safeMetadata = g.metadata ? (g.metadata as any) : {};
          const bannerUrl = g.bannerImageUrl ? formatDropboxUrl(g.bannerImageUrl) : null;
          const firstMediaUrl = g.media?.[0]
            ? formatDropboxUrl(String(g.media[0].thumbnailUrl || g.media[0].url))
            : null;

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
            photographers:
              g.booking?.assignments?.map((a: any) => String(a.teamMember.displayName)).join(", ") ||
              "No team assigned",
            cover:
              bannerUrl ||
              firstMediaUrl ||
              "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
          };
        });

        return {
          success: true,
          tenantId,
          featuredGalleries,
        };
      },
      { revalidateSeconds: 30, tags: [tenantTag(tenantId), `tenant:${tenantId}:dashboard`] },
    );

    console.log(`[api/dashboard/galleries] tenant=${tenantId} durationMs=${Date.now() - startedAt}`);
    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("[dashboard/galleries] error", err);
    return NextResponse.json(
      { success: false, error: String(err?.message || "Failed to load dashboard galleries") },
      { status: 500 },
    );
  }
}

