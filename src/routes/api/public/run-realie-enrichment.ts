/**
 * Cron endpoint: dequeue N parcels from enrichment_queue and fill in
 * living_sqft / year_built / beds / baths via Realie.
 *
 * Auth: /api/public/* bypasses the edge auth wall. We additionally check
 * that the caller sent the Supabase anon key in the `apikey` header
 * (matches how the other cron endpoints — run-recipes, rerun-underwrite,
 * run-bulk-lookups, run-monitoring — are called from pg_cron). The batch
 * cap keeps abusive callers cheap.
 *
 * Body: { batch?: number }  // default 25, hard cap 100 per invocation
 *
 * Each enriched parcel is re-underwritten as a side-effect of
 * lookupParcelByAddressCore(). Emits one ingestion_runs row per county
 * in the batch with source = "REALIE:enrichment".
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/run-realie-enrichment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        const gotKey = request.headers.get("apikey") ?? "";
        if (!expectedKey || gotKey !== expectedKey) {
          return new Response("Unauthorized", { status: 401 });
        }


        let batch = 25;
        try {
          const body = (await request.json().catch(() => ({}))) as { batch?: number };
          if (typeof body.batch === "number" && body.batch > 0) {
            batch = Math.min(Math.floor(body.batch), 100);
          }
        } catch { /* keep default */ }

        const startedAt = new Date().toISOString();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { lookupParcelByAddressCore } = await import("@/lib/parcels-core");

        // 1. Pull the next batch of pending items, oldest attempts first.
        const { data: queueItems, error: qErr } = await supabaseAdmin
          .from("enrichment_queue")
          .select("parcel_id, reason, priority, attempts")
          .eq("status", "pending")
          .lt("attempts", 3)
          .order("priority", { ascending: false })
          .order("requested_at", { ascending: true })
          .limit(batch);
        if (qErr) {
          return new Response(`Queue read failed: ${qErr.message}`, { status: 500 });
        }

        const items = queueItems ?? [];
        if (items.length === 0) {
          return Response.json({ ok: true, processed: 0, enriched: 0, failed: 0, note: "queue empty" });
        }

        // 2. Mark them inflight so a concurrent invocation doesn't double up.
        const ids = items.map((r) => r.parcel_id);
        await supabaseAdmin
          .from("enrichment_queue")
          .update({ status: "inflight", started_at: startedAt })
          .in("parcel_id", ids);

        // 3. Load the parcel rows we need addresses from.
        const { data: parcels, error: pErr } = await supabaseAdmin
          .from("parcels")
          .select("id, address, city, state, county_fips")
          .in("id", ids);
        if (pErr) {
          return new Response(`Parcel read failed: ${pErr.message}`, { status: 500 });
        }
        const byId = new Map((parcels ?? []).map((p) => [p.id, p]));

        // 4. Enrich one-by-one (Realie is per-address, no bulk endpoint).
        const results: Array<{ parcel_id: string; ok: boolean; note: string }> = [];
        for (const item of items) {
          const p = byId.get(item.parcel_id);
          if (!p || !p.address || !p.state) {
            await supabaseAdmin
              .from("enrichment_queue")
              .update({
                status: "failed",
                attempts: item.attempts + 1,
                last_error: "missing address or state",
                completed_at: new Date().toISOString(),
              })
              .eq("parcel_id", item.parcel_id);
            results.push({ parcel_id: item.parcel_id, ok: false, note: "missing address" });
            continue;
          }
          try {
            await lookupParcelByAddressCore({
              address: p.address,
              state: p.state.toUpperCase(),
              city: p.city ?? undefined,
            });

            // Contract check: after Realie writes + underwrite runs, the
            // parcel must have every REQUIRED field. If any is still null
            // we treat the enrichment as insufficient — no partial win.
            const { data: fresh } = await supabaseAdmin
              .from("parcels")
              .select("living_sqft, year_built, property_type")
              .eq("id", item.parcel_id).maybeSingle();
            const missing: string[] = [];
            if (!fresh?.living_sqft) missing.push("living_sqft");
            if (!fresh?.year_built) missing.push("year_built");
            if (!fresh?.property_type) missing.push("property_type");

            if (missing.length) {
              await supabaseAdmin
                .from("enrichment_queue")
                .update({
                  status: "failed",
                  attempts: item.attempts + 1,
                  last_error: `insufficient: missing ${missing.join(",")}`,
                  completed_at: new Date().toISOString(),
                })
                .eq("parcel_id", item.parcel_id);
              results.push({ parcel_id: item.parcel_id, ok: false, note: `insufficient (${missing.join(",")})` });
              continue;
            }

            await supabaseAdmin
              .from("enrichment_queue")
              .update({
                status: "done",
                attempts: item.attempts + 1,
                last_error: null,
                completed_at: new Date().toISOString(),
              })
              .eq("parcel_id", item.parcel_id);
            results.push({ parcel_id: item.parcel_id, ok: true, note: "enriched" });
          } catch (e: any) {
            const msg = String(e?.message ?? e).slice(0, 500);
            const nextAttempts = item.attempts + 1;
            await supabaseAdmin
              .from("enrichment_queue")
              .update({
                status: nextAttempts >= 3 ? "failed" : "pending",
                attempts: nextAttempts,
                last_error: msg,
                completed_at: nextAttempts >= 3 ? new Date().toISOString() : null,
              })
              .eq("parcel_id", item.parcel_id);
            results.push({ parcel_id: item.parcel_id, ok: false, note: msg });
          }
        }

        const enriched = results.filter((r) => r.ok).length;
        const failed = results.length - enriched;

        // 5. One summary row per county in this batch (ingestion_runs requires county_fips).
        const byCounty = new Map<string, { ok: number; fail: number }>();
        for (const r of results) {
          const cf = byId.get(r.parcel_id)?.county_fips;
          if (!cf) continue;
          const b = byCounty.get(cf) ?? { ok: 0, fail: 0 };
          if (r.ok) b.ok++; else b.fail++;
          byCounty.set(cf, b);
        }
        for (const [cf, b] of byCounty) {
          await supabaseAdmin.from("ingestion_runs").insert({
            county_fips: cf,
            source: "REALIE:enrichment",
            status: b.fail === 0 ? "ok" : b.ok > 0 ? "partial" : "failed",
            rows_ingested: b.ok,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            notes: `enriched ${b.ok} / failed ${b.fail}`,
          } as any);
        }

        return Response.json({
          ok: failed === 0,
          processed: results.length,
          enriched,
          failed,
          results,
        });
      },
    },
  },
});
