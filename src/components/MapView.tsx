import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

export interface MapParcel {
  parcel_id: string;
  lat: number;
  lng: number;
  perfect_score: number;
  ring: number;
}

interface Props {
  parcels: MapParcel[];
  center?: [number, number];
  zoom?: number;
  onSelect?: (parcel_id: string) => void;
  selectedId?: string | null;
  className?: string;
}

// Resolve token colors from the running document so map layers stay in sync
// with the design system. Falls back to reasonable defaults for SSR.
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const RING_COLORS: Record<number, string> = {
  1: "oklch(0.74 0.10 220)", // listed / open — steel blue token
  2: "oklch(0.65 0.13 300)", // shadow — violet token
  3: "oklch(0.78 0.11 190)", // prophecy — pale teal token
};

function tierColor(score: number): string {
  if (score >= 80) return cssVar("--tier-exceptional", "oklch(0.86 0.16 108)");
  if (score >= 65) return cssVar("--tier-strong", "oklch(0.82 0.15 165)");
  if (score >= 50) return cssVar("--tier-viable", "oklch(0.78 0.15 62)");
  return cssVar("--tier-watch", "oklch(0.60 0.030 178)");
}

export function MapView({ parcels, center = [-98, 36], zoom = 4, onSelect, selectedId, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap © CARTO",
          },
          "carto-labels": {
            type: "raster",
            tiles: ["https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png"],
            tileSize: 256,
          },
        },
        layers: [
          { id: "base", type: "raster", source: "carto-dark" },
          { id: "labels", type: "raster", source: "carto-labels" },
        ],
      },
      center,
      zoom,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Render markers as a GeoJSON layer for scalability
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const geojson = {
        type: "FeatureCollection" as const,
        features: parcels.map((p) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
          properties: {
            parcel_id: p.parcel_id,
            score: p.perfect_score,
            ring: p.ring,
            color: tierColor(p.perfect_score),
            radius: Math.max(3, Math.min(14, 3 + (p.perfect_score / 100) * 12)),
            selected: p.parcel_id === selectedId ? 1 : 0,
          },
        })),
      };
      const src = map.getSource("parcels") as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(geojson as any);
      } else {
        map.addSource("parcels", { type: "geojson", data: geojson as any });
        map.addLayer({
          id: "parcels-glow",
          type: "circle",
          source: "parcels",
          paint: {
            "circle-radius": ["*", ["get", "radius"], 2.6],
            "circle-color": ["get", "color"],
            "circle-opacity": 0.18,
            "circle-blur": 0.9,
          },
        });
        map.addLayer({
          id: "parcels-core",
          type: "circle",
          source: "parcels",
          paint: {
            "circle-radius": ["get", "radius"],
            "circle-color": ["get", "color"],
            "circle-opacity": 0.92,
            "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 2.5, 0.5],
            "circle-stroke-color": ["case", ["==", ["get", "selected"], 1], cssVar("--foreground", "#f6f2e0"), cssVar("--background", "#0b201f")],
          },
        });
        map.on("click", "parcels-core", (e) => {
          const f = e.features?.[0];
          if (f && onSelect) onSelect(String(f.properties?.parcel_id));
        });
        map.on("mouseenter", "parcels-core", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "parcels-core", () => { map.getCanvas().style.cursor = ""; });
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [parcels, selectedId, onSelect]);

  // Fit bounds when parcel set changes materially
  useEffect(() => {
    const map = mapRef.current;
    if (!map || parcels.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    parcels.forEach((p) => bounds.extend([p.lng, p.lat]));
    map.fitBounds(bounds, { padding: 60, duration: 800, maxZoom: 11 });
  }, [parcels.length]);

  return <div ref={containerRef} className={className ?? "h-full w-full"} />;
}
