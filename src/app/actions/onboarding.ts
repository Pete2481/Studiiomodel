"use server";

import { prisma } from "@/lib/prisma";
import { getSessionTenantId } from "@/lib/tenant-guard";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

export async function getOnboardingProgress() {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) return null;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            clients: true,
            services: true,
          }
        }
      }
    });

    if (!tenant) return null;

    const steps = [
      {
        id: "branding",
        title: "Studio Branding",
        description: "Upload your logo and set your brand color.",
        isCompleted: !!tenant.logoUrl || tenant.brandColor !== "#10b981",
        link: "/tenant/settings?tab=branding"
      },
      {
        id: "invoice",
        title: "Invoice Details",
        description: "Add your ABN and bank details for payments.",
        isCompleted: !!tenant.abn && !!tenant.accountNumber,
        link: "/tenant/settings?tab=invoicing"
      },
      {
        id: "dropbox",
        title: "Connect Dropbox",
        description: "Link your Dropbox account for automated delivery.",
        isCompleted: !!tenant.dropboxAccountId,
        link: "/tenant/settings?tab=data"
      },
      {
        id: "service",
        title: "First Service",
        description: "Configure your photography services and pricing.",
        isCompleted: tenant._count.services > 0,
        link: "/tenant/services"
      },
      {
        id: "client",
        title: "First Client",
        description: "Add your first real estate agency or client.",
        isCompleted: tenant._count.clients > 0,
        link: "/tenant/clients"
      }
    ];

    const completedCount = steps.filter(s => s.isCompleted).length;
    const totalCount = steps.length;
    const isAllCompleted = completedCount === totalCount;

    // Check if they've dismissed the welcome popup
    const settings = (tenant.settings as any) || {};
    const hasDismissedWelcome = !!settings.onboarding?.welcomeDismissed;

    return {
      steps,
      completedCount,
      totalCount,
      isAllCompleted,
      hasDismissedWelcome
    };
  } catch (error) {
    console.error("GET ONBOARDING PROGRESS ERROR:", error);
    return null;
  }
}

export async function dismissWelcomeAction() {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) return { success: false };

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return { success: false };

    const settings = (tenant.settings as any) || {};
    
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...settings,
          onboarding: {
            ...settings.onboarding,
            welcomeDismissed: true
          }
        }
      }
    });

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("DISMISS WELCOME ERROR:", error);
    return { success: false };
  }
}

