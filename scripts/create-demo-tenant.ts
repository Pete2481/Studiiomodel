import { PrismaClient, BookingStatus, BookingSource, GalleryStatus } from "@prisma/client";

/**
 * Creates/updates a read-only demo tenant + demo user + membership + a small set of sample data.
 *
 * Safe to run multiple times (idempotent-ish via upserts).
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node scripts/create-demo-tenant.ts
 *
 * Optional env vars:
 *   DEMO_TENANT_SLUG=demo
 *   DEMO_TENANT_NAME="Studiio Demo Studio"
 *   DEMO_USER_EMAIL="demo@studiio.au"
 *   DEMO_USER_NAME="Studiio Demo"
 */

const prisma = new PrismaClient();

function slugify(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const demoTenantSlug = String(process.env.DEMO_TENANT_SLUG || "demo");
  const demoTenantName = String(process.env.DEMO_TENANT_NAME || "Studiio Demo Studio");
  const demoUserEmail = String(process.env.DEMO_USER_EMAIL || "demo@studiio.au").toLowerCase().trim();
  const demoUserName = String(process.env.DEMO_USER_NAME || "Studiio Demo");

  // 1) Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: demoTenantSlug },
    create: {
      name: demoTenantName,
      slug: demoTenantSlug,
      timezone: "Australia/Sydney",
      // Make it visually distinct
      brandColor: "#10b981",
      settings: {
        demoTenant: true,
      } as any,
    },
    update: {
      name: demoTenantName,
      settings: {
        demoTenant: true,
      } as any,
      // Ensure integrations are empty
      dropboxAccessToken: null,
      dropboxRefreshToken: null,
      googleDriveRefreshToken: null,
    },
    select: { id: true, slug: true, name: true },
  });

  // 2) Demo user
  const user = await prisma.user.upsert({
    where: { email: demoUserEmail },
    create: {
      email: demoUserEmail,
      name: demoUserName,
    },
    update: {
      name: demoUserName,
    },
    select: { id: true, email: true },
  });

  // 3) Membership (role TENANT_ADMIN so they can see everything; readOnlyDemo blocks writes)
  const existingMembership = await prisma.tenantMembership.findFirst({
    where: {
      tenantId: tenant.id,
      userId: user.id,
      role: "TENANT_ADMIN",
      clientId: null,
    },
    select: { id: true, tenantId: true, userId: true, role: true },
  });

  const membership = existingMembership
    ? await prisma.tenantMembership.update({
        where: { id: existingMembership.id },
        data: {
          permissions: {
            readOnlyDemo: true,
            // Optional UX: hide invoice viewing for demo unless you want it
            canViewInvoices: false,
          } as any,
        },
        select: { id: true, tenantId: true, userId: true, role: true },
      })
    : await prisma.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: "TENANT_ADMIN",
          permissions: {
            readOnlyDemo: true,
            canViewInvoices: false,
          } as any,
        },
        select: { id: true, tenantId: true, userId: true, role: true },
      });

  // 4) Seed a small set of fake data (only if tenant currently has little/no content)
  const existing = await prisma.booking.count({ where: { tenantId: tenant.id, deletedAt: null } });
  if (existing < 1) {
    const client = await prisma.client.create({
      data: {
        tenantId: tenant.id,
        slug: "demo-agency",
        name: "Demo Contact",
        businessName: "Demo Realty",
        email: "agency@demo.example",
        phone: "0400 000 000",
        status: "ACTIVE",
        settings: {} as any,
      },
      select: { id: true },
    });

    const property = await prisma.property.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        name: "12 Demo Street, Sydney NSW",
        slug: "12-demo-street-sydney-nsw",
        addressLine1: "12 Demo Street, Sydney NSW",
      },
      select: { id: true },
    });

    const startAt = new Date();
    startAt.setDate(startAt.getDate() + 2);
    startAt.setHours(10, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    const booking = await prisma.booking.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        propertyId: property.id,
        source: BookingSource.TENANT,
        status: BookingStatus.REQUESTED,
        title: "Demo Booking (Requested)",
        startAt,
        endAt,
        timezone: "Australia/Sydney",
        clientNotes: "This is demo data.",
      },
      select: { id: true },
    });

    const gallery = await prisma.gallery.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        propertyId: property.id,
        bookingId: booking.id,
        title: "Demo Gallery",
        status: GalleryStatus.READY,
        bannerImageUrl: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80",
        metadata: {
          dropboxLink: "",
          imageFolders: [],
          demo: true,
        } as any,
      },
      select: { id: true },
    });

    const tag = await prisma.editTag.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "AI Item Removal" } },
      create: {
        tenantId: tenant.id,
        name: "AI Item Removal",
        cost: 10 as any,
        specialistType: "PHOTO",
        description: "Demo tag",
      },
      update: { active: true },
      select: { id: true },
    });

    const er = await prisma.editRequest.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        bookingId: booking.id,
        galleryId: gallery.id,
        note: "Remove the bed (demo request).",
        tags: ["AI Item Removal"],
        assignedToIds: [],
        status: "NEW",
        fileUrl: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=600&q=80",
        selectedTags: {
          create: [{ editTagId: tag.id, costAtTime: 10 as any }],
        },
        metadata: { demo: true } as any,
      },
      select: { id: true },
    });

    // eslint-disable-next-line no-console
    console.log(`[DEMO] Seeded booking=${booking.id} gallery=${gallery.id} editRequest=${er.id}`);
  }

  // eslint-disable-next-line no-console
  console.log("\n=== Demo account created ===");
  // eslint-disable-next-line no-console
  console.log(`Tenant: ${tenant.name} (slug: ${tenant.slug}, id: ${tenant.id})`);
  // eslint-disable-next-line no-console
  console.log(`User: ${user.email} (id: ${user.id})`);
  // eslint-disable-next-line no-console
  console.log(`MembershipId (use this for login tenant selection): ${membership.id}`);
  // eslint-disable-next-line no-console
  console.log("\nSet these env vars on production:");
  // eslint-disable-next-line no-console
  console.log(`DEMO_EMAIL=${user.email}`);
  // eslint-disable-next-line no-console
  console.log(`DEMO_MEMBERSHIP_ID=${membership.id}`);
  // eslint-disable-next-line no-console
  console.log(`DEMO_OTP_CODE=000000`);
  // eslint-disable-next-line no-console
  console.log("\nDone.");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

