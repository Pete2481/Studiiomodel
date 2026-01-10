"use server";

import Replicate from "replicate";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getDropboxTemporaryLink } from "./dropbox";

export type AITaskType = "sky_replacement" | "day_to_dusk" | "object_removal" | "virtual_staging";

const ARCHITECTURAL_NEGATIVE_PROMPT = "structural changes, changing windows, changing walls, changing floor material, different room layout, perspective change, distorted architecture, blurry background, low quality, changing ceiling, removing built-in fixtures";

interface AIProcessResult {
  success: boolean;
  outputUrl?: string;
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

    // 1. If it's a Dropbox asset, we MUST get a temporary direct link
    // so Replicate can download it. The internal proxy URLs (localhost) won't work.
    if (dbxPath && tenantId) {
      const urlParams = new URLSearchParams(publicImageUrl.split("?")[1] || "");
      const dbxId = urlParams.get("id");
      const isLocalHost = publicImageUrl.includes("localhost") || publicImageUrl.includes("127.0.0.1") || publicImageUrl.startsWith("/");
      
      if (isLocalHost) {
        console.log(`[AI_EDIT] Localhost/Proxy URL detected, forcing temporary link for ID: ${dbxId} or Path: ${dbxPath}`);
        // If we have a Dropbox File ID, use that as it's more reliable than the relative path
        const lookupPath = dbxId || dbxPath;
        const dbxResult = await getDropboxTemporaryLink(lookupPath, tenantId);
        if (dbxResult.success && dbxResult.url) {
          publicImageUrl = dbxResult.url;
        } else {
          // If we can't get a temp link, we might be able to extract the shared link if it exists
          const urlParams = new URLSearchParams(publicImageUrl.split("?")[1] || "");
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
            return { success: false, error: "AI cannot access local images. Please ensure Dropbox is connected." };
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

      case "object_removal":
        if (!prompt) return { success: false, error: "Prompt required for object removal" };
        model = "reve/edit-fast";
        input = {
          image: publicImageUrl,
          prompt: `Remove the following from the image: ${prompt}. Seamlessly blend the background.`,
        };
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
        output = await replicate.run(model, { input: { ...input, image: publicImageUrl } });
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
    
    // Replicate's reve/edit-fast output is a file object.
    // We get the URL by calling .url() on it as shown in your screenshots.
    const outputUrl = typeof output.url === 'function' ? output.url() : (Array.isArray(output) ? output[0] : output);

    if (!outputUrl) {
      return { success: false, error: "AI failed to generate output" };
    }

    // --- HD UPSCALING STEP ---
    console.log(`[AI_EDIT] Upscaling output to HD using nightmareai/real-esrgan...`);
    try {
      const upscaleOutput: any = await replicate.run(
        "nightmareai/real-esrgan:b3ef194191d13140337468c916c2c5b96dd0cb06dffc032a022a31807f6a5ea8",
        {
          input: {
            image: outputUrl,
            scale: 2, // 2x upscale for HD performance
            face_enhance: false
          }
        }
      );
      const finalUrl = typeof upscaleOutput.url === 'function' ? upscaleOutput.url() : (Array.isArray(upscaleOutput) ? upscaleOutput[0] : upscaleOutput);
      if (finalUrl) {
        console.log(`[AI_EDIT] HD Upscale complete: ${finalUrl}`);
        return { success: true, outputUrl: finalUrl };
      }
    } catch (upscaleError) {
      console.error("[AI_EDIT_UPSCALER_ERROR]:", upscaleError);
      // Fallback to original low-res output if upscaler fails
      return { success: true, outputUrl };
    }

    return { success: true, outputUrl };
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

