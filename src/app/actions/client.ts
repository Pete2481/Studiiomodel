"use server";

import { getTenantPrisma, enforceSubscription } from "@/lib/tenant-guard";
import { revalidatePath } from "next/cache";
import { notificationService } from "@/server/services/notification.service";
import { auth } from "@/auth";
import { permissionService } from "@/lib/permission-service";
import { prisma } from "@/lib/prisma";
import { randomInt } from "crypto";
import { cleanDropboxLink } from "@/lib/utils";

function isPrivateHost(hostname: string): boolean {
  const h = String(hostname || "").toLowerCase().trim();
  if (!h) return true;
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;

  // Basic private IPv4 ranges (no DNS resolution; best-effort SSRF guard)
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (![a, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) return true;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function looksLikeDirectImageUrl(u: URL): boolean {
  const p = u.pathname.toLowerCase();
  return (
    p.endsWith(".png") ||
    p.endsWith(".jpg") ||
    p.endsWith(".jpeg") ||
    p.endsWith(".webp") ||
    p.endsWith(".gif") ||
    p.endsWith(".svg")
  );
}

function tryExtractMetaImage(html: string): string | null {
  const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
  if (og) return og;
  const tw = html.match(/name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
  if (tw) return tw;
  // Favicon as last resort
  const icon = html.match(/rel=["'](?:shortcut icon|icon)["'][^>]*href=["']([^"']+)["']/i)?.[1];
  return icon || null;
}

async function resolveWebsiteToImageUrl(pageUrl: URL): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(pageUrl.toString(), {
      signal: controller.signal,
      headers: {
        accept: "text/html,*/*",
        "user-agent": "studiio/1.0",
      },
      cache: "no-store",
    });

    if (!res.ok) return null;
    const ct = String(res.headers.get("content-type") || "").toLowerCase();
    if (ct.startsWith("image/")) return pageUrl.toString();

    // Try to parse HTML for og:image / twitter:image / icon
    const html = await res.text().catch(() => "");
    if (!html) return null;
    const raw = tryExtractMetaImage(html);
    if (!raw) return null;
    const resolved = new URL(raw, pageUrl.toString()).toString();
    return resolved;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function normalizePublicImageUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("data:") || lower.startsWith("blob:")) return null;

  // Add scheme for common inputs like "www.example.com/logo.png"
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    // Only auto-prefix when it looks like a hostname (has a dot before the first slash).
    if (/^[a-z0-9-]+\.[a-z0-9.-]+(\/|$)/i.test(candidate)) {
      candidate = `https://${candidate}`;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  // Enforce https (upgrade http → https when possible).
  if (parsed.protocol === "http:") parsed = new URL(parsed.toString().replace(/^http:/i, "https:"));
  if (parsed.protocol !== "https:") return null;
  if (isPrivateHost(parsed.hostname)) return null;

  // Dropbox: normalize to a stable public direct URL for consistent rendering + server-side watermarking.
  if (parsed.hostname.includes("dropbox.com") || parsed.hostname.includes("dropboxusercontent.com")) {
    const cleaned = cleanDropboxLink(parsed.toString());
    const directBase = cleaned.replace("www.dropbox.com", "dl.dropboxusercontent.com");
    // Ensure raw=1 is present
    if (directBase.includes("?")) {
      return directBase.includes("raw=1") ? directBase : `${directBase}&raw=1`;
    }
    return `${directBase}?raw=1`;
  }

  // If it already looks like a direct image, keep it.
  if (looksLikeDirectImageUrl(parsed)) return parsed.toString();

  // Otherwise, treat it like a website page and try to extract a representative image.
  const resolved = await resolveWebsiteToImageUrl(parsed);
  if (!resolved) return parsed.toString(); // fall back to the page url (may not preview, but still stored)
  // Ensure https
  return resolved.replace(/^http:/i, "https:");
}

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
      accountsEmail,
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
    const avatarUrl = (rawAvatarUrl && rawAvatarUrl.length > 5000)
      ? null
      : await normalizePublicImageUrl(rawAvatarUrl);
    const normalizedWatermarkUrl = await normalizePublicImageUrl(watermarkUrl);

    // If user provided values but they were invalid, fail with a clear message.
    if (rawAvatarUrl && String(rawAvatarUrl).trim() && !avatarUrl) {
      return { success: false, error: "Client icon link must be a public https:// URL or Dropbox link." };
    }
    if (watermarkUrl && String(watermarkUrl).trim() && !normalizedWatermarkUrl) {
      return { success: false, error: "Branding logo link must be a public https:// URL or Dropbox link." };
    }
    
    console.log(`[ACTION_CLIENT] Upserting client. ID provided: "${id}"`);

    const clientData = {
      name,
      email,
      businessName,
      phone,
      avatarUrl,
      status: status || "PENDING",
      watermarkUrl: normalizedWatermarkUrl,
      watermarkSettings: watermarkSettings || {},
      settings: {
        permissions: permissions || {},
        priceOverrides: priceOverrides || {},
        disabledServices: disabledServices || [],
        accountsEmail: accountsEmail || ""
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
          watermarkUrl: normalizedWatermarkUrl,
          watermarkSettings: watermarkSettings || {},
          settings: {
            permissions: permissions || {},
            priceOverrides: priceOverrides || {},
            disabledServices: disabledServices || [],
            accountsEmail: accountsEmail || ""
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
          watermarkUrl: normalizedWatermarkUrl,
          watermarkSettings: watermarkSettings || {},
          settings: {
            permissions: permissions || {},
            priceOverrides: priceOverrides || {},
            disabledServices: disabledServices || [],
            accountsEmail: accountsEmail || ""
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
