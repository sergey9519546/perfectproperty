/**
 * Orchestrator: Scrapy pulls the next N targets to work on.
 *
 * Auth: HMAC-SHA256 (hex) header `x-signature` over the empty body OR
 * the request query string, keyed with SCRAPY_INGEST_SECRET (same secret
 * as the ingest webhook so Scrapy Cloud only needs one env var).
 *
 * Query:
 *   ?limit=20             cap on returned targets (min 1, max 100)
 *   ?spider=<name>        optional filter to a specific spider
 *
 * Response: { targets: ScrapeTarget[], budget: {...} }
 *
 * Scheduling rules (executed here so any spider host stays dumb):
 *  1. Respect per-target cadence_hours (skip if last_scheduled_at + cadence > now).
 *  2. Respect per-target penalty backoff (2^penalty * 15 min).
 *  3. Reserve `cold_coverage_reserve_pct` of the tick for counties with zero
 *     triggers in the last 7 days.
 *  4. Fill the rest by priority DESC.
 *
 * Also marks `last_scheduled_at = now()` on returned rows so parallel pullers
 * don't grab the same target twice.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function verify(secret: string, payload: string, header: string | null): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(header.trim(), "utf8");
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export const Route = createFileRoute("/api/public/next-scrape-targets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.SCRAPY_INGEST_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });

        const url = new URL(request.url);
        const qs = url.search.replace(/^\?/, "");
        if (!verify(secret, qs, request.headers.get("x-signature"))) {
          return new Response("Invalid signature", { status: 401 });
        }

        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 100);
        const spider = url.searchParams.get("spider");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nowIso = new Date().toISOString();

        // 1. Load config for cold-coverage reserve + budget snapshot.
        const { data: cfg } = await supabaseAdmin
          .from("orchestrator_config").select("*").eq("id", 1).maybeSingle();
        const coldPct = Number((cfg as any)?.cold_coverage_reserve_pct ?? 20) / 100;
        const zyteBudget = Number((cfg as any)?.zyte_daily_budget_usd ?? 25);

        // 2. Today's Zyte spend so far — if over budget, force needs_zyte=false only.
        const dayStart = new Date(); dayStart.setUTCHours(0,0,0,0);
        const { data: spendRows } = await supabaseAdmin
          .from("scrape_runs")
          .select("cost_usd, used_zyte")
          .gte("started_at", dayStart.toISOString());
        const zyteSpent = ((spendRows ?? []) as any[])
          .filter((r) => r.used_zyte).reduce((a, r) => a + Number(r.cost_usd || 0), 0);
        const zyteOver = zyteSpent >= zyteBudget;

        // 3. Pull candidate targets — not paused, cadence elapsed, backoff done.
        let q = supabaseAdmin.from("scrape_targets").select("*")
          .eq("paused", false)
          .order("priority", { ascending: false })
          .limit(limit * 3); // over-fetch, filter in JS
        if (spider) q = q.eq("spider", spider);
        if (zyteOver) q = q.eq("needs_zyte", false);
        const { data: rows, error } = await q;
        if (error) return new Response(`db error: ${error.message}`, { status: 500 });

        const now = Date.now();
        const eligible = ((rows ?? []) as any[]).filter((t) => {
          const cadence = Number(t.cadence_hours ?? 24) * 3600 * 1000;
          const lastSched = t.last_scheduled_at ? Date.parse(t.last_scheduled_at) : 0;
          if (lastSched && now - lastSched < cadence) return false;
          const penalty = Number(t.penalty ?? 0);
          const backoff = penalty > 0 ? Math.min(2 ** penalty, 96) * 15 * 60 * 1000 : 0;
          if (backoff && now - lastSched < backoff) return false;
          return true;
        });

        // 4. Cold-coverage split: counties with 0 triggers in last 7 days.
        const { data: coldRows } = await (supabaseAdmin as any).rpc("parcels_with_active_trigger", { _days: 7 });
        // Counties that DO have triggers; anything not in this set is "cold".
        const { data: coldCountyRows } = await supabaseAdmin
          .from("parcels").select("county_fips")
          .in("id", ((coldRows ?? []) as Array<{ parcel_id: string }>).map((r) => r.parcel_id));
        const hotCounties = new Set(((coldCountyRows ?? []) as any[]).map((r) => r.county_fips));
        const cold = eligible.filter((t) => !hotCounties.has(t.county_fips));
        const hot = eligible.filter((t) => hotCounties.has(t.county_fips));

        const coldSlots = Math.max(1, Math.floor(limit * coldPct));
        const picked = [...cold.slice(0, coldSlots), ...hot].slice(0, limit);

        // 5. Mark scheduled so concurrent callers don't grab them again.
        if (picked.length) {
          await supabaseAdmin.from("scrape_targets")
            .update({ last_scheduled_at: nowIso })
            .in("id", picked.map((t) => t.id));
        }

        return Response.json({
          targets: picked.map((t) => ({
            id: t.id, county_fips: t.county_fips, source_kind: t.source_kind,
            spider: t.spider, url_or_query: t.url_or_query,
            needs_zyte: t.needs_zyte, requests_per_min: t.requests_per_min,
            concurrent_requests: t.concurrent_requests,
            daily_request_cap: t.daily_request_cap,
          })),
          budget: {
            zyte_daily_budget_usd: zyteBudget,
            zyte_spent_today_usd: Math.round(zyteSpent * 100) / 100,
            zyte_over_budget: zyteOver,
          },
          scheduled_at: nowIso,
        });
      },
    },
  },
});
