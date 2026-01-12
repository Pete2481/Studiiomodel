import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { notificationService } from "@/server/services/notification.service";

async function requireMaster() {
  const session = await auth();
  if (!session || !session.user?.isMasterAdmin) return null;
  return session;
}

export async function POST(req: Request) {
  const session = await requireMaster();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const template = body.template || {};
  const subject = typeof template.subject === "string" ? template.subject.trim() : "";
  const blocks = Array.isArray(template.blocks) ? template.blocks : [];
  const toEmail =
    (typeof body.toEmail === "string" && body.toEmail.trim()) || session.user.email || "";

  if (!toEmail) return NextResponse.json({ error: "No email provided" }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });

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

  await notificationService.sendCustomTemplateEmail({
    tenant: masterTenant,
    toEmail,
    subject,
    title: "Announcement",
    blocks,
    data: { "@studio_name": "Studiio" },
    sendAsMaster: true,
    headers: {
      "Precedence": "bulk",
      "X-Auto-Response-Suppress": "OOF, AutoReply",
      "Feedback-ID": `MASTER:newsletter:test:studiio`,
    },
  });

  return NextResponse.json({ success: true });
}


