/**
 * Dead-letter queue helper. Any ingestion/underwrite failure is recorded to
 * `ingestion_failures` so one bad row can't kill a 5,000-parcel batch.
 * Server-only — uses supabaseAdmin.
 */
export interface DlqEntry {
  source: string;
  stage: string;
  error: unknown;
  parcelRef?: string | null;
  countyFips?: string | null;
  payload?: unknown;
}

export async function recordFailure(entry: DlqEntry): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const err = entry.error as any;
    await supabaseAdmin.from("ingestion_failures").insert({
      source: entry.source,
      stage: entry.stage,
      parcel_ref: entry.parcelRef ?? null,
      county_fips: entry.countyFips ?? null,
      error_message: String(err?.message ?? err).slice(0, 2000),
      stack: err?.stack ? String(err.stack).slice(0, 4000) : null,
      payload: (entry.payload ?? null) as any,
    });
  } catch (e) {
    // Never let DLQ writes themselves crash the pipeline.
    console.error("[dlq] failed to record failure", e);
  }
}
