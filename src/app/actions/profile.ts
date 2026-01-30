"use server";

import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { revalidatePath } from "next/cache";
import { normalizePublicImageUrl } from "@/app/actions/client";

export async function updateMyClientProfile(data: {
  name?: string;
  businessName?: string;
  phone?: string;
  accountsEmail?: string;
  avatarUrl?: string;
  watermarkUrl?: string;
}) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = String((session.user as any).role || "");
    if (role !== "CLIENT" && role !== "AGENT") {
      return { success: false, error: "Permission denied" };
    }

    const clientId = String((session.user as any).clientId || "").trim();
    if (!clientId) return { success: false, error: "Client account not found" };

    const tPrisma = await getTenantPrisma();

    const existing = await (tPrisma as any).client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        settings: true,
      },
    });
    if (!existing) return { success: false, error: "Client not found" };

    const name = String(data?.name || "").trim();
    const businessName = String(data?.businessName || "").trim();
    const phone = String(data?.phone || "").trim();
    const accountsEmail = String(data?.accountsEmail || "").trim();

    const rawAvatar = String(data?.avatarUrl || "").trim();
    const rawWatermark = String(data?.watermarkUrl || "").trim();

    const avatarUrl = (rawAvatar && rawAvatar.length > 5000) ? null : await normalizePublicImageUrl(rawAvatar);
    const watermarkUrl = await normalizePublicImageUrl(rawWatermark);

    if (rawAvatar && rawAvatar.trim() && !avatarUrl) {
      return { success: false, error: "Profile image link must be a public https:// URL or Dropbox link." };
    }
    if (rawWatermark && rawWatermark.trim() && !watermarkUrl) {
      return { success: false, error: "Branding logo link must be a public https:// URL or Dropbox link." };
    }

    const prevSettings = existing.settings && typeof existing.settings === "object" ? (existing.settings as any) : {};
    const nextSettings = { ...prevSettings, accountsEmail };

    await (tPrisma as any).client.update({
      where: { id: clientId },
      data: {
        name: name || undefined,
        businessName: businessName || undefined,
        phone: phone || undefined,
        avatarUrl: avatarUrl || null,
        watermarkUrl: watermarkUrl || null,
        settings: nextSettings,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/tenant/profile");
    revalidatePath("/tenant/agents");
    revalidatePath("/tenant/clients");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to update profile" };
  }
}

