import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";

function getRedirectUri(request: NextRequest) {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}/api/auth/google-drive/callback`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/tenant/settings?googleDrive=error&message=${encodeURIComponent(error)}`, request.nextUrl.origin));
  }

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

  if (!code || !state || !clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/tenant/settings?googleDrive=error", request.nextUrl.origin));
  }

  const redirectUri = getRedirectUri(request);
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  let tenantId = "";
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { tenantId?: string };
    if (decoded?.tenantId) {
      tenantId = decoded.tenantId;
    }
  } catch (parseError) {
    console.error("Failed to parse Google Drive state", parseError);
    return NextResponse.redirect(new URL("/tenant/settings?googleDrive=error", request.nextUrl.origin));
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user email
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    // Update the Tenant in the database
    // We only update refresh_token if it's provided (it usually is on first consent)
    const updateData: any = {
      googleDriveEmail: userInfo.data.email,
      googleDriveConnectedAt: new Date(),
    };

    if (tokens.refresh_token) {
      updateData.googleDriveRefreshToken = tokens.refresh_token;
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData
    });

    console.log("Google Drive connected successfully for tenant:", tenantId);

    return NextResponse.redirect(new URL("/tenant/settings?googleDrive=connected", request.nextUrl.origin));
  } catch (exchangeError: any) {
    console.error("Google Drive token exchange error:", exchangeError);
    return NextResponse.redirect(new URL(`/tenant/settings?googleDrive=error&reason=exception&message=${encodeURIComponent(exchangeError.message)}`, request.nextUrl.origin));
  }
}

