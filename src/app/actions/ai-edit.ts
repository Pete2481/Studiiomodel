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

interface AIProcessResult {
  success: boolean;
  outputUrl?: string;
  upscaled?: boolean;
  upscaleSkippedReason?: string;
  error?: string;
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
          prompt: "Transform this daytime photo into a beautiful early dusk / golden hour scene. Keep the overall image bright and clear, not too dark. Replace the sky with a stunning golden hour sky featuring soft pink, orange, and golden hues. Make the interior and architectural lights glow softly and warmly, ensuring the house remains the well-lit focal point with professional real estate lighting.",
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
        // UPGRADED: Using Google's Nano-Banana for professional-grade inpainting
        if (maskUrl) {
          model = "google/nano-banana";
          input = {
            image_input: [publicImageUrl, maskUrl],
            prompt: "Remove ONLY the objects highlighted in the mask and seamlessly rebuild the background floors and walls. Preserve the original lighting and architectural details exactly. Do not change architecture, windows, doors, or colors. High resolution, professional real estate photography.",
            aspect_ratio: "match_input_image"
          };
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

    while (retries <= maxRetries) {
      try {
        // Do NOT blindly inject `image` into every model (some use image_input/mask schemas).
        const runInput: any = { ...input };
        if (runInput.image) runInput.image = publicImageUrl;
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

