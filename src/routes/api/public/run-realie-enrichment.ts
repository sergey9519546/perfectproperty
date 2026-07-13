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

        // Map county_fips → Realie-friendly county name. Realie rejects
        // `{city, state}` without a county, so we always supply one.
        // NYC boroughs collapse to "New York" for Realie's purposes.
        const countyByFips: Record<string, string> = {
          "06037": "Los Angeles",
          "06075": "San Francisco",
          "06073": "San Diego",
          "12086": "Miami-Dade",
          "12011": "Broward",
          "17031": "Cook",
          "36005": "Bronx",
          "36047": "Kings",
          "36061": "New York",
          "36081": "Queens",
          "36085": "Richmond",
        };

        // 4. Enrich one-by-one (Realie is per-address, no bulk endpoint).
        const { setRealieAuditSink } = await import("@/lib/adapters/realie");
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
            await supabaseAdmin.from("realie_audit").insert({
              parcel_id: item.parcel_id,
              county_fips: p?.county_fips ?? null,
              endpoint: "/public/property/address/",
              request_params: { address: p?.address ?? null, state: p?.state ?? null } as any,
              http_status: null,
              ok: false,
              duration_ms: 0,
              outcome: "skipped_missing_address",
              error_code: "MISSING_INPUT",
              error_message: "missing address or state",
            } as any);
            results.push({ parcel_id: item.parcel_id, ok: false, note: "missing address" });
            continue;
          }
          const county = p.county_fips ? countyByFips[p.county_fips] : undefined;
          const reqParams = {
            address: p.address,
            state: p.state.toUpperCase(),
            city: county ? (p.city ?? undefined) : undefined,
            county,
          };

          // Capture every HTTP call the adapter makes during this lookup.
          const captured: any[] = [];
          setRealieAuditSink((e) => captured.push(e));

          try {
            await lookupParcelByAddressCore(reqParams);

            const { data: fresh } = await supabaseAdmin
              .from("parcels")
              .select("living_sqft, year_built, property_type")
              .eq("id", item.parcel_id).maybeSingle();
            const missing: string[] = [];
            if (!fresh?.living_sqft) missing.push("living_sqft");
            if (!fresh?.year_built) missing.push("year_built");
            if (!fresh?.property_type) missing.push("property_type");
            const returned = ["living_sqft", "year_built", "property_type"].filter((f) => !missing.includes(f));

            const primary = captured[0] ?? {
              endpoint: "/public/property/address/",
              params: reqParams, http_status: null, ok: true, duration_ms: 0,
              error_code: null, error_message: null, response_sample: null,
            };
            await supabaseAdmin.from("realie_audit").insert({
              parcel_id: item.parcel_id,
              county_fips: p.county_fips ?? null,
              endpoint: primary.endpoint,
              request_params: primary.params as any,
              http_status: primary.http_status,
              ok: missing.length === 0,
              duration_ms: primary.duration_ms,
              outcome: missing.length === 0 ? "enriched" : "insufficient",
              error_code: missing.length ? "INSUFFICIENT_FIELDS" : null,
              error_message: missing.length ? `missing ${missing.join(",")}` : null,
              fields_returned: returned,
              fields_missing: missing.length ? missing : null,
            } as any);

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
            const primary = captured[0] ?? null;
            await supabaseAdmin.from("realie_audit").insert({
              parcel_id: item.parcel_id,
              county_fips: p.county_fips ?? null,
              endpoint: primary?.endpoint ?? "/public/property/address/",
              request_params: (primary?.params ?? reqParams) as any,
              http_status: primary?.http_status ?? null,
              ok: false,
              duration_ms: primary?.duration_ms ?? 0,
              outcome: "error",
              error_code: primary?.error_code ?? "EXCEPTION",
              error_message: msg,
              response_sample: primary?.response_sample ?? null,
            } as any);
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
          } finally {
            setRealieAuditSink(null);
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
