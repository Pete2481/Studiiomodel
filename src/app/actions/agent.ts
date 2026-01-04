"use server";

import { getTenantPrisma } from "@/lib/tenant-guard";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { permissionService } from "@/lib/permission-service";

export async function getAgentsByClient(clientId: string) {
  try {
    const session = await auth();
    if (!session) return [];

    const tPrisma = await getTenantPrisma();
    return await tPrisma.agent.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { name: 'asc' }
    });
  } catch (error) {
    console.error("GET AGENTS ERROR:", error);
    return [];
  }
}

export async function upsertAgent(data: any) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN" && session.user.role !== "CLIENT") {
      return { success: false, error: "Permission Denied: Cannot manage agents." };
    }

    const tPrisma = await getTenantPrisma();
    const { id, ...rest } = data;

    if (id) {
      const agent = await tPrisma.agent.update({
        where: { id },
        data: {
          ...rest,
          updatedAt: new Date(),
        }
      });
      return { success: true, agent };
    } else {
      const agent = await tPrisma.agent.create({
        data: {
          ...rest,
          status: rest.status || "ACTIVE",
        }
      });
      return { success: true, agent };
    }
  } catch (error: any) {
    console.error("UPSERT AGENT ERROR:", error);
    if (error.code === 'P2002') {
      return { success: false, error: "An agent with this email already exists in this studio." };
    }
    return { success: false, error: error.message || "Failed to save agent" };
  }
}

export async function deleteAgent(id: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN" && session.user.role !== "CLIENT") {
      return { success: false, error: "Permission Denied: Cannot delete agents." };
    }

    const tPrisma = await getTenantPrisma();
    await tPrisma.agent.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    return { success: true };
  } catch (error: any) {
    console.error("DELETE AGENT ERROR:", error);
    return { success: false, error: error.message || "Failed to delete agent" };
  }
}
