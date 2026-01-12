import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notificationService } from "@/server/services/notification.service";

async function requireMaster() {
  const session = await auth();
  if (!session || !session.user?.isMasterAdmin) return null;
  return session;
}

function normalizeEmail(email: string) {
  return (email || "").trim().toLowerCase();
}

export async function POST(req: Request) {
  const session = await requireMaster();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const template = body.template || {};
  const subject = typeof template.subject === "string" ? template.subject.trim() : "";
  const blocks = Array.isArray(template.blocks) ? template.blocks : [];
  const tenantIds = Array.isArray(body.tenantIds) ? body.tenantIds.map(String) : [];

  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  if (tenantIds.length === 0) return NextResponse.json({ error: "No recipients selected" }, { status: 400 });

  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds }, deletedAt: null, contactEmail: { not: null } },
    select: { id: true, name: true, contactEmail: true },
  });

  const recipients = tenants
    .map((t) => ({
      tenantId: String(t.id),
      tenantName: String(t.name),
      email: normalizeEmail(String(t.contactEmail || "")),
    }))
    .filter((r) => Boolean(r.email));

  if (recipients.length === 0) {
    return NextResponse.json({ error: "No valid tenant contact emails found" }, { status: 400 });
  }

  // Persist newsletter + recipient rows (status updates as we send)
  const newsletter = await prisma.newsletter.create({
    data: {
      subject,
      blocks: blocks as any,
      status: "SENT",
      sentAt: new Date(),
      createdByUserId: session.user.id,
      recipients: {
        createMany: {
          data: recipients.map((r) => ({
            tenantId: r.tenantId,
            email: r.email,
            status: "PENDING",
          })),
        },
      },
    },
    include: { recipients: true },
  });

  // Deduplicate sends by email to avoid double-sending if multiple tenants share an email.
  const byEmail = new Map<string, { email: string; tenantName: string }>();
  for (const r of recipients) {
    if (!byEmail.has(r.email)) byEmail.set(r.email, { email: r.email, tenantName: r.tenantName });
  }

  const masterTenant = {
    id: "MASTER",
    name: "Studiio",
    brandColor: "#10b981",
    logoUrl: "https://studiio.au/logo-dark.png",
    contactPhone: "",
    address: "",
    city: "",
    postalCode: "",
  };

  for (const { email, tenantName } of byEmail.values()) {
    try {
      await notificationService.sendCustomTemplateEmail({
        tenant: masterTenant,
        toEmail: email,
        subject,
        title: "Announcement",
        blocks,
        data: {
          "@studio_name": tenantName,
        },
        sendAsMaster: true,
        headers: {
          "Precedence": "bulk",
          "X-Auto-Response-Suppress": "OOF, AutoReply",
          "Feedback-ID": `MASTER:newsletter:studiio`,
        },
      });

      await prisma.newsletterRecipient.updateMany({
        where: { newsletterId: newsletter.id, email },
        data: { status: "SENT", sentAt: new Date(), error: null },
      });
    } catch (e: any) {
      await prisma.newsletterRecipient.updateMany({
        where: { newsletterId: newsletter.id, email },
        data: { status: "FAILED", error: String(e?.message || e), sentAt: null },
      });
    }
  }

  return NextResponse.json({ success: true, newsletterId: newsletter.id });
}


