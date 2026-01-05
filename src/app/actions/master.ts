"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { randomInt } from "crypto";

export async function toggleSubscriptionOverwriteAction(tenantId: string, overwrite: boolean) {
  const session = await auth();
  
  if (!session?.user?.isMasterAdmin) {
    throw new Error("Unauthorized: Master Admin only");
  }

  try {
    // Use raw query to ensure immediate update bypassing Prisma cache
    await prisma.$executeRawUnsafe(
      `UPDATE "Tenant" SET "subscriptionOverwrite" = $1 WHERE id = $2`,
      overwrite,
      tenantId
    );
    
    revalidatePath("/master");
    return { success: true };
  } catch (error) {
    console.error("Failed to toggle subscription overwrite:", error);
    return { success: false, error: "Failed to update tenant" };
  }
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

export async function addTenantAdminAction(tenantId: string, email: string, name: string) {
  const session = await auth();
  
  if (!session?.user?.isMasterAdmin) {
    throw new Error("Unauthorized");
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Find or create the user
    const user = await prisma.user.upsert({
      where: { email: normalizedEmail },
      update: { name },
      create: {
        email: normalizedEmail,
        name,
      }
    });

    // 2. Create the membership
    const existingMembership = await prisma.tenantMembership.findFirst({
      where: {
        tenantId,
        userId: user.id,
        role: "TENANT_ADMIN"
      }
    });

    if (!existingMembership) {
      await prisma.tenantMembership.create({
        data: {
          tenantId,
          userId: user.id,
          role: "TENANT_ADMIN",
          hasFullClientAccess: true,
        }
      });
    }

    revalidatePath("/master");
    return { success: true };
  } catch (error) {
    console.error("Failed to add admin:", error);
    return { success: false, error: "Failed to add admin user" };
  }
}

export async function syncTenantAccessAction(tenantId: string) {
  const session = await auth();
  
  if (!session?.user?.isMasterAdmin) {
    throw new Error("Unauthorized: Master Admin only");
  }

  try {
    // 1. Get the tenant details
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, contactEmail: true }
    });

    if (!tenant || !tenant.contactEmail) {
      return { success: false, error: "Tenant has no contact email set" };
    }

    const email = tenant.contactEmail.toLowerCase().trim();

    // 2. Ensure the User exists
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: tenant.name,
      }
    });

    // 3. Ensure they have a Membership
    // Use findFirst + create to be safer than upsert with null clientId
    const existingMembership = await prisma.tenantMembership.findFirst({
      where: {
        tenantId: tenant.id,
        userId: user.id,
        role: "TENANT_ADMIN"
      }
    });

    if (!existingMembership) {
      await prisma.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: "TENANT_ADMIN",
          hasFullClientAccess: true,
        }
      });
    }

    revalidatePath("/master");
    return { success: true, message: `Access synced for ${email}` };
  } catch (error: any) {
    console.error("Failed to sync access:", error);
    return { success: false, error: `Failed to sync access: ${error.message || "Unknown error"}` };
  }
}

export async function updateTenantAction(tenantId: string, data: {
  name: string;
  contactEmail: string;
  contactPhone: string;
}) {
  const session = await auth();
  
  if (!session?.user?.isMasterAdmin) {
    throw new Error("Unauthorized: Master Admin only");
  }

  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: data.name,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
      }
    });

    revalidatePath("/master/tenants");
    return { success: true };
  } catch (error: any) {
    console.error("Failed to update tenant:", error);
    return { success: false, error: error.message || "Failed to update tenant" };
  }
}
