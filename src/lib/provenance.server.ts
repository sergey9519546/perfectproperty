/**
 * Field-level provenance writer + reader.
 *
 * Every underwriting input written into public.parcels is also stamped
 * into public.field_provenance with (value, confidence, source,
 * observed_at). One row per (parcel, field, source); repeated writes
 * from the same source update in place via UPSERT.
 *
 * Callers:
 *  - Realie enrichment (`src/lib/parcels-core.ts` after Realie upsert)
 *  - Scrapy ingest webhook (`/api/public/scrapy-ingest`)
 *  - Manual admin edits (future)
 *
 * Never import at module scope of a `*.functions.ts` file. Server-only.
 */

export type ProvField =
  | "living_sqft" | "year_built" | "beds" | "baths" | "lot_sqft"
  | "assessed_value" | "last_sale_price" | "last_sale_date"
  | "owner_name" | "owner_mailing_address" | "property_type"
  | "lat" | "lng" | "condition_grade" | "flood_zone";

export type ProvEntry = {
  field: ProvField | string;
  value: unknown;
  confidence: number;   // 0..1
  source: string;       // "REALIE", "SCRAPY:<recipe>", "COUNTY_ASSESSOR", "DEED"
  observed_at?: string; // ISO; defaults to now()
  provider_request_id?: string;
};

/** Default confidence per source when the provider doesn't stamp one. */
export const DEFAULT_CONFIDENCE: Record<string, number> = {
  REALIE: 0.85,
  COUNTY_ASSESSOR: 0.95,
  DEED: 0.98,
  "SCRAPY:foreclosure": 0.9,
  "SCRAPY:probate": 0.9,
  "SCRAPY:code_violation": 0.85,
  "SCRAPY:sale": 0.9,
  "SCRAPY:auction": 0.85,
  "SCRAPY:parcel": 0.7,
};

/** Field weights when computing overall score confidence. */
export const FIELD_WEIGHT: Record<string, number> = {
  living_sqft: 3.0,
  year_built: 1.5,
  beds: 1.0,
  baths: 1.0,
  lot_sqft: 1.0,
  assessed_value: 1.5,
  last_sale_price: 1.5,
  last_sale_date: 0.5,
  lat: 1.0,
  lng: 1.0,
  condition_grade: 1.0,
};

/** Required Realie fields + their min confidence to accept the response. */
export const REALIE_REQUIRED: Array<{ field: ProvField; min: number }> = [
  { field: "living_sqft", min: 0.8 },
  { field: "year_built", min: 0.9 },
  { field: "property_type", min: 0.9 },
];

/** Merge rule: keep newer + higher-confidence values. */
export function shouldOverwrite(
  incoming: Pick<ProvEntry, "confidence" | "observed_at">,
  existing: { confidence: number; observed_at: string | null } | null,
): boolean {
  if (!existing) return true;
  if (incoming.confidence > existing.confidence) return true;
  const inTs = incoming.observed_at ? Date.parse(incoming.observed_at) : Date.now();
  const exTs = existing.observed_at ? Date.parse(existing.observed_at) : 0;
  return (inTs - exTs) > 90 * 24 * 3600 * 1000; // fresher by >90 days
}

export async function writeProvenance(
  parcelId: string,
  entries: ProvEntry[],
): Promise<{ written: number }> {
  if (!parcelId || entries.length === 0) return { written: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();

  const rows = entries
    .filter((e) => e.value !== null && e.value !== undefined && e.value !== "")
    .map((e) => ({
      parcel_id: parcelId,
      field_name: String(e.field),
      value: (e.value ?? null) as any,
      confidence: Math.max(0, Math.min(1, e.confidence ?? DEFAULT_CONFIDENCE[e.source] ?? 0.5)),
      source: e.source,
      provider_request_id: e.provider_request_id ?? null,
      observed_at: e.observed_at ?? nowIso,
      written_at: nowIso,
    }));
  if (rows.length === 0) return { written: 0 };

  const { error } = await (supabaseAdmin as any)
    .from("field_provenance")
    .upsert(rows, { onConflict: "parcel_id,field_name,source" });
  if (error) throw new Error(`provenance write failed: ${error.message}`);
  return { written: rows.length };
}

/** Latest-per-field snapshot for a parcel, used by the "Why this score" panel and underwriter. */
export async function readLatestProvenance(parcelId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("field_provenance")
    .select("field_name, value, confidence, source, observed_at, written_at, provider_request_id")
    .eq("parcel_id", parcelId)
    .order("written_at", { ascending: false });
  if (error) throw new Error(error.message);
  const latest = new Map<string, any>();
  const history = new Map<string, any[]>();
  for (const r of (data ?? []) as any[]) {
    if (!latest.has(r.field_name)) latest.set(r.field_name, r);
    const arr = history.get(r.field_name) ?? [];
    arr.push(r);
    history.set(r.field_name, arr);
  }
  return { latest, history };
}

/** Weighted confidence over the fields that actually drive the underwrite. */
export function computeScoreConfidence(latest: Map<string, { confidence: number; observed_at: string | null }>): number {
  let num = 0, den = 0;
  for (const [field, w] of Object.entries(FIELD_WEIGHT)) {
    const row = latest.get(field);
    if (!row) { den += w; continue; }
    const ageDays = row.observed_at
      ? (Date.now() - Date.parse(row.observed_at)) / 86400000
      : 999;
    // linear decay past 18 months
    const freshness = ageDays > 540 ? Math.max(0.5, 1 - (ageDays - 540) / 720) : 1;
    num += w * row.confidence * freshness;
    den += w;
  }
  return den > 0 ? Math.round((num / den) * 100) / 100 : 0;
}

/** Snapshot the current provenance into a compact object for parcel_scores.inputs_provenance. */
export function buildProvenanceSnapshot(latest: Map<string, any>): Record<string, { source: string; confidence: number; observed_at: string | null }> {
  const out: Record<string, any> = {};
  for (const [field, row] of latest.entries()) {
    out[field] = { source: row.source, confidence: Number(row.confidence), observed_at: row.observed_at ?? null };
  }
  return out;
}
