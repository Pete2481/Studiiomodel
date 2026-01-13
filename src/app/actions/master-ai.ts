"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function assertMaster(session: any) {
  if (!session?.user?.isMasterAdmin) {
    throw new Error("Unauthorized");
  }
}

export async function setTenantAiSuiteEnabled(tenantId: string, enabled: boolean) {
  const session = await auth();
  assertMaster(session);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, settings: true },
  });
  if (!tenant) return { success: false as const, error: "Tenant not found" };

  const settings = (tenant.settings as any) || {};
  const next = {
    ...settings,
    aiSuite: {
      ...(settings.aiSuite || {}),
      enabled: !!enabled,
      updatedAt: new Date().toISOString(),
    },
  };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: next },
  });

  revalidatePath("/master/tenants");
  return { success: true as const };
}

export async function grantTenantAiSuiteFreePack(tenantId: string, packsToAdd: number = 1) {
  const session = await auth();
  assertMaster(session);

  const add = Math.max(0, Math.floor(Number(packsToAdd) || 0));
  if (add <= 0) return { success: false as const, error: "Invalid pack count" };

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, settings: true },
  });
  if (!tenant) return { success: false as const, error: "Tenant not found" };

  const settings = (tenant.settings as any) || {};
  const current = settings?.aiSuite?.freeUnlocksRemaining;
  const n = typeof current === "number" ? current : 0;

  const next = {
    ...settings,
    aiSuite: {
      ...(settings.aiSuite || {}),
      freeUnlocksRemaining: n + add,
      updatedAt: new Date().toISOString(),
    },
  };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: next },
  });

  revalidatePath("/master/tenants");
  return { success: true as const, freeUnlocksRemaining: n + add };
}

export async function setAiSuiteEnabledForAllTenants(enabled: boolean) {
  const session = await auth();
  assertMaster(session);

  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true, settings: true },
  });

  // Best-effort: update sequentially (keeps JSON patch simple and avoids DB-specific JSON update syntax)
  for (const t of tenants) {
    const settings = (t.settings as any) || {};
    const next = {
      ...settings,
      aiSuite: {
        ...(settings.aiSuite || {}),
        enabled: !!enabled,
        updatedAt: new Date().toISOString(),
      },
    };
    await prisma.tenant.update({
      where: { id: t.id },
      data: { settings: next },
    });
  }

  revalidatePath("/master/tenants");
  return { success: true as const, updated: tenants.length };
}

/**
 * Master helper: ensure a tenant has at least 1 free trial pack.
 * IMPORTANT: This does NOT enable paid AI. Paid unlocks remain controlled by `aiSuite.enabled`.
 */
export async function activateTenantAiSuiteFreeTrial(tenantId: string) {
  const session = await auth();
  assertMaster(session);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, settings: true },
  });
  if (!tenant) return { success: false as const, error: "Tenant not found" };

  const settings = (tenant.settings as any) || {};
  const aiSuite = (settings.aiSuite as any) || {};
  const currentFree = aiSuite?.freeUnlocksRemaining;
  const freeUnlocksRemaining = typeof currentFree === "number" ? currentFree : 0;

  const next = {
    ...settings,
    aiSuite: {
      ...aiSuite,
      enabled: typeof aiSuite?.enabled === "boolean" ? aiSuite.enabled : false,
      freeUnlocksRemaining: Math.max(1, freeUnlocksRemaining),
      trialActivatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: next },
  });

  revalidatePath("/master/tenants");
  return { success: true as const, freeUnlocksRemaining: Math.max(1, freeUnlocksRemaining) };
}


