"use server";

import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { notificationService } from "@/server/services/notification.service";

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

    const editRequest = await (tPrisma as any).editRequest.create({
      data: {
        gallery: { connect: { id: galleryId } },
        client: gallery.clientId ? { connect: { id: gallery.clientId } } : undefined,
        requestedBy: session?.user?.id ? { connect: { id: session.user.id } } : undefined,
        note,
        status: "NEW",
        fileUrl,
        thumbnailUrl,
        metadata: metadata || {},
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

