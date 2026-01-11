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
        googleDriveRefreshToken: null,
        googleDriveEmail: null,
        googleDriveConnectedAt: null,
        storageProvider: "DROPBOX" // Fallback to Dropbox if disconnected
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Google Drive disconnect failed", error);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}

