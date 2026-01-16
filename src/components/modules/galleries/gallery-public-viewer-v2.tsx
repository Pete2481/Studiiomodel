"use client";

import React from "react";
import { GalleryPublicViewer } from "./gallery-public-viewer";

interface GalleryPublicViewerV2Props {
  gallery: any;
  tenant: any;
  editTags?: any[];
  user?: any;
  initialAssets?: any[];
  initialCursor?: string | null;
  isShared?: boolean;
}

export function GalleryPublicViewerV2(props: GalleryPublicViewerV2Props) {
  return (
    <GalleryPublicViewer
      {...props}
      viewerConfig={{
        pageSize: 16,
        revealStep: 16,
        // V2: avoid full background re-enumeration that causes blank/reorder
        refreshAssetsOnOpen: false,
        // V2: progressive low->high banner
        progressiveBanner: true,
      }}
    />
  );
}


