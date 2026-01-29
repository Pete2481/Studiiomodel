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

  // 1. Verify the Secret (Check Tenant OR TeamMember)
  const [tenant, member] = await Promise.all([
    prisma.tenant.findUnique({
      where: { calendarSecret: secret },
      select: { id: true, name: true, timezone: true }
    }),
    prisma.teamMember.findUnique({
      where: { calendarSecret: secret },
      include: { tenant: { select: { id: true, name: true, timezone: true } } }
    })
  ]);

  if (!tenant && !member) {
    return new NextResponse("Invalid calendar feed link", { status: 401 });
  }

  const activeTenant = tenant || member?.tenant;
  const teamMemberId = member?.id;

  if (!activeTenant) {
    return new NextResponse("Invalid calendar feed link", { status: 401 });
  }

  // 2. Fetch bookings
  // We fetch bookings from 30 days ago to 90 days in the future for a healthy rolling window
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  const where: any = {
    tenantId: activeTenant.id,
    isPlaceholder: false,
    deletedAt: null,
    startAt: { gte: startDate }
  };

  // If it's a Team Member's secret, filter ONLY for their assignments
  if (teamMemberId) {
    where.assignments = {
      some: { teamMemberId }
    };
  }

  const bookings = await prisma.booking.findMany({
    where,
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
      client: true,
      services: { include: { service: true } },
      assignments: { include: { teamMember: { select: { displayName: true, phone: true } } } },
      agent: { select: { name: true, phone: true } },
    },
    orderBy: { startAt: 'asc' }
  });

  const now = new Date().toISOString().replace(/-|:|\.\d\d\d/g, "");

  // 3. Construct VCALENDAR header
  const calName = member 
    ? `${member.displayName} - ${activeTenant.name}`
    : `${activeTenant.name} - Studiio`;

  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Studiio//Calendar Feed//EN",
    `X-WR-CALNAME:${calName}`,
    `X-WR-TIMEZONE:${String((activeTenant as any)?.timezone || "Australia/Sydney")}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];

  // 4. Add each booking as a VEVENT
  bookings.forEach(booking => {
    const start = new Date(booking.startAt).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const end = new Date(booking.endAt).toISOString().replace(/-|:|\.\d\d\d/g, "");
    
    const clientName = booking.client?.businessName || booking.client?.name || "No Client";
    const fullAddress = formatFullAddress(booking.property);
    const summary = fullAddress;
    
    const teamNames = booking.assignments?.map(a => a.teamMember.displayName).join(", ") || "TBC";
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
    const services = booking.services?.map(s => s.service.name).join(", ") || "No Services";
    const agentLine =
      booking.agent?.name
        ? `Agent: ${booking.agent.name}${booking.agent.phone ? ` (${booking.agent.phone})` : ""}`
        : "";

    const descriptionLines = [
      `Job: ${booking.title}`,
      `Agency: ${clientName}`,
      `Address: ${fullAddress}`,
      agentLine,
      teamLine || `Team: ${teamNames}`,
      `Services: ${services}`,
      `Access: ${booking.propertyStatus || "TBC"}`,
      `--------------------------`,
      booking.clientNotes ? `Client Notes: ${booking.clientNotes}` : "",
      booking.internalNotes ? `Instructions: ${booking.internalNotes}` : ""
    ].filter(Boolean).map(icsEscape).join("\\n");

    const location = fullAddress;
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

