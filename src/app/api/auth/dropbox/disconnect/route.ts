import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.tenant.update({
      where: { id: session.user.tenantId },
      data: {
        dropboxAccessToken: null,
        dropboxRefreshToken: null,
        dropboxAccountId: null,
        dropboxEmail: null,
        dropboxConnectedAt: null,
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Dropbox disconnect failed", error);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}

