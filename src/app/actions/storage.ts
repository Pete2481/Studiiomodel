"use server";

import { prisma } from "@/lib/prisma";
import { getGalleryAssets as getDropboxAssets, getDropboxTemporaryLink, saveAIResultToDropbox, browseDropboxFolders } from "./dropbox";
import { getGalleryAssetsFromGoogleDrive as getGoogleDriveAssets, getGoogleDriveTemporaryLink, saveAIResultToGoogleDrive, browseGoogleDriveFolders } from "./google-drive";

/**
 * Unified entry point to fetch assets from the tenant's primary storage provider.
 * Supports pagination via limit and cursor.
 */
export async function getGalleryAssets(galleryId: string, limit: number = 100, cursor?: string) {
  const gallery = await prisma.gallery.findUnique({
    where: { id: galleryId },
    include: { tenant: true }
  });

  if (!gallery) return { success: false, error: "Gallery not found" };

  const metadata = gallery.metadata as any;
  const shareLink = metadata?.dropboxLink || "";
  
  // AUTO-DETECT PROVIDER: If the share link is Google Drive, use that regardless of tenant default
  let provider = (gallery.tenant as any).storageProvider || "DROPBOX";
  if (shareLink.includes("drive.google.com")) {
    provider = "GOOGLE_DRIVE";
  }

  if (provider === "GOOGLE_DRIVE") {
    return getGoogleDriveAssets(galleryId, limit, cursor);
  }

  return getDropboxAssets(galleryId, limit, cursor);
}

/**
 * Unified entry point to browse folders from a specific provider.
 */
export async function browseFolders(parentId: string = "", provider: "DROPBOX" | "GOOGLE_DRIVE" = "DROPBOX") {
  if (provider === "GOOGLE_DRIVE") {
    return browseGoogleDriveFolders(parentId || "root");
  }
  return browseDropboxFolders(parentId);
}

/**
 * Unified entry point to generate a temporary link for external services (AI).
 */
export async function getTemporaryLink(pathOrId: string, tenantId: string, provider: "DROPBOX" | "GOOGLE_DRIVE" = "DROPBOX") {
  if (provider === "GOOGLE_DRIVE") {
    return getGoogleDriveTemporaryLink(pathOrId, tenantId);
  }
  return getDropboxTemporaryLink(pathOrId, tenantId);
}

/**
 * Unified entry point to save AI results back to storage.
 */
export async function saveAIResult({
  tenantId,
  resultUrl,
  originalPathOrId,
  taskType,
  provider = "DROPBOX"
}: {
  tenantId: string;
  resultUrl: string;
  originalPathOrId: string;
  taskType: string;
  provider?: "DROPBOX" | "GOOGLE_DRIVE";
}) {
  if (provider === "GOOGLE_DRIVE") {
    return saveAIResultToGoogleDrive({
      tenantId,
      resultUrl,
      originalFileId: originalPathOrId,
      taskType
    });
  }
  return saveAIResultToDropbox({
    tenantId,
    resultUrl,
    originalPath: originalPathOrId,
    taskType
  });
}

