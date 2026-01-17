import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test.describe("Booking notifications (preview + send)", () => {
  test("returns a draft preview and sends (dryRun) to tenant/client/agent/team", async ({ page, request }) => {
    test.setTimeout(120_000);
    const prisma = new PrismaClient();

    // Pick any usable membership.
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

    const tenantId = membership.tenantId;
    const user = membership.user;

    // Ensure we have recipients in DB
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      await prisma.$disconnect();
      throw new Error(`E2E: Tenant not found: ${tenantId}`);
    }
    if (!tenant.contactEmail) {
      await prisma.tenant.update({ where: { id: tenantId }, data: { contactEmail: user.email } });
    }

    const client = await prisma.client.findFirst({ where: { tenantId, email: { not: null } } });
    if (!client?.email) {
      await prisma.$disconnect();
      throw new Error("E2E: No client with email found for tenant. Seed at least one client email.");
    }

    const agent = await prisma.agent.findFirst({ where: { tenantId, email: { not: null } } });
    if (!agent?.email) {
      await prisma.$disconnect();
      throw new Error("E2E: No agent with email found for tenant. Seed at least one agent email.");
    }

    const teamMember = await prisma.teamMember.findFirst({ where: { tenantId, email: { not: null }, deletedAt: null } });
    if (!teamMember?.email) {
      await prisma.$disconnect();
      throw new Error("E2E: No team member with email found for tenant. Seed at least one team member email.");
    }

    const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    const booking = await prisma.booking.create({
      data: {
        tenant: { connect: { id: tenantId } },
        title: "E2E Booking Notification",
        startAt,
        endAt,
        timezone: tenant.timezone || "Australia/Sydney",
        status: "REQUESTED",
        client: { connect: { id: client.id } },
        agent: { connect: { id: agent.id } },
        assignments: {
          create: [{ tenantId, teamMemberId: teamMember.id, role: "PHOTOGRAPHER" }],
        },
      },
      select: { id: true },
    });

    // Login without email delivery (inject OTP)
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
      maxRedirects: 0 as any,
    } as any);

    const setCookieHeaders = (loginRes.headersArray?.() || []).filter(
      (h: any) => String(h.name || "").toLowerCase() === "set-cookie"
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
      }))
    );

    const previewRes = await request.post("/api/tenant/calendar/notifications/preview", {
      data: { bookingId: booking.id, type: "NEW_BOOKING" },
    });
    expect(previewRes.ok()).toBeTruthy();
    const previewJson: any = await previewRes.json();
    expect(previewJson?.subject || "").toContain("New Booking");
    expect(String(previewJson?.html || "")).toContain("E2E Booking Notification");

    const to: string[] = Array.isArray(previewJson?.to) ? previewJson.to : [];
    expect(to).toContain((await prisma.tenant.findUnique({ where: { id: tenantId }, select: { contactEmail: true } }))?.contactEmail);
    expect(to).toContain(client.email);
    expect(to).toContain(agent.email);
    expect(to).toContain(teamMember.email);

    const sendRes = await request.post("/api/tenant/calendar/notifications/send", {
      data: { bookingId: booking.id, type: "NEW_BOOKING", dryRun: true },
    });
    expect(sendRes.ok()).toBeTruthy();
    const sendJson: any = await sendRes.json();
    expect(sendJson?.success).toBeTruthy();

    const updated = await prisma.booking.findUnique({ where: { id: booking.id }, select: { metadata: true } });
    expect((updated as any)?.metadata?.lastNotificationType).toBe("NEW_BOOKING");
    expect((updated as any)?.metadata?.lastNotificationSentAt).toBeTruthy();

    await prisma.$disconnect();
  });
});


