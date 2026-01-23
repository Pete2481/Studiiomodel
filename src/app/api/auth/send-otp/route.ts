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

    // Demo account support (production-only, tightly scoped):
    // - tenantId here is the MEMBERSHIP ID (see tenant-lookup route)
    const demoEmail = String(process.env.DEMO_EMAIL || "").toLowerCase().trim();
    const demoMembershipId = String(process.env.DEMO_MEMBERSHIP_ID || "");
    const demoOtp = String(process.env.DEMO_OTP_CODE || "000000");
    const isDemoLogin =
      process.env.NODE_ENV === "production" &&
      !!demoEmail &&
      normalizedEmail === demoEmail &&
      !!demoMembershipId &&
      String(tenantId) === demoMembershipId;
    // NOTE (performance): We intentionally DO NOT check membership here.
    // If the UI allowed the user to request an OTP for a workspace, we send it immediately.
    // Actual authorization is enforced during OTP verification in the NextAuth credentials authorize().
    //
    // For MASTER login, keep the master-admin check.
    if (tenantId === "MASTER") {
      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user?.isMasterAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    // 2. Generate 6-digit OTP
    // - Development: always 000000
    // - Production: allow demo fixed OTP ONLY for the demo membership
    const otp =
      process.env.NODE_ENV === "development"
        ? "000000"
        : isDemoLogin
          ? demoOtp
          : randomInt(100000, 999999).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // 3. Store OTP in VerificationToken table
    const identifier = `${normalizedEmail}:${tenantId}`;

    // Fallback: delete old tokens for this identifier and create new one
    // Do it in a transaction for fewer round-trips and consistency.
    if (process.env.NODE_ENV === "development") {
      // Token is globally unique; dev OTP "000000" can collide across identifiers.
      // Clear it to keep local logins reliable.
      await prisma.verificationToken.deleteMany({ where: { token: otp } });
    }

    await prisma.$transaction([
      prisma.verificationToken.deleteMany({ where: { identifier } }),
      prisma.verificationToken.create({ data: { identifier, token: otp, expires } }),
    ]);

    // 4. Send Email via Notification Service
    // IMPORTANT: Send using the ACTUAL tenantId (not membershipId) so we can use tenant SMTP settings.
    // This avoids relying on MASTER SMTP env vars being present.
    //
    // Local dev: fire-and-forget so the API responds instantly.
    // Production: await to ensure delivery (serverless runtimes can stop executing after response).
    // For demo logins, do not send email (fixed code is known).
    if (isDemoLogin) {
      return NextResponse.json({ success: true, demo: true });
    }

    try {
      let actualTenantId: string | "MASTER" = "MASTER";
      if (tenantId !== "MASTER") {
        const m = await prisma.tenantMembership.findUnique({
          where: { id: tenantId }, // tenantId is membershipId in this flow
          select: { tenantId: true },
        });
        if (m?.tenantId) actualTenantId = m.tenantId;
      }

      if (process.env.NODE_ENV === "development") {
        void notificationService.sendOTP(normalizedEmail, otp, actualTenantId);
      } else {
        await notificationService.sendOTP(normalizedEmail, otp, actualTenantId);
      }
      console.log(`[OTP SENT] To: ${normalizedEmail}, Tenant: ${actualTenantId}`);
    } catch (notifError) {
      console.error("[OTP Email Error]:", notifError);
      // Don't silently succeed in non-dev environments.
      if (process.env.NODE_ENV !== "development") {
        return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SendOTP Error]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

