export interface AIFurnitureBundle {
  id: string;
  name: string;
  thumbnail: string;
  roomType: string;
  prompt: string;
}

export const AI_FURNITURE_BUNDLES: AIFurnitureBundle[] = [
  {
    id: "coastal_lounge_set",
    name: "Hamptons Coastal Lounge",
    thumbnail: "https://studiio-assets.s3.amazonaws.com/furniture/coastal-sofa.png", // Example path
    roomType: "Living Room",
    prompt: "white linen L-shaped sectional sofa, round wooden coffee table, jute rug, coastal blue cushions, nautical wall art, hamptons style"
  },
  {
    id: "modern_minimalist_media",
    name: "Modern Media Suite",
    thumbnail: "https://studiio-assets.s3.amazonaws.com/furniture/modern-media.png",
    roomType: "Media Room",
    prompt: "sleek black leather theater seating, minimalist floating tv unit, ambient led lighting, dark charcoal rug, high-end acoustic panels"
  }
];

export interface AIStyleSuite {
  id: string;
  name: string;
  thumbnail: string;
  prompt: string;
  description: string;
}

export const AI_STAGING_STYLES: AIStyleSuite[] = [
  {
    id: "modern_luxury",
    name: "Modern Luxury",
    thumbnail: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&q=80&w=400&h=300",
    description: "Sleek Italian leather, marble accents, and minimalist designer furniture.",
    prompt: "high-end modern luxury interior design, sleek minimalist furniture, italian leather sofa, marble coffee table, designer lighting, architectural digest style, cinematic lighting, ultra-realistic, 8k"
  },
  {
    id: "coastal_hamptons",
    name: "Coastal / Hamptons",
    thumbnail: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=400&h=300",
    description: "Light linens, bleached oak, and airy blue and white tones.",
    prompt: "hamptons coastal interior design, light linen sofas, bleached oak furniture, nautical accents, soft blue and white color palette, airy and bright, natural sunlight, professional real estate photography"
  },
  {
    id: "industrial_loft",
    name: "Industrial Loft",
    thumbnail: "https://images.unsplash.com/photo-1505691938895-1758d7eaa511?auto=format&fit=crop&q=80&w=400&h=300",
    description: "Raw wood, exposed metal, and distressed leather accents.",
    prompt: "industrial loft interior design, exposed brick wall, raw wood dining table, metal chairs, distressed leather armchair, large windows, edgy and modern, high contrast lighting"
  },
  {
    id: "scandinavian",
    name: "Scandinavian",
    thumbnail: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=400&h=300",
    description: "Light woods, woven rugs, and functional Hygge styling.",
    prompt: "scandinavian hygge interior design, light wood floors, woven wool rugs, functional minimalist furniture, cozy and warm atmosphere, soft neutral tones, soft diffused lighting"
  }
];

