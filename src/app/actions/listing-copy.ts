"use server";

import Replicate from "replicate";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/tenant-guard";
import { getDropboxTemporaryLink, getGalleryAssets } from "./dropbox";

const REPLICATE_MODEL = "meta/llama-3.2-90b-vision-instruct";

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
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
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

    // 2. Fetch Assets directly from Dropbox (since Media table might be empty)
    const assetsResult = await getGalleryAssets(galleryId);
    if (!assetsResult.success || !assetsResult.assets || assetsResult.assets.length === 0) {
      throw new Error("No images found in gallery to analyze.");
    }

    const images = assetsResult.assets.filter((a: any) => a.type === "image");
    if (images.length === 0) {
      throw new Error("No images found in gallery to analyze.");
    }

    const property = gallery.property;
    const address = `${property.addressLine1}${property.addressLine2 ? ', ' + property.addressLine2 : ''}, ${property.city}, ${property.state} ${property.postcode}`;

    // 3. Get temporary links for images (Take top 3 for vision context)
    const imageLinks = await Promise.all(
      images.slice(0, 3).map(async (img: any) => {
        // img.id is the Dropbox ID (e.g. id:xxxx) which get_temporary_link supports
        if (img.id) {
          const res = await getDropboxTemporaryLink(img.id, session.user.tenantId!);
          return res.success ? res.url : null;
        }
        return null;
      })
    );

    const validLinks = imageLinks.filter(Boolean) as string[];
    const mainImage = validLinks[0];

    if (!mainImage) throw new Error("Could not generate temporary access for gallery images.");

    // 4. Build Prompt
    const prompt = `
You are a high-end real estate copywriter. Your task is to write a compelling property listing for the following property.

Property Address: ${address}
Property Title: ${gallery.title}

INSTRUCTIONS:
- Use the provided MASTER TEMPLATE as a guide for tone, structure, and style.
- The tone should be sophisticated, relaxed, and evocative of "luxury lifestyle".
- Highlight key features you might see in the images (pool, architecture, lighting, etc).
- Structure the response with a headline, a 2-3 paragraph description, and a bulleted list of features.
- Keep the word count similar to the template (approx 200-300 words).

--- MASTER TEMPLATE ---
${MASTER_TEMPLATE}
--- END MASTER TEMPLATE ---

Based on the images provided, write the professional copy now.
`;

    // 5. Run AI
    const output = await replicate.run(REPLICATE_MODEL, {
      input: {
        prompt,
        image: mainImage,
        max_new_tokens: 1000,
      }
    });

    // Handle output (might be an array of strings or a single string depending on the model)
    const resultText = Array.isArray(output) ? output.join("") : output;

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

