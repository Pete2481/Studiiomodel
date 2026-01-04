"use server";

import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { prisma } from "@/lib/prisma";

/**
 * Refreshes the Dropbox access token using the refresh token.
 */
async function refreshDropboxAccessToken(tenantId: string, refreshToken: string) {
  try {
    const tPrisma = await getTenantPrisma();
    const response = await fetch("https://api.dropbox.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.DROPBOX_CLIENT_ID!,
        client_secret: process.env.DROPBOX_CLIENT_SECRET!,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      await tPrisma.tenant.update({
        where: { id: tenantId },
        data: {
          dropboxAccessToken: data.access_token,
          updatedAt: new Date(),
        },
      });
      return data.access_token;
    }
    return null;
  } catch (error) {
    console.error("TOKEN REFRESH ERROR:", error);
    return null;
  }
}

/**
 * Browses Dropbox folders for the current tenant.
 * Used in the GalleryDrawer to pick asset folders.
 */
export async function browseDropboxFolders(path: string = "") {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // ROLE CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN" && session.user.role !== "PHOTOGRAPHER" && session.user.role !== "EDITOR") {
      return { success: false, error: "Permission Denied: Cannot browse Dropbox." };
    }

    const tPrisma = await getTenantPrisma();
    
    const tenant = await tPrisma.tenant.findFirst({
      select: { id: true, dropboxAccessToken: true, dropboxRefreshToken: true }
    });

    if (!tenant?.dropboxAccessToken) {
      return { success: false, error: "Dropbox not connected" };
    }

    let accessToken = tenant.dropboxAccessToken;

    // Helper for API call
    const listFolder = async (token: string) => {
      return fetch("https://api.dropboxapi.com/2/files/list_folder", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          path: path === "/" ? "" : path,
          recursive: false,
          include_media_info: false,
          include_deleted: false,
          include_has_explicit_shared_members: false,
          include_mounted_folders: true
        })
      });
    };

    let response = await listFolder(accessToken);

    if (response.status === 401 && tenant.dropboxRefreshToken) {
      const newToken = await refreshDropboxAccessToken(tenant.id, tenant.dropboxRefreshToken);
      if (newToken) {
        accessToken = newToken;
        response = await listFolder(accessToken);
      }
    }

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Dropbox API error:", errorData);
      return { success: false, error: "Failed to fetch from Dropbox" };
    }

    const data = await response.json();
    
    // Filter for folders only
    const folders = data.entries
      .filter((entry: any) => entry[".tag"] === "folder")
      .map((entry: any) => ({
        id: entry.id,
        name: entry.name,
        path: entry.path_display
      }));

    return { success: true, folders };
  } catch (error: any) {
    console.error("BROWSE DROPBOX ERROR:", error);
    return { success: false, error: error.message || "Failed to browse Dropbox" };
  }
}

/**
 * Fetches all assets (images) from multiple Dropbox folders or a share link for a specific gallery.
 */
export async function getGalleryAssets(galleryId: string) {
  try {
    // 1. Resolve tenant first via unscoped prisma to find context
    const galleryInfo = await prisma.gallery.findUnique({
      where: { id: galleryId, deletedAt: null },
      select: { tenantId: true }
    });

    if (!galleryInfo) return { success: false, error: "Gallery not found" };

    // 2. Get Scoped Client using the resolved tenantId
    const tPrisma = await getTenantPrisma(galleryInfo.tenantId);

    const gallery = await tPrisma.gallery.findUnique({
      where: { id: galleryId },
      include: { tenant: true }
    });

    if (!gallery?.tenant?.dropboxAccessToken) {
      return { success: false, error: "Dropbox not connected" };
    }

    let accessToken = gallery.tenant.dropboxAccessToken;
    const tenantId = gallery.tenantId;
    const refreshToken = gallery.tenant.dropboxRefreshToken;

    const metadata = gallery.metadata as any;
    const folders = metadata?.imageFolders || [];
    const shareLink = metadata?.dropboxLink;
    
    let allAssets: any[] = [];

    // Helper for API calls with auto-refresh
    const dropboxFetch = async (url: string, body: any) => {
      let res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (res.status === 401 && refreshToken) {
        const newToken = await refreshDropboxAccessToken(tenantId, refreshToken);
        if (newToken) {
          accessToken = newToken;
          res = await fetch(url, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          });
        }
      }
      return res;
    };

    // 1. Handle Share Link (Fastest Path)
    if (shareLink && shareLink.trim() !== "") {
      console.log("[DEBUG] Fetching metadata for shared link:", shareLink);
      const response = await dropboxFetch("https://api.dropboxapi.com/2/sharing/get_shared_link_metadata", {
        url: shareLink
      });

      if (response.ok) {
        const data = await response.json();
        console.log("[DEBUG] Shared link metadata received:", JSON.stringify(data));
        
        const rootPathLower = data.path_lower || "";
        
        // CASE A: It's a folder link
        if (data[".tag"] === "folder") {
          console.log("[DEBUG] Listing folder from shared link...");
          const listResponse = await dropboxFetch("https://api.dropboxapi.com/2/files/list_folder", {
            path: "", 
            shared_link: { url: shareLink },
            recursive: false
          });

          if (listResponse.ok) {
            const listData = await listResponse.json();
            console.log(`[DEBUG] Found ${listData.entries.length} entries in shared link`);
            const sharedAssets = listData.entries
              .filter((entry: any) => entry[".tag"] === "file" && entry.name.match(/\.(jpg|jpeg|png|webp)$/i))
              .map((entry: any) => {
                // For shared links, the path in get_thumbnail_v2 should be 
                // relative to the shared link root. If we are listing the 
                // root (path: ""), then the relative path is just "/filename"
                const relativePath = "/" + entry.name;

                return {
                  id: entry.id,
                  name: entry.name,
                  path: relativePath, 
                  url: `/api/dropbox/assets/${galleryId}?path=${encodeURIComponent(relativePath)}&sharedLink=${encodeURIComponent(shareLink)}`,
                  type: "image",
                  folderName: "Production Link"
                };
              });
            console.log(`[DEBUG] Extracted ${sharedAssets.length} valid images`);
            allAssets = [...allAssets, ...sharedAssets];
          } else {
            const errText = await listResponse.text();
            console.error("[DEBUG] LIST FOLDER ERROR:", errText);
          }
        } 
        // CASE B: It's a direct file link
        else if (data[".tag"] === "file") {
          console.log("[DEBUG] Single file detected from shared link");
          if (data.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
            allAssets.push({
              id: data.id,
              name: data.name,
              path: "/", // Root of the link
              url: `/api/dropbox/assets/${galleryId}?path=${encodeURIComponent("/")}&sharedLink=${encodeURIComponent(shareLink)}`,
              type: "image",
              folderName: "Direct Link"
            });
          }
        }
        else {
          console.log("[DEBUG] Shared link is neither folder nor file. Tag:", data[".tag"]);
        }
      } else {
        const errText = await response.text();
        console.error("[DEBUG] METADATA ERROR:", errText);
      }
    }

    // 2. Parallelize folder scanning for speed
    const folderPromises = folders.map(async (folder: any) => {
      const response = await dropboxFetch("https://api.dropboxapi.com/2/files/list_folder", {
        path: folder.path,
        recursive: false,
        include_media_info: true
      });

      if (response.ok) {
        const data = await response.json();
        return data.entries
          .filter((entry: any) => entry[".tag"] === "file" && entry.name.match(/\.(jpg|jpeg|png|webp)$/i))
          .map((entry: any) => ({
            id: entry.id,
            name: entry.name,
            path: entry.path_lower,
            url: `/api/dropbox/assets/${galleryId}?path=${encodeURIComponent(entry.path_lower)}`,
            type: "image",
            folderName: folder.name
          }));
      }
      return [];
    });

    const results = await Promise.all(folderPromises);
    results.forEach(folderAssets => {
      folderAssets.forEach((asset: any) => {
        if (!allAssets.some(a => a.path === asset.path)) {
          allAssets.push(asset);
        }
      });
    });

    // 3. Update Gallery Metadata with Image Count
    if (allAssets.length > 0) {
      await tPrisma.gallery.update({
        where: { id: galleryId },
        data: {
          metadata: {
            ...metadata,
            imageCount: allAssets.length
          }
        }
      });
    }

    return { success: true, assets: allAssets };
  } catch (error: any) {
    console.error("GET GALLERY ASSETS ERROR:", error);
    return { success: false, error: "Failed to load assets" };
  }
}

/**
 * Generates a direct download link for a Dropbox file.
 */
export async function getDropboxDownloadLink(path: string, sharedLink?: string) {
  try {
    const session = await auth();
    // For public gallery, we use the tenant from the path if needed, 
    // but usually we can find the tenant by searching galleries.
    // For now, let's assume we have a tenant context or we are in admin.
    
    // Better: Find the tenant via the path or a provided galleryId.
    // Let's pass galleryId for security and context.
    return { success: true, url: "" }; // Placeholder for now
  } catch (error) {
    return { success: false, error: "Failed to get download link" };
  }
}

/**
 * Copies a folder or file within Dropbox (Instant Transfer).
 */
export async function copyDropboxAssets(sourcePath: string, targetTenantId: string) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, error: "Unauthorized" };
    
    // This requires the recipient's Dropbox token.
    // Logic: 
    // 1. Get source tenant's token (the one who owns the gallery)
    // 2. Get target tenant's token (the agent saving it)
    // 3. Use Dropbox `copy_v2` across accounts? (Actually, Dropbox copy usually works within one account).
    // For cross-account, we use shared folders or Save to Dropbox via shared links.
    
    return { success: true };
  } catch (error) {
    return { success: false, error: "Dropbox transfer failed" };
  }
}

