"use server";

import { auth } from "@/auth";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { prisma } from "@/lib/prisma";
import { cleanDropboxLink } from "@/lib/utils";
import path from "path";
import sharp from "sharp";

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
 * Fetches assets (images) from multiple Dropbox folders or a share link for a specific gallery.
 * Supports pagination via limit and cursor.
 */
export async function getGalleryAssets(galleryId: string, limit: number = 100, cursor?: string) {
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
    const rawShareLink = metadata?.dropboxLink;
    const shareLink = rawShareLink ? cleanDropboxLink(rawShareLink) : "";
    
    let allAssets: any[] = [];
    let nextCursor: string | undefined = undefined;

    const sortEntriesByNameAsc = (entries: any[]) => {
      return [...(entries || [])].sort((a: any, b: any) =>
        String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
    };

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

    const processEntries = (entries: any[], folderName: string, sourceLink?: string) => {
      return entries
        .filter((entry: any) => entry[".tag"] === "file" && entry.name.match(/\.(jpg|jpeg|png|webp)$/i))
        .map((entry: any) => {
          // Dropbox API get_thumbnail_v2 expects a path from the shared link.
          // Prepending a slash is often standard for these calls.
          const relativePath = sourceLink ? ("/" + entry.name) : entry.path_lower;
          
          // Ensure sharedLink is cleaned and append shared=true to the proxy URL
          const cleanedSourceLink = sourceLink ? cleanDropboxLink(sourceLink) : "";
          const url = sourceLink 
            ? `/api/dropbox/assets/${galleryId}?path=${encodeURIComponent(relativePath)}&sharedLink=${encodeURIComponent(cleanedSourceLink)}&id=${encodeURIComponent(entry.id)}&shared=true`
            : `/api/dropbox/assets/${galleryId}?path=${encodeURIComponent(entry.path_lower)}&id=${encodeURIComponent(entry.id)}`;

          // Include the original direct URL as a fallback if possible
          // For shared folders, we can try appending the filename to the raw link
          let directUrl = "";
          if (sourceLink) {
            const cleaned = cleanDropboxLink(sourceLink).replace("www.dropbox.com", "dl.dropboxusercontent.com");
            if (cleaned.includes("?")) {
              directUrl = cleaned.replace("?", `/${encodeURIComponent(entry.name)}?`) + "&raw=1";
            } else {
              directUrl = `${cleaned}/${encodeURIComponent(entry.name)}?raw=1`;
            }
          }

          return {
            id: entry.id,
            name: entry.name,
            path: relativePath,
            url: url,
            directUrl: directUrl, // Fallback for failed proxy
            type: "image",
            folderName: folderName
          };
        });
    };

    const countImageEntries = (entries: any[]) => {
      return (entries || []).filter((entry: any) => entry?.[".tag"] === "file" && entry?.name?.match(/\.(jpg|jpeg|png|webp)$/i)).length;
    };

    const countAllImagesForCursor = async (initialEntries: any[], initialCursor?: string) => {
      let count = countImageEntries(initialEntries);
      let next = initialCursor;
      let guard = 0;
      while (next && guard < 200) {
        guard++;
        const res = await dropboxFetch("https://api.dropboxapi.com/2/files/list_folder/continue", { cursor: next });
        if (!res.ok) break;
        const page = await res.json();
        count += countImageEntries(page.entries);
        next = page.has_more ? page.cursor : undefined;
      }
      return count;
    };

    // PAGINATION LOGIC
    // If a cursor is provided, we just continue from that cursor.
    // NOTE: This assumes the cursor is for the "current" source being paginated.
    if (cursor) {
      const response = await dropboxFetch("https://api.dropboxapi.com/2/files/list_folder/continue", { cursor });
      if (response.ok) {
        const data = await response.json();
        // We need to know which folder/link this cursor belonged to.
        // For now, we assume "Production" or use metadata if we wanted to be fancy.
        allAssets = processEntries(sortEntriesByNameAsc(data.entries), "Production", shareLink);
        if (data.has_more) nextCursor = data.cursor;
        // Pagination continuation isn't a full scan, so we avoid writing counts here.
        return { success: true, assets: allAssets, nextCursor };
      }
      return { success: false, error: "Failed to continue pagination" };
    }

    // 1. Handle Share Link (Fastest Path)
    if (shareLink && shareLink.trim() !== "") {
      const response = await dropboxFetch("https://api.dropboxapi.com/2/sharing/get_shared_link_metadata", {
        url: shareLink
      });

      if (response.ok) {
        const data = await response.json();
        if (data[".tag"] === "folder") {
          const listResponse = await dropboxFetch("https://api.dropboxapi.com/2/files/list_folder", {
            path: "", 
            shared_link: { url: shareLink },
            recursive: false,
            limit: Math.min(limit, 1000)
          });

          if (listResponse.ok) {
            const listData = await listResponse.json();
            allAssets = processEntries(sortEntriesByNameAsc(listData.entries), "Production Link", shareLink);
            if (listData.has_more) nextCursor = listData.cursor;

            // Auto-update gallery counts (best effort). For share links we treat the folder listing as the source of truth.
            try {
              const imageCount = await countAllImagesForCursor(listData.entries, listData.has_more ? listData.cursor : undefined);
              const videoCount = Array.isArray(metadata?.videoLinks) ? metadata.videoLinks.length : 0;
              const existingImageCount = Number(metadata?.imageCount || 0);
              const existingVideoCount = Number(metadata?.videoCount || 0);
              if (imageCount !== existingImageCount || videoCount !== existingVideoCount) {
                await (tPrisma as any).gallery.update({
                  where: { id: galleryId },
                  data: {
                    metadata: {
                      ...(metadata || {}),
                      imageCount,
                      videoCount,
                    }
                  }
                });
              }
            } catch (e) {
              // non-blocking
            }
            
            // If we have enough assets or a cursor, return now
            if (allAssets.length >= limit || nextCursor) {
              return { success: true, assets: allAssets.slice(0, limit), nextCursor };
            }
          }
        } else if (data[".tag"] === "file") {
          if (data.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
            allAssets.push({
              id: data.id,
              name: data.name,
              path: "/",
              url: `/api/dropbox/assets/${galleryId}?path=${encodeURIComponent("/")}&sharedLink=${encodeURIComponent(shareLink)}&id=${encodeURIComponent(data.id)}`,
              type: "image",
              folderName: "Direct Link"
            });

            // Direct link is a single image. Update counts quickly.
            try {
              const imageCount = 1;
              const videoCount = Array.isArray(metadata?.videoLinks) ? metadata.videoLinks.length : 0;
              const existingImageCount = Number(metadata?.imageCount || 0);
              const existingVideoCount = Number(metadata?.videoCount || 0);
              if (imageCount !== existingImageCount || videoCount !== existingVideoCount) {
                await (tPrisma as any).gallery.update({
                  where: { id: galleryId },
                  data: { metadata: { ...(metadata || {}), imageCount, videoCount } }
                });
              }
            } catch (e) {
              // non-blocking
            }
          }
        }
      }
    }

    // 2. Scan folders if we still need more assets
    if (allAssets.length < limit && folders.length > 0) {
      // For simplicity, we'll just pull from the first folder for now if multiple exist
      // or combine them until we hit the limit.
      for (const folder of folders) {
        if (allAssets.length >= limit) break;

        const response = await dropboxFetch("https://api.dropboxapi.com/2/files/list_folder", {
          path: folder.path,
          recursive: false,
          include_media_info: true,
          limit: Math.min(limit - allAssets.length, 1000)
        });

        if (response.ok) {
          const data = await response.json();
          const folderAssets = processEntries(sortEntriesByNameAsc(data.entries), folder.name);
          allAssets = [...allAssets, ...folderAssets];
          if (data.has_more) nextCursor = data.cursor;
        }
      }
    }

    // Auto-update gallery counts (best effort). For multi-folder galleries, we at least track the currently known count.
    // For accuracy, we perform a full count pass (cursor pagination) but only return the first `limit` assets.
    try {
      let imageCount = 0;
      const videoCount = Array.isArray(metadata?.videoLinks) ? metadata.videoLinks.length : 0;

      if (shareLink && shareLink.trim() !== "") {
        // Share link path handled earlier; if we got here, we may not have had enough assets to early return.
        // We treat allAssets as the first page and count the rest via nextCursor when present.
        imageCount = await countAllImagesForCursor(allAssets.map((a: any) => ({ ".tag": "file", name: a.name })), nextCursor);
      } else if (folders.length > 0) {
        for (const folder of folders) {
          const res = await dropboxFetch("https://api.dropboxapi.com/2/files/list_folder", {
            path: folder.path,
            recursive: false,
            include_media_info: false,
            limit: 1000
          });
          if (!res.ok) continue;
          const page = await res.json();
          imageCount += await countAllImagesForCursor(page.entries, page.has_more ? page.cursor : undefined);
        }
      } else {
        imageCount = allAssets.length;
      }

      const existingImageCount = Number(metadata?.imageCount || 0);
      const existingVideoCount = Number(metadata?.videoCount || 0);
      if (imageCount !== existingImageCount || videoCount !== existingVideoCount) {
        await (tPrisma as any).gallery.update({
          where: { id: galleryId },
          data: {
            metadata: {
              ...(metadata || {}),
              imageCount,
              videoCount,
            }
          }
        });
      }
    } catch (e) {
      // non-blocking
    }

    return { 
      success: true, 
      assets: allAssets.slice(0, limit), 
      nextCursor 
    };
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

export async function resolveDropboxPathFromSharedLink(params: { tenantId: string; sharedLink: string; path?: string }) {
  const { tenantId, sharedLink, path: relativePath } = params;
  try {
    const tPrisma = await getTenantPrisma(tenantId);
    const tenant = await tPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { dropboxAccessToken: true, dropboxRefreshToken: true },
    });
    if (!tenant?.dropboxAccessToken) return { success: false as const, error: "Dropbox not connected" };

    let accessToken = tenant.dropboxAccessToken;
    const refreshToken = tenant.dropboxRefreshToken;

    const doReq = async (token: string) =>
      fetch("https://api.dropboxapi.com/2/sharing/get_shared_link_metadata", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: sharedLink,
          ...(relativePath ? { path: relativePath } : {}),
        }),
      });

    let res = await doReq(accessToken);
    if (res.status === 401 && refreshToken) {
      const newToken = await refreshDropboxAccessToken(tenantId, refreshToken);
      if (newToken) {
        accessToken = newToken;
        res = await doReq(accessToken);
      }
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { success: false as const, error: txt || `Dropbox shared link metadata failed (${res.status})` };
    }

    const data: any = await res.json().catch(() => null);
    const p = data?.path_lower || data?.path_display || "";
    if (!p || typeof p !== "string") {
      return { success: false as const, error: "Dropbox shared link did not return a path" };
    }
    return { success: true as const, pathLower: String(data.path_lower || p), name: String(data.name || "") };
  } catch (e: any) {
    return { success: false as const, error: e?.message || "Failed to resolve shared link path" };
  }
}

export async function uploadBytesToDropbox(params: {
  tenantId: string;
  dropboxPath: string;
  bytes: Buffer;
  mode?: "add" | "overwrite";
}) {
  const { tenantId, dropboxPath, bytes, mode = "add" } = params;
  try {
    const tPrisma = await getTenantPrisma(tenantId);
    const tenant = await tPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { dropboxAccessToken: true, dropboxRefreshToken: true },
    });
    if (!tenant?.dropboxAccessToken) return { success: false as const, error: "Dropbox not connected" };

    let accessToken = tenant.dropboxAccessToken;
    const refreshToken = tenant.dropboxRefreshToken;

    const doUpload = async (token: string) => {
      return fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path: dropboxPath,
            mode,
            autorename: mode === "add",
            mute: false,
            strict_conflict: false,
          }),
        },
        body: bytes as any,
      });
    };

    let response = await doUpload(accessToken);
    if (response.status === 401 && refreshToken) {
      const newToken = await refreshDropboxAccessToken(tenantId, refreshToken);
      if (newToken) {
        accessToken = newToken;
        response = await doUpload(accessToken);
      }
    }

    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      return { success: false as const, error: txt || `Dropbox upload failed (${response.status})` };
    }

    const data = await response.json().catch(() => ({}));
    return { success: true as const, data };
  } catch (e: any) {
    return { success: false as const, error: e?.message || "Dropbox upload failed" };
  }
}

async function dropboxGetMetadata(params: { tenantId: string; path: string }) {
  const { tenantId, path } = params;
  const tPrisma = await getTenantPrisma(tenantId);
  const tenant = await tPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { dropboxAccessToken: true, dropboxRefreshToken: true },
  });
  if (!tenant?.dropboxAccessToken) return { ok: false as const, error: "Dropbox not connected" };

  let accessToken = tenant.dropboxAccessToken;
  const refreshToken = tenant.dropboxRefreshToken;

  const doReq = async (token: string) =>
    fetch("https://api.dropboxapi.com/2/files/get_metadata", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path, include_media_info: false, include_deleted: false, include_has_explicit_shared_members: false }),
    });

  let res = await doReq(accessToken);
  if (res.status === 401 && refreshToken) {
    const newToken = await refreshDropboxAccessToken(tenantId, refreshToken);
    if (newToken) {
      accessToken = newToken;
      res = await doReq(accessToken);
    }
  }

  if (res.ok) return { ok: true as const };
  if (res.status === 409) return { ok: false as const, notFound: true as const };
  const txt = await res.text().catch(() => "");
  return { ok: false as const, error: txt || `Dropbox get_metadata failed (${res.status})` };
}

export async function ensureDropboxUniquePath(params: { tenantId: string; originalPath: string; suffix: string }) {
  const { tenantId, originalPath, suffix } = params;
  try {
    const p = String(originalPath || "");
    const parts = p.split("/");
    const filename = parts.pop() || "";
    const dir = parts.join("/") || "";
    const dot = filename.lastIndexOf(".");
    const base = dot > 0 ? filename.slice(0, dot) : filename;
    const ext = dot > 0 ? filename.slice(dot) : "";

    const mk = (n: number) => {
      const tag = n <= 1 ? suffix : `${suffix}_${n}`;
      const name = `${base}${tag}${ext}`;
      return `${dir}/${name}`.replaceAll("//", "/");
    };

    // Try up to 20 unique variants.
    for (let i = 1; i <= 20; i++) {
      const candidate = mk(i);
      const meta = await dropboxGetMetadata({ tenantId, path: candidate });
      if (meta.ok === false && (meta as any).notFound) return { success: true as const, path: candidate };
      if (meta.ok === false && !(meta as any).notFound) {
        return { success: false as const, error: (meta as any).error || "Failed to check Dropbox path" };
      }
    }

    // Fallback: let Dropbox autorename handle conflicts.
    return { success: true as const, path: mk(1) };
  } catch (e: any) {
    return { success: false as const, error: e?.message || "Failed to compute unique path" };
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
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());

    // 1b. For exterior-style AI (dusk/sky), avoid ML upscalers but ensure high pixel dimensions for zoom.
    // This is deterministic (Lanczos resize + high-quality JPEG) and should not hallucinate textures.
    let uploadBytes: Buffer = imageBytes;
    if (taskType === "day_to_dusk" || taskType === "sky_replacement") {
      try {
        const img = sharp(imageBytes, { failOn: "none" });
        const meta = await img.metadata();
        const w = Number(meta.width || 0);
        const h = Number(meta.height || 0);
        const longEdge = Math.max(w, h);
        const TARGET_LONG_EDGE = 6500;
        const MAX_LONG_EDGE = 8000;
        const effectiveTarget = Math.min(TARGET_LONG_EDGE, MAX_LONG_EDGE);

        const needsUpscale = !!longEdge && longEdge < effectiveTarget;
        const scale = needsUpscale ? effectiveTarget / longEdge : 1;
        const newW = w ? Math.min(Math.round(w * scale), MAX_LONG_EDGE) : null;
        const newH = h ? Math.min(Math.round(h * scale), MAX_LONG_EDGE) : null;

        const pipeline = needsUpscale && newW && newH
          ? img.resize(newW, newH, { fit: "fill", kernel: sharp.kernel.lanczos3 })
          : img;

        uploadBytes = await pipeline
          .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
          .toBuffer();
      } catch (e) {
        // non-blocking: fall back to original bytes
        uploadBytes = imageBytes;
      }
    }

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
        // Node runtime supports Buffer bodies; cast keeps TS happy under DOM fetch typings.
        body: uploadBytes as any
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

/**
 * Saves a single AI result back to Dropbox next to the original file.
 * - Same folder as original
 * - Filename: BaseName-AI.jpg
 * - Never overwrite (Dropbox autorename enabled)
 */
export async function saveAIResultSiblingToDropbox({
  tenantId,
  galleryId,
  resultUrl,
  originalPath,
  originalName,
}: {
  tenantId: string;
  galleryId?: string;
  resultUrl: string;
  originalPath: string;
  originalName: string;
}) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    const sessionTenantId = (session.user as any)?.tenantId;
    const role = (session.user as any)?.role;
    const isAdminLike = role === "ADMIN" || role === "TENANT_ADMIN" || role === "TEAM_MEMBER";
    if (!isAdminLike || (sessionTenantId && sessionTenantId !== tenantId)) {
      return { success: false, error: "Unauthorized" };
    }

    const tPrisma = await getTenantPrisma(tenantId);
    const tenant = await tPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { dropboxAccessToken: true, dropboxRefreshToken: true },
    });
    if (!tenant?.dropboxAccessToken) throw new Error("Dropbox not connected");

    // Basic allowlist for safety (match external-image route hosts)
    const parsed = new URL(resultUrl);
    const ALLOWLIST_HOSTS = new Set(["replicate.delivery", "pbxt.replicate.delivery"]);
    if (process.env.NODE_ENV !== "production") {
      // Dev-only: allow local debug endpoints for E2E tests.
      ALLOWLIST_HOSTS.add("localhost");
      ALLOWLIST_HOSTS.add("127.0.0.1");
    }
    if (!ALLOWLIST_HOSTS.has(parsed.hostname)) {
      return { success: false, error: "Host not allowed" };
    }

    const upstream = await fetch(parsed.toString(), { cache: "no-store" });
    if (!upstream.ok) return { success: false, error: "Failed to download AI result" };
    const bytes = await upstream.arrayBuffer();

    const baseName = String(originalName || "")
      .replace(/\.[^.]+$/, "")
      .replace(/-AI$/i, "");

    // Resolve target directory:
    // - Prefer the original file's directory
    // - If the original path is a "share-link relative" path like "/DSC0001.jpg",
    //   try to resolve a real folder path from gallery metadata (imageFolders or dropboxLink).
    let resolvedDir = path.posix.dirname(originalPath || "/");
    resolvedDir = resolvedDir === "." ? "/" : resolvedDir;

    if ((resolvedDir === "/" || resolvedDir === "") && galleryId) {
      try {
        const gallery = await prisma.gallery.findUnique({
          where: { id: galleryId },
          select: { metadata: true },
        });
        const meta: any = (gallery as any)?.metadata || {};

        const mappedFolderPath = meta?.imageFolders?.[0]?.path;
        if (typeof mappedFolderPath === "string" && mappedFolderPath.startsWith("/")) {
          resolvedDir = mappedFolderPath;
        } else if (typeof meta?.dropboxLink === "string" && meta.dropboxLink.trim()) {
          const metaRes = await fetch("https://api.dropboxapi.com/2/sharing/get_shared_link_metadata", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tenant.dropboxAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: meta.dropboxLink }),
          });
          if (metaRes.ok) {
            const sharedMeta: any = await metaRes.json().catch(() => null);
            const p = sharedMeta?.path_lower || sharedMeta?.path_display;
            if (typeof p === "string" && p.startsWith("/")) {
              resolvedDir = sharedMeta?.[".tag"] === "folder" ? p : path.posix.dirname(p);
            }
          }
        }
      } catch (e) {
        // non-blocking, fall back to "/"
      }
    }

    const targetPath = path.posix.join(resolvedDir || "/", `${baseName}-AI.jpg`);

    let accessToken = tenant.dropboxAccessToken;
    const uploadFile = async (token: string) => {
      return fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path: targetPath,
            mode: "add",
            autorename: true,
            mute: false,
            strict_conflict: true,
          }),
        },
        body: bytes,
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
      // Try to surface a friendlier error for common Dropbox OAuth scope issues.
      try {
        const parsedErr: any = JSON.parse(errorText);
        const tag = parsedErr?.error?.[".tag"];
        const requiredScope = parsedErr?.error?.required_scope;
        if (tag === "missing_scope") {
          return {
            success: false,
            code: "MISSING_SCOPE" as const,
            requiredScope: String(requiredScope || ""),
            error:
              `Dropbox permission missing (${String(requiredScope || "unknown")}). ` +
              "Please disconnect and reconnect Dropbox to grant the new permission.",
          };
        }
      } catch {
        // ignore JSON parse errors
      }

      return { success: false, error: `Failed to save to Dropbox: ${errorText}` };
    }

    const data = await response.json().catch(() => null);
    return {
      success: true,
      path: (data as any)?.path_display || (data as any)?.path_lower || targetPath,
      name: (data as any)?.name || `${baseName}-AI.jpg`,
    };
  } catch (error: any) {
    console.error("SAVE AI SIBLING ERROR:", error);
    return { success: false, error: error.message || "Failed to save to Dropbox" };
  }
}

