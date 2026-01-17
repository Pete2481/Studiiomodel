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
  const dryRun = Boolean(body?.dryRun);
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

  const tPrisma = (await getTenantPrisma()) as any;
  const booking = await tPrisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, metadata: true } });
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let result: any = { success: true, to: [] as string[] };
  if (!dryRun) {
    result = await notificationService.sendBookingEmail({ bookingId, type });
    if (!(result as any)?.success) return NextResponse.json({ error: (result as any)?.error || "Failed to send" }, { status: 500 });
  } else {
    const preview = await notificationService.buildBookingEmail({ bookingId, type });
    result = { success: true, to: preview?.to || [], subject: preview?.subject || "" };
  }

  const prevMeta = (booking.metadata && typeof booking.metadata === "object") ? (booking.metadata as any) : {};
  const nowIso = new Date().toISOString();
  const nextMeta = {
    ...prevMeta,
    lastNotificationSentAt: nowIso,
    lastNotificationType: type,
  };

  await tPrisma.booking.update({
    where: { id: bookingId },
    data: { metadata: nextMeta },
  });

  return NextResponse.json({ success: true, bookingId, type, to: result.to || [], subject: result.subject || "" });
}


