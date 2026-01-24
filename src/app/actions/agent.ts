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
    const sessionUser = session.user as any;
    const role = String(sessionUser?.role || "");

    // Client accounts: always scope to their own clientId (ignore the passed arg)
    if (role === "CLIENT") {
      const myClientId = String(sessionUser?.clientId || "");
      if (!myClientId) return [];
      return await tPrisma.agent.findMany({
        where: { clientId: myClientId, deletedAt: null },
        orderBy: { name: "asc" },
      });
    }

    // Tenant/admin: allow fetch by explicit clientId; if omitted, return all for the tenant.
    const cid = String(clientId || "").trim();
    if (!cid) {
      return await tPrisma.agent.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
      });
    }
    return await tPrisma.agent.findMany({
      where: { clientId: cid, deletedAt: null },
      orderBy: { name: "asc" },
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
    const sessionUser = session.user as any;
    const role = String(sessionUser?.role || "");

    // PERMISSION CHECK
    if (role !== "TENANT_ADMIN" && role !== "ADMIN" && role !== "CLIENT") {
      return { success: false, error: "Permission Denied: Cannot manage agents." };
    }

    const tPrisma = await getTenantPrisma();
    const { id, clientId, ...rest } = data;

    if (id) {
      // Client can only edit agents in their own agency.
      if (role === "CLIENT") {
        const myClientId = String(sessionUser?.clientId || "");
        if (!myClientId) return { success: false, error: "Client account not found." };
        const existing = await tPrisma.agent.findUnique({ where: { id: String(id) }, select: { id: true, clientId: true } });
        if (!existing) return { success: false, error: "Not found" };
        if (String(existing.clientId) !== myClientId) return { success: false, error: "Permission Denied: Cannot edit this contact." };
      }

      const agent = await tPrisma.agent.update({
        where: { id },
        data: {
          ...rest,
          ...(role === "CLIENT"
            ? {
                // Prevent clients from reassigning to another agency
                client: { connect: { id: String(sessionUser?.clientId || "") } },
              }
            : clientId
              ? { client: { connect: { id: clientId } } }
              : {}),
          updatedAt: new Date(),
        }
      });
      return { success: true, agent };
    } else {
      // Client creates only within their agency; ignore provided clientId.
      if (role === "CLIENT") {
        const myClientId = String(sessionUser?.clientId || "");
        if (!myClientId) return { success: false, error: "Client account not found." };
        const agent = await tPrisma.agent.create({
          data: {
            ...rest,
            client: { connect: { id: myClientId } },
            status: rest.status || "ACTIVE",
          },
        });
        return { success: true, agent };
      }

      if (!clientId) return { success: false, error: "Client ID is required" };
      
      const agent = await tPrisma.agent.create({
        data: {
          ...rest,
          client: { connect: { id: clientId } },
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
    const sessionUser = session.user as any;
    const role = String(sessionUser?.role || "");

    // PERMISSION CHECK
    if (role !== "TENANT_ADMIN" && role !== "ADMIN" && role !== "CLIENT") {
      return { success: false, error: "Permission Denied: Cannot delete agents." };
    }

    const tPrisma = await getTenantPrisma();

    // Client can only delete agents in their own agency.
    if (role === "CLIENT") {
      const myClientId = String(sessionUser?.clientId || "");
      if (!myClientId) return { success: false, error: "Client account not found." };
      const existing = await tPrisma.agent.findUnique({ where: { id: String(id) }, select: { id: true, clientId: true } });
      if (!existing) return { success: false, error: "Not found" };
      if (String(existing.clientId) !== myClientId) return { success: false, error: "Permission Denied: Cannot delete this contact." };
    }

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
