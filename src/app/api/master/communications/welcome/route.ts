import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_SUBJECT = "Welcome to Studiio";

const DEFAULT_BLOCKS = [
  {
    id: "intro",
    type: "text",
    content:
      "Hi @user_name,\n\nWelcome to @studio_name on Studiio.\n\nHere’s what Studiio does (in plain English):",
    width: 100,
  },
  {
    id: "about1",
    type: "text",
    content:
      "Studiio is a simple, modern way for photographers and media creators to deliver work to clients. It connects directly to your own Dropbox, so your files never get uploaded or moved anywhere else — Studiio just displays them in a clean, fast, good-looking gallery that clients can easily view and download from, while you stay in full control of your files and folder structure.",
    width: 100,
  },
  {
    id: "about2",
    type: "text",
    content:
      "On top of galleries, Studiio brings everything together in one place: invoicing, scheduling, edit and revision requests directly inside the gallery, plus AI tools to help streamline the workflow. It’s built to cut down emails, back-and-forth, and clunky delivery methods, and make the whole client experience feel smoother and more professional. It’s currently in a trial phase with no subscription, and the more feedback I get from people using it, the better the platform will become.",
    width: 100,
  },
] as const;

async function requireMaster() {
  const session = await auth();
  if (!session || !session.user?.isMasterAdmin) return null;
  return session;
}

export async function GET() {
  const session = await requireMaster();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await prisma.systemConfig.upsert({
    where: { id: "system" },
    update: {},
    create: {
      id: "system",
      welcomeEmailSubject: DEFAULT_SUBJECT,
      welcomeEmailBlocks: DEFAULT_BLOCKS as any,
    },
    select: {
      welcomeEmailSubject: true,
      welcomeEmailBlocks: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    subject: config.welcomeEmailSubject,
    blocks: config.welcomeEmailBlocks,
    updatedAt: config.updatedAt,
  });
}

export async function POST(req: Request) {
  const session = await requireMaster();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const blocks = Array.isArray(body.blocks) ? body.blocks : [];

  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });

  await prisma.systemConfig.upsert({
    where: { id: "system" },
    update: {
      welcomeEmailSubject: subject,
      welcomeEmailBlocks: blocks as any,
    },
    create: {
      id: "system",
      welcomeEmailSubject: subject,
      welcomeEmailBlocks: blocks as any,
    },
  });

  return NextResponse.json({ success: true });
}


