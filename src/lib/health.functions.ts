/**
 * Admin health metrics for the ingestion/underwriting pipeline.
 * Used by /admin/health dashboard.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/integrations/supabase/require-admin";

export const getPipelineHealth = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const since1h = new Date(Date.now() - 3600 * 1000).toISOString();

    const [runs, fails, sources, probes, recentFails, queueRows, realie24h] = await Promise.all([
      supabaseAdmin
        .from("ingestion_runs")
        .select("status, rows_ingested, county_fips, started_at")
        .gte("started_at", since24),
      supabaseAdmin
        .from("ingestion_failures")
        .select("id, source, stage, county_fips, error_message, created_at")
        .gte("created_at", since24),
      supabaseAdmin.from("source_health").select("*"),
      supabaseAdmin.from("probe_runs").select("id, created_at").gte("created_at", since1h),
      supabaseAdmin
        .from("ingestion_failures")
        .select("id, source, stage, county_fips, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(25),
      supabaseAdmin
        .from("enrichment_queue")
        .select("status, reason, priority, attempts, last_error, requested_at"),
      supabaseAdmin
        .from("ingestion_runs")
        .select("rows_ingested, started_at, status")
        .eq("source", "REALIE:enrichment")
        .gte("started_at", since24),
    ]);

    const runsRows = runs.data ?? [];
    const totalIngested = runsRows.reduce((a, r) => a + (r.rows_ingested ?? 0), 0);
    const totalFailed = (fails.data ?? []).length;
    const byCounty = new Map<string, { ok: number; fail: number; ingested: number }>();
    for (const r of runsRows) {
      const b = byCounty.get(r.county_fips) ?? { ok: 0, fail: 0, ingested: 0 };
      if (String(r.status).toUpperCase() === "OK") b.ok++;
      else b.fail++;
      b.ingested += r.rows_ingested ?? 0;
      byCounty.set(r.county_fips, b);
    }

    const q = (queueRows.data ?? []) as any[];
    const enrichment = {
      pending: q.filter((x) => x.status === "pending").length,
      inflight: q.filter((x) => x.status === "inflight").length,
      done: q.filter((x) => x.status === "done").length,
      failed: q.filter((x) => x.status === "failed").length,
      total: q.length,
      by_reason: Object.fromEntries(
        ["foreclosure", "probate", "code_violation", "tax_lien", "listing", "manual"].map((r) => [
          r,
          q.filter((x) => x.reason === r && x.status !== "done").length,
        ]),
      ),
    };
    const realieRuns = (realie24h.data ?? []) as any[];
    const realieEnriched24h = realieRuns.reduce((a, r) => a + (r.rows_ingested ?? 0), 0);
    const lastRealieRun = realieRuns.length
      ? realieRuns.reduce((a, b) => (a.started_at > b.started_at ? a : b)).started_at
      : null;

    return {
      total_ingested_24h: totalIngested,
      total_failed_24h: totalFailed,
      realie_calls_last_hour: (probes.data ?? []).length,
      sources: sources.data ?? [],
      by_county: Array.from(byCounty.entries()).map(([fips, b]) => ({ fips, ...b })),
      recent_failures: recentFails.data ?? [],
      enrichment,
      realie_enriched_24h: realieEnriched24h,
      last_realie_run: lastRealieRun,
    };
  });
