import { prisma } from "@/lib/prisma";

export type GeocodeResult =
  | { ok: true; lat: number; lon: number; formattedAddress?: string }
  | { ok: false; error: string; status?: string };

function getGeocodeKey() {
  // Prefer server-only key to avoid referrer restrictions.
  return process.env.GOOGLE_GEOCODING_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
}

export function formatPropertyAddress(p: {
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
}) {
  const parts = [p.addressLine1, p.city, p.state, p.postcode, p.country]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const apiKey = getGeocodeKey();
  if (!apiKey) return { ok: false, error: "Geocoding API key not configured" };

  const addr = String(address || "").trim();
  if (!addr) return { ok: false, error: "Missing address" };

  try {
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json().catch(() => ({}));
    const status = String(geoData?.status || "");
    const errMsg = String(geoData?.error_message || "");

    if (status !== "OK" || !geoData?.results?.[0]?.geometry?.location) {
      const hint =
        status === "REQUEST_DENIED" && errMsg.toLowerCase().includes("referer")
          ? "Use GOOGLE_GEOCODING_API_KEY (server key) instead of a referrer-restricted NEXT_PUBLIC key."
          : "";
      return { ok: false, status, error: `Geocoding failed (${status}${errMsg ? `: ${errMsg}` : ""}). ${hint}`.trim() };
    }

    const { lat, lng } = geoData.results[0].geometry.location;
    const latNum = Number(lat);
    const lonNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
      return { ok: false, status, error: "Invalid lat/lon returned from geocoder" };
    }

    const formattedAddress = String(geoData?.results?.[0]?.formatted_address || "");
    return { ok: true, lat: latNum, lon: lonNum, formattedAddress };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e || "Geocoding error") };
  }
}

export async function setPropertyLatLon(propertyId: string, lat: number, lon: number) {
  // Store as Decimal compatible values (Prisma accepts number)
  await prisma.property.update({
    where: { id: String(propertyId) },
    data: {
      latitude: lat as any,
      longitude: lon as any,
    },
  });
}

