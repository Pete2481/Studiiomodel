import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notificationService } from "@/server/services/notification.service";

async function requireMaster() {
  const session = await auth();
  if (!session || !session.user?.isMasterAdmin) return null;
  return session;
}

export async function POST(req: Request) {
  const session = await requireMaster();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const toEmail =
    (typeof body.toEmail === "string" && body.toEmail.trim()) || session.user.email || "";
  const toName = (typeof body.toName === "string" && body.toName.trim()) || session.user.name || "User";

  if (!toEmail) return NextResponse.json({ error: "No email provided" }, { status: 400 });

  // Use a lightweight tenant object for the template styling.
  const masterTenant = {
    name: "Studiio",
    brandColor: "#10b981",
    logoUrl: "https://studiio.au/logo-dark.png",
    contactPhone: "",
    address: "",
    city: "",
    postalCode: "",
  };

  const config = await prisma.systemConfig.findUnique({
    where: { id: "system" },
    select: { welcomeEmailSubject: true, welcomeEmailBlocks: true },
  });

  const subject = config?.welcomeEmailSubject || "Welcome to Studiio";
  const blocks = (config?.welcomeEmailBlocks as any) || [];

  await notificationService.sendCustomTemplateEmail({
    tenant: masterTenant,
    toEmail,
    subject,
    title: "Welcome",
    blocks,
    data: {
      "@user_name": toName,
      "@studio_name": "Studiio",
    },
    // Ensure it comes from team@studiio.au
    sendAsMaster: true,
  });

  return NextResponse.json({ success: true });
}


