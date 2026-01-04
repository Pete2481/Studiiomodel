import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const dropboxTokenEndpoint = "https://api.dropboxapi.com/oauth2/token";

const clientId = process.env.DROPBOX_CLIENT_ID ?? "";
const clientSecret = process.env.DROPBOX_CLIENT_SECRET ?? "";
const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/dropbox/callback`;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/tenant/settings?dropbox=error&message=${encodeURIComponent(error)}`, request.nextUrl.origin));
  }

  if (!code || !state || !clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/tenant/settings?dropbox=error", request.nextUrl.origin));
  }

  let tenantId = "";
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { tenantId?: string };
    if (decoded?.tenantId) {
      tenantId = decoded.tenantId;
    }
  } catch (parseError) {
    console.error("Failed to parse Dropbox state", parseError);
    return NextResponse.redirect(new URL("/tenant/settings?dropbox=error", request.nextUrl.origin));
  }

  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  try {
    const tokenResponse = await fetch(dropboxTokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Dropbox token exchange failed:", errorText);
      return NextResponse.redirect(new URL(`/tenant/settings?dropbox=error&reason=exchange_failed&details=${encodeURIComponent(errorText)}`, request.nextUrl.origin));
    }

    const tokenJson = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      account_id?: string;
      email?: string;
      uid?: string;
    };

    console.log("Dropbox token exchange successful for tenant:", tenantId);

    // Update the Tenant in the database
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        dropboxAccessToken: tokenJson.access_token,
        dropboxRefreshToken: tokenJson.refresh_token,
        dropboxAccountId: tokenJson.account_id || tokenJson.uid,
        dropboxEmail: tokenJson.email,
        dropboxConnectedAt: new Date(),
      }
    });

    console.log("Database updated for tenant:", tenantId);

    return NextResponse.redirect(new URL("/tenant/settings?dropbox=connected", request.nextUrl.origin));
  } catch (exchangeError: any) {
    console.error("Dropbox token exchange error:", exchangeError);
    return NextResponse.redirect(new URL(`/tenant/settings?dropbox=error&reason=exception&message=${encodeURIComponent(exchangeError.message)}`, request.nextUrl.origin));
  }
}

