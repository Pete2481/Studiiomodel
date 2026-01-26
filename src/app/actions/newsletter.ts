"use server";

import { getTenantPrisma, getSessionTenantId } from "@/lib/tenant-guard";
import { notificationService } from "@/server/services/notification.service";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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
        email: true,
      },
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

type NewsletterBlock = { id: string; type: "text" | "image"; content: string; width?: number };
type NewsletterTemplate = { subject: string; blocks: NewsletterBlock[] };
type NewsletterDraft = {
  id: string;
  template: NewsletterTemplate;
  createdAt: string;
  updatedAt: string;
};

function safeDraftArray(input: unknown): NewsletterDraft[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((d: any) => ({
      id: String(d?.id || ""),
      template: {
        subject: String(d?.template?.subject || ""),
        blocks: Array.isArray(d?.template?.blocks) ? (d.template.blocks as any) : [],
      },
      createdAt: String(d?.createdAt || ""),
      updatedAt: String(d?.updatedAt || ""),
    }))
    .filter((d) => Boolean(d.id) && Boolean(d.template?.subject));
}

function generateDraftId() {
  // Avoid importing crypto; sufficient uniqueness for UI drafts.
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveNewsletterDraft(template: NewsletterTemplate, draftId?: string | null) {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session?.user || !tenantId) return { success: false, error: "Unauthorized" } as const;

    // ROLE CHECK (tenant newsletter is admin-only)
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." } as const;
    }

    const subject = String(template?.subject || "").trim();
    const blocks = Array.isArray(template?.blocks) ? template.blocks : [];
    if (!subject) return { success: false, error: "Subject is required" } as const;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const settings = tenant?.settings && typeof tenant.settings === "object" ? (tenant.settings as any) : {};
    const drafts = safeDraftArray(settings.newsletterDrafts);
    const now = new Date().toISOString();

    const targetId = draftId ? String(draftId) : "";
    const existingIdx = targetId ? drafts.findIndex((d) => d.id === targetId) : -1;

    if (existingIdx >= 0) {
      drafts[existingIdx] = {
        ...drafts[existingIdx],
        template: { subject, blocks: blocks as any },
        updatedAt: now,
      };
    } else {
      if (drafts.length >= 5) {
        return { success: false, error: "Draft limit reached (5). Delete a draft to save another." } as const;
      }
      drafts.unshift({
        id: generateDraftId(),
        template: { subject, blocks: blocks as any },
        createdAt: now,
        updatedAt: now,
      });
    }

    drafts.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(settings || {}),
          newsletterDrafts: drafts,
        },
      },
    });

    revalidatePath("/tenant/newsletter");
    return { success: true, drafts } as const;
  } catch (error: any) {
    console.error("SAVE NEWSLETTER DRAFT ERROR:", error);
    return { success: false, error: error?.message || "Failed to save draft" } as const;
  }
}

export async function deleteNewsletterDraft(draftId: string) {
  try {
    const session = await auth();
    const tenantId = await getSessionTenantId();
    if (!session?.user || !tenantId) return { success: false, error: "Unauthorized" } as const;

    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." } as const;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const settings = tenant?.settings && typeof tenant.settings === "object" ? (tenant.settings as any) : {};
    const drafts = safeDraftArray(settings.newsletterDrafts).filter((d) => d.id !== String(draftId));

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(settings || {}),
          newsletterDrafts: drafts,
        },
      },
    });

    revalidatePath("/tenant/newsletter");
    return { success: true, drafts } as const;
  } catch (error: any) {
    console.error("DELETE NEWSLETTER DRAFT ERROR:", error);
    return { success: false, error: error?.message || "Failed to delete draft" } as const;
  }
}
