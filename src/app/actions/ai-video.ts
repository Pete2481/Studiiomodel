"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTemporaryLink } from "@/app/actions/storage";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import path from "path";

type Provider = "DROPBOX" | "GOOGLE_DRIVE";

type OrderedAsset = {
  id?: string | null;
  name?: string | null;
  url: string;
  path?: string | null;
};

type ReplicatePrediction = {
  id: string;
  status: string;
  output?: any;
  error?: any;
};

function inferProvider(args: { tenantProvider: Provider; shareLink?: string | null }): Provider {
  const share = String(args.shareLink || "");
  if (share.includes("drive.google.com")) return "GOOGLE_DRIVE";
  return args.tenantProvider || "DROPBOX";
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to download image (${res.status})`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function buildStoryboardJpeg(args: { imageUrls: string[]; width: number; height: number }): Promise<Buffer> {
  const { imageUrls, width, height } = args;
  const n = imageUrls.length;
  if (n < 1) throw new Error("No images provided");

  const segH = Math.floor(height / n);
  const segments = await Promise.all(
    imageUrls.map(async (u) => {
      const buf = await fetchBytes(u);
      // Normalize + resize to exact segment size
      return sharp(buf)
        .rotate()
        .resize(width, segH, { fit: "cover" })
        .jpeg({ quality: 86, mozjpeg: true })
        .toBuffer();
    }),
  );

  const composites = segments.map((input, i) => ({
    input,
    left: 0,
    top: i * segH,
  }));

  // If height isn't divisible by n, extend the last segment to fill the remainder.
  const canvas = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#000000",
    },
  });

  return canvas.composite(composites).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}

function toDataUrlJpeg(buf: Buffer): string {
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

function sanitizeDropboxName(name: string) {
  return String(name || "Gallery")
    .trim()
    .slice(0, 80)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ");
}

async function resolveDropboxBaseDir(args: { galleryId: string; firstAssetPath?: string | null }) {
  const gallery = await prisma.gallery.findUnique({
    where: { id: args.galleryId },
    select: { metadata: true },
  });
  const meta: any = (gallery as any)?.metadata || {};

  // 1) Prefer the first selected asset's directory when it looks like a real Dropbox path
  const p = String(args.firstAssetPath || "");
  if (p.startsWith("/")) {
    const dir = path.posix.dirname(p);
    if (dir && dir !== "." && dir !== "/") return dir;
  }

  // 2) Fall back to mapped folder path (gallery drawer selection)
  const mapped = meta?.imageFolders?.[0]?.path;
  if (typeof mapped === "string" && mapped.startsWith("/")) return mapped;

  // 3) Fall back to shared link metadata (folder/file)
  const shareLink = String(meta?.dropboxLink || "").trim();
  if (!shareLink) return "/";
  try {
    const tenant = await prisma.gallery.findUnique({
      where: { id: args.galleryId },
      select: { tenantId: true },
    });
    const t = await prisma.tenant.findUnique({
      where: { id: (tenant as any)?.tenantId || "" },
      select: { dropboxAccessToken: true },
    });
    const token = (t as any)?.dropboxAccessToken;
    if (!token) return "/";
    const metaRes = await fetch("https://api.dropboxapi.com/2/sharing/get_shared_link_metadata", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: shareLink }),
    });
    if (!metaRes.ok) return "/";
    const sharedMeta: any = await metaRes.json().catch(() => null);
    const p2 = sharedMeta?.path_lower || sharedMeta?.path_display;
    if (typeof p2 === "string" && p2.startsWith("/")) {
      return sharedMeta?.[".tag"] === "folder" ? p2 : path.posix.dirname(p2);
    }
  } catch {
    // ignore
  }
  return "/";
}

async function dropboxApiCall(args: {
  url: string;
  token: string;
  body: any;
  tenantId: string;
  refreshToken?: string | null;
}) {
  let accessToken = args.token;
  const doCall = (t: string) =>
    fetch(args.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(args.body),
    });

  let res = await doCall(accessToken);
  if (res.status === 401 && args.refreshToken) {
    // Best-effort refresh (duplicate minimal logic to avoid importing a non-exported helper)
    try {
      const refresh = await fetch("https://api.dropbox.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: args.refreshToken,
          client_id: process.env.DROPBOX_CLIENT_ID!,
          client_secret: process.env.DROPBOX_CLIENT_SECRET!,
        }),
      });
      if (refresh.ok) {
        const data: any = await refresh.json().catch(() => null);
        const nextToken = String(data?.access_token || "");
        if (nextToken) {
          accessToken = nextToken;
          await prisma.tenant.update({
            where: { id: args.tenantId },
            data: { dropboxAccessToken: nextToken, updatedAt: new Date() },
          });
          res = await doCall(accessToken);
        }
      }
    } catch {
      // ignore refresh errors
    }
  }
  return res;
}

async function saveVideoUrlToDropbox(args: {
  tenantId: string;
  galleryId: string;
  galleryTitle: string;
  videoUrl: string;
  firstAssetPath?: string | null;
}) {
  // Fetch tenant tokens
  const tenant = await prisma.tenant.findUnique({
    where: { id: args.tenantId },
    select: { dropboxAccessToken: true, dropboxRefreshToken: true },
  });
  if (!tenant?.dropboxAccessToken) {
    return { success: false as const, error: "Dropbox not connected" };
  }

  // Resolve base dir and target path
  const baseDir = await resolveDropboxBaseDir({ galleryId: args.galleryId, firstAssetPath: args.firstAssetPath });
  const folder = path.posix.join(baseDir || "/", "AI Videos", sanitizeDropboxName(args.galleryTitle));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targetPath = path.posix.join(folder, `AI-Social-${stamp}.mp4`);

  // Ensure folder exists (best-effort). Dropbox returns 409 if it already exists.
  try {
    const mk = await dropboxApiCall({
      url: "https://api.dropboxapi.com/2/files/create_folder_v2",
      token: tenant.dropboxAccessToken,
      refreshToken: tenant.dropboxRefreshToken,
      tenantId: args.tenantId,
      body: { path: folder, autorename: false },
    });
    if (!mk.ok) {
      const j: any = await mk.json().catch(() => null);
      const tag = j?.error?.[".tag"];
      if (tag !== "path" && tag !== "conflict") {
        // ignore non-blocking folder creation errors
      }
    }
  } catch {
    // ignore
  }

  // 1) Ask Dropbox to fetch the URL server-side (no ffmpeg, no streaming upload)
  const saveRes = await dropboxApiCall({
    url: "https://api.dropboxapi.com/2/files/save_url",
    token: tenant.dropboxAccessToken,
    refreshToken: tenant.dropboxRefreshToken,
    tenantId: args.tenantId,
    body: { path: targetPath, url: args.videoUrl },
  });
  const saveJson: any = await saveRes.json().catch(() => null);
  if (!saveRes.ok) {
    return { success: false as const, error: `Dropbox save_url failed: ${JSON.stringify(saveJson)}` };
  }

  // 2) Poll Dropbox job until complete
  const tag = String(saveJson?.[".tag"] || "");
  const jobId = String(saveJson?.async_job_id || "");
  let finalPath: string | null = null;

  if (tag === "complete" && saveJson?.metadata?.path_lower) {
    finalPath = String(saveJson.metadata.path_lower);
  } else if (tag === "async_job_id" && jobId) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 2 * 60_000) {
      await new Promise((r) => setTimeout(r, 1500));
      const stRes = await dropboxApiCall({
        url: "https://api.dropboxapi.com/2/files/save_url/check_job_status",
        token: tenant.dropboxAccessToken,
        refreshToken: tenant.dropboxRefreshToken,
        tenantId: args.tenantId,
        body: { async_job_id: jobId },
      });
      const st: any = await stRes.json().catch(() => null);
      if (!stRes.ok) {
        return { success: false as const, error: `Dropbox save_url status failed: ${JSON.stringify(st)}` };
      }
      const stTag = String(st?.[".tag"] || "");
      if (stTag === "complete" && st?.metadata?.path_lower) {
        finalPath = String(st.metadata.path_lower);
        break;
      }
      if (stTag === "failed") {
        return { success: false as const, error: "Dropbox save_url failed" };
      }
    }
  }

  if (!finalPath) return { success: false as const, error: "Dropbox save did not complete" };

  // 3) Create/get a shared link
  const createShare = await dropboxApiCall({
    url: "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings",
    token: tenant.dropboxAccessToken,
    refreshToken: tenant.dropboxRefreshToken,
    tenantId: args.tenantId,
    body: { path: finalPath },
  });
  const shareJson: any = await createShare.json().catch(() => null);

  if (createShare.ok && shareJson?.url) {
    return { success: true as const, shareUrl: String(shareJson.url), path: finalPath };
  }

  // If link already exists, list shared links
  const listRes = await dropboxApiCall({
    url: "https://api.dropboxapi.com/2/sharing/list_shared_links",
    token: tenant.dropboxAccessToken,
    refreshToken: tenant.dropboxRefreshToken,
    tenantId: args.tenantId,
    body: { path: finalPath, direct_only: true },
  });
  const listJson: any = await listRes.json().catch(() => null);
  const existingUrl = listJson?.links?.[0]?.url;
  if (listRes.ok && existingUrl) {
    return { success: true as const, shareUrl: String(existingUrl), path: finalPath };
  }

  return { success: false as const, error: "Failed to create Dropbox share link" };
}

async function createReplicatePrediction(args: { input: any; model: { owner: string; name: string }; token: string }) {
  const { input, model, token } = args;
  const res = await fetch(`https://api.replicate.com/v1/models/${model.owner}/${model.name}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json as any)?.detail || (json as any)?.error || JSON.stringify(json);
    throw new Error(typeof msg === "string" ? msg : "Replicate prediction failed");
  }
  return json as ReplicatePrediction;
}

async function getReplicatePrediction(args: { predictionId: string; token: string }) {
  const res = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(args.predictionId)}`, {
    headers: { Authorization: `Token ${args.token}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json as any)?.detail || (json as any)?.error || JSON.stringify(json);
    throw new Error(typeof msg === "string" ? msg : "Failed to fetch prediction");
  }
  return json as ReplicatePrediction;
}

function extractOutputUrl(output: any): string | null {
  if (!output) return null;
  if (typeof output === "string" && output.startsWith("http")) return output;
  if (Array.isArray(output) && output.length > 0) return extractOutputUrl(output[0]);
  if (output && typeof output.url === "string") return output.url;
  return null;
}

export async function startAiSocialVideo(args: { galleryId: string; orderedAssets: OrderedAsset[]; durationSeconds?: 5 | 10 }) {
  const session = await auth();
  if (!session?.user) return { success: false as const, error: "Unauthorized" };

  const galleryId = String(args.galleryId || "");
  const orderedAssets = Array.isArray(args.orderedAssets) ? args.orderedAssets : [];
  if (!galleryId) return { success: false as const, error: "Missing galleryId" };
  if (orderedAssets.length < 3 || orderedAssets.length > 5) {
    return { success: false as const, error: "Select 3–5 images." };
  }

  const gallery = await prisma.gallery.findFirst({
    where: { id: galleryId, deletedAt: null },
    select: {
      id: true,
      tenantId: true,
      metadata: true,
      tenant: { select: { storageProvider: true, settings: true } },
    },
  });
  if (!gallery) return { success: false as const, error: "Gallery not found" };

  const userTenantId = (session.user as any)?.tenantId;
  if (!userTenantId || userTenantId !== gallery.tenantId) return { success: false as const, error: "Unauthorized" };

  const meta: any = (gallery.metadata as any) || {};
  const aiSuite: any = meta.aiSuite || {};
  const remainingVideos = typeof aiSuite.remainingVideos === "number" ? aiSuite.remainingVideos : 0;

  if (!aiSuite.unlocked) return { success: false as const, error: "AI_SUITE_LOCKED", code: "AI_SUITE_LOCKED" };
  if (remainingVideos <= 0) return { success: false as const, error: "AI_SUITE_VIDEO_LIMIT", code: "AI_SUITE_VIDEO_LIMIT", aiSuite };

  // Enforce tenant AI toggle for paid unlocks (trial unlocks can run even if disabled).
  const tenantSettings: any = (gallery.tenant as any)?.settings || {};
  const aiEnabledRaw = tenantSettings?.aiSuite?.enabled;
  const tenantAiEnabled = typeof aiEnabledRaw === "boolean" ? aiEnabledRaw : false;
  if (!tenantAiEnabled && aiSuite.unlockType !== "trial") {
    return { success: false as const, error: "AI_DISABLED", code: "AI_DISABLED", aiSuite };
  }

  // Decrement quota up-front (best-effort), matching AI Suite pattern.
  const nextAiSuite = { ...aiSuite, remainingVideos: remainingVideos - 1 };
  const firstAssetPath = String(orderedAssets?.[0]?.path || "");
  const nextMeta = { ...meta, aiSuite: nextAiSuite, aiSocialVideo: { firstAssetPath, startedAt: new Date().toISOString() } };
  await prisma.gallery.update({ where: { id: galleryId }, data: { metadata: nextMeta } });

  const provider = inferProvider({
    tenantProvider: ((gallery.tenant as any)?.storageProvider as Provider) || "DROPBOX",
    shareLink: meta?.dropboxLink || "",
  });

  const publicUrls: string[] = [];
  for (const a of orderedAssets) {
    const lookup = String(a?.id || a?.path || "");
    let resolved: string | null = null;

    if (lookup) {
      const temp = await getTemporaryLink(lookup, gallery.tenantId, provider);
      if ((temp as any)?.success && (temp as any)?.url) resolved = String((temp as any).url);
    }

    // Fallback: accept already-public URLs
    if (!resolved) {
      const u = String(a?.url || "");
      if (u.startsWith("http") && !u.includes("localhost") && !u.includes("127.0.0.1")) resolved = u;
    }

    if (!resolved) {
      return { success: false as const, error: "AI cannot access one or more images. Please ensure storage is connected." };
    }
    publicUrls.push(resolved);
  }

  // Build a numbered storyboard grid (9:16) so the model can interpret it as multiple scenes (Clip 1..N),
  // instead of simply panning across a single tall image.
  const storyboard = await (async () => {
    const width = 1080;
    const height = 1920;
    const n = publicUrls.length;
    const cols = 2;
    const rows = 3;
    const pad = 28;
    const gutter = 22;
    const tileW = Math.floor((width - pad * 2 - gutter * (cols - 1)) / cols);
    const tileH = Math.floor((height - pad * 2 - gutter * (rows - 1)) / rows);

    const base = sharp({
      create: { width, height, channels: 3, background: "#000000" },
    });

    const comps: sharp.OverlayOptions[] = [];
    for (let i = 0; i < Math.min(n, cols * rows); i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const left = pad + c * (tileW + gutter);
      const top = pad + r * (tileH + gutter);
      const buf = await fetchBytes(publicUrls[i]);
      const tile = await sharp(buf).rotate().resize(tileW, tileH, { fit: "cover" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      comps.push({ input: tile, left, top });

      // Number badge overlay (helps model respect order)
      const label = String(i + 1);
      const svg = Buffer.from(
        `<svg width="${tileW}" height="${tileH}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="52" cy="52" r="34" fill="rgba(0,0,0,0.65)"/>
          <text x="52" y="63" text-anchor="middle" font-size="34" font-family="Arial" font-weight="800" fill="#ffffff">${label}</text>
        </svg>`
      );
      comps.push({ input: svg, left, top });
    }

    return base.composite(comps).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  })();
  const storyboardDataUrl = toDataUrlJpeg(storyboard);

  const token = process.env.REPLICATE_API_TOKEN || "";
  if (!token) return { success: false as const, error: "Missing REPLICATE_API_TOKEN" };

  const model = { owner: "kwaivgi", name: "kling-v2.5-turbo-pro" };
  // Kling duration is constrained by the model (enum: 5 or 10).
  const duration = args.durationSeconds === 5 ? 5 : 10;
  const prompt =
    `Create a cinematic real estate social video (vertical 9:16), duration ${duration} seconds.\n` +
    "The input image is a storyboard grid of numbered panels (1..N). Treat each numbered panel as a separate full-frame shot.\n" +
    "Show panels in order (1..N) and distribute screen time evenly across them.\n" +
    "For each shot: add natural, photorealistic motion (subtle camera dolly/push, gentle parallax, realistic lighting micro-changes). Avoid Ken Burns slideshow look.\n" +
    "Between shots: use smooth cinematic transitions (match cut / gentle dissolve) that blend into the next panel.\n" +
    "IMPORTANT: Do NOT scroll or pan across the storyboard grid. Do NOT show multiple panels at once. Do NOT add text.\n" +
    "Style: bright, clean, premium real estate marketing. Preserve architecture and perspective. Avoid warping, flicker, jitter, and surreal artifacts.";

  // Kling models are often strict about input schema; try a couple common variants.
  const inputAttempts = [
    { image: storyboardDataUrl, prompt, duration, aspect_ratio: "9:16" },
    { image_url: storyboardDataUrl, prompt, duration, aspect_ratio: "9:16" },
  ];

  let prediction: ReplicatePrediction | null = null;
  let lastErr: any = null;
  for (const input of inputAttempts) {
    try {
      prediction = await createReplicatePrediction({ input, model, token });
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!prediction) {
    // restore quota? best-effort no (keeps parity with AI Suite decrement-on-run attempt)
    return { success: false as const, error: (lastErr as any)?.message || "Failed to start video generation" };
  }

  return { success: true as const, predictionId: prediction.id, aiSuite: nextAiSuite };
}

export async function pollAiSocialVideo(args: { predictionId: string; galleryId: string }) {
  const session = await auth();
  if (!session?.user) return { success: false as const, error: "Unauthorized" };

  const predictionId = String(args.predictionId || "");
  const galleryId = String(args.galleryId || "");
  if (!predictionId) return { success: false as const, error: "Missing predictionId" };
  if (!galleryId) return { success: false as const, error: "Missing galleryId" };

  const gallery = await prisma.gallery.findFirst({
    where: { id: galleryId, deletedAt: null },
    select: { id: true, tenantId: true, title: true, metadata: true },
  });
  if (!gallery) return { success: false as const, error: "Gallery not found" };

  const userTenantId = (session.user as any)?.tenantId;
  if (!userTenantId || userTenantId !== gallery.tenantId) return { success: false as const, error: "Unauthorized" };

  const token = process.env.REPLICATE_API_TOKEN || "";
  if (!token) return { success: false as const, error: "Missing REPLICATE_API_TOKEN" };

  const pred = await getReplicatePrediction({ predictionId, token });
  const status = String(pred.status || "");
  const videoUrl = status === "succeeded" ? extractOutputUrl(pred.output) : null;

  if (status === "succeeded" && videoUrl) {
    const meta: any = (gallery.metadata as any) || {};
    const firstAssetPath = String(meta?.aiSocialVideo?.firstAssetPath || "");

    // Save into Dropbox next to the gallery’s photos folder under AI Videos/
    const saved = await saveVideoUrlToDropbox({
      tenantId: gallery.tenantId,
      galleryId,
      galleryTitle: String((gallery as any)?.title || "Gallery"),
      videoUrl,
      firstAssetPath,
    });
    if (!saved.success) {
      // Fallback: return Replicate URL if Dropbox save fails (still allow user to view/download)
      return { success: true as const, status, videoUrl, warning: saved.error || "Dropbox save failed" };
    }

    const shareUrl = saved.shareUrl;
    const currentVideos: any[] = Array.isArray(meta.videoLinks) ? meta.videoLinks : [];
    const exists = currentVideos.some((v) => String(v?.url || v) === shareUrl);
    if (!exists) {
      const nextVideos = [
        ...currentVideos,
        { url: shareUrl, title: "AI Social Video", createdAt: new Date().toISOString(), kind: "AI_SOCIAL" },
      ];
      await prisma.gallery.update({
        where: { id: galleryId },
        data: { metadata: { ...meta, videoLinks: nextVideos } },
      });
      revalidatePath(`/gallery/${galleryId}`);
    }
    return { success: true as const, status, videoUrl: shareUrl };
  }

  if (status === "failed" || status === "canceled") {
    return { success: true as const, status, error: pred.error ? String(pred.error) : "Video generation failed" };
  }

  return { success: true as const, status };
}


