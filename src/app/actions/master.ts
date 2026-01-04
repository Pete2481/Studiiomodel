"use server";

import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { randomInt } from "crypto";

export async function toggleSubscriptionOverwriteAction(tenantId: string, overwrite: boolean) {
// ... existing code ...
}

export async function impersonateTenantAction(tenantId: string) {
  const session = await auth();
  
  if (!session?.user?.isMasterAdmin) {
    throw new Error("Unauthorized: Master Admin only");
  }

  try {
    const userEmail = session.user.email;
    if (!userEmail) throw new Error("User email not found");

    // 1. Ensure the Master Admin is a member of this tenant
    // (They usually are from creation, but let's make sure or create it)
    let membership = await prisma.tenantMembership.findFirst({
      where: {
        tenantId,
        user: { email: userEmail }
      }
    });

    if (!membership) {
      const user = await prisma.user.findUnique({ where: { email: userEmail } });
      if (!user) throw new Error("Master Admin user record not found");

      membership = await prisma.tenantMembership.create({
        data: {
          tenantId,
          userId: user.id,
          role: "TENANT_ADMIN",
          hasFullClientAccess: true,
        }
      });
    }

    // 2. Generate a one-time token for instant login
    const otp = randomInt(100000, 999999).toString();
    const expires = new Date(Date.now() + 60 * 1000); // 1 minute expiry
    const identifier = `${userEmail.toLowerCase().trim()}:${membership.id}`;

    await prisma.verificationToken.deleteMany({
      where: { identifier }
    });
    
    await prisma.verificationToken.create({
      data: { identifier, token: otp, expires }
    });

    return { 
      success: true, 
      otp, 
      email: userEmail, 
      membershipId: membership.id 
    };
  } catch (error) {
    console.error("Failed to prepare impersonation:", error);
    return { success: false, error: "Failed to prepare impersonation" };
  }
}

