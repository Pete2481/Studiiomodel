"use server";

import { getTenantPrisma } from "@/lib/tenant-guard";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { permissionService } from "@/lib/permission-service";

export async function upsertService(data: any) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "manageServices")) {
      return { success: false, error: "Permission Denied: Cannot manage services." };
    }

    const tPrisma = await getTenantPrisma();

    const { id, name, description, price, durationMinutes, icon, active, clientVisible, includeTax, slotType } = data;

    let settings = {
      includeTax: includeTax ?? true,
    };

    if (id) {
      const existing = await (tPrisma as any).service.findFirst({
        where: { id }
      });
      if (!existing) return { success: false, error: "Service not found" };
      
      // Preserve existing settings (like isFavorite)
      settings = {
        ...((existing.settings as any) || {}),
        ...settings
      };
    }

    const serviceData = {
      name,
      description,
      price: parseFloat(price),
      durationMinutes: parseInt(durationMinutes) || 60,
      icon: icon || "CAMERA",
      active: active ?? true,
      clientVisible: clientVisible ?? true,
      slotType: slotType || null,
      settings
    };

    if (id) {
      await (tPrisma as any).service.update({
        where: { id },
        data: serviceData,
      });
    } else {
      await (tPrisma as any).service.create({
        data: {
          ...serviceData,
        },
      });
    }

    revalidatePath("/tenant/services");
    return { success: true };
  } catch (error: any) {
    console.error("UPSERT SERVICE ERROR:", error);
    return { success: false, error: error.message || "Failed to save service." };
  }
}

export async function toggleServiceFavorite(id: string, isFavorite: boolean) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "manageServices")) {
      return { success: false, error: "Permission Denied: Cannot manage services." };
    }

    const tPrisma = await getTenantPrisma();

    const service = await (tPrisma as any).service.findFirst({
      where: { id }
    });

    if (!service) return { success: false, error: "Service not found" };

    const settings = (service.settings as any) || {};
    
    await (tPrisma as any).service.update({
      where: { id },
      data: {
        settings: {
          ...settings,
          isFavorite
        }
      }
    });

    revalidatePath("/tenant/services");
    revalidatePath("/tenant/bookings");
    return { success: true };
  } catch (error: any) {
    console.error("TOGGLE FAVORITE ERROR:", error);
    return { success: false, error: "Failed to update favorite status." };
  }
}

export async function deleteService(id: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "manageServices")) {
      return { success: false, error: "Permission Denied: Cannot manage services." };
    }

    const tPrisma = await getTenantPrisma();

    const service = await (tPrisma as any).service.findFirst({
      where: { id }
    });

    if (!service) return { success: false, error: "Service not found" };

    await (tPrisma as any).service.delete({
      where: { id },
    });

    revalidatePath("/tenant/services");
    return { success: true };
  } catch (error: any) {
    console.error("DELETE SERVICE ERROR:", error);
    return { success: false, error: "Failed to delete service. It might be linked to existing bookings." };
  }
}

export async function importServicesCsv(formData: FormData) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "manageServices")) {
      return { success: false, error: "Permission Denied: Cannot manage services." };
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
      // Simple CSV parse: name, description, price, duration
      const [name, description, price, duration] = row.split(",").map(s => s.trim().replace(/^"|"$/g, ''));
      
      if (!name || !price) continue;

      await (tPrisma as any).service.create({
        data: {
          name,
          description: description || "",
          price: parseFloat(price) || 0,
          durationMinutes: parseInt(duration) || 60,
          icon: "CAMERA",
          active: true,
          settings: {
            includeTax: true
          }
        }
      });
      count++;
    }

    revalidatePath("/tenant/services");
    return { success: true, count };
  } catch (error: any) {
    console.error("CSV IMPORT ERROR:", error);
    return { success: false, error: "Failed to import CSV. Please ensure the format is: Name, Description, Price, Duration" };
  }
}
