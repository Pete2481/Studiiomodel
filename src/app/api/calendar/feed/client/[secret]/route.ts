import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ secret: string }> }
) {
  const { secret } = await params;

  // Client-only feed: secret maps to a single Client (agency).
  // Stored in Client.settings.calendarSecret to avoid DB schema migrations.
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      tenantId: string;
      name: string;
      businessName: string | null;
      tenantName: string;
      tenantTimezone: string | null;
    }>
  >`
    SELECT
      c.id,
      c."tenantId",
      c.name,
      c."businessName",
      t.name AS "tenantName",
      t.timezone AS "tenantTimezone"
    FROM "Client" c
    JOIN "Tenant" t ON t.id = c."tenantId"
    WHERE c."deletedAt" IS NULL
      AND (c.settings->>'calendarSecret') = ${secret}
    LIMIT 1
  `;

  const client = rows?.[0] || null;

  if (!client) {
    return new NextResponse("Invalid calendar feed link", { status: 401 });
  }

  // Rolling window: 30 days back to future (same as other feeds)
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const bookings = await prisma.booking.findMany({
    where: {
      tenantId: client.tenantId,
      clientId: client.id,
      isPlaceholder: false,
      deletedAt: null,
      startAt: { gte: startDate },
      status: { notIn: ["DECLINED", "CANCELLED"] as any },
    },
    include: {
      property: true,
      services: { include: { service: true } },
      assignments: { include: { teamMember: true } },
      agent: true,
    },
    orderBy: { startAt: "asc" },
  });

  const now = new Date().toISOString().replace(/-|:|\.\d\d\d/g, "");
  const tz = String(client.tenantTimezone || "Australia/Sydney");
  const calName = `${client.businessName || client.name} - ${client.tenantName || "Studiio"}`;

  const icsLines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Studiio//Client Calendar Feed//EN",
    `X-WR-CALNAME:${calName}`,
    `X-WR-TIMEZONE:${tz}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  bookings.forEach((booking: any) => {
    const start = new Date(booking.startAt).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const end = new Date(booking.endAt).toISOString().replace(/-|:|\.\d\d\d/g, "");

    // Client feed should not expose internal notes.
    const title = booking.title || "Booking";
    const teamNames = booking.assignments?.map((a: any) => a.teamMember.displayName).join(", ") || "Unassigned";
    const services = booking.services?.map((s: any) => s.service.name).join(", ") || "TBC";

    const descriptionLines = [
      `Job: ${title}`,
      `Team: ${teamNames}`,
      `Services: ${services}`,
      booking.clientNotes ? `Notes: ${booking.clientNotes}` : "",
    ]
      .filter(Boolean)
      .map((line: string) => line.replace(/,/g, "\\,"))
      .join("\\n");

    const location = booking.property?.name || booking.title || "TBC";

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

  return new NextResponse(icsLines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="studiio-client-calendar.ics"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}


