import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { cached, tenantTag } from "@/lib/server-cache";
import { formatDropboxUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

function decToNumber(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

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
    const canBackfill = role === "TENANT_ADMIN" || role === "ADMIN";

    const payload = await cached(
      "api:mapsDeliveredGalleries",
      [tenantId, role, agentId, clientId, seeAll],
      async () => {
        let where: any = { tenantId, deletedAt: null, status: "DELIVERED" };

        // Scope by role (matches dashboard/gallery scoping patterns).
        if (role === "AGENT" && clientId) {
          if (!seeAll) where.agentId = agentId;
          else where.clientId = clientId;
        } else if (role === "CLIENT" && clientId) {
          where.clientId = clientId;
        }

        const rows = await prisma.gallery.findMany({
          where,
          orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }],
          take: 2000,
          select: {
            id: true,
            title: true,
            status: true,
            deliveredAt: true,
            createdAt: true,
            clientId: true,
            agentId: true,
            bannerImageUrl: true,
            client: { select: { name: true, businessName: true } },
            agent: { select: { name: true } },
            media: {
              take: 1,
              orderBy: { createdAt: "asc" },
              select: { url: true, thumbnailUrl: true },
            },
            property: {
              select: {
                id: true,
                name: true,
                addressLine1: true,
                city: true,
                state: true,
                postcode: true,
                country: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        });

        const markers = rows.map((g: any) => {
          const lat = decToNumber(g?.property?.latitude);
          const lon = decToNumber(g?.property?.longitude);
          const addressParts = [
            g?.property?.addressLine1,
            g?.property?.city,
            g?.property?.state,
            g?.property?.postcode,
          ]
            .map((s: any) => String(s || "").trim())
            .filter(Boolean);
          const fallbackAddress = String(g?.property?.name || "").trim();
          // Prefer a true thumbnail (fast) and only fall back to banner/full urls.
          const rawCover = String(g?.media?.[0]?.thumbnailUrl || g?.bannerImageUrl || g?.media?.[0]?.url || "").trim();
          const coverUrl = rawCover ? formatDropboxUrl(rawCover) : null;

          return {
            id: String(g.id),
            title: String(g.title || "Gallery"),
            status: String(g.status || ""),
            deliveredAt: g.deliveredAt ? new Date(g.deliveredAt).toISOString() : null,
            createdAt: g.createdAt ? new Date(g.createdAt).toISOString() : null,
            client: g.client ? String(g.client.businessName || g.client.name || "") : "",
            agent: g.agent ? String(g.agent.name || "") : "",
            coverUrl,
            property: {
              id: String(g.property.id),
              name: String(g.property.name || ""),
              address: addressParts.join(", ") || fallbackAddress,
              lat,
              lon,
            },
          };
        });

        const withCoords = markers.filter((m: any) => Number.isFinite(m?.property?.lat) && Number.isFinite(m?.property?.lon));
        const missingCoordsCount = markers.length - withCoords.length;

        return {
          success: true,
          tenantId,
          canBackfill,
          total: markers.length,
          missingCoordsCount,
          markers: withCoords,
        };
      },
      { revalidateSeconds: 30, tags: [tenantTag(tenantId), `tenant:${tenantId}:maps`] },
    );

    console.log(`[api/maps/galleries] tenant=${tenantId} durationMs=${Date.now() - startedAt}`);
    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("[api/maps/galleries] error", err);
    return NextResponse.json(
      { success: false, error: String(err?.message || "Failed to load map galleries") },
      { status: 500 },
    );
  }
}

