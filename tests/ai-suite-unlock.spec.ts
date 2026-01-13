import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test.describe("AI Suite unlock billing", () => {
  test("creates an invoiceable $50 Edit Request when user accepts unlock", async ({ page, request }) => {
    test.setTimeout(120_000);
    const prisma = new PrismaClient();

    // Default to a seeded tenant-admin user (has galleries in the sample DB).
    const preferredEmail = (process.env.E2E_EMAIL || "pete@mediadrive.com.au").toLowerCase().trim();

    // Helper: choose a membership we can actually login with AND whose tenant has galleries.
    const pickMembershipWithGalleries = async (userId?: string) => {
      const memberships = await prisma.tenantMembership.findMany({
        where: {
          ...(userId ? { userId } : {}),
          tenant: { deletedAt: null },
          user: { email: { not: null } },
        },
        include: { tenant: true, client: true, user: true, teamMember: true },
        orderBy: { createdAt: "asc" },
        take: 250,
      });

      // Prefer tenant admins first (unlocks should work for client/agent too, but tenant-admin is the most reliable for E2E).
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

    // Try preferred user first, then fall back to ANY usable membership in DB.
    const preferredUser = await prisma.user.findUnique({ where: { email: preferredEmail } });
    const membership =
      (preferredUser ? await pickMembershipWithGalleries(preferredUser.id) : null) ||
      (await pickMembershipWithGalleries());

    if (!membership?.user?.email) {
      await prisma.$disconnect();
      throw new Error(
        "E2E: Could not find any user membership with galleries. Seed at least one gallery and membership, or set E2E_EMAIL to a user who has galleries."
      );
    }

    const user = membership.user;

    const galleryCandidates = await prisma.gallery.findMany({
      where: { tenantId: membership.tenantId, deletedAt: null },
      select: { id: true, metadata: true },
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    const targetGallery =
      galleryCandidates.find((g: any) => !g?.metadata?.aiSuite?.unlocked) ||
      galleryCandidates.find((g: any) => (g?.metadata?.aiSuite?.remainingEdits ?? 0) <= 0) ||
      galleryCandidates[0];

    if (!targetGallery?.id) {
      await prisma.$disconnect();
      throw new Error(`E2E: No galleries found for tenant ${membership.tenantId}`);
    }

    const startedAt = new Date();

    // Login without relying on /api/auth/send-otp (which can hang on email delivery):
    // 1) Insert OTP directly into VerificationToken for this (email, membershipId)
    // 2) Get CSRF token
    // 3) POST credentials callback to receive session cookie
    const otp = "000000";
    const identifier = `${String(user.email).toLowerCase().trim()}:${membership.id}`;
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
        email: user.email,
        tenantId: membership.id, // NOTE: tenantId parameter is actually membershipId in this app
        otp,
        callbackUrl: "/",
      },
      // Don't follow redirects so we can capture Set-Cookie from this response.
      maxRedirects: 0 as any,
    } as any);

    const setCookieHeaders = (loginRes.headersArray?.() || []).filter(
      (h: any) => String(h.name || "").toLowerCase() === "set-cookie"
    );
    if (!setCookieHeaders.length) {
      await prisma.$disconnect();
      throw new Error("E2E: Login did not return Set-Cookie headers (session not established)");
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

    // Sanity check we are authenticated (session endpoint should return user)
    const sessionRes = await request.get("/api/auth/session");
    const sessionJson: any = await sessionRes.json().catch(() => null);
    if (!sessionJson?.user) {
      await prisma.$disconnect();
      throw new Error("E2E: Auth session not established after setting cookies");
    }

    // Navigate to a gallery and open the processing choice modal
    await page.goto(`/gallery/${targetGallery.id}`);
    const firstTile = page.locator("div.break-inside-avoid").first();
    await expect(firstTile).toBeVisible({ timeout: 30_000 });
    await firstTile.click();

    // Use the lightbox header pill button (it contains visible text "Edit Image").
    const editImagePill = page.locator("button", { hasText: "Edit Image" }).first();
    await expect(editImagePill).toBeVisible({ timeout: 30_000 });
    await editImagePill.click();

    // Choose AI Suite (opens unlock modal if locked / limit reached)
    await page.locator("button").filter({ hasText: "AI Suite" }).first().click();
    await expect(page.getByRole("heading", { name: "Unlock AI Suite" })).toBeVisible({ timeout: 30_000 });

    // Wait for session/user to hydrate in the modal (checkbox becomes enabled)
    const termsCheckbox = page.locator('input[type="checkbox"]').first();
    await expect(termsCheckbox).toBeEnabled({ timeout: 30_000 });
    await termsCheckbox.check();

    const unlockButton = page
      .locator("button")
      .filter({ hasText: /Unlock AI Suite \(\$50\)|Unlock another 15 edits \(\$50\)/ })
      .first();
    await expect(unlockButton).toBeEnabled({ timeout: 30_000 });
    let dialogMessage: string | null = null;
    page.once("dialog", async (d) => {
      dialogMessage = d.message();
      await d.accept();
    });
    await unlockButton.click();

    // Assert EditRequest exists in DB (poll, because unlock is async and UI may not immediately close modal)
    let unlockReq: any = null;
    for (let i = 0; i < 60; i++) {
      unlockReq = await prisma.editRequest.findFirst({
        where: {
          tenantId: membership.tenantId,
          galleryId: targetGallery.id,
          metadata: { path: ["type"], equals: "aiSuiteUnlock" },
          createdAt: { gte: startedAt },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, title: true, metadata: true, createdAt: true },
      });
      if (unlockReq) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!unlockReq && dialogMessage) {
      await prisma.$disconnect();
      throw new Error(`E2E: Unlock flow showed an alert and no EditRequest was created. Alert: "${dialogMessage}"`);
    }

    await prisma.$disconnect();

    expect(unlockReq, "Expected a new AI Suite unlock EditRequest to be created").toBeTruthy();
    expect(unlockReq?.status).toBe("NEW");
    expect((unlockReq as any)?.metadata?.amount).toBe(50);
    expect(unlockReq?.title || "").toContain("AI Suite Unlock");
  });
});


