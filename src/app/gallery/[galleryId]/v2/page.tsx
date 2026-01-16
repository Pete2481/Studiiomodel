import { notFound } from "next/navigation";
import { Metadata } from "next";
import { NEXT_PUBLIC_GALLERY_V2_ENABLED } from "@/lib/env";
import { PublicGalleryV2, generatePublicGalleryV2Metadata, V2_PAGE_SIZE } from "../_public-gallery-v2";

// Enable ISR / Caching with 1 hour revalidation for public galleries
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ galleryId: string }>;
}): Promise<Metadata> {
  const { galleryId } = await params;
  return generatePublicGalleryV2Metadata({ galleryId, canonicalPath: `/gallery/${galleryId}/v2` });
}

export default async function PublicGalleryV2Page({
  params,
}: {
  params: Promise<{ galleryId: string }>;
}) {
  if (!NEXT_PUBLIC_GALLERY_V2_ENABLED) notFound();

  const { galleryId } = await params;
  return PublicGalleryV2({ galleryId, pageSize: V2_PAGE_SIZE });
}


