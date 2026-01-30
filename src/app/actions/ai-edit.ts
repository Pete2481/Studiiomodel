"use server";

import Replicate from "replicate";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getTemporaryLink } from "./storage";
import sharp from "sharp";

export type AITaskType =
  | "sky_replacement"
  | "day_to_dusk"
  | "object_removal"
  | "virtual_staging"
  | "room_editor";

const ARCHITECTURAL_NEGATIVE_PROMPT = "structural changes, changing windows, changing walls, changing floor material, different room layout, perspective change, distorted architecture, blurry background, low quality, changing ceiling, removing built-in fixtures";
const AUTO_REMOVE_ALL_ITEMS_PROMPT =
  "Remove ALL furniture and ALL movable items from this room (couches, chairs, tables, rugs/mats, lamps, plants, decor, wall art/frames, clutter). Leave the room completely empty. Preserve the room exactly: walls, doors, windows, trims, ceiling, floor materials and colors, lighting direction, camera angle, and perspective. Do not change architectural features. Professional real estate photography, high resolution.";
const ROOM_EDITOR_GUARDRAILS =
  "Preserve the room EXACTLY: walls, ceiling, floor, doors, windows, trims, built-ins, colors, materials, lighting direction, camera angle, and perspective. Do not change architecture. Do not add new objects unless explicitly requested. Photorealistic, professional real estate photography, high resolution.";
const DUSK_LIGHTING_ONLY_GUARDRAILS =
  "LIGHTING-ONLY EDIT. Preserve the photo EXACTLY (like-for-like). Do NOT change any objects or geometry. " +
  "Do NOT open/close blinds or curtains. Do NOT change window contents, reflections, or interior staging. " +
  "Do NOT change landscaping/grass/trees, fences, bricks, roof tiles, driveway texture, vehicles, signs, or any natural environment. " +
  "Do NOT add/remove objects. Do NOT alter perspective, framing, lens distortion, or sharpness/texture. " +
  "Only change the sky color and overall lighting/color temperature to look like early dusk/golden hour. " +
  "CRITICAL: Keep exposure like-for-like with the original daytime photo: bright and clear, no crushed shadows, no heavy darkening. " +
  "Lift shadows as needed so grass/roof/brick remain clearly visible. Add gentle warm interior/exterior light glow without making the scene dark.";

interface AIProcessResult {
  success: boolean;
  outputUrl?: string;
  upscaled?: boolean;
  upscaleSkippedReason?: string;
  error?: string;
}

async function readImageBytes(input: string): Promise<Buffer> {
  const s = String(input || "").trim();
  if (!s) throw new Error("Missing image input");
  if (s.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(s);
    if (!m) throw new Error("Invalid data URL");
    return Buffer.from(m[2], "base64");
  }
  const res = await fetch(s);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function contentAwareFillFallback(args: {
  imageBytes: Buffer;
  maskBytes: Buffer;
  force?: boolean;
}): Promise<{ outputDataUrl: string; meanAbsDiffInside: number; used: boolean }> {
  const { imageBytes, maskBytes, force = false } = args;
  const img = sharp(imageBytes, { failOn: "none" });
  const meta = await img.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) return { outputDataUrl: "", meanAbsDiffInside: 0, used: false };

  const imgRawObj = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const imgRaw = imgRawObj.data;

  // Resize mask to image size and take luminance as alpha.
  const maskRaw = await sharp(maskBytes, { failOn: "none" })
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const pxCount = width * height;
  const maskBin = new Uint8Array(pxCount);
  for (let i = 0; i < pxCount; i++) {
    const r = maskRaw[i * 4 + 0];
    const g = maskRaw[i * 4 + 1];
    const b = maskRaw[i * 4 + 2];
    const v = (r + g + b) / 3;
    maskBin[i] = v > 128 ? 1 : 0;
  }

  // Collect border samples just outside the mask (up to 5000).
  const samplesR: number[] = [];
  const samplesG: number[] = [];
  const samplesB: number[] = [];
  const maxSamples = 5000;
  const get = (x: number, y: number) => y * width + x;
  for (let y = 1; y < height - 1 && samplesR.length < maxSamples; y++) {
    for (let x = 1; x < width - 1 && samplesR.length < maxSamples; x++) {
      const idx = get(x, y);
      if (maskBin[idx] === 1) continue;
      if (
        maskBin[get(x - 1, y)] ||
        maskBin[get(x + 1, y)] ||
        maskBin[get(x, y - 1)] ||
        maskBin[get(x, y + 1)]
      ) {
        const off = idx * 4;
        samplesR.push(imgRaw[off + 0]);
        samplesG.push(imgRaw[off + 1]);
        samplesB.push(imgRaw[off + 2]);
      }
    }
  }

  if (samplesR.length < 100) return { outputDataUrl: "", meanAbsDiffInside: 0, used: false };

  // Border variance: if high, don't use this fallback (it will look like a patch),
  // unless forced (Spot Removal mode: never hallucinate).
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = (arr: number[]) => {
    const m = mean(arr);
    let s = 0;
    for (const v of arr) s += (v - m) * (v - m);
    return s / arr.length;
  };
  const std = (v: number) => Math.sqrt(v);
  const stdBorder = (std(variance(samplesR)) + std(variance(samplesG)) + std(variance(samplesB))) / 3;
  if (!force && stdBorder > 18) return { outputDataUrl: "", meanAbsDiffInside: 0, used: false };

  // For forced mode, prefer a blur-based fill (less “solid patch” on textured areas).
  if (force) {
    const blurredRaw = await sharp(imageBytes, { failOn: "none" })
      .ensureAlpha()
      // Strong blur so object silhouettes don't bleed through.
      .blur(24)
      .raw()
      .toBuffer();

    const alphaBuf = Buffer.alloc(pxCount);
    for (let i = 0; i < pxCount; i++) alphaBuf[i] = maskBin[i] ? 255 : 0;
    const alphaBlur = await sharp(alphaBuf, { raw: { width, height, channels: 1 } })
      // Edge feather only (core stays hard masked below).
      .blur(10)
      .raw()
      .toBuffer();

    const outRaw = Buffer.from(imgRaw);
    let diffSum = 0;
    let diffCount = 0;
    for (let i = 0; i < pxCount; i++) {
      // HARD remove inside the mask, feather only at the edge.
      const a = (maskBin[i] ? 255 : alphaBlur[i]) / 255;
      if (a <= 0) continue;
      const off = i * 4;
      const or = outRaw[off + 0];
      const og = outRaw[off + 1];
      const ob = outRaw[off + 2];
      const br = blurredRaw[off + 0];
      const bg = blurredRaw[off + 1];
      const bb = blurredRaw[off + 2];
      const nr = Math.round(or * (1 - a) + br * a);
      const ng = Math.round(og * (1 - a) + bg * a);
      const nb = Math.round(ob * (1 - a) + bb * a);
      outRaw[off + 0] = nr;
      outRaw[off + 1] = ng;
      outRaw[off + 2] = nb;
      if (maskBin[i]) {
        diffSum += Math.abs(nr - or) + Math.abs(ng - og) + Math.abs(nb - ob);
        diffCount += 3;
      }
    }
    const outPng = await sharp(outRaw, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const outputDataUrl = `data:image/png;base64,${outPng.toString("base64")}`;
    return { outputDataUrl, meanAbsDiffInside: diffCount ? diffSum / diffCount : 0, used: true };
  }

  const median = (arr: number[]) => {
    const a = [...arr].sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
  };
  const fillR = median(samplesR);
  const fillG = median(samplesG);
  const fillB = median(samplesB);

  const alphaBuf = Buffer.alloc(pxCount);
  for (let i = 0; i < pxCount; i++) alphaBuf[i] = maskBin[i] ? 255 : 0;
  const alphaBlur = await sharp(alphaBuf, { raw: { width, height, channels: 1 } })
    .blur(6)
    .raw()
    .toBuffer();

  const outRaw = Buffer.from(imgRaw); // copy
  let diffSum = 0;
  let diffCount = 0;
  for (let i = 0; i < pxCount; i++) {
    const a = alphaBlur[i] / 255;
    if (a <= 0) continue;
    const off = i * 4;
    const or = outRaw[off + 0];
    const og = outRaw[off + 1];
    const ob = outRaw[off + 2];
    const nr = Math.round(or * (1 - a) + fillR * a);
    const ng = Math.round(og * (1 - a) + fillG * a);
    const nb = Math.round(ob * (1 - a) + fillB * a);
    outRaw[off + 0] = nr;
    outRaw[off + 1] = ng;
    outRaw[off + 2] = nb;
    if (maskBin[i]) {
      diffSum += Math.abs(nr - or) + Math.abs(ng - og) + Math.abs(nb - ob);
      diffCount += 3;
    }
  }

  const outPng = await sharp(outRaw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const outputDataUrl = `data:image/png;base64,${outPng.toString("base64")}`;
  return { outputDataUrl, meanAbsDiffInside: diffCount ? diffSum / diffCount : 0, used: true };
}

export async function processImageWithAI(
  assetUrl: string,
  taskType: AITaskType,
  prompt?: string,
  dbxPath?: string,
  tenantId?: string,
  maskUrl?: string
): Promise<AIProcessResult> {
  // Move instantiation inside to ensure we pick up the latest .env values
  // without requiring a full server restart
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
    // When passing browser-generated masks (data URLs), prefer uploading Buffer inputs.
    fileEncodingStrategy:
      (typeof maskUrl === "string" && maskUrl.startsWith("data:")) ||
      (typeof assetUrl === "string" && assetUrl.startsWith("data:"))
        ? "upload"
        : "default",
  });

  try {
    let session = null;
    try {
      session = await auth();
    } catch (e) {
      // Ignore auth error if called from CLI/Script
      console.log("[AI_EDIT] Auth context not available, proceeding with tenantId check");
    }

    // For now, allow public access if tenantId is provided (e.g. from a public gallery)
    // but in production we'd want to verify the gallery access here.
    if (!session && !tenantId) return { success: false, error: "Unauthorized" };

    let publicImageUrl = assetUrl;

    // 1. If it's a Storage asset (Dropbox or Drive), we MUST get a temporary direct link
    // so Replicate can download it. The internal proxy URLs (localhost) won't work.
    if (dbxPath && tenantId) {
      const urlObj = (() => {
        try {
          return new URL(publicImageUrl);
        } catch {
          return null;
        }
      })();

      const urlParams = urlObj?.searchParams || new URLSearchParams(publicImageUrl.split("?")[1] || "");
      const dbxId = urlParams.get("id");
      const isLocalHost = publicImageUrl.includes("localhost") || publicImageUrl.includes("127.0.0.1") || publicImageUrl.startsWith("/");
      const isProxyUrl =
        publicImageUrl.includes("/api/dropbox/assets/") ||
        publicImageUrl.includes("/api/google-drive/assets/") ||
        publicImageUrl.startsWith("/api/dropbox/assets/") ||
        publicImageUrl.startsWith("/api/google-drive/assets/");
      
      if (isLocalHost || isProxyUrl) {
        console.log(`[AI_EDIT] Proxy/Local URL detected, forcing temporary link for ID: ${dbxId} or Path: ${dbxPath}`);
        
        // Resolve tenant to check provider
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { storageProvider: true }
        });
        const provider = (tenant as any)?.storageProvider || "DROPBOX";

        // If we have a File ID, use that as it's more reliable than the relative path
        const lookupPath = dbxId || dbxPath;
        const storageResult = await getTemporaryLink(lookupPath, tenantId, provider);
        if (storageResult.success && storageResult.url) {
          publicImageUrl = storageResult.url;
        } else {
          // If we can't get a temp link, check for Dropbox shared link fallback
          const sharedLink = urlParams.get("sharedLink");
          if (sharedLink && (sharedLink.includes("dropbox.com") || sharedLink.includes("dropboxusercontent.com"))) {
            let directUrl = sharedLink.replace("www.dropbox.com", "dl.dropboxusercontent.com").replace("dl=0", "raw=1");
            
            // If it's a folder link (/scl/fo/), we need to append the filename to get the specific file
            if (directUrl.includes("/scl/fo/") && dbxPath) {
              const fileName = dbxPath.split("/").pop();
              if (fileName) {
                // Remove existing query params from base URL to append filename correctly
                const baseUrl = directUrl.split("?")[0];
                const queryParams = directUrl.split("?")[1] || "";
                directUrl = `${baseUrl}/${encodeURIComponent(fileName)}?${queryParams}`;
              }
            }
            publicImageUrl = directUrl;
          } else {
            return { success: false, error: `AI cannot access local images. Please ensure ${provider} is connected.` };
          }
        }
      } else if (publicImageUrl.includes("dropbox.com") || publicImageUrl.includes("dropboxusercontent.com")) {
        // It's already a full Dropbox URL, just ensure it's a direct link
        publicImageUrl = publicImageUrl
          .replace("www.dropbox.com", "dl.dropboxusercontent.com")
          .replace("dl=0", "raw=1")
          .replace("dl=1", "raw=1");
      }
    }

    // Ensure we only ever pass plain strings to callers (Client Components cannot receive URL objects).
    publicImageUrl = typeof publicImageUrl === "string" ? publicImageUrl : String(publicImageUrl);

    let model: any;
    let input: any;

    switch (taskType) {
      case "sky_replacement":
        // Using reve/edit-fast which is confirmed to exist and be accessible (200 OK)
        model = "reve/edit-fast";
        input = {
          image: publicImageUrl,
          prompt: prompt || "Replace the grey/overcast sky with a perfect, beautiful clear blue sunny sky with soft wispy white clouds. Professional real estate photography style, bright and airy.",
        };
        break;

      case "day_to_dusk":
        model = "reve/edit-fast";
        input = {
          image: publicImageUrl,
          prompt:
            `${DUSK_LIGHTING_ONLY_GUARDRAILS}\n\n` +
            `GOAL:\n` +
            (prompt ||
              "Transform this daytime photo into a beautiful early dusk / golden hour scene. Match the original exposure (bright and clear; NOT dark). Replace the sky with a stunning golden hour sky featuring soft pink, orange, and golden hues. Make existing interior and architectural lights glow softly and warmly (do not change blinds/curtains), ensuring the house remains the well-lit focal point with professional real estate lighting."),
        };
        break;

      case "room_editor":
        model = "google/nano-banana";
        input = {
          image_input: [publicImageUrl],
          prompt: `${ROOM_EDITOR_GUARDRAILS}\n\nINSTRUCTION:\n${prompt || "Remove all furniture, rugs/mats, decor, and wall art. Leave the room empty."}`,
          aspect_ratio: "match_input_image"
        };
        break;

      case "object_removal":
        if (maskUrl) {
          // True object removal (non-generative fill) via LaMa inpainting.
          // Requires only image+mask; does not accept prompt fields.
          // Pinned version for stability.
          model = "allenhooo/lama:cdac78a1bec5b23c07fd29692fb70baa513ea403a39e643c48ec5edadb15fe72";
          input = {
            image: publicImageUrl,
            mask: maskUrl,
          };

          // LaMa expects the mask to match the image resolution.
          // Our UI mask is generated at the displayed size, so resize/threshold server-side.
          try {
            const [imgBytes, maskBytes] = await Promise.all([
              readImageBytes(publicImageUrl),
              readImageBytes(maskUrl),
            ]);
            const meta = await sharp(imgBytes, { failOn: "none" }).metadata();
            const w = Number(meta.width || 0);
            const h = Number(meta.height || 0);
            if (w > 0 && h > 0) {
              const resizedMaskPng = await sharp(maskBytes, { failOn: "none" })
                .resize(w, h, { fit: "fill" })
                .ensureAlpha()
                // Make it a hard black/white mask.
                .threshold(128)
                .png()
                .toBuffer();

              // Upload both as bytes to ensure Replicate sees identical dimensions.
              input = {
                image: imgBytes,
                mask: resizedMaskPng,
              };
            }
          } catch (e) {
            console.warn("[AI_EDIT] Mask resize for LaMa failed, proceeding with raw inputs:", e);
          }
        } else {
          model = "reve/edit-fast";
          input = {
            image: publicImageUrl,
            prompt: prompt || AUTO_REMOVE_ALL_ITEMS_PROMPT,
          };
        }
        break;

      case "virtual_staging":
        model = maskUrl ? "stability-ai/sdxl-inpaint" : "reve/edit-fast";
        const baseStagingPrompt = prompt || "Add modern luxury living room furniture, high-end interior design, realistic, cinematic lighting to this empty room.";
        input = {
          image: publicImageUrl,
          prompt: `${baseStagingPrompt}. Seamlessly integrate furniture into the existing room architecture. Preserve all walls, windows, and floors exactly as they are.`,
          mask: maskUrl || undefined,
          negative_prompt: ARCHITECTURAL_NEGATIVE_PROMPT,
          prompt_strength: 0.85, // Stronger focus on furniture within mask
          num_inference_steps: 50,
          guidance_scale: 12, // High guidance for strict prompt adherence
          mask_blur: 4, // Subtle blur for seamless blending at edges
        };
        break;

      default:
        return { success: false, error: "Invalid task type" };
    }

    console.log(`[AI_EDIT] Starting ${taskType} using ${model} for ${dbxPath || publicImageUrl}`);
    
    // FINAL SAFETY CHECK: Ensure we aren't sending a localhost URL to Replicate
    if (publicImageUrl.includes("localhost") || publicImageUrl.startsWith("/")) {
      console.error("[AI_EDIT_ERROR] Failed to resolve a public URL. Sending localhost to Replicate would fail.");
      return { success: false, error: "AI cannot access the image (Localhost Error). Please check your Dropbox connection." };
    }
    
    // Robust execution with built-in retry for 429s
    let output: any;
    let retries = 0;
    const maxRetries = 2;

    const dataUrlToBuffer = (dataUrl: string): { buffer: Buffer; mime: string } | null => {
      try {
        const m = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || "").trim());
        if (!m) return null;
        const mime = m[1] || "application/octet-stream";
        const b64 = m[2] || "";
        return { buffer: Buffer.from(b64, "base64"), mime };
      } catch {
        return null;
      }
    };

    while (retries <= maxRetries) {
      try {
        // Do NOT blindly inject `image` into every model (some use image_input/mask schemas).
        const runInput: any = { ...input };
        if (runInput.image) runInput.image = publicImageUrl;

        // Convert any browser-generated image/mask data URLs into Buffers so Replicate uploads them.
        if (typeof runInput.image === "string" && runInput.image.startsWith("data:image/")) {
          const parsed = dataUrlToBuffer(runInput.image);
          if (parsed) runInput.image = parsed.buffer;
        }
        if (typeof runInput.mask === "string" && runInput.mask.startsWith("data:image/")) {
          const parsed = dataUrlToBuffer(runInput.mask);
          if (parsed) runInput.mask = parsed.buffer;
        }

        // Final safety: only populate `prompt` if this schema uses it.
        if ("prompt" in runInput && !String(runInput.prompt || "").trim()) {
          runInput.prompt = String(prompt || "").trim() || "Edit the image according to the provided inputs.";
        }

        console.log(
          "[AI_EDIT] Replicate input check:",
          JSON.stringify(
            {
              model,
              taskType,
              keys: Object.keys(runInput || {}),
              promptLen: String(runInput.prompt || "").length,
              hasMask: !!runInput.mask,
              maskType: runInput.mask ? (Buffer.isBuffer(runInput.mask) ? "buffer" : typeof runInput.mask) : null,
            },
            null,
            2
          )
        );

        output = await replicate.run(model, { input: runInput });
        break; // Success!
      } catch (runError: any) {
        if (runError.status === 429 && retries < maxRetries) {
          console.log(`[AI_EDIT] Rate limited (429). Retrying in 3s... (Attempt ${retries + 1})`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          retries++;
          continue;
        }
        throw runError; // Re-throw if not a 429 or max retries reached
      }
    }
    
    // Helper to robustly extract a string URL from Replicate output
    const extractUrl = async (data: any): Promise<string | null> => {
      if (!data) return null;
      
      // 1. If it's a string, it's likely already the URL
      if (typeof data === 'string' && (data.startsWith('http') || data.startsWith('data:'))) return data;
      
      // 2. If it's an array, recurse on the first element
      if (Array.isArray(data) && data.length > 0) return await extractUrl(data[0]);
      
      // 3. Check for Replicate's FileOutput object (most common)
      // The SDK often provides a .url() method that uploads to Replicate's storage
      if (data && typeof data.url === 'function') {
        try {
          const url = await data.url();
          if (url) return url;
        } catch (e) {
          console.warn("[AI_EDIT] .url() call failed, falling back to stream reading");
        }
      }
      
      // 4. Check for direct .url property
      if (data && typeof data.url === 'string') return data.url;

      // 5. Handle ReadableStream / Readable (Node.js)
      if (data && (typeof data.read === 'function' || data[Symbol.asyncIterator] || (data.constructor && data.constructor.name === 'ReadableStream'))) {
        try {
          const chunks = [];
          for await (const chunk of data) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          }
          const buffer = Buffer.concat(chunks);
          return `data:image/jpeg;base64,${buffer.toString('base64')}`;
        } catch (e) {
          console.error("[AI_EDIT] Failed to read stream:", e);
        }
      }

      if (data && typeof data.toString === 'function' && data.toString() !== "[object Object]") {
        const str = data.toString();
        if (str.startsWith('http') || str.startsWith('data:')) return str;
      }
      return null;
    };

    const outputUrl = await extractUrl(output);

    if (!outputUrl) {
      console.error("[AI_EDIT_ERROR] No output URL found in Replicate response:", JSON.stringify(output));
      return { success: false, error: "AI failed to generate a valid image URL" };
    }

    // --- HD UPSCALING STEP ---
    // Best-quality / like-for-like guardrail:
    // ML upscalers (ESRGAN) can hallucinate textures (grass/roof/brick) on exterior photos.
    // To avoid ruining details, only run the ML upscaler for room-style edits where it's safest.
    if (taskType !== "room_editor") {
      return {
        success: true,
        outputUrl: String(outputUrl),
        upscaled: false,
        upscaleSkippedReason: "disabled_for_task",
      };
    }

    const upscaleScale = 4;

    // Optional guardrail: skip expensive upscaling if the output is already huge.
    // We keep this best-effort and never block the workflow if it fails.
    try {
      const res = await fetch(String(outputUrl), { cache: "no-store" });
      if (res.ok) {
        const bytes = Buffer.from(await res.arrayBuffer());
        const meta = await sharp(bytes, { failOn: "none" }).metadata();
        const w = Number(meta.width || 0);
        const h = Number(meta.height || 0);
        const longEdge = Math.max(w, h);
        const SKIP_LONG_EDGE = 5600;
        if (longEdge && longEdge >= SKIP_LONG_EDGE) {
          console.log(`[AI_EDIT] Upscale skipped (already large): ${w}x${h} (longEdge=${longEdge})`);
          return { success: true, outputUrl: String(outputUrl), upscaled: false, upscaleSkippedReason: "already_large" };
        }
      }
    } catch (e) {
      // Non-blocking: if we can't fetch/inspect, proceed with upscaling attempt.
    }

    console.log(`[AI_EDIT] Upscaling output to HD using nightmareai/real-esrgan (scale=${upscaleScale})`);
    try {
      const upscaleOutput: any = await replicate.run(
        "nightmareai/real-esrgan:b3ef194191d13140337468c916c2c5b96dd0cb06dffc032a022a31807f6a5ea8",
        {
          input: {
            image: outputUrl,
            scale: upscaleScale,
            face_enhance: false
          }
        }
      );
      
      const finalUrl = await extractUrl(upscaleOutput);
      if (finalUrl) {
        console.log(`[AI_EDIT] HD Upscale complete: ${String(finalUrl).substring(0, 100)}...`);
        return { success: true, outputUrl: String(finalUrl), upscaled: true };
      }
    } catch (upscaleError) {
      console.error("[AI_EDIT_UPSCALER_ERROR]:", upscaleError);
      // Fallback to original output if upscaler fails
      return { success: true, outputUrl: String(outputUrl), upscaled: false, upscaleSkippedReason: "upscaler_failed" };
    }

    return { success: true, outputUrl: String(outputUrl), upscaled: false, upscaleSkippedReason: "no_upscale_url" };
  } catch (error: any) {
    console.error("[AI_EDIT_ERROR]:", error);
    
    // Specific handling for Rate Limits (429)
    if (error.message?.includes("throttled") || error.status === 429) {
      return { 
        success: false, 
        error: "Rate limit reached. Replicate requires at least $5.00 in credit to unlock higher speeds. Please top up your Replicate account." 
      };
    }

    return { success: false, error: error.message || "AI processing failed" };
  }
}

