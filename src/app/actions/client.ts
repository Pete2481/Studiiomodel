"use server";

import { getTenantPrisma, enforceSubscription } from "@/lib/tenant-guard";
import { revalidatePath } from "next/cache";
import { notificationService } from "@/server/services/notification.service";
import { auth } from "@/auth";
import { permissionService } from "@/lib/permission-service";
import { prisma } from "@/lib/prisma";
import { randomInt } from "crypto";

export async function upsertClient(data: any, skipNotification = false) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Cannot manage clients." };
    }

    // SECURITY: Prevent API-level bypass of the paywall
    await enforceSubscription();

    const tPrisma = await getTenantPrisma();

    const { 
      id, 
      name, 
      email, 
      businessName, 
      phone, 
      avatarUrl: rawAvatarUrl,
      status, 
      permissions,
      priceOverrides,
      disabledServices,
      watermarkUrl,
      watermarkSettings
    } = data;

    // SAFETY: Never store massive base64 images in the DB.
    const avatarUrl = (rawAvatarUrl && rawAvatarUrl.length > 5000) ? null : rawAvatarUrl;
    
    console.log(`[ACTION_CLIENT] Upserting client. ID provided: "${id}"`);

    const clientData = {
      name,
      email,
      businessName,
      phone,
      avatarUrl,
      status: status || "PENDING",
      watermarkUrl,
      watermarkSettings: watermarkSettings || {},
      settings: {
        permissions: permissions || {},
        priceOverrides: priceOverrides || {},
        disabledServices: disabledServices || []
      },
    };

    let client;
    const isNew = !id || id === "" || id === "undefined" || id === "null";
    console.log(`[ACTION_CLIENT] isNew determined as: ${isNew}`);

    if (!isNew) {
      // First verify ownership (automatically handled by tPrisma where)
      const existing = await (tPrisma as any).client.findUnique({
        where: { id }
      });
      if (!existing) return { success: false, error: "Client not found" };

      // Update existing using primary key and explicit fields
      client = await (tPrisma as any).client.update({
        where: { id },
        data: {
          name: name,
          email: email,
          businessName: businessName,
          phone: phone,
          avatarUrl: avatarUrl,
          status: status || "PENDING",
          watermarkUrl,
          watermarkSettings: watermarkSettings || {},
          settings: {
            permissions: permissions || {},
            priceOverrides: priceOverrides || {},
            disabledServices: disabledServices || []
          },
        }
      });
    } else {
      // Create new with explicit fields
      client = await (tPrisma as any).client.create({
        data: {
          name: name,
          email: email,
          businessName: businessName,
          phone: phone,
          avatarUrl: avatarUrl,
          status: status || "PENDING",
          watermarkUrl,
          watermarkSettings: watermarkSettings || {},
          settings: {
            permissions: permissions || {},
            priceOverrides: priceOverrides || {},
            disabledServices: disabledServices || []
          },
          slug: (businessName || name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        }
      });
    }

    if (!client) {
      return { success: false, error: "Failed to create/update client record." };
    }

    // Handle User & Membership for portal access
    if (email && (status === "ACTIVE" || status === "PENDING")) {
      // User is global, tPrisma won't scope it
      let user = await (tPrisma as any).user.findUnique({ where: { email } });
      if (!user) {
        user = await (tPrisma as any).user.create({
          data: {
            email,
            name: name,
          }
        });
      }

      // Check for membership (automatically scoped to tenant by tPrisma)
      const membership = await (tPrisma as any).tenantMembership.findFirst({
        where: { 
          userId: user.id,
          clientId: client.id
        }
      });

      if (!membership) {
        await (tPrisma as any).tenantMembership.create({
          data: {
            user: { connect: { id: user.id } },
            client: { connect: { id: client.id } },
            role: "CLIENT", // default role for client portal users
            permissions: permissions || {},
          }
        });
      } else {
        // Update permissions on membership
        await (tPrisma as any).tenantMembership.update({
          where: { id: membership.id },
          data: {
            permissions: permissions || {},
          }
        });
      }
    }

    revalidatePath("/tenant/clients");

    // Notifications
    try {
      if (isNew && !skipNotification) {
        console.log(`[ACTION_CLIENT] New client created, triggering welcome email for ${client.id}...`);
        await notificationService.sendClientWelcome(client.id);
      } else if (isNew && skipNotification) {
        console.log(`[ACTION_CLIENT] New client created, skipping notification as requested.`);
      } else {
        console.log(`[ACTION_CLIENT] Client ${client.id} updated, no welcome email needed.`);
      }
    } catch (notifError) {
      console.error("[ACTION_CLIENT] NOTIFICATION ERROR (non-blocking):", notifError);
    }

    return { success: true, clientId: String(client.id) };
  } catch (error: any) {
    console.error("UPSERT CLIENT ERROR:", error);
    return { success: false, error: error.message || "Failed to save client." };
  }
}

export async function deleteClient(id: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Cannot archive clients." };
    }

    const tPrisma = await getTenantPrisma();

    // Soft delete (automatically handled by tPrisma where)
    await (tPrisma as any).client.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    revalidatePath("/tenant/clients");
    return { success: true };
  } catch (error: any) {
    console.error("DELETE CLIENT ERROR:", error);
    return { success: false, error: "Failed to archive client." };
  }
}

export async function resendClientInvite(id: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Cannot resend invites." };
    }

    const tPrisma = await getTenantPrisma();

    // automatically handled by tPrisma where
    const client = await (tPrisma as any).client.findUnique({
      where: { id }
    });

    if (!client) return { success: false, error: "Client not found" };

    await notificationService.sendClientWelcome(client.id);

    return { success: true };
  } catch (error: any) {
    console.error("RESEND INVITE ERROR:", error);
    return { success: false, error: "Failed to resend invite." };
  }
}

export async function importClientsCsv(formData: FormData) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Cannot manage clients." };
    }

    const tPrisma = await getTenantPrisma();

    const file = formData.get("file") as File;
    if (!file) return { success: false, error: "No file provided" };

    const text = await file.text();
    const rows = text.split("\n").filter(row => row.trim());
    
    // Skip header row
    const dataRows = rows.slice(1);
    let count = 0;

    for (const row of dataRows) {
      // CSV format: Business Name, Contact Name, Email, Phone
      // We use a regex for CSV split to handle quotes better
      const columns = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || row.split(",").map(s => s.trim());
      const values = columns.map(s => s.trim().replace(/^"|"$/g, ''));
      
      const [businessName, contactName, email, phone] = values;
      
      if (!contactName && !businessName) continue;

      // Use the upsert logic if email is provided, or just create
      await upsertClient({
        name: contactName || businessName,
        email: email || null,
        businessName: businessName || contactName,
        phone: phone || null,
        status: "PENDING",
        permissions: {},
        priceOverrides: {}
      }, true); // skipNotification = true
      
      count++;
    }

    revalidatePath("/tenant/clients");
    return { success: true, count };
  } catch (error: any) {
    console.error("CLIENT CSV IMPORT ERROR:", error);
    return { success: false, error: "Failed to import CSV. Please ensure the format is: Agency Name, Contact Name, Email, Phone" };
  }
}

export async function impersonateClientAction(clientId: string) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId || (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN")) {
      throw new Error("Unauthorized: Admin only");
    }

    const tenantId = session.user.tenantId;
    const userEmail = session.user.email;
    if (!userEmail) throw new Error("User email not found");

    // 1. Find the user
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) throw new Error("User record not found");

    // 2. Find or create a CLIENT membership for this Admin for this specific Client
    // This allows them to switch into "Client Mode" for this agency.
    let membership = await prisma.tenantMembership.findFirst({
      where: {
        tenantId,
        userId: user.id,
        clientId,
        role: "CLIENT"
      }
    });

    if (!membership) {
      membership = await prisma.tenantMembership.create({
        data: {
          tenantId,
          userId: user.id,
          clientId,
          role: "CLIENT",
          permissions: {
            canDownloadHighRes: true,
            canViewAllAgencyGalleries: true,
            canPlaceBookings: true,
            canViewInvoices: true,
            canEditRequests: true,
          }
        }
      });
    }

    // 3. Generate a one-time token for instant login
    const otp = randomInt(100000, 999999).toString();
    const expires = new Date(Date.now() + 60 * 1000); // 1 minute expiry
    const identifier = `${userEmail.toLowerCase().trim()}:${membership.id}`;

    await prisma.verificationToken.deleteMany({
      where: { identifier }
    });
    
    await prisma.verificationToken.create({
      data: { identifier, token: otp, expires }
    });

    return { 
      success: true, 
      otp, 
      email: userEmail, 
      membershipId: membership.id 
    };
  } catch (error: any) {
    console.error("Failed to prepare client impersonation:", error);
    return { success: false, error: error.message || "Failed to prepare switch" };
  }
}
