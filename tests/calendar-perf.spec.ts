import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test.describe("Calendar perf (refresh)", () => {
  test("measures cold refresh + capture trace", async ({ page, request }) => {
    test.setTimeout(180_000);

    const prisma = new PrismaClient();

    // Pick any usable membership with an email.
    const preferredEmail = (process.env.E2E_EMAIL || "pete@mediadrive.com.au").toLowerCase().trim();
    const preferredUser = await prisma.user.findUnique({ where: { email: preferredEmail } });

    const membership =
      (preferredUser
        ? await prisma.tenantMembership.findFirst({
            where: { userId: preferredUser.id, tenant: { deletedAt: null } },
            include: { tenant: true, user: true, client: true, teamMember: true },
            orderBy: { createdAt: "asc" },
          })
        : null) ||
      (await prisma.tenantMembership.findFirst({
        where: { tenant: { deletedAt: null }, user: { email: { not: null } } },
        include: { tenant: true, user: true, client: true, teamMember: true },
        orderBy: { createdAt: "asc" },
      }));

    if (!membership?.user?.email) {
      await prisma.$disconnect();
      throw new Error("E2E: Could not find a usable membership with a user email.");
    }

    const user = membership.user;

    // Login without email delivery (inject OTP)
    const otp = "000000";
    const identifier = `${String(user.email).toLowerCase().trim()}:${membership.id}`;
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    await prisma.verificationToken.create({
      data: { identifier, token: otp, expires: new Date(Date.now() + 10 * 60 * 1000) },
    });

    const csrfRes = await request.get("/api/auth/csrf", {
      headers: { Accept: "application/json" },
    });
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
      maxRedirects: 0 as any,
    } as any);

    const setCookieHeaders = (loginRes.headersArray?.() || []).filter(
      (h: any) => String(h.name || "").toLowerCase() === "set-cookie",
    );
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
      })),
    );

    const url = "/tenant/calendar";

    // 1) First navigation (cold-ish) – measure response header timing + DOM/load.
    const navStart = Date.now();
    const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
    const navMs = Date.now() - navStart;
    expect(resp?.ok()).toBeTruthy();

    const timing = resp?.timing?.();
    const navPerf: any = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0] as any;
      if (!n) return null;
      return {
        domContentLoaded: n.domContentLoadedEventEnd,
        load: n.loadEventEnd,
        ttfb: n.responseStart,
        responseEnd: n.responseEnd,
        transferSize: n.transferSize,
      };
    });

    // Shell should appear (title from ShellSettings) even if calendar content is still loading.
    const shellStart = Date.now();
    await page.getByText("Booking calendar", { exact: false }).first().waitFor({ timeout: 60_000 });
    const shellMs = Date.now() - shellStart;

    // 2) Soft refresh
    const refreshStart = Date.now();
    const resp2 = await page.reload({ waitUntil: "domcontentloaded" });
    const refreshMs = Date.now() - refreshStart;
    expect(resp2?.ok()).toBeTruthy();

    const navPerf2: any = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0] as any;
      if (!n) return null;
      return {
        domContentLoaded: n.domContentLoadedEventEnd,
        load: n.loadEventEnd,
        ttfb: n.responseStart,
        responseEnd: n.responseEnd,
        transferSize: n.transferSize,
      };
    });

    // Log for quick visibility in terminal output.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ url, navMs, shellMs, timing, navPerf, refreshMs, navPerf2 }, null, 2));

    await prisma.$disconnect();
  });
});

