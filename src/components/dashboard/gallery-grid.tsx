"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

// Local type - no mock data dependency
export type GallerySummary = {
  id: string;
  title: string;
  createdAt: Date | string;
  address?: string;
  clientName?: string;
  coverImageUrl?: string;
  photographerIds?: string[];
  imageCount?: number;
};

const PAGE_SIZE = 12;

type GalleryGridProps = {
  galleries: GallerySummary[];
  onEdit?: (galleryId: string) => void;
  editingGalleryId?: string | null;
};

export function GalleryGrid({ galleries, onEdit, editingGalleryId }: GalleryGridProps) {
  const [page, setPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(galleries.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [galleries]);

  const handleCopyLink = useCallback(async (galleryId: string) => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/gallery/${galleryId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(galleryId);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("Unable to copy gallery link", error);
    }
  }, []);

  const handleShareGallery = useCallback(async (galleryId: string, title: string) => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/gallery/${galleryId}`;
    
    if (navigator.share) {
      try {
        await navigator.share({ 
          title: `Check out this gallery: ${title}`, 
          text: `View the gallery for ${title}`,
          url 
        });
        return;
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Share failed:", error);
        }
      }
    }
    
    const subject = encodeURIComponent(`Gallery: ${title}`);
    const body = encodeURIComponent(`Check out this gallery:\n\n${url}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }, []);

  const paginatedGalleries = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return galleries.slice(start, start + PAGE_SIZE);
  }, [galleries, page]);

  if (galleries.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500">
        <p className="font-semibold text-slate-600">No galleries yet</p>
        <p className="mt-2 max-w-sm text-xs text-slate-400">
          Drop property images here or tap upload to create your first collection.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {paginatedGalleries.map((gallery) => (
          <article
            key={gallery.id}
            className="group relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
          >
            <div
              className="relative w-full overflow-hidden rounded-t-[28px] bg-slate-100"
              style={{ aspectRatio: "4 / 3" }}
            >
              {gallery.coverImageUrl && gallery.coverImageUrl.length > 0 ? (
                <Image
                  fill
                  src={gallery.coverImageUrl}
                  alt={gallery.title}
                  sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition duration-500 group-hover:scale-105"
                  priority
                  unoptimized={gallery.coverImageUrl.includes("dropboxusercontent.com")}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <span className="text-4xl">🖼</span>
                </div>
              )}
              <div className="absolute inset-x-0 top-0 flex justify-end p-3">
                <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold text-slate-700 backdrop-blur">
                  {formatDate(gallery.createdAt)}
                </span>
              </div>
            </div>
            <div className="space-y-2 px-5 py-4">
              <h3 className="text-[15px] font-bold text-slate-900">{gallery.title}</h3>
              {(gallery.clientName || gallery.address) && (
                <p className="text-xs font-medium text-slate-500">{gallery.clientName ?? gallery.address}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>{gallery.photographerIds?.length ?? 0} team</span>
                <span>•</span>
                <span>{gallery.imageCount ?? 0} images</span>
              </div>
              <div className="flex w-full items-center justify-between gap-2 pt-2">
                <Link
                  href={`/gallery/${gallery.id}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-slate-200 text-sm transition hover:border-emerald-500 hover:text-emerald-600"
                  aria-label="Open gallery"
                >
                  <span aria-hidden>👁️</span>
                </Link>
                {onEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(gallery.id)}
                    disabled={editingGalleryId === gallery.id}
                    className={`inline-flex h-9 flex-1 items-center justify-center rounded-full border text-sm transition ${
                      editingGalleryId === gallery.id
                        ? "border-slate-200 bg-slate-100 text-slate-400"
                        : "border-slate-200 text-slate-500 hover:border-emerald-500 hover:text-emerald-600"
                    }`}
                  >
                    <span aria-hidden>✏️</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleCopyLink(gallery.id)}
                  className={`inline-flex h-9 flex-1 items-center justify-center rounded-full border text-sm transition ${
                    copiedId === gallery.id
                      ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                      : "border-slate-200 text-slate-500 hover:border-emerald-500 hover:text-emerald-600"
                  }`}
                >
                  <span aria-hidden>🔗</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleShareGallery(gallery.id, gallery.title)}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-slate-200 text-sm text-slate-500 transition hover:border-emerald-500 hover:text-emerald-600"
                >
                  <span aria-hidden>📤</span>
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-500 shadow-sm">
          <div>Page {page} of {totalPages}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-full border border-slate-200 px-3 py-1 hover:border-slate-300 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-full border border-slate-200 px-3 py-1 hover:border-slate-300 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(date: any) {
  try {
    const d = new Date(date);
    return `${d.getUTCDate()} ${d.toLocaleString("en-US", { month: "short" })}`;
  } catch {
    return "";
  }
}
