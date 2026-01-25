"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type MapMarker = {
  id: string;
  title: string;
  status: string;
  deliveredAt: string | null;
  createdAt: string | null;
  client: string;
  agent: string;
  property: { id: string; name: string; address: string; lat: number; lon: number };
};

type Payload = {
  success: boolean;
  tenantId: string;
  total: number;
  missingCoordsCount: number;
  markers: MapMarker[];
  error?: string;
};

// Fix default marker icons in bundlers (Next/Webpack)
const DefaultIcon = L.icon({
  iconUrl:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%2310b981' d='M12 2c-3.3 0-6 2.7-6 6 0 4.5 6 14 6 14s6-9.5 6-14c0-3.3-2.7-6-6-6zm0 8.5c-1.4 0-2.5-1.1-2.5-2.5S10.6 5.5 12 5.5s2.5 1.1 2.5 2.5S13.4 10.5 12 10.5z'/%3E%3C/svg%3E",
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -24],
});

function FitBounds({ points }: { points: Array<{ lat: number; lon: number }> }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  }, [map, points]);
  return null;
}

export function GalleriesMap() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/maps/galleries", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as Payload | null;
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/maps/galleries", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as Payload | null;
        if (cancelled) return;
        setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markers = useMemo(() => (Array.isArray(data?.markers) ? data!.markers : []), [data]);
  const points = useMemo(() => markers.map((m) => ({ lat: m.property.lat, lon: m.property.lon })), [markers]);

  const center = points.length ? ([points[0].lat, points[0].lon] as [number, number]) : ([-33.8688, 151.2093] as [number, number]); // Sydney fallback

  const runBackfill = async () => {
    setBackfillMsg(null);
    setBackfilling(true);
    try {
      let loops = 0;
      while (loops < 200) {
        loops++;
        const res = await fetch(`/api/maps/backfill?limit=20`, { method: "POST" });
        const json = await res.json().catch(() => ({} as any));
        if (!res.ok || !json?.success) {
          setBackfillMsg(String(json?.error || "Backfill failed (admin only)."));
          break;
        }
        const remaining = Number(json?.remaining || 0);
        setBackfillMsg(`Geocoding… updated ${Number(json?.updated || 0)} (remaining ${remaining})`);
        if (remaining <= 0) break;
        // small delay to be kind to rate limits
        await new Promise((r) => setTimeout(r, 150));
      }
    } finally {
      await load();
      setBackfilling(false);
      setTimeout(() => setBackfillMsg(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Delivered jobs map</h2>
          <p className="text-sm font-medium text-slate-500">
            Visual map of delivered galleries (private to your account).
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.success && Number(data?.missingCoordsCount || 0) > 0 ? (
            <button
              type="button"
              onClick={() => void runBackfill()}
              disabled={backfilling}
              className="h-10 px-5 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              title="Geocode missing properties (admin only)"
            >
              {backfilling ? "Geocoding…" : "Fix missing locations"}
            </button>
          ) : null}
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {loading ? "Loading…" : data?.success ? `${markers.length} pins` : "Failed"}
            {data?.success && typeof data.missingCoordsCount === "number" && data.missingCoordsCount > 0
              ? ` • ${data.missingCoordsCount} missing locations`
              : null}
          </div>
        </div>
      </div>

      {backfillMsg ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
          {backfillMsg}
        </div>
      ) : null}

      <div className="rounded-[32px] border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="h-[70vh] w-full">
          <MapContainer center={center} zoom={10} scrollWheelZoom className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={points} />
            {markers.map((m) => {
              const d = m.deliveredAt ? new Date(m.deliveredAt) : null;
              const delivered = d && !isNaN(d.getTime()) ? format(d, "dd MMM yyyy") : "";
              return (
                <Marker key={m.id} position={[m.property.lat, m.property.lon]} icon={DefaultIcon}>
                  <Popup>
                    <div className="space-y-2">
                      <div className="font-bold text-slate-900">{m.property.name || m.title}</div>
                      {m.property.address ? <div className="text-xs text-slate-600">{m.property.address}</div> : null}
                      <div className="text-xs text-slate-600">
                        {m.client ? <div><span className="font-semibold">Client:</span> {m.client}</div> : null}
                        {m.agent ? <div><span className="font-semibold">Agent:</span> {m.agent}</div> : null}
                        {delivered ? <div><span className="font-semibold">Delivered:</span> {delivered}</div> : null}
                      </div>
                      <Link
                        href={`/gallery/${encodeURIComponent(m.id)}`}
                        target="_blank"
                        className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-slate-900 text-white text-xs font-bold"
                      >
                        Open gallery
                      </Link>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>

      {!loading && data && !data.success ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {data.error || "Failed to load map data."}
        </div>
      ) : null}
    </div>
  );
}

