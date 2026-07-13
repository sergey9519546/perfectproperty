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

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const usageDate = dayStart.toISOString().slice(0, 10);

    const [
      runs,
      fails,
      sources,
      realieAudit1h,
      recentFails,
      queueRows,
      realie24h,
      realieUsage,
      orchestratorConfig,
    ] = await Promise.all([
      supabaseAdmin
        .from("ingestion_runs")
        .select("status, rows_ingested, county_fips, started_at")
        .gte("started_at", since24),
      supabaseAdmin
        .from("ingestion_failures")
        .select("id, source, stage, county_fips, error_message, created_at")
        .gte("created_at", since24),
      supabaseAdmin.from("source_health").select("*"),
      supabaseAdmin
        .from("realie_audit")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since1h),
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
      (supabaseAdmin as any)
        .from("realie_usage_daily")
        .select("endpoint, request_count, success_count, failure_count, property_count, updated_at")
        .eq("usage_date", usageDate),
      supabaseAdmin.from("orchestrator_config").select("*").eq("id", 1).maybeSingle(),
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
    const usageRows = (realieUsage.data ?? []) as Array<{
      endpoint: string;
      request_count: number;
      success_count: number;
      failure_count: number;
      property_count: number;
      updated_at: string;
    }>;
    const realieCallsToday = usageRows.reduce((sum, row) => sum + Number(row.request_count), 0);
    const configuredLimit = Number(
      (orchestratorConfig.data as any)?.realie_daily_call_limit ?? 100,
    );
    const realieDailyCallLimit = Number.isFinite(configuredLimit) ? configuredLimit : 100;

    return {
      total_ingested_24h: totalIngested,
      total_failed_24h: totalFailed,
      // Logical calls completed in the last hour. Daily usage below is the
      // authoritative credit counter because it also reserves retry attempts.
      realie_calls_last_hour: realieAudit1h.count ?? 0,
      realie_calls_today: realieCallsToday,
      realie_daily_call_limit: realieDailyCallLimit,
      realie_calls_remaining: Math.max(0, realieDailyCallLimit - realieCallsToday),
      realie_usage_by_endpoint: usageRows,
      sources: sources.data ?? [],
      by_county: Array.from(byCounty.entries()).map(([fips, b]) => ({ fips, ...b })),
      recent_failures: recentFails.data ?? [],
      enrichment,
      realie_enriched_24h: realieEnriched24h,
      last_realie_run: lastRealieRun,
    };
  });
