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
    const galleryInfo = await prisma.gallery.findFirst({
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
                  url: `/api/dropbox/assets/${galleryId}?path=${encodeURIComponent(relativePath)}&sharedLink=${encodeURIComponent(shareLink)}&id=${encodeURIComponent(entry.id)}`,
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
              url: `/api/dropbox/assets/${galleryId}?path=${encodeURIComponent("/")}&sharedLink=${encodeURIComponent(shareLink)}&id=${encodeURIComponent(data.id)}`,
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
      let folderAssets: any[] = [];
      let hasMore = true;
      let cursor = "";

      try {
        // Initial fetch
        let response = await dropboxFetch("https://api.dropboxapi.com/2/files/list_folder", {
          path: folder.path,
          recursive: false,
          include_media_info: true
        });

        if (response.ok) {
          let data = await response.json();
          
          const processEntries = (entries: any[]) => {
            return entries
              .filter((entry: any) => entry[".tag"] === "file" && entry.name.match(/\.(jpg|jpeg|png|webp)$/i))
              .map((entry: any) => ({
                id: entry.id,
                name: entry.name,
                path: entry.path_lower,
                url: `/api/dropbox/assets/${galleryId}?path=${encodeURIComponent(entry.path_lower)}&id=${encodeURIComponent(entry.id)}`,
                type: "image",
                folderName: folder.name
              }));
          };

          folderAssets = [...folderAssets, ...processEntries(data.entries)];
          hasMore = data.has_more;
          cursor = data.cursor;

          // CURSOR LOOP: Keep pulling if there are more than 1000 items
          while (hasMore) {
            console.log(`[DROPBOX] Pulling next batch for ${folder.name} (has_more: true)`);
            const nextResponse = await dropboxFetch("https://api.dropboxapi.com/2/files/list_folder/continue", {
              cursor: cursor
            });

            if (nextResponse.ok) {
              const nextData = await nextResponse.json();
              folderAssets = [...folderAssets, ...processEntries(nextData.entries)];
              hasMore = nextData.has_more;
              cursor = nextData.cursor;
            } else {
              hasMore = false;
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching folder ${folder.name}:`, err);
      }

      return folderAssets;
    });

    const results = await Promise.all(folderPromises);
    results.forEach(folderAssets => {
      folderAssets.forEach((asset: any) => {
        if (!allAssets.some(a => a.path === asset.path)) {
          allAssets.push(asset);
        }
      });
    });

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

/**
 * Generates a temporary direct link for a Dropbox file.
 * This is used to pass images to external services like AI models.
 */
export async function getDropboxTemporaryLink(path: string, tenantId: string) {
  try {
    const tPrisma = await getTenantPrisma(tenantId);
    const tenant = await tPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { dropboxAccessToken: true, dropboxRefreshToken: true }
    });

    if (!tenant?.dropboxAccessToken) throw new Error("Dropbox not connected");

    let accessToken = tenant.dropboxAccessToken;

    const getLink = async (token: string) => {
      return fetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ path })
      });
    };

    let response = await getLink(accessToken);

    if (response.status === 401 && tenant.dropboxRefreshToken) {
      const newToken = await refreshDropboxAccessToken(tenantId, tenant.dropboxRefreshToken);
      if (newToken) {
        accessToken = newToken;
        response = await getLink(accessToken);
      }
    }

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Dropbox temporary link error details:", JSON.stringify(errorData, null, 2));
      const errorSummary = errorData.error_summary || "Failed to get temporary link";
      return { success: false, error: errorSummary };
    }

    const data = await response.json();
    return { success: true, url: data.link, metadata: data.metadata };
  } catch (error: any) {
    console.error("GET TEMP LINK ERROR:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Saves an AI-generated image URL back to the tenant's Dropbox folder.
 */
export async function saveAIResultToDropbox({
  tenantId,
  resultUrl,
  originalPath,
  taskType
}: {
  tenantId: string;
  resultUrl: string;
  originalPath: string;
  taskType: string;
}) {
  try {
    const tPrisma = await getTenantPrisma(tenantId);
    const tenant = await tPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { dropboxAccessToken: true, dropboxRefreshToken: true }
    });

    if (!tenant?.dropboxAccessToken) throw new Error("Dropbox not connected");

    // 1. Download the image from the AI URL
    const imageResponse = await fetch(resultUrl);
    if (!imageResponse.ok) throw new Error("Failed to download AI result");
    const imageBlob = await imageResponse.arrayBuffer();

    // 2. Determine target path
    // Original: /Production/House/Kitchen.jpg -> Target: /Production/House/Kitchen_AI_Sky.jpg
    const pathParts = originalPath.split(".");
    const ext = pathParts.pop();
    const basePath = pathParts.join(".");
    const suffix = taskType === "sky_replacement" ? "_AI_Sky" : 
                   taskType === "day_to_dusk" ? "_AI_Dusk" : 
                   taskType === "object_removal" ? "_AI_Clean" : "_AI_Staged";
    const targetPath = `${basePath}${suffix}.${ext}`;

    let accessToken = tenant.dropboxAccessToken;

    const uploadFile = async (token: string) => {
      return fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path: targetPath,
            mode: "overwrite",
            autorename: true,
            mute: false
          })
        },
        body: imageBlob
      });
    };

    let response = await uploadFile(accessToken);

    if (response.status === 401 && tenant.dropboxRefreshToken) {
      const newToken = await refreshDropboxAccessToken(tenantId, tenant.dropboxRefreshToken);
      if (newToken) {
        accessToken = newToken;
        response = await uploadFile(accessToken);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Dropbox upload error text:", errorText);
      try {
        const errorData = JSON.parse(errorText);
        console.error("Dropbox upload error data:", errorData);
      } catch (e) {
        // Not JSON
      }
      return { success: false, error: "Failed to save to Dropbox: " + errorText };
    }

    return { success: true, path: targetPath };
  } catch (error: any) {
    console.error("SAVE AI RESULT ERROR:", error);
    return { success: false, error: error.message };
  }
}

