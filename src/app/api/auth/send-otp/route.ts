import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { notificationService } from "@/server/services/notification.service";

export async function POST(request: Request) {
  try {
    const { email, tenantId } = await request.json();

    if (!email || !tenantId) {
      return NextResponse.json({ error: "Email and Tenant ID are required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Verify membership exists (unless Master Admin login)
    if (tenantId !== "MASTER") {
      const membership = await prisma.tenantMembership.findFirst({
        where: {
          id: tenantId, // tenantId is now the membershipId
          user: { email: normalizedEmail }
        },
        include: { tenant: true }
      });

      if (!membership) {
        return NextResponse.json({ error: "No membership found for this workspace" }, { status: 403 });
      }
    } else {
      // For MASTER login, verify user IS master admin
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });
      if (!user?.isMasterAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    // 2. Generate 6-digit OTP
    // Default to 000000 for development ONLY if specified in ENV
    const otp = process.env.NODE_ENV === "development" ? "000000" : randomInt(100000, 999999).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // 3. Store OTP in VerificationToken table
    const identifier = `${normalizedEmail}:${tenantId}`;

    // Fallback: delete old tokens for this identifier and create new one
    await prisma.verificationToken.deleteMany({
      where: { identifier }
    });
    
    await prisma.verificationToken.create({
      data: { identifier, token: otp, expires }
    });

    // 4. Send Email via Notification Service
    // Use the actual tenant ID for branding, not the membership ID
    const actualTenantId = (tenantId === "MASTER" || !membership) ? "MASTER" : membership.tenantId;
    
    try {
      await notificationService.sendOTP(normalizedEmail, otp, actualTenantId);
      console.log(`[OTP SENT] To: ${normalizedEmail}, Tenant: ${actualTenantId}`);
    } catch (notifError) {
      console.error("[OTP Email Error]:", notifError);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SendOTP Error]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

