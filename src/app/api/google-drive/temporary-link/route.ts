import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";

/**
 * Public-facing (but obfuscated) proxy to allow external services 
 * (like AI models) to access private Google Drive assets.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("id");
    const tenantId = searchParams.get("tenantId");

    if (!fileId || !tenantId) {
      return new NextResponse("Missing parameters", { status: 400 });
    }

    // Resolve tenant to get the refresh token
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { googleDriveRefreshToken: true }
    });

    if (!tenant?.googleDriveRefreshToken) {
      console.error(`[TEMP LINK] Google Drive not connected for tenant: ${tenantId}`);
      return new NextResponse("Google Drive not connected", { status: 404 });
    }

    // Initialize Google Drive Client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_CLIENT_ID,
      process.env.GOOGLE_DRIVE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: tenant.googleDriveRefreshToken
    });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Fetch File Content from Google Drive
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);

    // Return the image
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": response.headers["content-type"] || "image/jpeg",
      }
    });

  } catch (error: any) {
    console.error("GOOGLE DRIVE TEMP LINK PROXY ERROR:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

