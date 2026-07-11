/**
 * Preflight / circuit breaker for county ingestion sources.
 *
 * Pings a source URL with a short timeout before we spend cycles pulling it.
 * Persists results to `public.source_health` so an admin dashboard can render
 * green/yellow/red rings and the cron endpoint can skip tripped sources.
 *
 * Failure policy:
 *   - 1 failure   → yellow, not tripped
 *   - 3+ failures → red, tripped for 30 minutes
 */
import type { CountySource } from "./adapters/sources";

const TRIP_THRESHOLD = 3;
const TRIP_MINUTES = 30;
const TIMEOUT_MS = 6000;

export interface PreflightResult {
  ok: boolean;
  status: "green" | "yellow" | "red";
  tripped: boolean;
  note: string;
}

async function pingUrl(url: string): Promise<{ ok: boolean; note: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // ArcGIS + Socrata both answer to GET with query string; a cheap probe with
    // limit=1 works better than HEAD (many portals reject HEAD).
    const sep = url.includes("?") ? "&" : "?";
    const probeUrl = url.includes("arcgis")
      ? `${url}${sep}where=1%3D1&returnCountOnly=true&f=json`
      : `${url}${sep}$limit=1`;
    const res = await fetch(probeUrl, { method: "GET", signal: ctrl.signal });
    if (!res.ok) return { ok: false, note: `HTTP ${res.status}` };
    return { ok: true, note: "OK" };
  } catch (e: any) {
    return { ok: false, note: String(e?.message ?? e).slice(0, 200) };
  } finally {
    clearTimeout(t);
  }
}

export async function checkSource(src: CountySource): Promise<PreflightResult> {
  if (!src.parcels) return { ok: false, status: "red", tripped: true, note: "No parcel source configured" };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const key = `${src.fips}:${src.parcels.kind}`;

  // If a fresh trip is still active, short-circuit.
  const { data: existing } = await supabaseAdmin
    .from("source_health").select("*").eq("source_key", key).maybeSingle();
  const now = Date.now();
  if (existing?.tripped_until && new Date(existing.tripped_until).getTime() > now) {
    return {
      ok: false, status: "red", tripped: true,
      note: `Tripped until ${existing.tripped_until}: ${existing.last_error ?? ""}`,
    };
  }

  const probe = await pingUrl(src.parcels.url);
  const nowIso = new Date().toISOString();
  const prevFails = existing?.consecutive_failures ?? 0;
  let record: any;
  if (probe.ok) {
    record = {
      source_key: key, county_fips: src.fips,
      status: "green", last_ok_at: nowIso, last_error: null,
      consecutive_failures: 0, tripped_until: null, updated_at: nowIso,
    };
    await supabaseAdmin.from("source_health").upsert(record, { onConflict: "source_key" });
    return { ok: true, status: "green", tripped: false, note: "OK" };
  }
  const fails = prevFails + 1;
  const trip = fails >= TRIP_THRESHOLD;
  const status: "yellow" | "red" = trip ? "red" : "yellow";
  record = {
    source_key: key, county_fips: src.fips, status,
    last_fail_at: nowIso, last_error: probe.note,
    consecutive_failures: fails,
    tripped_until: trip ? new Date(now + TRIP_MINUTES * 60_000).toISOString() : null,
    updated_at: nowIso,
  };
  await supabaseAdmin.from("source_health").upsert(record, { onConflict: "source_key" });
  return { ok: false, status, tripped: trip, note: probe.note };
}
