"use server";

import { getTenantPrisma, enforceSubscription } from "@/lib/tenant-guard";
import { revalidatePath, revalidateTag } from "next/cache";
import { bookingService } from "@/server/services/booking.service";
import { auth } from "@/auth";
import { permissionService } from "@/lib/permission-service";
import { tenantTag } from "@/lib/server-cache";
import { notificationService } from "@/server/services/notification.service";

function toIso(d: any) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function toCalendarBooking(b: any) {
  if (!b) return null;
  const s = toIso(b.startAt);
  const e = toIso(b.endAt);
  if (!s || !e) return null;

  let status = String(b.status || "REQUESTED").toLowerCase();
  if (status === "approved") status = "confirmed";

  return {
    id: String(b.id),
    title: String(b.title || (b.isPlaceholder ? `${b.slotType} SLOT` : "Booking")),
    startAt: s,
    endAt: e,
    status,
    propertyStatus: b.propertyStatus || "",
    metadata: (b.metadata && typeof b.metadata === "object") ? b.metadata : {},
    clientId: b.clientId ? String(b.clientId) : null,
    agentId: b.agentId ? String(b.agentId) : null,
    client: !b.client ? null : { name: String(b.client.name || ""), businessName: String(b.client.businessName || "") },
    property: !b.property ? { name: "TBC" } : { name: String(b.property.name || "TBC") },
    internalNotes: String(b.internalNotes || ""),
    clientNotes: String(b.clientNotes || ""),
    isPlaceholder: !!b.isPlaceholder,
    slotType: (b as any).slotType || null,
    services: (b.services || []).map((s: any) => ({ serviceId: String(s.serviceId), name: String(s.service?.name || "Unknown Service") })),
    assignments: (b.assignments || []).map((a: any) => ({
      teamMemberId: String(a.teamMemberId),
      teamMember: { displayName: String(a.teamMember?.displayName || "To assign"), avatarUrl: a.teamMember?.avatarUrl || null },
    })),
  };
}

export async function upsertBooking(data: any) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId as string | undefined;
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    const sessionUser = session.user as any;
    const role = String(sessionUser?.role || "");

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "viewBookings")) {
      return { success: false, error: "Permission Denied: Cannot manage bookings." };
    }

    // SECURITY: Prevent API-level bypass of the paywall
    await enforceSubscription(tenantId);

    const startAt = data.startAt ? new Date(data.startAt) : new Date(`${data.date}T${data.startTime}:00`);
    const endAtRaw = data.endAt ? new Date(data.endAt) : new Date(startAt.getTime() + (parseFloat(data.duration || "1") * 60 * 60 * 1000));

    if (isNaN(startAt.getTime()) || isNaN(endAtRaw.getTime())) {
      return { success: false, error: "Invalid start or end date format." };
    }

    // CLIENT portal guards: tenant-only features and fixed-duration behavior.
    let safeData = { ...data };
    let endAt = endAtRaw;
    if (role === "CLIENT") {
      // No block outs from client portal.
      const requestedStatus = String(safeData.status || "REQUESTED").toUpperCase();
      if (requestedStatus === "BLOCKED" || requestedStatus === "BLOCKOUT") {
        return { success: false, error: "Clients cannot create block outs." };
      }

      // No OTC from client portal.
      safeData.clientMode = "existing";
      safeData.otcName = undefined;
      safeData.otcEmail = undefined;
      safeData.otcPhone = undefined;
      safeData.otcNotes = undefined;

      // Force the clientId to their own (cannot select another client).
      if (!sessionUser.clientId) return { success: false, error: "Missing client context." };
      safeData.clientId = String(sessionUser.clientId);

      // Validate agent/contact (must belong to this client if set).
      if (safeData.agentId) {
        const tPrisma = await getTenantPrisma();
        const agent = await (tPrisma as any).agent.findUnique({
          where: { id: String(safeData.agentId) },
          select: { id: true, clientId: true },
        });
        if (!agent || String(agent.clientId) !== String(sessionUser.clientId)) {
          return { success: false, error: "Invalid contact selected." };
        }
      }

      // Force status to REQUESTED (client cannot approve/decline/cancel here).
      safeData.status = "REQUESTED";

      // Client duration is fixed to 60 minutes.
      endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

      // Client cannot assign team members.
      safeData.teamMemberIds = [];
    }

    const booking = await bookingService.upsertBooking(tenantId, {
      ...safeData,
      startAt,
      endAt
    });

    revalidatePath("/tenant/bookings");
    revalidatePath("/tenant/calendar");
    revalidatePath("/");

    // IMPORTANT: invalidate Next Data Cache entries (unstable_cache) used by calendar endpoints.
    revalidateTag(tenantTag(tenantId));
    revalidateTag(`tenant:${tenantId}:calendar`);
    
    // Return a calendar-ready payload so the UI can update immediately without waiting on range refetch.
    const calendarBooking = toCalendarBooking(booking);
    return { success: true, bookingId: String(booking.id), booking: calendarBooking };
  } catch (error: any) {
    console.error("UPSERT ERROR:", error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}

export async function deleteBooking(id: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "viewBookings")) {
      return { success: false, error: "Permission Denied: Cannot delete bookings." };
    }

    const tPrisma = await getTenantPrisma();

    // SECURITY: If client portal, ensure the booking belongs to this client.
    const sessionUser = session.user as any;
    const role = String(sessionUser?.role || "");
    if (role === "CLIENT") {
      const clientId = String(sessionUser?.clientId || "");
      if (!clientId) return { success: false, error: "Missing client context." };
      const existing = await (tPrisma as any).booking.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, clientId: true },
      });
      if (!existing) return { success: false, error: "Not found." };
      if (String(existing.clientId || "") !== clientId) return { success: false, error: "Permission Denied" };
    }

    // Soft delete (automatically handled by tPrisma where)
    await tPrisma.booking.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: "CANCELLED"
      }
    });

    revalidatePath("/tenant/bookings");
    revalidatePath("/tenant/calendar");
    revalidatePath("/");

    // IMPORTANT: invalidate Next Data Cache entries (unstable_cache) used by calendar endpoints.
    const tenantId = String((session as any)?.user?.tenantId || "");
    if (tenantId) {
      revalidateTag(tenantTag(tenantId));
      revalidateTag(`tenant:${tenantId}:calendar`);
    }
    
    return { success: true };
  } catch (error: any) {
    console.error("DELETE ERROR:", error);
    return { success: false, error: error.message || "Failed to delete booking." };
  }
}

export async function cancelBookingAsClient(bookingId: string) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId as string | undefined;
    if (!session?.user || !tenantId) return { success: false, error: "Unauthorized" } as const;

    const sessionUser = session.user as any;
    const role = String(sessionUser?.role || "");
    if (role !== "CLIENT") return { success: false, error: "Permission Denied" } as const;

    const clientId = String(sessionUser?.clientId || "");
    if (!clientId) return { success: false, error: "Missing client context." } as const;

    const tPrisma = (await getTenantPrisma()) as any;

    const booking = await tPrisma.booking.findFirst({
      where: { id: String(bookingId || ""), deletedAt: null },
      select: {
        id: true,
        clientId: true,
        tenant: { select: { contactEmail: true } },
        assignments: { select: { teamMember: { select: { email: true } } } },
      },
    });

    if (!booking) return { success: false, error: "Not found." } as const;
    if (String(booking.clientId || "") !== clientId) return { success: false, error: "Permission Denied" } as const;

    // Email tenant + assigned team
    const toOverride: string[] = [];
    const add = (e?: string | null) => {
      const v = String(e || "").trim();
      if (!v) return;
      if (!toOverride.includes(v)) toOverride.push(v);
    };
    add(booking?.tenant?.contactEmail);
    for (const a of booking?.assignments || []) add(a?.teamMember?.email);

    if (toOverride.length) {
      await notificationService.sendBookingEmail({
        bookingId: String(booking.id),
        type: "BOOKING_CANCELLED",
        toOverride,
      });
    }

    // Soft delete + status cancel
    await tPrisma.booking.update({
      where: { id: String(booking.id) },
      data: { deletedAt: new Date(), status: "CANCELLED" },
    });

    revalidatePath("/tenant/bookings");
    revalidatePath("/tenant/calendar");
    revalidatePath("/");
    revalidateTag(tenantTag(tenantId));
    revalidateTag(`tenant:${tenantId}:calendar`);

    return { success: true } as const;
  } catch (error: any) {
    console.error("CLIENT CANCEL ERROR:", error);
    return { success: false, error: error?.message || "Failed to cancel booking." } as const;
  }
}

export async function bulkDeleteBookings(ids: string[]) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "viewBookings")) {
      return { success: false, error: "Permission Denied: Cannot delete bookings." };
    }

    const tenantId = String((session as any)?.user?.tenantId || "");
    if (!tenantId) return { success: false, error: "Unauthorized" };

    const safeIds = Array.isArray(ids) ? ids.map((x) => String(x)).filter(Boolean) : [];
    if (safeIds.length === 0) return { success: true, deletedCount: 0 };

    const tPrisma = await getTenantPrisma();

    // Soft delete in one pass.
    const res = await (tPrisma as any).booking.updateMany({
      where: { id: { in: safeIds } },
      data: { deletedAt: new Date(), status: "CANCELLED" },
    });

    revalidatePath("/tenant/bookings");
    revalidatePath("/tenant/bookings/history");
    revalidatePath("/tenant/calendar");
    revalidatePath("/");

    // IMPORTANT: invalidate Next Data Cache entries (unstable_cache) used by calendar endpoints.
    revalidateTag(tenantTag(tenantId));
    revalidateTag(`tenant:${tenantId}:calendar`);

    return { success: true, deletedCount: Number(res?.count || 0) };
  } catch (error: any) {
    console.error("BULK DELETE ERROR:", error);
    return { success: false, error: error.message || "Failed to delete bookings." };
  }
}

export async function rescheduleBooking(input: { id: string; startAt: string; endAt: string; status?: string }) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId as string | undefined;
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (!permissionService.can(session.user as any, "viewBookings")) {
      return { success: false, error: "Permission Denied: Cannot manage bookings." };
    }

    // SECURITY: Prevent API-level bypass of the paywall
    await enforceSubscription(tenantId);

    const bookingId = String(input?.id || "");
    if (!bookingId) return { success: false, error: "Missing booking id." };

    const startAt = new Date(String(input?.startAt || ""));
    const endAt = new Date(String(input?.endAt || ""));
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      return { success: false, error: "Invalid start/end date format." };
    }
    if (endAt.getTime() <= startAt.getTime()) {
      return { success: false, error: "End time must be after start time." };
    }

    const sessionUser = session.user as any;
    const role = String(sessionUser?.role || "");
    const canViewAll = permissionService.can(session.user as any, "viewAllBookings") || role === "TENANT_ADMIN" || role === "ADMIN";

    const tPrisma = (await getTenantPrisma()) as any;
    const existing = await tPrisma.booking.findFirst({
      where: { id: bookingId, deletedAt: null, tenantId },
      select: {
        id: true,
        tenantId: true,
        clientId: true,
        agentId: true,
        assignments: { select: { teamMemberId: true } },
      },
    });
    if (!existing) return { success: false, error: "Not found." };

    // Ownership check (same logic as calendar-lite masking)
    let isOwned = !!canViewAll;
    if (!isOwned) {
      if (role === "CLIENT" && existing.clientId && sessionUser.clientId && String(existing.clientId) === String(sessionUser.clientId)) isOwned = true;
      else if (role === "AGENT" && existing.agentId && sessionUser.agentId && String(existing.agentId) === String(sessionUser.agentId)) isOwned = true;
      else if (sessionUser.teamMemberId && (existing.assignments || []).some((a: any) => String(a.teamMemberId) === String(sessionUser.teamMemberId))) isOwned = true;
    }
    if (!isOwned) return { success: false, error: "Permission Denied." };

    // Status rules:
    // - CLIENT/AGENT reschedules always become REQUESTED (unconfirmed)
    // - Tenant/staff can optionally set status (e.g. PENCILLED)
    let nextStatus: string | undefined = undefined;
    if (role === "CLIENT" || role === "AGENT") {
      nextStatus = "REQUESTED";
    } else if (input?.status) {
      nextStatus = String(input.status || "").toUpperCase();
    }

    const updated = await tPrisma.booking.update({
      where: { id: bookingId },
      data: {
        startAt,
        endAt,
        ...(nextStatus ? { status: nextStatus } : {}),
      },
      include: {
        client: true,
        property: true,
        services: { include: { service: true } },
        assignments: { include: { teamMember: true } },
      },
    });

    revalidatePath("/tenant/bookings");
    revalidatePath("/tenant/calendar");
    revalidatePath("/");

    // IMPORTANT: invalidate Next Data Cache entries (unstable_cache) used by calendar endpoints.
    revalidateTag(tenantTag(tenantId));
    revalidateTag(`tenant:${tenantId}:calendar`);

    const calendarBooking = toCalendarBooking(updated);
    return { success: true, bookingId: String(bookingId), booking: calendarBooking };
  } catch (error: any) {
    console.error("RESCHEDULE ERROR:", error);
    return { success: false, error: error.message || "Failed to reschedule booking." };
  }
}
