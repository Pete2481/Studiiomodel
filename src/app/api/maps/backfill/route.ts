import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { geocodeAddress, formatPropertyAddress, setPropertyLatLon } from "@/lib/geocode";
import { revalidateTag } from "next/cache";
import { tenantTag } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = String(session.user.tenantId);
    const role = String((session.user as any)?.role || "");
    if (role !== "TENANT_ADMIN" && role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || "20") || 20));

    const candidates = await prisma.property.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ latitude: null }, { longitude: null }],
        galleries: { some: { deletedAt: null, status: "DELIVERED" } },
      },
      take: limit,
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        name: true,
        addressLine1: true,
        city: true,
        state: true,
        postcode: true,
        country: true,
      },
    });

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ propertyId: string; error: string }> = [];

    // Geocode sequentially to avoid rate limiting and keep predictable performance.
    for (const p of candidates) {
      processed++;
      const address = formatPropertyAddress(p) || String((p as any)?.name || "").trim();
      if (!address) {
        skipped++;
        continue;
      }

      const geo = await geocodeAddress(address);
      if (!geo.ok) {
        skipped++;
        errors.push({ propertyId: String(p.id), error: geo.error });
        continue;
      }

      try {
        await setPropertyLatLon(String(p.id), geo.lat, geo.lon);
        updated++;
      } catch (e: any) {
        skipped++;
        errors.push({ propertyId: String(p.id), error: String(e?.message || e || "Update failed") });
      }
    }

    const remaining = await prisma.property.count({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ latitude: null }, { longitude: null }],
        galleries: { some: { deletedAt: null, status: "DELIVERED" } },
      },
    });

    // Refresh cached map/dashboard fetches for this tenant.
    revalidateTag(tenantTag(tenantId));
    revalidateTag(`tenant:${tenantId}:maps`);

    console.log(
      `[api/maps/backfill] tenant=${tenantId} processed=${processed} updated=${updated} remaining=${remaining} durationMs=${Date.now() - startedAt}`,
    );

    return NextResponse.json({
      success: true,
      processed,
      updated,
      skipped,
      remaining,
      errors: errors.slice(0, 10),
    });
  } catch (err: any) {
    console.error("[api/maps/backfill] error", err);
    return NextResponse.json(
      { success: false, error: String(err?.message || "Backfill failed") },
      { status: 500 },
    );
  }
}

