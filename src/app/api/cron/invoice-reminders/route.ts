import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notificationService } from "@/server/services/notification.service";
import { subDays } from "date-fns";

export const dynamic = "force-dynamic";

/**
 * AUTO INVOICE REMINDER CRON
 * Scans all tenants for outstanding invoices and sends reminders if enabled.
 * Security: Requires CRON_SECRET header or parameter.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") || req.headers.get("x-cron-secret");

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[CRON] Starting Auto Invoice Reminder scan...");

  try {
    // 1. Find all tenants with auto reminders enabled
    const tenants = await prisma.tenant.findMany({
      where: { autoInvoiceReminders: true, deletedAt: null },
      select: { id: true, name: true }
    });

    let totalSent = 0;

    for (const tenant of tenants) {
      // 2. Find outstanding, overdue invoices for this tenant
      // Criteria: Status SENT, Overdue, No reminder sent recently (last 3 days)
      const overdueInvoices = await prisma.invoice.findMany({
        where: {
          tenantId: tenant.id,
          status: "SENT",
          dueAt: { lt: new Date() },
          deletedAt: null,
          OR: [
            { lastReminderSentAt: null },
            { lastReminderSentAt: { lt: subDays(new Date(), 3) } }
          ]
        },
        select: { id: true, number: true }
      });

      for (const inv of overdueInvoices) {
        console.log(`[CRON] Sending auto-reminder for Invoice #${inv.number} (Tenant: ${tenant.name})`);
        
        try {
          await notificationService.sendInvoiceReminder(inv.id);
          
          // Update last reminder date
          await prisma.invoice.update({
            where: { id: inv.id },
            data: { lastReminderSentAt: new Date() }
          });
          
          totalSent++;
        } catch (err) {
          console.error(`[CRON] Failed to send reminder for ${inv.id}:`, err);
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      tenantsProcessed: tenants.length, 
      remindersSent: totalSent 
    });

  } catch (error: any) {
    console.error("[CRON] Auto Invoice Reminder Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

