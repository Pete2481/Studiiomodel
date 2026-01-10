import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const dropboxAuthBase = "https://www.dropbox.com/oauth2/authorize";

const clientId = process.env.DROPBOX_CLIENT_ID ?? "";

function getRedirectUri(request: NextRequest) {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}/api/auth/dropbox/callback`;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;
  
  if (!clientId) {
    return NextResponse.json({ error: "Dropbox client not configured" }, { status: 500 });
  }

  const redirectUri = getRedirectUri(request);

  // State contains the tenantId so we know who to update in the callback
  const state = Buffer.from(JSON.stringify({ 
    tenantId, 
    nonce: Math.random().toString(36).slice(2, 10) 
  })).toString("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    token_access_type: "offline",
    scope: "files.metadata.read files.content.read files.content.write sharing.read",
    state,
  });

  const authorizeUrl = `${dropboxAuthBase}?${params.toString()}`;
  return NextResponse.redirect(authorizeUrl);
}

