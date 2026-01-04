"use server";

import { getTenantPrisma, getSessionTenantId } from "@/lib/tenant-guard";
import { notificationService } from "@/server/services/notification.service";
import { auth } from "@/auth";

export async function sendNewsletter(template: any, recipientIds: string[]) {
  try {
    const session = await auth();
    const tPrisma = await getTenantPrisma();
    const tenantId = await getSessionTenantId();
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    if (recipientIds.length === 0) {
      return { success: false, error: "No recipients selected" };
    }

    // Fetch recipients (automatically scoped by tPrisma)
    const clients = await tPrisma.client.findMany({
      where: {
        id: { in: recipientIds },
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    // In a real app, you would send emails here using a loop or batch service
    // For now, we'll log it and simulate success
    console.log(`Sending newsletter to ${clients.length} clients`);
    console.log("Subject:", template.subject);
    
    await notificationService.sendNewsletterBroadcast(tenantId, template, recipientIds);

    return { success: true };
  } catch (error: any) {
    console.error("SEND NEWSLETTER ERROR:", error);
    return { success: false, error: error.message || "Failed to send newsletter" };
  }
}

