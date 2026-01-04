"use server";

import { getTenantPrisma, enforceSubscription } from "@/lib/tenant-guard";
import { revalidatePath } from "next/cache";
import { notificationService } from "@/server/services/notification.service";
import { auth } from "@/auth";
import { permissionService } from "@/lib/permission-service";

export async function upsertClient(data: any) {
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
      avatarUrl,
      status, 
      permissions,
      priceOverrides,
      watermarkUrl,
      watermarkSettings
    } = data;
    
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
        priceOverrides: priceOverrides || {}
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
            priceOverrides: priceOverrides || {}
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
            permissions: permissions || {}
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
    revalidatePath("/mobile/clients");

    // Notifications
    try {
      if (isNew) {
        console.log(`[ACTION_CLIENT] New client created, triggering welcome email for ${client.id}...`);
        await notificationService.sendClientWelcome(client.id);
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
