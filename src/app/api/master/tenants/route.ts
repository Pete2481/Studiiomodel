import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { addDays } from "date-fns";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session || !session.user.id || !session.user.isMasterAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, slug, contactEmail, contactPhone, settings } = await request.json();

    if (!name || !slug) {
      return NextResponse.json({ error: "Name and Slug are required" }, { status: 400 });
    }

    // 1. Create the Tenant with initial trial
    // Use raw query for creation to bypass Prisma Client field validation during caching issues
    const trialEndsAt = addDays(new Date(), 90); // 3-month free trial
    const slugLower = slug.toLowerCase().trim();
    const settingsJson = settings ? JSON.parse(settings) : {};

    const tenantResults: any[] = await prisma.$queryRawUnsafe(`
      INSERT INTO "Tenant" (
        id, name, slug, "contactEmail", "contactPhone", settings, 
        "subscriptionStatus", "trialEndsAt", "createdAt", "updatedAt"
      )
      VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW(), NOW()
      )
      RETURNING *
    `, 
      // Generate a cuid-like ID if not provided, or let the DB default if handled (Prisma usually handles id generation)
      // Since we are bypassing Prisma, we need to provide an ID.
      `cm${Math.random().toString(36).substring(2, 11)}`,
      name, slugLower, contactEmail, contactPhone, JSON.stringify(settingsJson), "trialing", trialEndsAt
    );
    
    const tenant = tenantResults[0];

    // 2. Automatically link the contact email as a TENANT_ADMIN
    if (contactEmail) {
      const normalizedContactEmail = contactEmail.toLowerCase().trim();
      
      // Find or create the user for the contact email
      const contactUser = await prisma.user.upsert({
        where: { email: normalizedContactEmail },
        update: {}, // Don't change anything if they exist
        create: {
          email: normalizedContactEmail,
          name: name, // Default to studio name
        }
      });

      // Create membership for the contact person
      await prisma.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: contactUser.id,
          role: "TENANT_ADMIN",
          hasFullClientAccess: true,
        },
      });
    }

    // 3. Also link the creator (Master Admin) as a TENANT_ADMIN for initial setup
    await prisma.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId: session.user.id,
        role: "TENANT_ADMIN",
        hasFullClientAccess: true,
      },
    });

    return NextResponse.json({ tenant });
  } catch (error: any) {
    console.error("[CreateTenant Error]:", error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "A studio with this slug already exists." }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

