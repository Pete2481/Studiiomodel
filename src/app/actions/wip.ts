"use server";

import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { permissionService } from "@/lib/permission-service";
import { revalidatePath } from "next/cache";

type WipStatus = "COMPLETED" | "PENDING";

function clampStr(v: any, maxLen: number) {
  const s = String(v ?? "").trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function uniqStrings(items: any[], maxItems: number, maxLen: number) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items || []) {
    const s = clampStr(raw, maxLen);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

export async function updateBookingWip(input: {
  bookingId: string;
  status: WipStatus;
  pendingItems?: string[];
  note?: string;
}) {
  const session = await auth();
  const tenantId = session?.user?.tenantId as string | undefined;
  if (!session?.user || !tenantId) return { success: false, error: "Unauthorized" };

  const user = session.user as any;
  const role = String(user?.role || "");
  if (role === "CLIENT" || role === "AGENT") return { success: false, error: "Permission denied" };
  if (!permissionService.can(user, "viewBookings")) return { success: false, error: "Permission denied" };

  const bookingId = clampStr(input?.bookingId, 64);
  const status = String(input?.status || "").toUpperCase() as WipStatus;
  if (!bookingId) return { success: false, error: "Missing booking id" };
  if (status !== "COMPLETED" && status !== "PENDING") return { success: false, error: "Invalid status" };

  const pendingItems = status === "COMPLETED" ? [] : uniqStrings(input?.pendingItems || [], 12, 40);
  const note = status === "COMPLETED" ? "" : clampStr(input?.note, 240);

  const tPrisma = (await getTenantPrisma()) as any;

  const existing = await tPrisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null, tenantId },
    select: { id: true, endAt: true, metadata: true, isPlaceholder: true },
  });
  if (!existing || existing.isPlaceholder) return { success: false, error: "Not found" };

  // Only allow WIP updates for past jobs.
  const endAt = existing.endAt instanceof Date ? existing.endAt : new Date(existing.endAt);
  if (isNaN(endAt.getTime()) || endAt.getTime() >= Date.now()) {
    return { success: false, error: "WIP can only be updated after the job date has passed." };
  }

  const prevMeta = (existing.metadata && typeof existing.metadata === "object") ? existing.metadata : {};
  const nextMeta = {
    ...(prevMeta as any),
    wip: {
      status,
      pendingItems,
      note: note || undefined,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.id ? String(user.id) : undefined,
    },
  };

  await tPrisma.booking.update({
    where: { id: bookingId },
    data: { metadata: nextMeta },
  });

  revalidatePath("/tenant/wip");
  return { success: true };
}

