export const MASTER_ADMIN_EMAIL = process.env.MASTER_ADMIN_EMAIL || "team@studiio.au";

/**
 * Public Gallery V2 (hidden route) gate.
 * - Enable in local/staging to test `/gallery/[galleryId]/v2`.
 * - Keep disabled in production until ready to roll over.
 */
export const NEXT_PUBLIC_GALLERY_V2_ENABLED =
  process.env.NEXT_PUBLIC_GALLERY_V2_ENABLED === "1" ||
  process.env.NEXT_PUBLIC_GALLERY_V2_ENABLED === "true";

