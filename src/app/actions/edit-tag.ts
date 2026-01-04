"use server";

import { getTenantPrisma } from "@/lib/tenant-guard";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

export async function upsertEditTag(data: {
  id?: string;
  name: string;
  description?: string;
  cost: number;
  specialistType?: string;
  active?: boolean;
}) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    const tPrisma = await getTenantPrisma();
    const { id, name, description, cost, specialistType, active = true } = data;

    if (id) {
      // Update
      await (tPrisma as any).editTag.update({
        where: { id },
        data: {
          name,
          description,
          cost,
          specialistType,
          active,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create
      await (tPrisma as any).editTag.create({
        data: {
          name,
          description,
          cost,
          specialistType,
          active,
        },
      });
    }

    revalidatePath("/tenant/edits");
    return { success: true };
  } catch (error: any) {
    console.error("UPSERT EDIT TAG ERROR:", error);
    return { success: false, error: error.message || "Failed to save edit tag" };
  }
}

export async function deleteEditTag(id: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    const tPrisma = await getTenantPrisma();

    // Check if tag is in use before deleting? 
    // For now, let's just delete or mark as inactive.
    await (tPrisma as any).editTag.delete({
      where: { id },
    });

    revalidatePath("/tenant/edits");
    return { success: true };
  } catch (error: any) {
    console.error("DELETE EDIT TAG ERROR:", error);
    return { success: false, error: error.message || "Failed to delete edit tag" };
  }
}

export async function getEditTags() {
  try {
    const tPrisma = await getTenantPrisma();

    const tags = await (tPrisma as any).editTag.findMany({
      orderBy: { name: 'asc' },
    });

    return { success: true, tags: JSON.parse(JSON.stringify(tags)) };
  } catch (error: any) {
    console.error("GET EDIT TAGS ERROR:", error);
    return { success: false, error: "Failed to load edit tags" };
  }
}

