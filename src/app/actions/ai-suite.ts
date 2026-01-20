"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { processImageWithAI } from "@/app/actions/ai-edit";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

type AiSuiteMeta = {
  unlocked?: boolean;
  remainingEdits?: number;
  remainingVideos?: number;
  unlockBlockId?: string;
  lastUnlockedAt?: string;
  unlockType?: "trial" | "paid";
};

type TenantAiSuiteSettings = {
  enabled: boolean;
  freeUnlocksRemaining: number;
  settings: any;
};

type AiSuiteGlobalLimits = {
  defaultPackEdits: number;
  minPackEdits: number;
  maxPackEdits: number;
  forcePackEdits: number | null;

  defaultPackVideos: number;
  minPackVideos: number;
  maxPackVideos: number;
  forcePackVideos: number | null;
};

function clampInt(n: any, min: number, max: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

async function getAiSuiteGlobalLimits(): Promise<AiSuiteGlobalLimits> {
  // Stored in a dedicated SystemConfig row (`id="aiSuite"`) using the Json field `welcomeEmailBlocks`.
  const cfg = await (prisma as any).systemConfig.upsert({
    where: { id: "aiSuite" },
    update: {},
    create: {
      id: "aiSuite",
      welcomeEmailSubject: "AI_SUITE_CONFIG",
      welcomeEmailBlocks: {
        defaultPackEdits: 15,
        minPackEdits: 5,
        maxPackEdits: 50,
        forcePackEdits: null,
        // New: AI Social Video quota per unlock pack
        defaultPackVideos: 3,
        minPackVideos: 1,
        maxPackVideos: 20,
        forcePackVideos: null,
      } as any,
    },
    select: { welcomeEmailBlocks: true },
  });

  const raw = (cfg?.welcomeEmailBlocks as any) || {};
  const minPackEdits = clampInt(raw.minPackEdits ?? 5, 1, 999);
  const maxPackEdits = clampInt(raw.maxPackEdits ?? 50, 1, 999);
  const defaultPackEdits = clampInt(raw.defaultPackEdits ?? 15, minPackEdits, maxPackEdits);
  const forcePackEdits =
    raw.forcePackEdits === null || raw.forcePackEdits === undefined
      ? null
      : clampInt(raw.forcePackEdits, minPackEdits, maxPackEdits);

  const minPackVideos = clampInt(raw.minPackVideos ?? 1, 1, 999);
  const maxPackVideos = clampInt(raw.maxPackVideos ?? 20, 1, 999);
  const defaultPackVideos = clampInt(raw.defaultPackVideos ?? 3, minPackVideos, maxPackVideos);
  const forcePackVideos =
    raw.forcePackVideos === null || raw.forcePackVideos === undefined
      ? null
      : clampInt(raw.forcePackVideos, minPackVideos, maxPackVideos);

  return {
    defaultPackEdits,
    minPackEdits,
    maxPackEdits,
    forcePackEdits,
    defaultPackVideos,
    minPackVideos,
    maxPackVideos,
    forcePackVideos,
  };
}

async function resolvePackEditsForTenant(tenantId: string, tenantSettings: any) {
  const global = await getAiSuiteGlobalLimits();
  const tenantOverrideRaw = (tenantSettings as any)?.aiSuite?.packEditsOverride;
  const tenantOverride =
    tenantOverrideRaw === null || tenantOverrideRaw === undefined
      ? null
      : clampInt(tenantOverrideRaw, global.minPackEdits, global.maxPackEdits);

  const packEdits =
    global.forcePackEdits !== null
      ? global.forcePackEdits
      : tenantOverride !== null
        ? tenantOverride
        : global.defaultPackEdits;

  return { packEdits, global, tenantOverride };
}

async function resolvePackVideosForTenant(tenantId: string, tenantSettings: any) {
  const global = await getAiSuiteGlobalLimits();
  const tenantOverrideRaw = (tenantSettings as any)?.aiSuite?.packVideosOverride;
  const tenantOverride =
    tenantOverrideRaw === null || tenantOverrideRaw === undefined
      ? null
      : clampInt(tenantOverrideRaw, global.minPackVideos, global.maxPackVideos);

  const packVideos =
    global.forcePackVideos !== null
      ? global.forcePackVideos
      : tenantOverride !== null
        ? tenantOverride
        : global.defaultPackVideos;

  return { packVideos, global, tenantOverride };
}

async function getTenantAiSuiteSettings(tenantId: string): Promise<TenantAiSuiteSettings> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const settings = (t?.settings as any) || {};
  const enabledRaw = settings?.aiSuite?.enabled;
  // Default OFF for safety until platform billing is live (Master can toggle ON per tenant)
  const enabled = typeof enabledRaw === "boolean" ? enabledRaw : false;

  const freeRaw = settings?.aiSuite?.freeUnlocksRemaining;
  // Default 1 if missing (trial pack)
  const freeUnlocksRemaining = Math.max(0, typeof freeRaw === "number" ? freeRaw : (freeRaw === undefined ? 1 : 0));
  return { enabled, freeUnlocksRemaining, settings };
}

async function incrementTenantAiSuiteUsage(tenantId: string, patch?: { model?: string; estimatedUsdDelta?: number }) {
  try {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (t?.settings as any) || {};
    const aiSuite = (settings.aiSuite as any) || {};
    const usage = (aiSuite.usage as any) || {};
    const totalRuns = (typeof usage.totalRuns === "number" ? usage.totalRuns : 0) + 1;
    const estimatedUsdTotal =
      (typeof usage.estimatedUsdTotal === "number" ? usage.estimatedUsdTotal : 0) +
      (typeof patch?.estimatedUsdDelta === "number" ? patch.estimatedUsdDelta : 0);

    const next = {
      ...settings,
      aiSuite: {
        ...aiSuite,
        usage: {
          ...usage,
          totalRuns,
          estimatedUsdTotal,
          lastRunAt: new Date().toISOString(),
          lastModel: patch?.model || usage.lastModel || null,
        },
      },
    };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: next },
    });
  } catch (e) {
    console.error("[AI_SUITE_USAGE] Failed to increment usage:", e);
  }
}

function readAiSuiteMeta(metadata: any): AiSuiteMeta {
  const raw = (metadata as any)?.aiSuite;
  if (!raw || typeof raw !== "object") return {};
  const unlockTypeRaw = (raw as any).unlockType;
  const unlockType: AiSuiteMeta["unlockType"] =
    unlockTypeRaw === "trial" || unlockTypeRaw === "paid" ? unlockTypeRaw : undefined;
  return {
    unlocked: !!raw.unlocked,
    remainingEdits: typeof raw.remainingEdits === "number" ? raw.remainingEdits : undefined,
    remainingVideos: typeof raw.remainingVideos === "number" ? raw.remainingVideos : undefined,
    unlockBlockId: typeof raw.unlockBlockId === "string" ? raw.unlockBlockId : undefined,
    lastUnlockedAt: typeof raw.lastUnlockedAt === "string" ? raw.lastUnlockedAt : undefined,
    unlockType,
  };
}

function writeAiSuiteMeta(metadata: any, next: AiSuiteMeta) {
  const safe = metadata && typeof metadata === "object" ? { ...(metadata as any) } : {};
  (safe as any).aiSuite = {
    unlocked: !!next.unlocked,
    remainingEdits: next.remainingEdits ?? 0,
    remainingVideos: next.remainingVideos ?? 0,
    unlockBlockId: next.unlockBlockId || null,
    lastUnlockedAt: next.lastUnlockedAt || null,
    unlockType: next.unlockType || null,
  };
  return safe;
}

async function ensureAiSuiteUnlockEditRequest(args: {
  tenantId: string;
  galleryId: string;
  clientId: string | null;
  requestedById: string | null;
  unlockBlockId: string;
  mode: "accept" | "backfill";
  editsIncluded?: number;
}) {
  const { tenantId, galleryId, clientId, requestedById, unlockBlockId, mode } = args;
  const tPrisma = await getTenantPrisma(tenantId);

  const existing = await (tPrisma as any).editRequest.findFirst({
    where: {
      galleryId,
      metadata: { path: ["type"], equals: "aiSuiteUnlock" },
      AND: [{ metadata: { path: ["unlockBlockId"], equals: unlockBlockId } }],
    },
    select: { id: true },
  });

  if (existing) return { created: false as const, id: String(existing.id) };

  const tag = await (tPrisma as any).editTag.upsert({
    where: { tenantId_name: { tenantId, name: "AI Suite Unlock" } },
    create: {
      tenantId,
      name: "AI Suite Unlock",
      description: "Unlock premium AI Suite for this gallery (15 edits).",
      cost: new Prisma.Decimal(50),
      active: true,
    },
    update: {
      active: true,
      cost: new Prisma.Decimal(50),
    },
    select: { id: true },
  });

  const note =
    mode === "accept"
      ? "AI Suite unlocked for this gallery ($50 one-off). Includes 15 AI edits."
      : "AI Suite unlock charge recorded (backfilled). Includes 15 AI edits.";
  const editsIncluded = Math.max(1, Math.floor(Number((args as any)?.editsIncluded || 15)));

  const created = await (tPrisma as any).editRequest.create({
    data: {
      // Use relation connects (EditRequest create expects relations, not raw FK scalars)
      gallery: { connect: { id: galleryId } },
      client: clientId ? { connect: { id: clientId } } : undefined,
      requestedBy: requestedById ? { connect: { id: requestedById } } : undefined,
      title: "AI Suite Unlock ($50)",
      note,
      fileUrl: null,
      thumbnailUrl: null,
      tags: ["AI_SUITE_UNLOCK"],
      status: "NEW",
      metadata: {
        type: "aiSuiteUnlock",
        unlockBlockId,
        amount: 50,
        editsIncluded,
        recordedMode: mode,
        acceptedAt: new Date().toISOString(),
      },
      isAi: true,
      selectedTags: {
        create: {
          editTagId: tag.id,
          costAtTime: new Prisma.Decimal(50),
        },
      },
    },
    select: { id: true },
  });

  return { created: true as const, id: String(created.id) };
}

export async function unlockAiSuiteForGallery(galleryId: string) {
  const session = await auth();
  if (!session?.user) return { success: false as const, error: "Unauthorized" };

  const gallery = await prisma.gallery.findFirst({
    where: { id: galleryId, deletedAt: null },
    select: { id: true, tenantId: true, clientId: true, status: true, metadata: true },
  });
  if (!gallery) return { success: false as const, error: "Gallery not found" };

  // Basic access guard: user must belong to the tenant that owns this gallery.
  const userTenantId = (session.user as any)?.tenantId;
  if (!userTenantId || userTenantId !== gallery.tenantId) {
    return { success: false as const, error: "Unauthorized" };
  }

  const tenantAi = await getTenantAiSuiteSettings(gallery.tenantId);
  const { packEdits } = await resolvePackEditsForTenant(gallery.tenantId, tenantAi.settings);
  const { packVideos } = await resolvePackVideosForTenant(gallery.tenantId, tenantAi.settings);

  const current = readAiSuiteMeta(gallery.metadata);

  // If already unlocked and still has quota, don't create a new block (prevents double-charge).
  // But do ensure the unlock EditRequest exists (in case a prior attempt failed silently).
  if (
    current.unlocked &&
    (current.remainingEdits ?? 0) > 0 &&
    (current.remainingVideos ?? 0) > 0 &&
    current.unlockBlockId
  ) {
    try {
      const tenantAi = await getTenantAiSuiteSettings(gallery.tenantId);
      const { packEdits } = await resolvePackEditsForTenant(gallery.tenantId, tenantAi.settings);
      await ensureAiSuiteUnlockEditRequest({
        tenantId: gallery.tenantId,
        galleryId,
        clientId: gallery.clientId || null,
        requestedById: (session.user as any)?.id || null,
        unlockBlockId: current.unlockBlockId,
        mode: "backfill",
        editsIncluded: packEdits,
      });
    } catch (e) {
      console.error("[AI_SUITE_UNLOCK] Failed to ensure unlock EditRequest:", e);
    }

    revalidatePath(`/gallery/${galleryId}`);
    revalidatePath("/tenant/edits");
    return { success: true as const, aiSuite: current };
  }

  // Free pack path (platform-funded): consume tenant free unlock if available, and DO NOT create an invoiceable EditRequest.
  const canUseFreePack = tenantAi.freeUnlocksRemaining > 0;

  // If paid AI is disabled for this tenant, still allow FREE TRIAL unlocks (if a pack is available),
  // but block paid unlocks.
  if (!tenantAi.enabled && !canUseFreePack) {
    return { success: false as const, error: "AI_DISABLED" };
  }

  // New unlock (or repurchase after limit reached)
  const unlockBlockId = crypto.randomUUID();
  const next: AiSuiteMeta = {
    unlocked: true,
    remainingEdits: packEdits,
    remainingVideos: packVideos,
    unlockBlockId,
    lastUnlockedAt: new Date().toISOString(),
    unlockType: canUseFreePack ? "trial" : "paid",
  };

  const nextMetadata = writeAiSuiteMeta(gallery.metadata, next);
  const tPrisma = await getTenantPrisma(gallery.tenantId);

  await (tPrisma as any).gallery.update({
    where: { id: galleryId },
    data: { metadata: nextMetadata },
  });

  if (canUseFreePack) {
    // Consume 1 free unlock (best-effort, tenant-scoped settings).
    try {
      const nextSettings = {
        ...(tenantAi.settings || {}),
        aiSuite: {
          ...((tenantAi.settings as any)?.aiSuite || {}),
          freeUnlocksRemaining: Math.max(0, tenantAi.freeUnlocksRemaining - 1),
          lastFreeUnlockUsedAt: new Date().toISOString(),
        },
      };
      await prisma.tenant.update({
        where: { id: gallery.tenantId },
        data: { settings: nextSettings },
      });
    } catch (e) {
      console.error("[AI_SUITE_TRIAL] Failed to decrement free unlock allowance:", e);
    }
  } else {
    // Paid path: Create the invoiceable EditRequest immediately upon acceptance (idempotent per unlockBlockId).
    await ensureAiSuiteUnlockEditRequest({
      tenantId: gallery.tenantId,
      galleryId,
      clientId: gallery.clientId || null,
      requestedById: (session.user as any)?.id || null,
      unlockBlockId,
      mode: "accept",
      editsIncluded: packEdits,
    });
  }

  revalidatePath(`/gallery/${galleryId}`);
  revalidatePath("/tenant/edits");

  return { success: true as const, aiSuite: next, usedFreePack: canUseFreePack };
}

export async function runAiSuiteRoomEditor(args: {
  galleryId: string;
  assetUrl: string;
  prompt: string;
  dbxPath?: string;
}) {
  const session = await auth();
  if (!session?.user) return { success: false as const, error: "Unauthorized" };

  const { galleryId, assetUrl, prompt, dbxPath } = args;
  const gallery = await prisma.gallery.findFirst({
    where: { id: galleryId, deletedAt: null },
    select: { id: true, tenantId: true, clientId: true, status: true, metadata: true },
  });
  if (!gallery) return { success: false as const, error: "Gallery not found" };

  const userTenantId = (session.user as any)?.tenantId;
  if (!userTenantId || userTenantId !== gallery.tenantId) {
    return { success: false as const, error: "Unauthorized" };
  }

  const aiSuite = readAiSuiteMeta(gallery.metadata);
  const remaining = aiSuite.remainingEdits ?? 0;
  const unlocked = !!aiSuite.unlocked;

  if (!unlocked) {
    return { success: false as const, error: "AI_SUITE_LOCKED", aiSuite };
  }
  if (remaining <= 0) {
    return { success: false as const, error: "AI_SUITE_LIMIT", aiSuite };
  }

  const unlockBlockId = aiSuite.unlockBlockId;
  if (!unlockBlockId) {
    return { success: false as const, error: "AI_SUITE_LOCKED", aiSuite };
  }

  const tenantAi = await getTenantAiSuiteSettings(gallery.tenantId);
  // If paid AI is disabled, still allow running AI Suite for galleries unlocked via FREE TRIAL packs.
  if (!tenantAi.enabled && aiSuite.unlockType !== "trial") {
    return { success: false as const, error: "AI_DISABLED", aiSuite };
  }

  // Decrement quota (best-effort). This counts each AI run attempt.
  const nextAiSuite: AiSuiteMeta = {
    ...aiSuite,
    remainingEdits: remaining - 1,
  };

  await prisma.gallery.update({
    where: { id: galleryId },
    data: { metadata: writeAiSuiteMeta(gallery.metadata, nextAiSuite) },
  });

  // Backfill safety: ensure the $50 unlock EditRequest exists for this unlock block.
  // This should normally be created at unlock-accept time in `unlockAiSuiteForGallery()`,
  // but older galleries/unlocks may be missing the billing record.
  try {
    await ensureAiSuiteUnlockEditRequest({
      tenantId: gallery.tenantId,
      galleryId,
      clientId: gallery.clientId || null,
      requestedById: (session.user as any)?.id || null,
      unlockBlockId,
      mode: "backfill",
    });
  } catch (e) {
    // Don't block AI run if the billing record fails; admins can reconcile later.
    console.error("[AI_SUITE_BILLING] Failed to ensure unlock charge EditRequest:", e);
  }

  const result = await processImageWithAI(assetUrl, "room_editor" as any, prompt, dbxPath, gallery.tenantId);
  if (!result.success) {
    return { success: false as const, error: result.error || "AI processing failed", aiSuite: nextAiSuite };
  }

  // Usage tracking (tenant scoped): best-effort counters for Master reporting.
  // NOTE: Replicate doesn't reliably return $ cost per prediction in API responses, so we track counts + estimates.
  await incrementTenantAiSuiteUsage(gallery.tenantId, {
    model: "google/nano-banana",
    estimatedUsdDelta: 0.35,
  });

  return { success: true as const, outputUrl: String(result.outputUrl), aiSuite: nextAiSuite };
}

export async function runAiSuiteTask(args: {
  galleryId: string;
  assetUrl: string;
  taskType: "day_to_dusk" | "sky_replacement" | "object_removal" | "virtual_staging";
  prompt?: string;
  dbxPath?: string;
}) {
  const session = await auth();
  if (!session) return { success: false as const, error: "Unauthorized" };

  const { galleryId, assetUrl, taskType, prompt, dbxPath } = args;
  const gallery = await prisma.gallery.findUnique({
    where: { id: galleryId },
    select: { id: true, tenantId: true, clientId: true, metadata: true },
  });
  if (!gallery) return { success: false as const, error: "Gallery not found" };

  const aiSuite = readAiSuiteMeta(gallery.metadata);
  const remaining = aiSuite.remainingEdits ?? 0;
  const unlocked = !!aiSuite.unlocked;

  if (!unlocked) return { success: false as const, error: "AI_SUITE_LOCKED", aiSuite };
  if (remaining <= 0) return { success: false as const, error: "AI_SUITE_LIMIT", aiSuite };

  const unlockBlockId = aiSuite.unlockBlockId;
  if (!unlockBlockId) return { success: false as const, error: "AI_SUITE_LOCKED", aiSuite };

  const tenantAi = await getTenantAiSuiteSettings(gallery.tenantId);
  if (!tenantAi.enabled && aiSuite.unlockType !== "trial") {
    return { success: false as const, error: "AI_DISABLED", aiSuite };
  }

  const nextAiSuite: AiSuiteMeta = { ...aiSuite, remainingEdits: remaining - 1 };
  await prisma.gallery.update({
    where: { id: galleryId },
    data: { metadata: writeAiSuiteMeta(gallery.metadata, nextAiSuite) },
  });

  try {
    await ensureAiSuiteUnlockEditRequest({
      tenantId: gallery.tenantId,
      galleryId,
      clientId: gallery.clientId || null,
      requestedById: (session.user as any)?.id || null,
      unlockBlockId,
      mode: "backfill",
    });
  } catch (e) {
    console.error("[AI_SUITE_BILLING] Failed to ensure unlock charge EditRequest:", e);
  }

  const result = await processImageWithAI(assetUrl, taskType as any, prompt, dbxPath, gallery.tenantId);
  if (!result.success) {
    return { success: false as const, error: result.error || "AI processing failed", aiSuite: nextAiSuite };
  }

  await incrementTenantAiSuiteUsage(gallery.tenantId, {
    model: "reve/edit-fast",
    estimatedUsdDelta: 0.20,
  });

  return { success: true as const, outputUrl: String(result.outputUrl), aiSuite: nextAiSuite };
}


