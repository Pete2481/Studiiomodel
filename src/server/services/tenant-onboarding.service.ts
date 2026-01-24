import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";
import { notificationService } from "@/server/services/notification.service";
import { randomInt } from "crypto";

function randomId(prefix: string) {
  return `${prefix}${Math.random().toString(36).substring(2, 11)}`;
}

function normalizeSlug(slug: string) {
  return String(slug || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type TenantOnboardingInput = {
  name: string;
  slug: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  settings?: any;
  trialDays?: number; // default 90
  starter?: {
    client?: { businessName: string; contactName?: string; email?: string };
    service?: { name: string; price: number; durationMinutes: number; icon?: string };
  };
};

export async function createTenantWithDefaults(input: TenantOnboardingInput) {
  const name = String(input.name || "").trim();
  const slug = normalizeSlug(input.slug);
  if (!name) throw new Error("Studio name is required");
  if (!slug) throw new Error("Studio slug is required");

  const trialDays = Number.isFinite(input.trialDays as any) ? Number(input.trialDays) : 90;
  const trialEndsAt = addDays(new Date(), trialDays);
  const calendarSecret = `t_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
  const settingsJson = (input.settings && typeof input.settings === "object") ? input.settings : {};

  const contactEmail = String(input.contactEmail || "").toLowerCase().trim();
  const contactName = String(input.contactName || name).trim();
  const contactPhone = String(input.contactPhone || "").trim();

  // Slug uniqueness
  const existing = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (existing?.id) {
    const e: any = new Error("A studio with this slug already exists.");
    e.code = "SLUG_TAKEN";
    throw e;
  }

  // Create tenant (keep legacy id shape used elsewhere)
  const tenantId = randomId("cm");
  const tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      name,
      slug,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      settings: settingsJson as any,
      subscriptionStatus: "trialing",
      trialEndsAt,
      brandColor: "#94a3b8",
      calendarSecret,
    } as any,
    select: { id: true, slug: true, name: true },
  });

  // Create or link primary user as TENANT_ADMIN
  let membershipId: string | null = null;
  if (contactEmail) {
    const user = await prisma.user.upsert({
      where: { email: contactEmail },
      update: { name: contactName },
      create: { email: contactEmail, name: contactName },
      select: { id: true },
    });

    const existingMembership = await prisma.tenantMembership.findFirst({
      where: { tenantId: tenant.id, userId: user.id, role: "TENANT_ADMIN" },
      select: { id: true },
    });
    if (!existingMembership) {
      const m = await prisma.tenantMembership.create({
        data: { tenantId: tenant.id, userId: user.id, role: "TENANT_ADMIN", hasFullClientAccess: true } as any,
        select: { id: true },
      });
      membershipId = m.id;
    } else {
      membershipId = existingMembership.id;
    }
  }

  // Seed default services
  const standardServices = [
    { name: "Professional Real Estate Photography", price: 250, duration: 60, icon: "Camera" },
    { name: "Aerial Drone (Photos & Video)", price: 350, duration: 45, icon: "Zap" },
    { name: "2D & 3D Floor Plans", price: 150, duration: 30, icon: "FileText" },
    { name: "Full Cinematic Video Tour", price: 550, duration: 90, icon: "Video" },
  ];
  await Promise.all(
    standardServices.map((s) =>
      prisma.service.create({
        data: {
          tenantId: tenant.id,
          name: s.name,
          description: `Standard ${s.name.toLowerCase()} service for real estate properties.`,
          price: s.price as any,
          durationMinutes: s.duration,
          icon: s.icon,
          active: true,
        } as any,
      }),
    ),
  );

  // Seed default edit tags (idempotent-ish on tenantId+name)
  await prisma.editTag.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "AI Item removal" } },
    create: {
      tenantId: tenant.id,
      name: "AI Item removal",
      description: "Uses AI tools to remove unwanted items and clean up the image.",
      cost: 10.0 as any,
      specialistType: "PHOTO",
      active: true,
    } as any,
    update: { active: true },
  });

  // Optional starter client + starter service
  const starterClient = input.starter?.client;
  if (starterClient?.businessName) {
    const slugBase = normalizeSlug(starterClient.businessName) || "first-client";
    await prisma.client.create({
      data: {
        tenantId: tenant.id,
        slug: slugBase,
        name: String(starterClient.contactName || starterClient.businessName),
        businessName: String(starterClient.businessName),
        email: starterClient.email ? String(starterClient.email).toLowerCase().trim() : null,
        status: "ACTIVE",
        settings: {} as any,
      } as any,
    });
  }

  const starterService = input.starter?.service;
  if (starterService?.name && Number.isFinite(starterService.price) && Number.isFinite(starterService.durationMinutes)) {
    await prisma.service.create({
      data: {
        tenantId: tenant.id,
        name: String(starterService.name),
        description: "Starter service created during signup.",
        price: Number(starterService.price) as any,
        durationMinutes: Number(starterService.durationMinutes),
        icon: String(starterService.icon || "Wrench"),
        active: true,
      } as any,
    });
  }

  // Signup approve email best-effort (non-blocking)
  // - Generates a one-time OTP for the *membershipId* (the login flow’s tenantId value)
  // - Sends a one-click Approve link that autologins the new admin
  if (contactEmail && membershipId) {
    try {
      const otp = randomInt(100000, 999999).toString();
      const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
      const identifier = `${contactEmail}:${membershipId}`;

      // Ensure token uniqueness + single-use per identifier
      await prisma.$transaction([
        prisma.verificationToken.deleteMany({ where: { identifier } }),
        prisma.verificationToken.create({ data: { identifier, token: otp, expires } }),
      ]);

      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://studiio.com.au").replace(/\/+$/g, "");
      const approveUrl =
        `${baseUrl}/login?autologin=1` +
        `&email=${encodeURIComponent(contactEmail)}` +
        `&tenantId=${encodeURIComponent(membershipId)}` +
        `&otp=${encodeURIComponent(otp)}`;

      await notificationService.sendSignupApproveEmail({
        tenantId: tenant.id,
        toEmail: contactEmail,
        toName: contactName,
        studioName: tenant.name,
        approveUrl,
      });
    } catch (e) {
      // non-blocking
      console.error("[TenantOnboarding] Approve email failed:", e);
    }
  }

  return { tenantId: tenant.id, membershipId };
}

