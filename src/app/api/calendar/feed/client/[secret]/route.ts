import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function toNumber(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function icsEscape(v: any): string {
  const s = String(v ?? "");
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatFullAddress(property: any): string {
  const p = property || {};
  const parts = [p.addressLine1, p.addressLine2, p.city, p.state, p.postcode, p.country]
    .map((x: any) => String(x || "").trim())
    .filter(Boolean);
  const structured = parts.join(", ");
  const fallback = String(p.name || "").trim();
  return structured || fallback || "TBC";
}

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
      property: {
        select: {
          name: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postcode: true,
          country: true,
          latitude: true,
          longitude: true,
        },
      },
      services: { include: { service: true } },
      assignments: { include: { teamMember: { select: { displayName: true, phone: true } } } },
      agent: { select: { name: true, phone: true } },
      client: { select: { name: true, businessName: true } },
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

    const jobTitle = booking.title || "Booking";
    const agencyName = booking.client?.businessName || booking.client?.name || client.businessName || client.name || "Agency";
    const fullAddress = formatFullAddress(booking.property);
    const agentLine =
      booking.agent?.name
        ? `Agent: ${booking.agent.name}${booking.agent.phone ? ` (${booking.agent.phone})` : ""}`
        : "";
    const photographers = (booking.assignments || [])
      .map((a: any) => {
        const n = String(a?.teamMember?.displayName || "").trim();
        const ph = String(a?.teamMember?.phone || "").trim();
        if (!n) return "";
        return ph ? `${n} (${ph})` : n;
      })
      .filter(Boolean)
      .join(", ");
    const teamLine = photographers ? `Photographer(s): ${photographers}` : "";
    const services = booking.services?.map((s: any) => s.service.name).join(", ") || "TBC";

    const descriptionLines = [
      `Job: ${jobTitle}`,
      `Agency: ${agencyName}`,
      `Address: ${fullAddress}`,
      agentLine,
      teamLine,
      `Services: ${services}`,
      `Access: ${booking.propertyStatus || "TBC"}`,
      `--------------------------`,
      booking.clientNotes ? `Client Notes: ${booking.clientNotes}` : "",
      booking.internalNotes ? `Internal Notes: ${booking.internalNotes}` : "",
    ]
      .filter(Boolean)
      .map(icsEscape)
      .join("\\n");

    const location = fullAddress;
    const summary = fullAddress;
    const lat = toNumber(booking.property?.latitude);
    const lon = toNumber(booking.property?.longitude);

    icsLines.push("BEGIN:VEVENT");
    icsLines.push(`UID:${booking.id}@studiio.au`);
    icsLines.push(`DTSTAMP:${now}`);
    icsLines.push(`DTSTART:${start}`);
    icsLines.push(`DTEND:${end}`);
    icsLines.push(`SUMMARY:${icsEscape(summary)}`);
    icsLines.push(`DESCRIPTION:${descriptionLines}`);
    icsLines.push(`LOCATION:${icsEscape(location)}`);
    if (lat != null && lon != null) {
      icsLines.push(`GEO:${lat};${lon}`);
    }
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


