import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { permissionService } from "@/lib/permission-service";
import { notificationService, type BookingNotificationType } from "@/server/services/notification.service";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permissionService.can(session.user as any, "viewBookings")) {
    return NextResponse.json({ error: "Permission Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const bookingId = String(body?.bookingId || "");
  const type = String(body?.type || "") as BookingNotificationType;
  if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
  if (!type) return NextResponse.json({ error: "Missing type" }, { status: 400 });

  const allowed: BookingNotificationType[] = [
    "NEW_BOOKING",
    "BOOKING_APPROVED",
    "BOOKING_UPDATED",
    "BOOKING_CANCELLED",
    "BOOKING_CHANGE_REQUESTED",
  ];
  if (!allowed.includes(type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  // Tenant ownership guard (prevents cross-tenant bookingId access)
  const tPrisma = (await getTenantPrisma()) as any;
  const exists = await tPrisma.booking.findUnique({ where: { id: bookingId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const preview = await notificationService.buildBookingEmail({ bookingId, type });
  if (!preview) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ bookingId, type, subject: preview.subject, html: preview.html, to: preview.to });
}


