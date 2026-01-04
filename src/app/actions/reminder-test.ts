"use server";

import { prisma } from "@/lib/prisma";
import { getTenantPrisma, getSessionTenantId } from "@/lib/tenant-guard";
import { format } from "date-fns";
import { auth } from "@/auth";

export async function sendTestReminderAction(template: any) {
  try {
    const tenantId = await getSessionTenantId();
    const session = await auth();
    if (!tenantId || !session?.user?.email) return { success: false, error: "Unauthorized" };

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) return { success: false, error: "Tenant not found" };

    const data = {
      "@user_name": session.user.name || "Test User",
      "@date": format(new Date(), "PPPP"),
      "@time": "2:00 PM",
      "@location": "123 Test Street, Sydney",
      "@studio_name": tenant.name,
    };

    const { notificationService } = await import("@/server/services/notification.service");
    // @ts-ignore
    const contentHtml = notificationService['blocksToHtml'](template.blocks, data);
    // @ts-ignore
    const html = notificationService['getBaseTemplate'](contentHtml, tenant, "Test Reminder");

    const { emailService } = await import("@/server/services/email.service");
    await emailService.sendEmail({
      tenantId,
      to: session.user.email,
      subject: `[TEST] ${template.subject.replaceAll("@studio_name", tenant.name)}`,
      html
    });

    return { success: true };
  } catch (error: any) {
    console.error("SEND TEST REMINDER ERROR:", error);
    return { success: false, error: error.message || "Failed to send test email" };
  }
}

