"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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

