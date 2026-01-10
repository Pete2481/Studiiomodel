"use server";

import { prisma } from "@/lib/prisma";
import { getSessionTenantId, getTenantPrisma } from "@/lib/tenant-guard";
import { revalidatePath } from "next/cache";
import { format, addDays, subMinutes, addMinutes, startOfDay } from "date-fns";
import { getWeatherData } from "./weather";
import { auth } from "@/auth";
import { BookingStatus } from "@prisma/client";

export async function updateTenantBranding(data: {
  name: string;
  logoUrl?: string | null;
  brandColor?: string;
}) {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: data.name,
        logoUrl: data.logoUrl,
        brandColor: data.brandColor || "#94a3b8",
      }
    });

    revalidatePath("/tenant/settings");
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE BRANDING ERROR:", error);
    return { success: false, error: error.message || "Failed to update branding" };
  }
}

export async function updateTenantContactInfo(data: {
  contactEmail: string;
  contactPhone: string;
  accountEmail: string;
  address: string;
  city: string;
  postalCode: string;
  timezone: string;
  currency: string;
  revenueTarget?: number;
}) {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        accountEmail: data.accountEmail,
        address: data.address,
        city: data.city,
        postalCode: data.postalCode,
        timezone: data.timezone,
        currency: data.currency,
        revenueTarget: data.revenueTarget ? Number(data.revenueTarget) : 100000,
      }
    });

    revalidatePath("/tenant/settings");
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE CONTACT ERROR:", error);
    return { success: false, error: error.message || "Failed to update contact info" };
  }
}

export async function updateTenantInvoicingSettings(data: {
  invoiceLogoUrl?: string | null;
  invoiceTerms: string;
  abn: string;
  taxLabel: string;
  taxRate: number;
  taxInclusive?: boolean;
  accountName: string;
  bsb: string;
  accountNumber: string;
  autoInvoiceReminders?: boolean;
  invoiceDueDays?: number;
}) {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    // IMPORTANT: taxRate from UI is percentage (e.g. 10), DB column expects decimal (e.g. 0.1)
    const dbTaxRate = Number(data.taxRate) / 100;
    const autoReminders = Boolean(data.autoInvoiceReminders);

    console.log("[UpdateSettings] Saving:", { tenantId, autoReminders, dbTaxRate });

    // Standard Prisma update is safer and supports type checking
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        invoiceLogoUrl: data.invoiceLogoUrl || null,
        invoiceTerms: data.invoiceTerms,
        abn: data.abn,
        taxLabel: data.taxLabel,
        taxRate: dbTaxRate,
        taxInclusive: data.taxInclusive ?? true,
        accountName: data.accountName,
        bsb: data.bsb,
        accountNumber: data.accountNumber,
        autoInvoiceReminders: autoReminders,
        invoiceDueDays: data.invoiceDueDays ? Number(data.invoiceDueDays) : 7,
      }
    });

    revalidatePath("/tenant/settings");
    revalidatePath("/tenant/invoices");
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE INVOICING ERROR:", error);
    return { success: false, error: error.message || "Failed to update invoicing settings" };
  }
}

export async function updateTenantSecuritySettings(data: {
  privacyPolicyUrl: string;
  termsOfUseUrl: string;
  contactStudioUrl: string;
}) {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        privacyPolicyUrl: data.privacyPolicyUrl,
        termsOfUseUrl: data.termsOfUseUrl,
        contactStudioUrl: data.contactStudioUrl,
      }
    });

    revalidatePath("/tenant/settings");
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE SECURITY SETTINGS ERROR:", error);
    return { success: false, error: error.message || "Failed to update security settings" };
  }
}

export async function updateTenantBookingStatuses(statuses: string[]) {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        bookingStatuses: statuses
      }
    });

    revalidatePath("/tenant/settings");
    revalidatePath("/tenant/bookings");
    revalidatePath("/tenant/calendar");
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE BOOKING STATUSES ERROR:", error);
    return { success: false, error: error.message || "Failed to update booking statuses" };
  }
}

export async function updateTenantBusinessHours(hours: any) {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    // 1. Update the business hours in the DB using Raw SQL to ensure "Hard Save"
    // This bypasses any Prisma/Next.js caching issues.
    // We cast $1 to ::jsonb because Postgres is strict about types in raw queries.
    await prisma.$executeRawUnsafe(
      `UPDATE "Tenant" SET "businessHours" = $1::jsonb WHERE id = $2`,
      JSON.stringify(hours),
      tenantId
    );

    // 2. Generate/Update Placeholders for the next 30 days
    const startDate = new Date();
    const startDateStr = format(startDate, "yyyy-MM-dd");

    const tPrisma = await getTenantPrisma();
    
    // 1. Delete ALL future placeholders to start fresh (from today onwards)
    await tPrisma.booking.deleteMany({
      where: {
        isPlaceholder: true,
        startAt: { gte: startOfDay(startDate) }
      }
    });

    // Get weather/sun data for placeholders (Open-Meteo forecast is max 16 days)
    const weatherRes = await getWeatherData(-28.8333, 153.4333, startDateStr, format(addDays(startDate, 13), "yyyy-MM-dd"));
    
    if (weatherRes.success && weatherRes.daily) {
      const lastSunriseStr = weatherRes.daily.sunrise[weatherRes.daily.sunrise.length - 1];
      const lastSunsetStr = weatherRes.daily.sunset[weatherRes.daily.sunset.length - 1];

      // Prepare batch data
      const placeholdersToCreate = [];

      for (let i = 0; i < 30; i++) {
        const currentDate = addDays(startDate, i);
        const dateStr = format(currentDate, "yyyy-MM-dd");
        const dayOfWeek = currentDate.getDay().toString();
        const config = hours[dayOfWeek];

        if (!config || (!config.sunrise && !config.dusk)) continue;

        let sunriseTime: Date;
        let sunsetTime: Date;

        const sunDataIdx = weatherRes.daily.time.indexOf(dateStr);
        if (sunDataIdx !== -1) {
          sunriseTime = new Date(weatherRes.daily.sunrise[sunDataIdx]);
          sunsetTime = new Date(weatherRes.daily.sunset[sunDataIdx]);
        } else {
          // Calculate approximate sun times based on the last known day
          const daysFromLast = i - (weatherRes.daily.time.length - 1);
          const baseSunrise = new Date(lastSunriseStr);
          const baseSunset = new Date(lastSunsetStr);
          
          sunriseTime = new Date(baseSunrise.getTime() + (daysFromLast * 24 * 60 * 60 * 1000));
          sunsetTime = new Date(baseSunset.getTime() + (daysFromLast * 24 * 60 * 60 * 1000));
        }

        // Create Sunrise Slots
        for (let s = 0; s < (config.sunrise || 0); s++) {
          placeholdersToCreate.push({
            tenantId,
            title: "SUNRISE SLOT",
            startAt: subMinutes(sunriseTime, 30),
            endAt: addMinutes(sunriseTime, 30),
            status: BookingStatus.REQUESTED,
            isPlaceholder: true,
            slotType: "SUNRISE",
            clientId: null,
            propertyId: null,
            metadata: {}
          });
        }

        // Create Dusk Slots
        for (let d = 0; d < (config.dusk || 0); d++) {
          placeholdersToCreate.push({
            tenantId,
            title: "DUSK SLOT",
            startAt: subMinutes(sunsetTime, 30),
            endAt: addMinutes(sunsetTime, 30),
            status: BookingStatus.REQUESTED,
            isPlaceholder: true,
            slotType: "DUSK",
            clientId: null,
            propertyId: null,
            metadata: {}
          });
        }
      }

      // 2. Batch Create everything
      if (placeholdersToCreate.length > 0) {
        await tPrisma.booking.createMany({
          data: placeholdersToCreate
        });
      }
    }

    revalidatePath("/tenant/settings");
    revalidatePath("/tenant/calendar");
    revalidatePath("/tenant/bookings");
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE BUSINESS HOURS ERROR:", error);
    return { success: false, error: error.message || "Failed to update business hours" };
  }
}

export async function updateTenantReminderTemplate(data: {
  enabled: boolean;
  hoursBefore: number;
  subject: string;
  blocks: any[];
}) {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) return { success: false, error: "Tenant not found" };

    const currentSettings = (tenant.settings as any) || {};

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...currentSettings,
          reminderTemplate: {
            enabled: data.enabled,
            hoursBefore: data.hoursBefore,
            subject: data.subject,
            blocks: data.blocks
          }
        }
      }
    });

    revalidatePath("/tenant/settings");
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE REMINDER TEMPLATE ERROR:", error);
    return { success: false, error: error.message || "Failed to update reminder template" };
  }
}

export async function updateTenantNotificationSettings(data: {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
}) {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session || !tenantId) return { success: false, error: "Unauthorized" };

    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        smtpUser: data.smtpUser,
        smtpPass: data.smtpPass,
        smtpSecure: data.smtpSecure,
      }
    });

    revalidatePath("/tenant/settings");
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE NOTIFICATION SETTINGS ERROR:", error);
    return { success: false, error: error.message || "Failed to update notification settings" };
  }
}

// EOF
