import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { geocodeAddress, formatPropertyAddress, setPropertyLatLon } from "@/lib/geocode";
import { revalidateTag } from "next/cache";
import { tenantTag } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

/**
 * MAPS GEO BACKFILL CRON
 * Fills missing Property.latitude/longitude for properties that have delivered galleries.
 * Security: Requires CRON_SECRET header or parameter.
 *
 * Usage:
 * - GET /api/cron/maps-backfill?secret=...&limit=20
 */
export async function GET(req: Request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") || req.headers.get("x-cron-secret");

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit") || "20") || 20));

  try {
    // Pick one tenant with missing coords on properties that have delivered galleries.
    const tenantRow = await prisma.property.findFirst({
      where: {
        deletedAt: null,
        OR: [{ latitude: null }, { longitude: null }],
        galleries: { some: { deletedAt: null, status: "DELIVERED" } },
      },
      select: { tenantId: true },
      orderBy: { updatedAt: "asc" },
    });

    if (!tenantRow?.tenantId) {
      return NextResponse.json({ success: true, message: "No missing locations found.", durationMs: Date.now() - startedAt });
    }

    const tenantId = String(tenantRow.tenantId);

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

    // Sequential geocoding for predictable rate limiting.
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

    revalidateTag(tenantTag(tenantId));
    revalidateTag(`tenant:${tenantId}:maps`);

    console.log(
      `[CRON][maps-backfill] tenant=${tenantId} processed=${processed} updated=${updated} remaining=${remaining} durationMs=${Date.now() - startedAt}`,
    );

    return NextResponse.json({
      success: true,
      tenantId,
      processed,
      updated,
      skipped,
      remaining,
      errors: errors.slice(0, 10),
      durationMs: Date.now() - startedAt,
    });
  } catch (error: any) {
    console.error("[CRON][maps-backfill] error", error);
    return NextResponse.json({ error: String(error?.message || error || "Cron backfill failed") }, { status: 500 });
  }
}

