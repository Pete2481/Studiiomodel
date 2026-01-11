import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { google } from "googleapis";

function getRedirectUri(request: NextRequest) {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}/api/auth/google-drive/callback`;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google Drive client not configured" }, { status: 500 });
  }

  const redirectUri = getRedirectUri(request);
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const state = Buffer.from(JSON.stringify({ 
    tenantId, 
    nonce: Math.random().toString(36).slice(2, 10) 
  })).toString("base64url");

  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/userinfo.email"
    ],
    state,
    prompt: "consent" // Force to get refresh token
  });

  return NextResponse.redirect(authorizeUrl);
}

