/**
 * Generic ArcGIS REST FeatureServer / MapServer query.
 * These endpoints are the backbone of every US county GIS portal.
 *
 * Docs: https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer.htm
 */

export interface ArcGISQueryOpts {
  where?: string;
  outFields?: string; // "*"
  resultRecordCount?: number;
  resultOffset?: number;
  returnGeometry?: boolean;
  outSR?: number; // 4326 for lng/lat
  geometry?: string; // JSON envelope
  geometryType?: string;
}

export interface ArcGISFeature {
  attributes: Record<string, any>;
  geometry?: {
    x?: number; y?: number;
    rings?: number[][][];
  };
}

export async function arcgisQuery(baseUrl: string, opts: ArcGISQueryOpts = {}): Promise<ArcGISFeature[]> {
  const params = new URLSearchParams({
    f: "json",
    where: opts.where ?? "1=1",
    outFields: opts.outFields ?? "*",
    outSR: String(opts.outSR ?? 4326),
    returnGeometry: String(opts.returnGeometry ?? true),
    resultRecordCount: String(opts.resultRecordCount ?? 100),
    resultOffset: String(opts.resultOffset ?? 0),
  });
  if (opts.geometry) {
    params.set("geometry", opts.geometry);
    params.set("geometryType", opts.geometryType ?? "esriGeometryEnvelope");
    params.set("inSR", "4326");
    params.set("spatialRel", "esriSpatialRelIntersects");
  }
  const url = `${baseUrl}/query?${params.toString()}`;

  // Try direct first — cheap, no Zyte credit burn.
  let json: any;
  try {
    const res = await fetch(url, { headers: { "user-agent": "PerfectPropertyEngine/1.0" } });
    if (!res.ok) throw new Error(`ArcGIS ${res.status}: ${await res.text().catch(() => "")}`);
    json = await res.json();
    if (json?.error) throw new Error(`ArcGIS ${json.error.code}: ${json.error.message}`);
  } catch (directErr) {
    // Fallback through Zyte extraction (bypasses IP blocks / anti-bot).
    // Only fires when ZYTE_API_KEY is set; otherwise we rethrow the original.
    const { zyteFetchLike, zyteEnabled } = await import("@/lib/zyte.server");
    if (!zyteEnabled()) throw directErr;
    const z = await zyteFetchLike(url);
    if (!z.ok) throw new Error(`ArcGIS direct failed (${(directErr as Error).message}); Zyte fallback: ${z._note}`);
    json = await z.json();
    if (json?.error) throw new Error(`ArcGIS ${json.error.code}: ${json.error.message}`);
  }
  return json.features ?? [];
}


// Centroid from ring geometry (polygon parcels)
export function featureCentroid(f: ArcGISFeature): { lat: number; lng: number } | null {
  if (f.geometry?.x != null && f.geometry?.y != null) {
    return { lat: f.geometry.y, lng: f.geometry.x };
  }
  const ring = f.geometry?.rings?.[0];
  if (!ring || ring.length === 0) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of ring) { sx += x; sy += y; }
  return { lng: sx / ring.length, lat: sy / ring.length };
}
