import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test.describe("AI Save-to-Dropbox (E2E)", () => {
  test("uploads bytes to Dropbox next to an original asset (debug route)", async ({ page, request }) => {
    test.setTimeout(180_000);
    const prisma = new PrismaClient();

    // Pick a usable membership with galleries (same strategy as other E2E tests)
    const preferredEmail = (process.env.E2E_EMAIL || "pete@mediadrive.com.au").toLowerCase().trim();

    const pickMembershipWithGalleries = async (userId?: string) => {
      const memberships = await prisma.tenantMembership.findMany({
        where: {
          ...(userId ? { userId } : {}),
          tenant: { deletedAt: null },
          user: { email: { not: null } },
        },
        include: { tenant: true, user: true, teamMember: true },
        orderBy: { createdAt: "asc" },
        take: 250,
      });

      const ordered = [
        ...memberships.filter((m) => m.role === "TENANT_ADMIN"),
        ...memberships.filter((m) => m.role !== "TENANT_ADMIN"),
      ];

      for (const m of ordered) {
        if (!m.user?.email) continue;
        if ((m.role === "TEAM_MEMBER" || m.role === "TENANT_ADMIN") && m.teamMember?.deletedAt) continue;
        const count = await prisma.gallery.count({ where: { tenantId: m.tenantId, deletedAt: null } });
        if (count > 0) return m;
      }
      return null;
    };

    const preferredUser = await prisma.user.findUnique({ where: { email: preferredEmail } });
    const membership =
      (preferredUser ? await pickMembershipWithGalleries(preferredUser.id) : null) || (await pickMembershipWithGalleries());

    if (!membership?.tenantId || !membership?.user?.email) {
      await prisma.$disconnect();
      throw new Error("E2E: Could not find any user membership with galleries.");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: membership.tenantId },
      select: { dropboxAccessToken: true },
    });
    const initialDropboxToken = tenant?.dropboxAccessToken || null;
    if (!initialDropboxToken) {
      await prisma.$disconnect();
      test.skip(true, "E2E: Tenant has no Dropbox token connected.");
      return;
    }

    // Prefer a gallery backed by a Dropbox shared link (this is the common setup for fast public galleries).
    const gallery = await prisma.gallery.findFirst({
      where: {
        tenantId: membership.tenantId,
        deletedAt: null,
        metadata: { path: ["dropboxLink"], not: "" as any },
      } as any,
      select: { id: true, metadata: true },
      orderBy: { createdAt: "desc" },
    });

    const galleryId = gallery?.id || null;
    if (!galleryId) {
      await prisma.$disconnect();
      test.skip(true, "E2E: No gallery with dropboxLink found for this tenant.");
      return;
    }

    const meta: any = (gallery as any).metadata || {};
    const shareLink = meta?.dropboxLink;
    if (!shareLink || typeof shareLink !== "string") {
      await prisma.$disconnect();
      test.skip(true, "E2E: Gallery has no valid metadata.dropboxLink");
    }

    // For this E2E we don't need to download/list original assets. We just need:
    // - a galleryId with a dropboxLink so the server can resolve the real folder path
    // - a plausible original name/path to derive the "-AI" filename
    const originalName = `E2E-${Date.now()}.jpg`;
    const originalPath = `/${originalName}`;

    // Login via OTP insertion (no email required).
    const otp = "000000";
    const identifier = `${String(membership.user.email).toLowerCase().trim()}:${membership.id}`;
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    await prisma.verificationToken.create({
      data: { identifier, token: otp, expires: new Date(Date.now() + 10 * 60 * 1000) },
    });

    const csrfRes = await request.get("/api/auth/csrf");
    const csrfJson: any = await csrfRes.json();
    const csrfToken = csrfJson?.csrfToken;
    if (!csrfToken) {
      await prisma.$disconnect();
      throw new Error("E2E: Failed to obtain NextAuth CSRF token");
    }

    const loginRes = await request.post("/api/auth/callback/credentials", {
      form: {
        csrfToken,
        email: membership.user.email,
        tenantId: membership.id, // NOTE: tenantId parameter is actually membershipId in this app
        otp,
        callbackUrl: "/",
      },
      maxRedirects: 0 as any,
    } as any);

    const setCookieHeaders = (loginRes.headersArray?.() || []).filter(
      (h: any) => String(h.name || "").toLowerCase() === "set-cookie"
    );
    if (!setCookieHeaders.length) {
      await prisma.$disconnect();
      throw new Error("E2E: Login did not return Set-Cookie headers");
    }

    const cookies = setCookieHeaders
      .map((h: any) => String(h.value))
      .map((raw: string) => raw.split(";")[0])
      .map((pair: string) => {
        const idx = pair.indexOf("=");
        return { name: pair.slice(0, idx), value: pair.slice(idx + 1) };
      })
      .filter((c: any) => c.name && c.value);

    await page.context().addCookies(
      cookies.map((c: any) => ({
        name: c.name,
        value: c.value,
        domain: "localhost",
        path: "/",
      }))
    );

    // Trigger save via debug route (this hits the same server action used by the UI)
    const resultUrl = "http://localhost:3000/api/debug/sample-image";
    const saveRes = await page.request.post("/api/debug/save-ai-sibling", {
      data: {
        tenantId: membership.tenantId,
        galleryId,
        resultUrl,
        originalPath,
        originalName,
      },
    });
    const saveJson: any = await saveRes.json().catch(() => null);

    expect(saveRes.ok(), `Expected debug save route to return 200, got ${saveRes.status()}`).toBeTruthy();
    expect(saveJson?.ok).toBeTruthy();
    if (!saveJson?.result?.success) {
      const errStr = JSON.stringify(saveJson?.result || {});
      if (errStr.includes("missing_scope") || String(saveJson?.result?.code || "") === "MISSING_SCOPE") {
        await prisma.$disconnect();
        test.skip(true, "E2E: Dropbox missing files.content.write scope. Reconnect Dropbox and re-run.");
      }
      await prisma.$disconnect();
      throw new Error(`E2E: Save action failed: ${JSON.stringify(saveJson?.result)}`);
    }

    // Verify the file exists in Dropbox (poll briefly). Use the returned path/name for accuracy.
    const savedPath = String(saveJson?.result?.path || "");
    const savedName = String(saveJson?.result?.name || "");
    if (!savedPath.startsWith("/") || !savedName) {
      await prisma.$disconnect();
      throw new Error(`E2E: Save succeeded but did not return a valid path/name: ${JSON.stringify(saveJson?.result)}`);
    }

    // If the save action had to refresh the Dropbox token, the DB may now have a new access token.
    const refreshedTenant = await prisma.tenant.findUnique({
      where: { id: membership.tenantId },
      select: { dropboxAccessToken: true },
    });
    const verifyToken = refreshedTenant?.dropboxAccessToken || initialDropboxToken;

    let foundName: string | null = null;
    for (let i = 0; i < 10; i++) {
      const verifyRes = await fetch("https://api.dropboxapi.com/2/files/get_metadata", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${verifyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: savedPath }),
      });
      if (verifyRes.ok) {
        const metaJson: any = await verifyRes.json().catch(() => null);
        if (metaJson?.[".tag"] === "file" && String(metaJson?.name || "") === savedName) {
          foundName = String(metaJson.name);
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    await prisma.$disconnect();

    expect(foundName, `Expected to find uploaded file "${savedName}" at ${savedPath}`).toBeTruthy();
  });
});


