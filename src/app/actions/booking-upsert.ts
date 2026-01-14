"use server";

import { getTenantPrisma, enforceSubscription } from "@/lib/tenant-guard";
import { revalidatePath } from "next/cache";
import { bookingService } from "@/server/services/booking.service";
import { auth } from "@/auth";
import { permissionService } from "@/lib/permission-service";

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

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "viewBookings")) {
      return { success: false, error: "Permission Denied: Cannot manage bookings." };
    }

    // SECURITY: Prevent API-level bypass of the paywall
    await enforceSubscription(tenantId);

    const startAt = data.startAt ? new Date(data.startAt) : new Date(`${data.date}T${data.startTime}:00`);
    const endAt = data.endAt ? new Date(data.endAt) : new Date(startAt.getTime() + (parseFloat(data.duration || "1") * 60 * 60 * 1000));

    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      return { success: false, error: "Invalid start or end date format." };
    }

    const booking = await bookingService.upsertBooking(tenantId, {
      ...data,
      startAt,
      endAt
    });

    revalidatePath("/tenant/bookings");
    revalidatePath("/tenant/calendar");
    revalidatePath("/");
    
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
    
    return { success: true };
  } catch (error: any) {
    console.error("DELETE ERROR:", error);
    return { success: false, error: error.message || "Failed to delete booking." };
  }
}
