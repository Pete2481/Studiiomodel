"use server";

import Replicate from "replicate";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { getDropboxTemporaryLink, getGalleryAssets } from "./dropbox";
import { getNearbyLandmarks } from "@/lib/google-places";

// Use the 90B vision model for deep spatial reasoning and high-end creative output.
const REPLICATE_MODEL = "lucataco/ollama-llama3.2-vision-90b:54202b223d5351c5afe5c0c9dba2b3042293b839d022e76f53d66ab30b9dc814";

/**
 * Helper to run Replicate with automatic retries for rate limits (429)
 */
async function runReplicateWithRetry(replicate: Replicate, model: any, input: any, maxRetries = 3) {
  let retries = 0;
  while (retries <= maxRetries) {
    try {
      return await replicate.run(model, { input });
    } catch (error: any) {
      const isThrottled = error.status === 429 || error.message?.includes("throttled");
      if (isThrottled && retries < maxRetries) {
        // Extract retry-after from error or default to 5s
        const waitTime = (error.retry_after || 5) * 1000;
        console.log(`[REPLICATE] Throttled. Waiting ${waitTime/1000}s before retry ${retries + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        retries++;
        continue;
      }
      throw error;
    }
  }
}

const MASTER_TEMPLATE = `
Ultimate Byron Bay sanctuary with outstanding income potential

36 MARVELL STREET, BYRON BAY
Capturing the essence of Byron Bay's relaxed luxury, this rare and remarkable property offers a truly unique lifestyle and investment opportunity in the heart of town. Set on a 497m² block in the exclusive 'Golden Grid', it features two beautifully appointed spaces – The Cottage and The Chapel – each with separate access. Just moments from the beach and a short stroll into town, this stunning property blends character-filled charm with income-generating potential in one of Byron's most tightly held enclaves. Profiled in international design publications including Vogue, both spaces have been thoughtfully crafted to reflect Byron's iconic style. The Cottage offers timeless Queenslander charm with original timbers, high ceilings and relaxed open-plan living, while The Chapel, a stylish two-storey studio, is perfect for guests, extended family or as a caretaker's residence. This is an incredibly rare opportunity to secure a premium central Byron Bay property with exceptional lifestyle and investment appeal.

- 497m² block with two thoughtfully designed spaces, each with separate access
- Sought-after 'Golden Grid' location – walk to town and beach
- The Cottage features three bedrooms and a gas fireplace
- High ceilings, raw timber features and indoor-outdoor flow
- Large covered verandah, outdoor bath, pool and spa
- Spacious deck perfect for entertaining or relaxing in privacy
- The Chapel is a self-contained two-storey studio with private entry
- Ideal for holiday letting, guest accommodation or caretaker use
- 240m to The Top Shop café, 650m to the beach, 6 mins to Wategos
`;

export async function generateListingCopy(galleryId: string) {
  // Use REPLICATE_API_TOKEN from process.env explicitly to ensure it's picked up
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return { success: false, error: "REPLICATE_API_TOKEN is missing from environment. Please add it to Vercel/Local env." };
  }

  const replicate = new Replicate({
    auth: token,
  });

  try {
    const session = await auth();
    if (!session?.user?.tenantId) throw new Error("Unauthorized");

    const tPrisma = await getTenantPrisma(session.user.tenantId);
    
    // 1. Fetch Gallery details
    const gallery = await tPrisma.gallery.findUnique({
      where: { id: galleryId },
      include: { 
        property: true
      }
    });

    if (!gallery) throw new Error("Gallery not found");

    // 2. Fetch Assets directly from Dropbox
    const assetsResult = await getGalleryAssets(galleryId);
    if (!assetsResult.success || !assetsResult.assets || assetsResult.assets.length === 0) {
      throw new Error("No images found in gallery to analyze.");
    }

    const images = assetsResult.assets.filter((a: any) => a.type === "image");
    if (images.length === 0) {
      throw new Error("No images found in gallery to analyze.");
    }

    // --- ASSET CLASSIFICATION ---
    const floorplans = images.filter((a: any) => 
      a.name.toLowerCase().includes('plan') || 
      a.name.toLowerCase().includes('layout') ||
      a.name.toLowerCase().includes('sketch')
    );
    const exteriors = images.filter((a: any) => 
      a.name.toLowerCase().includes('ext') || 
      a.name.toLowerCase().includes('front') || 
      a.name.toLowerCase().includes('drone') ||
      a.name.toLowerCase().includes('aerial')
    );
    const interiors = images.filter((a: any) => 
      !floorplans.some(f => f.id === a.id) && 
      !exteriors.some(e => e.id === a.id)
    );

    // Diverse selection for AI analysis
    const selection = [
      ...floorplans.slice(0, 1), // Priority 1: Floorplan
      ...exteriors.slice(0, 1),   // Priority 2: Main Exterior
      ...interiors.slice(0, 2)    // Priority 3: Vibe/Living/Kitchen
    ].slice(0, 4);

    const property = gallery.property;
    const address = `${property.addressLine1}${property.addressLine2 ? ', ' + property.addressLine2 : ''}, ${property.city}, ${property.state} ${property.postcode}`;

    // --- LOCATION LANDMARKS ---
    const landmarks = await getNearbyLandmarks(address);
    const landmarksContext = landmarks.length > 0 
      ? `Nearby landmarks and lifestyle spots: ${landmarks.join(", ")}.`
      : "";

    // 3. Get temporary links for selection
    const imageLinks = await Promise.all(
      selection.map(async (img: any) => {
        if (img.id) {
          const res = await getDropboxTemporaryLink(img.id, session.user.tenantId!);
          return res.success ? res.url : null;
        }
        return null;
      })
    );

    const validLinks = imageLinks.filter(Boolean) as string[];
    if (validLinks.length === 0) throw new Error("Could not generate temporary access for gallery images.");

    // --- STAGE 1: VISION ANALYSIS (Deep Dive) ---
    console.log("[AI] Starting Stage 1: Vision Analysis (Sequential)");
    
    const analysisResults: string[] = [];

    // Process selection sequentially to avoid 429s
    for (let i = 0; i < validLinks.slice(0, 3).length; i++) {
      const url = validLinks[i];
      const asset = selection[i];
      const isFloorplan = floorplans.some(f => f.id === asset.id);
      const typeLabel = isFloorplan ? "FLOOR PLAN" : "PROPERTY IMAGE";
      
      const analysisPrompt = `
Analyze this ${typeLabel} from a property listing. 
${isFloorplan ? `You are "Eyes". Extract ONLY what is visible on this FLOOR PLAN. 
Return strict JSON:
{
  "specs": { "bedrooms": number|null, "bathrooms": number|null, "car_spaces": number|null },
  "key_features": string[],
  "layout_notes": string[]
}` : `You are "Eyes". Extract architectural details and vibe from this PROPERTY IMAGE. 
Return strict JSON:
{
  "style": string,
  "materials": string[],
  "standout_features": string[],
  "vibe": string
}`}
`;

      try {
        const analysisOutput = await runReplicateWithRetry(replicate, REPLICATE_MODEL, {
          prompt: analysisPrompt,
          image: url,
          temperature: 0.2,
          top_p: 0.95,
          max_new_tokens: 500,
        });
        
        analysisResults.push(Array.isArray(analysisOutput) ? analysisOutput.join("") : analysisOutput as string);
        
        // Brief 1s delay between vision calls
        if (i < validLinks.slice(0, 3).length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err) {
        console.error(`Error analyzing image ${i}:`, err);
      }
    }

    const extractedFacts = analysisResults.filter(Boolean).join("\n\n---\n\n");

    // --- STAGE 2: COPYWRITING (The "Awesome" Copy) ---
    console.log("[AI] Starting Stage 2: High-End Copywriting");
    
    const copywritingPrompt = `
You are a master real estate copywriter specializing in ultra-high-end property listings for the Byron Bay, Northern Rivers, and Gold Coast regions. 
Your tone is evocative, sophisticated, and lifestyle-oriented, mirroring the "relaxed luxury" vibe of the Northern Rivers.

PROJECT CONTEXT:
- Address: ${address}
- Title: ${gallery.title}
- ${landmarksContext}

DEEP DIVE FACTS FROM ASSET ANALYSIS (Factual JSON Data):
${extractedFacts}

YOUR MISSION:
Write a "AWESOME" property listing that makes a buyer fall in love. 
1. Use the address and landmarks to describe the "Lifestyle" (e.g. "Stroll to the white sands of...", "Moments from the curated delights of...").
2. Use the factual data to accurately describe the layout, room counts, and high-end materials.
3. DO NOT use generic AI filler. Be specific. If the analysis mentions "limestone floors" or "raked ceilings", use those details.
4. PRESERVE the architectural character mentioned in the analysis.

STRUCTURE:
- HEADLINE: Captivating and powerful.
- BODY COPY: 3-4 rich paragraphs that tell a story. Focus on the feeling of living there.
- THE FEATURES: A curated bulleted list of 8-10 key selling points.
- TONE: Sophisticated, relaxed, and premium.

--- MASTER TEMPLATE FOR STYLE ---
${MASTER_TEMPLATE}
--- END MASTER TEMPLATE ---

Write the final professional copy now.
`;

    // Final pass context: Use the exterior if available
    const finalImage = exteriors.length > 0 ? validLinks[selection.findIndex(s => s.id === exteriors[0].id)] : validLinks[0];

    const finalOutput = await runReplicateWithRetry(replicate, REPLICATE_MODEL, {
      prompt: copywritingPrompt,
      image: finalImage,
      max_new_tokens: 1500,
      temperature: 0.75,
    });

    const resultText = Array.isArray(finalOutput) ? finalOutput.join("") : finalOutput as string;

    return { success: true, copy: resultText };
  } catch (error: any) {
    console.error("GENERATE COPY ERROR:", error);
    return { success: false, error: error.message };
  }
}

export async function saveGalleryCopy(galleryId: string, copy: string, isPublished: boolean = false) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) throw new Error("Unauthorized");

    const tPrisma = await getTenantPrisma(session.user.tenantId);
    
    await tPrisma.gallery.update({
      where: { id: galleryId },
      data: { 
        aiCopy: copy,
        isCopyPublished: isPublished,
        updatedAt: new Date()
      }
    });

    return { success: true };
  } catch (error: any) {
    console.error("SAVE COPY ERROR:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Smart AI Update: Rewrites ONLY a specific selection of text based on user instructions.
 */
export async function updateListingSelection(
  galleryId: string,
  fullText: string,
  selectionText: string,
  instruction: string
) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return { success: false, error: "REPLICATE_API_TOKEN is missing." };
  }

  const replicate = new Replicate({ auth: token });

  try {
    const session = await auth();
    if (!session?.user?.tenantId) throw new Error("Unauthorized");

    const tPrisma = await getTenantPrisma(session.user.tenantId);
    const gallery = await tPrisma.gallery.findUnique({
      where: { id: galleryId },
      include: { property: true }
    });

    if (!gallery) throw new Error("Gallery not found");

    const updatePrompt = `
You are a master real estate copywriter. I have a listing draft for ${gallery.property.addressLine1}.

FULL CURRENT TEXT:
"""
${fullText}
"""

THE SECTION TO REWRITE:
"""
${selectionText}
"""

USER'S INSTRUCTION FOR THIS SECTION:
"${instruction}"

YOUR MISSION:
Rewrite ONLY the specific section provided. Do not change anything else in the listing.
Maintain the high-end, sophisticated Byron Bay "relaxed luxury" tone.
Ensure the rewritten section flows perfectly back into the rest of the text.

Return ONLY the rewritten snippet. No preamble, no explanation.
`;

    const output = await runReplicateWithRetry(replicate, REPLICATE_MODEL, {
      prompt: updatePrompt,
      max_new_tokens: 1000,
      temperature: 0.7,
    });

    const rewrittenSnippet = Array.isArray(output) ? output.join("") : output as string;
    
    // Clean up the snippet (sometimes AI adds quotes or markers)
    const cleanedSnippet = rewrittenSnippet.trim().replace(/^"/, '').replace(/"$/, '').replace(/^"""/, '').replace(/"""$/, '');

    // Replace the selection in the full text
    const updatedFullText = fullText.replace(selectionText, cleanedSnippet);

    return { success: true, updatedText: updatedFullText };
  } catch (error: any) {
    console.error("SMART EDIT ERROR:", error);
    return { success: false, error: error.message };
  }
}

