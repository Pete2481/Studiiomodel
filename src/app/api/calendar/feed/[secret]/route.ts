import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ secret: string }> }
) {
  const { secret } = await params;

  // 1. Verify the Secret
  const tenant = await prisma.tenant.findUnique({
    where: { calendarSecret: secret },
    select: { id: true, name: true }
  });

  if (!tenant) {
    return new NextResponse("Invalid calendar feed link", { status: 401 });
  }

  // 2. Fetch all real bookings (excluding placeholders)
  // We fetch bookings from 30 days ago to 90 days in the future for a healthy rolling window
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  const bookings = await prisma.booking.findMany({
    where: {
      tenantId: tenant.id,
      isPlaceholder: false,
      deletedAt: null,
      startAt: { gte: startDate }
    },
    include: {
      property: true,
      client: true,
      services: { include: { service: true } },
      assignments: { include: { teamMember: true } }
    },
    orderBy: { startAt: 'asc' }
  });

  const now = new Date().toISOString().replace(/-|:|\.\d\d\d/g, "");

  // 3. Construct VCALENDAR header
  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Studiio//Calendar Feed//EN",
    `X-WR-CALNAME:${tenant.name} - Studiio`,
    "X-WR-TIMEZONE:Australia/Sydney",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];

  // 4. Add each booking as a VEVENT
  bookings.forEach(booking => {
    const start = new Date(booking.startAt).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const end = new Date(booking.endAt).toISOString().replace(/-|:|\.\d\d\d/g, "");
    
    const clientName = booking.client?.businessName || booking.client?.name || "No Client";
    const title = `${clientName} | ${booking.title}`;
    
    const teamNames = booking.assignments?.map(a => a.teamMember.displayName).join(", ") || "TBC";
    const services = booking.services?.map(s => s.service.name).join(", ") || "No Services";

    const descriptionLines = [
      `Job: ${booking.title}`,
      `Agency: ${clientName}`,
      `Team: ${teamNames}`,
      `Services: ${services}`,
      `Access: ${booking.propertyStatus || "TBC"}`,
      `--------------------------`,
      booking.clientNotes ? `Client Notes: ${booking.clientNotes}` : "",
      booking.internalNotes ? `Instructions: ${booking.internalNotes}` : ""
    ].filter(Boolean).map(line => line.replace(/,/g, '\\,')).join("\\n");

    const location = booking.property?.name || "TBC";

    icsLines.push("BEGIN:VEVENT");
    icsLines.push(`UID:${booking.id}@studiio.au`);
    icsLines.push(`DTSTAMP:${now}`);
    icsLines.push(`DTSTART:${start}`);
    icsLines.push(`DTEND:${end}`);
    icsLines.push(`SUMMARY:${title}`);
    icsLines.push(`DESCRIPTION:${descriptionLines}`);
    icsLines.push(`LOCATION:${location}`);
    icsLines.push("END:VEVENT");
  });

  icsLines.push("END:VCALENDAR");

  // 5. Return the .ics content
  return new NextResponse(icsLines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="studiio-calendar.ics"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
}

