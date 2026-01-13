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
  unlockBlockId?: string;
  lastUnlockedAt?: string;
};

function readAiSuiteMeta(metadata: any): AiSuiteMeta {
  const raw = (metadata as any)?.aiSuite;
  if (!raw || typeof raw !== "object") return {};
  return {
    unlocked: !!raw.unlocked,
    remainingEdits: typeof raw.remainingEdits === "number" ? raw.remainingEdits : undefined,
    unlockBlockId: typeof raw.unlockBlockId === "string" ? raw.unlockBlockId : undefined,
    lastUnlockedAt: typeof raw.lastUnlockedAt === "string" ? raw.lastUnlockedAt : undefined,
  };
}

function writeAiSuiteMeta(metadata: any, next: AiSuiteMeta) {
  const safe = metadata && typeof metadata === "object" ? { ...(metadata as any) } : {};
  (safe as any).aiSuite = {
    unlocked: !!next.unlocked,
    remainingEdits: next.remainingEdits ?? 0,
    unlockBlockId: next.unlockBlockId || null,
    lastUnlockedAt: next.lastUnlockedAt || null,
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
        editsIncluded: 15,
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

  const current = readAiSuiteMeta(gallery.metadata);

  // If already unlocked and still has quota, don't create a new block (prevents double-charge).
  // But do ensure the unlock EditRequest exists (in case a prior attempt failed silently).
  if (current.unlocked && (current.remainingEdits ?? 0) > 0 && current.unlockBlockId) {
    try {
      await ensureAiSuiteUnlockEditRequest({
        tenantId: gallery.tenantId,
        galleryId,
        clientId: gallery.clientId || null,
        requestedById: (session.user as any)?.id || null,
        unlockBlockId: current.unlockBlockId,
        mode: "backfill",
      });
    } catch (e) {
      console.error("[AI_SUITE_UNLOCK] Failed to ensure unlock EditRequest:", e);
    }

    revalidatePath(`/gallery/${galleryId}`);
    revalidatePath("/tenant/edits");
    return { success: true as const, aiSuite: current };
  }

  // New unlock (or repurchase after limit reached)
  const unlockBlockId = crypto.randomUUID();
  const next: AiSuiteMeta = {
    unlocked: true,
    remainingEdits: 15,
    unlockBlockId,
    lastUnlockedAt: new Date().toISOString(),
  };

  const nextMetadata = writeAiSuiteMeta(gallery.metadata, next);
  const tPrisma = await getTenantPrisma(gallery.tenantId);

  await (tPrisma as any).gallery.update({
    where: { id: galleryId },
    data: { metadata: nextMetadata },
  });

  // Create the invoiceable EditRequest immediately upon acceptance (idempotent per unlockBlockId).
  await ensureAiSuiteUnlockEditRequest({
    tenantId: gallery.tenantId,
    galleryId,
    clientId: gallery.clientId || null,
    requestedById: (session.user as any)?.id || null,
    unlockBlockId,
    mode: "accept",
  });

  revalidatePath(`/gallery/${galleryId}`);
  revalidatePath("/tenant/edits");

  return { success: true as const, aiSuite: next };
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

  return { success: true as const, outputUrl: result.outputUrl, aiSuite: nextAiSuite };
}


