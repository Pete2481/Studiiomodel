import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { notificationService } from "@/server/services/notification.service";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session || !session.user.id || !session.user.isMasterAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, slug, contactName, contactEmail, contactPhone, settings } = await request.json();

    if (!name || !slug) {
      return NextResponse.json({ error: "Name and Slug are required" }, { status: 400 });
    }

    // 1. Create the Tenant with initial trial
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
      `cm${Math.random().toString(36).substring(2, 11)}`,
      name, slugLower, contactEmail, contactPhone, JSON.stringify(settingsJson), "trialing", trialEndsAt
    );
    
    const tenant = tenantResults[0];

    // 2. Automatically link the contact email as a TENANT_ADMIN
    let contactUserId = null;
    if (contactEmail) {
      const normalizedContactEmail = contactEmail.toLowerCase().trim();
      
      const contactUser = await prisma.user.upsert({
        where: { email: normalizedContactEmail },
        update: {
          name: contactName || name
        },
        create: {
          email: normalizedContactEmail,
          name: contactName || name,
        }
      });

      contactUserId = contactUser.id;

      await prisma.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: contactUser.id,
          role: "TENANT_ADMIN",
          hasFullClientAccess: true,
        },
      });
    }

    // 3. Link the Master Admin
    await prisma.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId: session.user.id,
        role: "TENANT_ADMIN",
        hasFullClientAccess: true,
      },
    });

    // 4. AUTO-SEED STANDARD SERVICES
    const standardServices = [
      { name: "Professional Real Estate Photography", price: 250, duration: 60, icon: "Camera" },
      { name: "Aerial Drone (Photos & Video)", price: 350, duration: 45, icon: "Zap" },
      { name: "2D & 3D Floor Plans", price: 150, duration: 30, icon: "FileText" },
      { name: "Full Cinematic Video Tour", price: 550, duration: 90, icon: "Video" },
    ];

    await Promise.all(standardServices.map(s => 
      prisma.service.create({
        data: {
          tenantId: tenant.id,
          name: s.name,
          description: `Standard ${s.name.toLowerCase()} service for real estate properties.`,
          price: s.price,
          durationMinutes: s.duration,
          icon: s.icon,
          active: true,
        }
      })
    ));

    // 5. SEND WELCOME EMAIL
    if (contactEmail) {
      try {
        await notificationService.sendTeamMemberWelcome(contactUserId as string);
      } catch (e) {
        console.error("[CreateTenant] Failed to send welcome email:", e);
      }
    }

    return NextResponse.json({ tenant });
  } catch (error: any) {
    console.error("[CreateTenant Error]:", error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "A studio with this slug already exists." }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

