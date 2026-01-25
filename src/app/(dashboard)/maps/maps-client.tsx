"use client";

import dynamic from "next/dynamic";

const GalleriesMap = dynamic(() => import("@/components/maps/galleries-map").then((m) => m.GalleriesMap), {
  ssr: false,
  loading: () => <div className="h-[70vh] bg-slate-100 rounded-[32px] animate-pulse" />,
});

export function MapsClient() {
  return <GalleriesMap />;
}

