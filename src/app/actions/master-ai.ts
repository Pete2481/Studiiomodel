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

type AiSuiteGlobalLimits = {
  defaultPackEdits: number; // default edits per pack
  minPackEdits: number; // minimum allowed pack size
  maxPackEdits: number; // maximum allowed pack size
  forcePackEdits?: number | null; // optional forced override
};

const DEFAULT_LIMITS: AiSuiteGlobalLimits = {
  defaultPackEdits: 15,
  minPackEdits: 5,
  maxPackEdits: 50,
  forcePackEdits: null,
};

function clampInt(n: any, min: number, max: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export async function getAiSuiteGlobalLimits() {
  const session = await auth();
  assertMaster(session);

  // Store AI Suite settings in a dedicated SystemConfig row to avoid schema changes.
  // We use `welcomeEmailBlocks` as a generic Json payload for this row.
  const cfg = await prisma.systemConfig.upsert({
    where: { id: "aiSuite" },
    update: {},
    create: {
      id: "aiSuite",
      welcomeEmailSubject: "AI_SUITE_CONFIG",
      welcomeEmailBlocks: DEFAULT_LIMITS as any,
    },
    select: { welcomeEmailBlocks: true },
  });

  const raw = (cfg?.welcomeEmailBlocks as any) || {};
  const minPackEdits = clampInt(raw.minPackEdits ?? DEFAULT_LIMITS.minPackEdits, 1, 999);
  const maxPackEdits = clampInt(raw.maxPackEdits ?? DEFAULT_LIMITS.maxPackEdits, 1, 999);
  const defaultPackEdits = clampInt(raw.defaultPackEdits ?? DEFAULT_LIMITS.defaultPackEdits, minPackEdits, maxPackEdits);
  const force =
    raw.forcePackEdits === null || raw.forcePackEdits === undefined
      ? null
      : clampInt(raw.forcePackEdits, minPackEdits, maxPackEdits);

  return {
    success: true as const,
    limits: { defaultPackEdits, minPackEdits, maxPackEdits, forcePackEdits: force },
  };
}

export async function setAiSuiteGlobalLimits(patch: Partial<AiSuiteGlobalLimits>) {
  const session = await auth();
  assertMaster(session);

  const currentRes = await getAiSuiteGlobalLimits();
  if (!currentRes.success) return { success: false as const, error: "Failed to load current limits" };
  const current = currentRes.limits;

  const nextMin = clampInt(patch.minPackEdits ?? current.minPackEdits, 1, 999);
  const nextMax = clampInt(patch.maxPackEdits ?? current.maxPackEdits, 1, 999);
  const minPackEdits = Math.min(nextMin, nextMax);
  const maxPackEdits = Math.max(nextMin, nextMax);
  const defaultPackEdits = clampInt(patch.defaultPackEdits ?? current.defaultPackEdits, minPackEdits, maxPackEdits);
  const forcePackEdits =
    patch.forcePackEdits === null
      ? null
      : patch.forcePackEdits === undefined
        ? (current.forcePackEdits ?? null)
        : clampInt(patch.forcePackEdits, minPackEdits, maxPackEdits);

  const payload: AiSuiteGlobalLimits = { defaultPackEdits, minPackEdits, maxPackEdits, forcePackEdits };

  await prisma.systemConfig.upsert({
    where: { id: "aiSuite" },
    update: { welcomeEmailBlocks: payload as any, welcomeEmailSubject: "AI_SUITE_CONFIG" },
    create: { id: "aiSuite", welcomeEmailSubject: "AI_SUITE_CONFIG", welcomeEmailBlocks: payload as any },
    select: { id: true },
  });

  revalidatePath("/master/tenants");
  return { success: true as const, limits: payload };
}

export async function setTenantAiSuitePackEditsOverride(tenantId: string, packEditsOverride: number | null) {
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
      packEditsOverride: packEditsOverride === null ? null : Math.max(1, Math.floor(Number(packEditsOverride))),
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


