"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";

export async function setMyPassword(input: { currentPassword?: string; newPassword: string }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    const userId = String(session.user.id);
    const currentPassword = String(input?.currentPassword || "");
    const newPassword = String(input?.newPassword || "");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) return { success: false, error: "User not found" };

    // If a password already exists, require current password.
    if (user.passwordHash) {
      if (!currentPassword) return { success: false, error: "Current password is required." };
      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        return { success: false, error: "Current password is incorrect." };
      }
    }

    const nextHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: nextHash, passwordUpdatedAt: new Date() },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: (error as any)?.message || "Failed to set password" };
  }
}

export async function adminSetUserPasswordByEmail(input: { email: string; newPassword: string }) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = String((session.user as any).role || "");
    if (role !== "TENANT_ADMIN" && role !== "ADMIN" && role !== "CLIENT") {
      return { success: false, error: "Permission denied" };
    }

    const tenantId = String((session.user as any).tenantId || "");
    if (!tenantId) return { success: false, error: "Tenant not found" };

    const email = String(input?.email || "").toLowerCase().trim();
    if (!email) return { success: false, error: "Email is required" };

    const newPassword = String(input?.newPassword || "");
    const nextHash = await hashPassword(newPassword);

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return { success: false, error: "No user exists for this email yet." };

    const membership = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId: user.id },
      select: { id: true },
    });
    if (!membership) {
      return { success: false, error: "This email does not have portal access in this studio yet." };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: nextHash, passwordUpdatedAt: new Date() },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to set password" };
  }
}

export async function enableAgentPortalAccess(input: { agentId: string }) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = String((session.user as any).role || "");
    if (role !== "TENANT_ADMIN" && role !== "ADMIN" && role !== "CLIENT") {
      return { success: false, error: "Permission denied" };
    }

    const tenantId = String((session.user as any).tenantId || "");
    if (!tenantId) return { success: false, error: "Tenant not found" };

    const agentId = String(input?.agentId || "").trim();
    if (!agentId) return { success: false, error: "Agent ID is required" };

    const agent = await prisma.agent.findFirst({
      where: { id: agentId, tenantId, deletedAt: null },
      select: { id: true, email: true, clientId: true },
    });
    if (!agent) return { success: false, error: "Agent not found" };

    // Client can only enable access for agents in their own agency.
    if (role === "CLIENT") {
      const myClientId = String((session.user as any).clientId || "");
      if (!myClientId) return { success: false, error: "Client account not found" };
      if (String(agent.clientId) !== myClientId) return { success: false, error: "Permission denied" };
    }

    const email = String(agent.email || "").toLowerCase().trim();
    if (!email) return { success: false, error: "Agent must have an email to enable portal access." };

    let user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      user = await prisma.user.create({ data: { email }, select: { id: true } });
    }

    // Ensure membership exists (role AGENT scoped to the agent's clientId)
    const existing = await prisma.tenantMembership.findFirst({
      where: {
        tenantId,
        userId: user.id,
        role: "AGENT",
        clientId: agent.clientId,
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.tenantMembership.create({
        data: {
          tenantId,
          userId: user.id,
          role: "AGENT" as any,
          clientId: agent.clientId,
          permissions: {},
        },
      });
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to enable agent portal access" };
  }
}

export async function setAgentPortalPassword(input: { agentId: string; newPassword: string }) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = String((session.user as any).role || "");
    if (role !== "TENANT_ADMIN" && role !== "ADMIN" && role !== "CLIENT") {
      return { success: false, error: "Permission denied" };
    }

    const tenantId = String((session.user as any).tenantId || "");
    if (!tenantId) return { success: false, error: "Tenant not found" };

    const agentId = String(input?.agentId || "").trim();
    if (!agentId) return { success: false, error: "Agent ID is required" };

    const agent = await prisma.agent.findFirst({
      where: { id: agentId, tenantId, deletedAt: null },
      select: { id: true, email: true, clientId: true },
    });
    if (!agent) return { success: false, error: "Agent not found" };

    // Client can only set passwords for agents in their own agency.
    if (role === "CLIENT") {
      const myClientId = String((session.user as any).clientId || "");
      if (!myClientId) return { success: false, error: "Client account not found" };
      if (String(agent.clientId) !== myClientId) return { success: false, error: "Permission denied" };
    }

    const email = String(agent.email || "").toLowerCase().trim();
    if (!email) return { success: false, error: "Agent must have an email to set a password." };

    // Ensure user + membership exist (auto-enables portal access)
    let user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      user = await prisma.user.create({ data: { email }, select: { id: true } });
    }

    const existingMembership = await prisma.tenantMembership.findFirst({
      where: {
        tenantId,
        userId: user.id,
        role: "AGENT",
        clientId: agent.clientId,
      },
      select: { id: true },
    });
    if (!existingMembership) {
      await prisma.tenantMembership.create({
        data: {
          tenantId,
          userId: user.id,
          role: "AGENT" as any,
          clientId: agent.clientId,
          permissions: {},
        },
      });
    }

    const nextHash = await hashPassword(String(input?.newPassword || ""));
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: nextHash, passwordUpdatedAt: new Date() },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to set agent password" };
  }
}
