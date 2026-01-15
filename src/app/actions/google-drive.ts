"use server";

import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";

async function getGoogleDriveClient(tenantId: string) {
  const tPrisma = await getTenantPrisma(tenantId);
  const tenant = await tPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { googleDriveRefreshToken: true }
  });

  if (!tenant?.googleDriveRefreshToken) {
    throw new Error("Google Drive not connected");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: tenant.googleDriveRefreshToken
  });

  return google.drive({ version: "v3", auth: oauth2Client });
}

/**
 * Browses Google Drive folders for the current tenant.
 */
export async function browseGoogleDriveFolders(parentId: string = "root") {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, error: "Unauthorized" };

    const drive = await getGoogleDriveClient(session.user.tenantId);
    
    const response = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      spaces: "drive",
    });

    const folders = response.data.files?.map(file => ({
      id: file.id,
      name: file.name,
      path: file.id // For Drive, we use IDs as paths
    })) || [];

    return { success: true, folders };
  } catch (error: any) {
    console.error("BROWSE GOOGLE DRIVE ERROR:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetches assets (images) from Google Drive folders for a specific gallery.
 * Supports pagination via limit and cursor (pageToken).
 */
export async function getGalleryAssetsFromGoogleDrive(galleryId: string, limit: number = 100, cursor?: string) {
  try {
    const galleryInfo = await prisma.gallery.findFirst({
      where: { id: galleryId, deletedAt: null },
      select: { tenantId: true, metadata: true }
    });

    if (!galleryInfo) return { success: false, error: "Gallery not found" };

    const drive = await getGoogleDriveClient(galleryInfo.tenantId);
    const metadata = galleryInfo.metadata as any;
    
    // Support both mapped folders and raw share link
    let folders = metadata?.imageFolders || [];
    const shareLink = metadata?.dropboxLink || "";

    if (folders.length === 0 && shareLink.includes("drive.google.com")) {
      const folderMatch = shareLink.match(/\/folders\/([^/?]+)/);
      const idMatch = shareLink.match(/[?&]id=([^&]+)/);
      const folderId = folderMatch?.[1] || idMatch?.[1];
      
      if (folderId) {
        folders = [{ id: folderId, path: folderId, name: "Production Folder" }];
      }
    }
    
    if (folders.length === 0) {
      return { success: true, assets: [], nextCursor: null };
    }
    
    let allAssets: any[] = [];
    let nextCursor: string | null = null;

    // For simplicity, if we have multiple folders, we only paginate the first one
    // or combine them. But usually it's one folder.
    const folder = folders[0];
    
    const response = await drive.files.list({
      q: `'${folder.path}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      spaces: "drive",
      pageSize: limit,
      pageToken: cursor
    });

    const folderAssets = response.data.files?.map(file => ({
      id: file.id,
      name: file.name,
      path: file.id,
      url: `/api/google-drive/assets/${galleryId}?id=${file.id}`,
      type: "image",
      folderName: folder.name
    })) || [];

    allAssets = folderAssets;
    nextCursor = response.data.nextPageToken || null;

    return { success: true, assets: allAssets, nextCursor };
  } catch (error: any) {
    console.error("GET GOOGLE DRIVE ASSETS ERROR:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Generates a temporary direct link for a Google Drive file.
 */
export async function getGoogleDriveTemporaryLink(fileId: string, tenantId: string) {
  try {
    // For AI models, we'll need a way for them to access the image.
    // Since Google Drive doesn't have direct temporary links for private files,
    // we use a proxy URL on our own domain that includes a temporary signature.
    // For now, let's point it to our internal proxy which will handle the token.
    
    const host = process.env.NEXT_PUBLIC_APP_URL || "https://studiiomodel.vercel.app";
    // This URL will be accessed by the AI model. We'll need a "public" version of the proxy
    // or a way to pass the token.
    const url = `${host}/api/google-drive/temporary-link?id=${fileId}&tenantId=${tenantId}`;

    return { success: true, url };
  } catch (error: any) {
    console.error("GET GOOGLE DRIVE TEMP LINK ERROR:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Saves an AI-generated image back to the tenant's Google Drive.
 */
export async function saveAIResultToGoogleDrive({
  tenantId,
  resultUrl,
  originalFileId,
  taskType
}: {
  tenantId: string;
  resultUrl: string;
  originalFileId: string;
  taskType: string;
}) {
  try {
    const drive = await getGoogleDriveClient(tenantId);

    // 1. Get original file metadata to find parent folder
    const originalFile = await drive.files.get({
      fileId: originalFileId,
      fields: "name, parents",
    });

    const parentId = originalFile.data.parents?.[0];
    if (!parentId) throw new Error("Original file parent not found");

    // 2. Download result
    const response = await fetch(resultUrl);
    if (!response.ok) throw new Error("Failed to download AI result");
    const buffer = await response.arrayBuffer();

    // 3. Determine new name
    const originalName = originalFile.data.name || "image.jpg";
    const pathParts = originalName.split(".");
    const ext = pathParts.pop();
    const basePath = pathParts.join(".");
    const suffix = taskType === "sky_replacement" ? "_AI_Sky" : 
                   taskType === "day_to_dusk" ? "_AI_Dusk" : 
                   taskType === "object_removal" ? "_AI_Clean" : "_AI_Staged";
    const targetName = `${basePath}${suffix}.${ext}`;

    // 4. Upload to Google Drive
    await drive.files.create({
      requestBody: {
        name: targetName,
        parents: [parentId],
      },
      media: {
        mimeType: "image/jpeg",
        body: Buffer.from(buffer),
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error("SAVE AI RESULT TO GOOGLE DRIVE ERROR:", error);
    return { success: false, error: error.message };
  }
}

