"use server";

import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { notificationService } from "@/server/services/notification.service";
import { getDropboxTemporaryLink, uploadBytesToDropbox, ensureDropboxUniquePath, resolveDropboxPathFromSharedLink } from "@/app/actions/dropbox";

function safeJson(obj: any) {
  return obj && typeof obj === "object" ? obj : {};
}

function parseDropboxPathFromFileUrl(fileUrl: string): { path: string | null; filename: string | null; sharedLink: string | null } {
  const raw = String(fileUrl || "").trim();
  if (!raw) return { path: null, filename: null, sharedLink: null };

  try {
    // Handle relative URLs like /api/dropbox/assets/...
    const u = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw)
      : new URL(raw, "http://localhost");

    const pathParam = u.searchParams.get("path");
    const sharedLink = u.searchParams.get("sharedLink");
    if (pathParam) {
      const p = decodeURIComponent(pathParam);
      const filename = String(p).split("/").filter(Boolean).slice(-1)[0] || null;
      return { path: p, filename, sharedLink: sharedLink ? decodeURIComponent(sharedLink) : null };
    }

    // Fallback: best-effort filename from URL pathname.
    const seg = u.pathname.split("/").filter(Boolean).slice(-1)[0] || "";
    return { path: null, filename: seg || null, sharedLink: sharedLink ? decodeURIComponent(sharedLink) : null };
  } catch {
    // Best-effort: treat last segment as filename
    const seg = raw.split("?")[0].split("#")[0].split("/").filter(Boolean).slice(-1)[0] || "";
    return { path: null, filename: seg || null, sharedLink: null };
  }
}

export async function createEditRequest(data: {
  galleryId: string;
  note: string;
  tagIds: string[];
  fileUrl: string;
  thumbnailUrl?: string;
  metadata?: any;
}) {
  try {
    const session = await auth();
    
    const { galleryId, note, tagIds, fileUrl, thumbnailUrl, metadata } = data;

    // 1. Find gallery to get tenant/client info (Public access check)
    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId, deletedAt: null },
      select: { tenantId: true, clientId: true, status: true }
    });

    if (!gallery) return { success: false, error: "Gallery not found." };
    
    // SECURITY: Ensure gallery is published if no session exists
    if (!session && gallery.status !== 'READY' && gallery.status !== 'DELIVERED') {
      return { success: false, error: "Unauthorized: Gallery is not published." };
    }

    const tenantId = gallery.tenantId;
    const tPrisma = await getTenantPrisma(tenantId);

    // 2. Fetch tags using isolated client
    const tags = await (tPrisma as any).editTag.findMany({
      where: {
        id: { in: tagIds }
      }
    });

    const incomingMeta = safeJson(metadata);
    const dropboxInfo = parseDropboxPathFromFileUrl(fileUrl);
    const nextMeta = {
      ...incomingMeta,
      ...(dropboxInfo.path
        ? { dropbox: { path: dropboxInfo.path, filename: dropboxInfo.filename, sharedLink: dropboxInfo.sharedLink || undefined } }
        : {}),
    };

    const editRequest = await (tPrisma as any).editRequest.create({
      data: {
        gallery: { connect: { id: galleryId } },
        client: gallery.clientId ? { connect: { id: gallery.clientId } } : undefined,
        requestedBy: session?.user?.id ? { connect: { id: session.user.id } } : undefined,
        note,
        status: "NEW",
        fileUrl,
        thumbnailUrl,
        metadata: nextMeta,
        selectedTags: {
          create: tags.map((tag: any) => ({
            editTagId: tag.id,
            costAtTime: tag.cost
          }))
        }
      }
    });

    revalidatePath("/");
    revalidatePath("/tenant/edits");
    revalidatePath(`/gallery/${galleryId}`);
    
    return { success: true, editRequestId: String(editRequest.id) };
  } catch (error: any) {
    console.error("CREATE EDIT REQUEST ERROR:", error);
    return { success: false, error: error.message || "Failed to create edit request." };
  }
}

export async function getEditRequestOriginalDownloadLink(editRequestId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) return { success: false as const, error: "Unauthorized" };

  const role = String((session.user as any)?.role || "");
  if (role !== "TENANT_ADMIN" && role !== "ADMIN" && role !== "EDITOR") {
    return { success: false as const, error: "Permission denied" };
  }

  const tPrisma = await getTenantPrisma();
  const req = await (tPrisma as any).editRequest.findUnique({
    where: { id: String(editRequestId || "") },
    select: { id: true, tenantId: true, fileUrl: true, metadata: true },
  });
  if (!req) return { success: false as const, error: "Not found" };

  const meta = safeJson(req.metadata);
  let dropboxPath = meta?.dropbox?.path ? String(meta.dropbox.path) : "";
  let sharedLink = meta?.dropbox?.sharedLink ? String(meta.dropbox.sharedLink) : "";
  let filename = meta?.dropbox?.filename ? String(meta.dropbox.filename) : "";

  // Backfill on read if possible.
  if (!dropboxPath) {
    const parsed = parseDropboxPathFromFileUrl(String(req.fileUrl || ""));
    if (parsed.path) {
      dropboxPath = parsed.path;
      filename = parsed.filename || filename;
      sharedLink = parsed.sharedLink || sharedLink;
      const nextMeta = { ...meta, dropbox: { path: dropboxPath, filename, sharedLink: sharedLink || undefined } };
      await (tPrisma as any).editRequest.update({
        where: { id: String(req.id) },
        data: { metadata: nextMeta },
      });
    }
  }

  if (!dropboxPath) {
    // Fall back to the stored URL (non-Dropbox-native), best effort.
    return { success: true as const, url: String(req.fileUrl || ""), filename: filename || "asset" };
  }

  // If this came from a shared-link proxy, resolve to a real path_lower first.
  let resolvedPath = dropboxPath;
  if (sharedLink) {
    const resolved = await resolveDropboxPathFromSharedLink({
      tenantId: String(req.tenantId),
      sharedLink,
      path: dropboxPath,
    });
    if (resolved.success && (resolved as any).pathLower) {
      resolvedPath = String((resolved as any).pathLower);
      if (!filename) filename = String((resolved as any).name || "") || filename;
    }
  }

  const link = await getDropboxTemporaryLink(resolvedPath, String(req.tenantId));
  if (!link.success || !link.url) return { success: false as const, error: link.error || "Failed to get download link" };

  return { success: true as const, url: link.url, filename: filename || "asset" };
}

export async function getEditRequestEditedDownloadLink(editRequestId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) return { success: false as const, error: "Unauthorized" };

  const role = String((session.user as any)?.role || "");
  if (role !== "TENANT_ADMIN" && role !== "ADMIN" && role !== "EDITOR") {
    return { success: false as const, error: "Permission denied" };
  }

  const tPrisma = await getTenantPrisma();
  const req = await (tPrisma as any).editRequest.findUnique({
    where: { id: String(editRequestId || "") },
    select: { id: true, tenantId: true, metadata: true },
  });
  if (!req) return { success: false as const, error: "Not found" };

  const meta = safeJson(req.metadata);
  const editedPath = meta?.edited?.path ? String(meta.edited.path) : "";
  if (!editedPath) return { success: false as const, error: "No edited upload found" };

  const link = await getDropboxTemporaryLink(editedPath, String(req.tenantId));
  if (!link.success || !link.url) return { success: false as const, error: link.error || "Failed to get download link" };

  const filename = String(editedPath).split("/").filter(Boolean).slice(-1)[0] || "edited";
  return { success: true as const, url: link.url, filename };
}

export async function uploadEditedAssetToDropbox(formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) return { success: false as const, error: "Unauthorized" };

  const role = String((session.user as any)?.role || "");
  if (role !== "TENANT_ADMIN" && role !== "ADMIN" && role !== "EDITOR") {
    return { success: false as const, error: "Permission denied" };
  }

  const editRequestId = String(formData.get("editRequestId") || "");
  const file = formData.get("file") as File | null;
  if (!editRequestId) return { success: false as const, error: "Missing editRequestId" };
  if (!file) return { success: false as const, error: "Missing file" };

  const tPrisma = await getTenantPrisma();
  const req = await (tPrisma as any).editRequest.findUnique({
    where: { id: editRequestId },
    select: { id: true, tenantId: true, fileUrl: true, metadata: true },
  });
  if (!req) return { success: false as const, error: "Not found" };

  const meta = safeJson(req.metadata);
  let originalPath = meta?.dropbox?.path ? String(meta.dropbox.path) : "";
  const sharedLink = meta?.dropbox?.sharedLink ? String(meta.dropbox.sharedLink) : "";
  if (!originalPath) {
    const parsed = parseDropboxPathFromFileUrl(String(req.fileUrl || ""));
    if (parsed.path) originalPath = parsed.path;
  }
  if (!originalPath) {
    return { success: false as const, error: "This edit request is missing a Dropbox file path." };
  }

  // Resolve shared-link relative path to a real Dropbox path_lower if possible.
  if (sharedLink) {
    const resolved = await resolveDropboxPathFromSharedLink({
      tenantId: String(req.tenantId),
      sharedLink,
      path: originalPath,
    });
    if (resolved.success && (resolved as any).pathLower) {
      originalPath = String((resolved as any).pathLower);
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const unique = await ensureDropboxUniquePath({
    tenantId: String(req.tenantId),
    originalPath,
    suffix: "_EDITED",
  });
  if (!unique.success || !unique.path) return { success: false as const, error: unique.error || "Failed to compute upload path" };

  const uploaded = await uploadBytesToDropbox({
    tenantId: String(req.tenantId),
    dropboxPath: unique.path,
    bytes,
    mode: "add",
  });
  if (!uploaded.success) return { success: false as const, error: uploaded.error || "Upload failed" };

  const nextMeta = {
    ...meta,
    edited: {
      path: unique.path,
      uploadedAt: new Date().toISOString(),
      uploadedBy: (session.user as any)?.id ? String((session.user as any).id) : undefined,
    },
  };

  await (tPrisma as any).editRequest.update({
    where: { id: String(req.id) },
    data: { metadata: nextMeta },
  });

  revalidatePath("/tenant/edits");
  return { success: true as const, editedPath: unique.path };
}

export async function updateEditRequestStatus(id: string, status: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN" && session.user.role !== "EDITOR") {
      return { success: false, error: "Permission Denied: Cannot update status." };
    }

    const tPrisma = await getTenantPrisma();

    const request = await (tPrisma as any).editRequest.update({
      where: { id },
      data: { 
        status: status as any,
        completedAt: status === "COMPLETED" ? new Date() : null
      }
    });

    if (status === "COMPLETED") {
      try {
        await notificationService.sendEditRequestCompleted(id);
      } catch (notifError) {
        console.error("NOTIFICATION ERROR (non-blocking):", notifError);
      }
    }

    revalidatePath("/tenant/edits");
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE EDIT STATUS ERROR:", error);
    return { success: false, error: error.message || "Failed to update status." };
  }
}

export async function updateEditRequestAssignments(id: string, assignedToIds: string[]) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." };
    }

    const tPrisma = await getTenantPrisma();

    await (tPrisma as any).editRequest.update({
      where: { id },
      data: { 
        assignedToIds,
        status: assignedToIds.length > 0 ? "IN_PROGRESS" : undefined
      }
    });

    revalidatePath("/tenant/edits");
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE EDIT ASSIGNMENTS ERROR:", error);
    return { success: false, error: error.message || "Failed to update assignments." };
  }
}

export async function bulkCancelEditRequests(ids: string[]) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" } as const;

    // ROLE CHECK (deletion is admin-only)
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN") {
      return { success: false, error: "Permission Denied: Admin only." } as const;
    }

    const safeIds = Array.isArray(ids) ? ids.map((x) => String(x)).filter(Boolean) : [];
    if (safeIds.length === 0) return { success: true, cancelledCount: 0 } as const;

    const tPrisma = await getTenantPrisma();
    const res = await (tPrisma as any).editRequest.updateMany({
      where: { id: { in: safeIds } },
      data: { status: "CANCELLED", completedAt: null },
    });

    revalidatePath("/tenant/edits");
    return { success: true, cancelledCount: Number(res?.count || 0) } as const;
  } catch (error: any) {
    console.error("BULK CANCEL EDIT REQUESTS ERROR:", error);
    return { success: false, error: error?.message || "Failed to delete edit requests." } as const;
  }
}

export async function exportGalleryEditRequests(galleryId: string, format: 'fcpxml' | 'resolve' | 'csv' | 'json' | 'markdown', requestId?: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN" && session.user.role !== "EDITOR") {
      return { success: false, error: "Permission Denied: Cannot export requests." };
    }

    const tPrisma = await getTenantPrisma();

    const gallery = await (tPrisma as any).gallery.findUnique({
      where: { id: galleryId },
      include: {
        editRequests: {
          where: requestId ? { id: requestId } : { status: { not: 'CANCELLED' } },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!gallery) return { success: false, error: "Gallery not found." };

    // Extract all video comments, whether from separate requests or bundled ones
    let allComments: { timestamp: number; note: string }[] = [];
    
    gallery.editRequests.forEach((r: any) => {
      const meta = r.metadata as any;
      if (meta?.videoComments && Array.isArray(meta.videoComments)) {
        allComments = [...allComments, ...meta.videoComments];
      } else if (meta?.videoTimestamp !== undefined) {
        allComments.push({ timestamp: meta.videoTimestamp, note: r.note });
      }
    });

    // Sort by timestamp
    allComments.sort((a, b) => a.timestamp - b.timestamp);

    if (allComments.length === 0) return { success: false, error: "No video comments found." };

    let content = "";
    let filename = `studiio-export-${galleryId}`;

    if (format === 'fcpxml') {
      filename += ".fcpxml";
      content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.8">
    <resources>
        <format id="r1" name="FFVideoFormat1080p24" frameDuration="100/2400s" width="1920" height="1080" />
    </resources>
    <library>
        <event name="Studiio Edit Requests">
            <project name="${gallery.title.replace(/[&<>"']/g, "")}">
                <sequence format="r1" duration="3600s" tcStart="0s" tcFormat="NDF">
                    <spine>
                        <gap name="Edit Markers" offset="0s" duration="3600s" start="3600s">
                            ${allComments.map((c: any) => {
                              return `<marker start="${c.timestamp}s" duration="1s" value="EDIT: ${c.note.replace(/[&<>"']/g, "")}" />`;
                            }).join('\n                            ')}
                        </gap>
                    </spine>
                </sequence>
            </project>
        </event>
    </library>
</fcpxml>`;
    } else if (format === 'resolve') {
      filename += ".edl";
      content = `TITLE: ${gallery.title.replace(/[&<>"']/g, "")}\nFCM: NON-DROP FRAME\n\n`;
      allComments.forEach((c: any, i: number) => {
        const timecode = new Date(c.timestamp * 1000).toISOString().substr(11, 8) + ":00";
        content += `${String(i + 1).padStart(3, '0')}  AX       V     C        ${timecode} ${timecode} ${timecode} ${timecode}\n`;
        content += `* FROM CLIP NAME: VIDEO_EDIT_REQUEST\n`;
        content += `* COMMENT: ${c.note.replace(/\n/g, " ")}\n\n`;
      });
    } else if (format === 'csv') {
      filename += ".csv";
      content = "Timestamp,Note\n" + allComments.map(c => `"${new Date(c.timestamp * 1000).toISOString().substr(14, 5)}","${c.note.replace(/"/g, '""')}"`).join("\n");
    } else if (format === 'json') {
      filename += ".json";
      content = JSON.stringify(allComments, null, 2);
    } else if (format === 'markdown') {
      filename += ".md";
      content = `# Edit Requests: ${gallery.title}\n\n` + allComments.map(c => `- [${new Date(c.timestamp * 1000).toISOString().substr(14, 5)}] ${c.note}`).join("\n");
    }

    return { success: true, content, filename };
  } catch (error: any) {
    console.error("EXPORT ERROR:", error);
    return { success: false, error: error.message || "Failed to export." };
  }
}

