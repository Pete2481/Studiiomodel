import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      tenant: true,
      property: true,
      client: true,
      services: { include: { service: true } },
      assignments: { include: { teamMember: true } }
    }
  });

  if (!booking) {
    return new NextResponse("Booking not found", { status: 404 });
  }

  const start = new Date(booking.startAt).toISOString().replace(/-|:|\.\d\d\d/g, "");
  const end = new Date(booking.endAt).toISOString().replace(/-|:|\.\d\d\d/g, "");
  
  // Client Name as the Main Header
  const clientName = booking.client?.businessName || booking.client?.name || "Client";
  const title = clientName;
  
  const teamNames = booking.assignments?.map(a => a.teamMember.displayName).join(", ") || "TBC";

  const descriptionLines = [
    `Job: ${booking.title}`,
    `Shoot with ${booking.tenant.name}`,
    `--------------------------`,
    `Client: ${clientName}`,
    `Team: ${teamNames}`,
    `Services: ${booking.services.map(s => s.service.name).join(", ")}`,
    `Access: ${booking.propertyStatus || "TBC"}`,
    `--------------------------`,
    booking.clientNotes ? `Notes: ${booking.clientNotes}` : "",
    booking.internalNotes ? `Instructions: ${booking.internalNotes}` : ""
  ].filter(Boolean).join("\\n");

  const location = booking.property?.name || "TBC";

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Studiio//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${booking.id}@studiio.au`,
    `DTSTAMP:${new Date().toISOString().replace(/-|:|\.\d\d\d/g, "")}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${descriptionLines}`,
    `LOCATION:${location}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  return new NextResponse(icsContent, {
    headers: {
      "Content-Type": "text/calendar",
      "Content-Disposition": `attachment; filename="booking-${bookingId}.ics"`
    }
  });
}

