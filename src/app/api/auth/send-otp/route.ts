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
    // Default to 000000 for development ONLY if specified in ENV
    const otp = process.env.NODE_ENV === "development" ? "000000" : randomInt(100000, 999999).toString();
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
    // Performance: send using MASTER to avoid tenant DB lookups in sendOTP/emailService.
    // Local dev: fire-and-forget so the API responds instantly.
    // Production: await to ensure delivery (serverless runtimes can stop executing after response).
    try {
      if (process.env.NODE_ENV === "development") {
        void notificationService.sendOTP(normalizedEmail, otp, "MASTER");
      } else {
        await notificationService.sendOTP(normalizedEmail, otp, "MASTER");
      }
      console.log(`[OTP SENT] To: ${normalizedEmail}`);
    } catch (notifError) {
      console.error("[OTP Email Error]:", notifError);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SendOTP Error]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

