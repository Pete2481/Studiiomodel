import { NextResponse } from "next/server";
import { createTenantWithDefaults } from "@/server/services/tenant-onboarding.service";

// Very lightweight abuse guard (best-effort, per-instance).
const windowMs = 10 * 60 * 1000; // 10 min
const maxPerWindow = 5;
const hits = new Map<string, { count: number; resetAt: number }>();

function getIp(request: Request) {
  // Vercel: x-forwarded-for can be a comma-separated list
  const xff = request.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return ip;
}

function normalizeSlug(slug: string) {
  return String(slug || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request: Request) {
  try {
    const ip = getIp(request);
    const now = Date.now();
    const existing = hits.get(ip);
    if (!existing || existing.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
    } else {
      existing.count += 1;
      if (existing.count > maxPerWindow) {
        return NextResponse.json({ error: "Too many attempts. Please try again shortly." }, { status: 429 });
      }
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const name = String((body as any).name || "").trim();
    const slug = normalizeSlug(String((body as any).slug || ""));
    const contactName = String((body as any).contactName || "").trim();
    const contactEmail = String((body as any).contactEmail || "").toLowerCase().trim();
    const contactPhone = String((body as any).contactPhone || "").trim();

    if (!name || !slug) return NextResponse.json({ error: "Studio name and slug are required." }, { status: 400 });
    if (!contactName || !contactEmail) return NextResponse.json({ error: "Primary admin name and email are required." }, { status: 400 });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const starter = (body as any)?.starter || {};
    const starterClient = starter?.client;
    const starterService = starter?.service;

    await createTenantWithDefaults({
      name,
      slug,
      contactName,
      contactEmail,
      contactPhone,
      settings: { ...(body as any)?.settings, createdVia: "self_serve" },
      trialDays: 90,
      starter: {
        client: starterClient
          ? {
              businessName: String(starterClient.businessName || "").trim(),
              contactName: String(starterClient.contactName || "").trim(),
              email: String(starterClient.email || "").trim(),
            }
          : undefined,
        service: starterService
          ? {
              name: String(starterService.name || "").trim(),
              price: Number(starterService.price || 0),
              durationMinutes: Number(starterService.durationMinutes || 0),
              icon: String(starterService.icon || "Wrench"),
            }
          : undefined,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const msg = String(error?.message || "Internal server error");
    if (String(error?.code || "") === "SLUG_TAKEN") {
      return NextResponse.json({ error: "That workspace URL is already taken. Try a different slug." }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

