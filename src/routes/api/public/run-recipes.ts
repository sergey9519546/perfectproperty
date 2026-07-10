/**
 * Cron endpoint: re-run every saved adapter_recipe.
 *
 * Called by pg_cron every 6 hours via pg_net.http_post. Auth is a shared
 * bearer secret in the `x-cron-secret` header (compared with
 * timingSafeEqual). Each recipe writes its own row to ingestion_runs;
 * this handler additionally writes ONE summary row per invocation with
 * source = "CRON:run-recipes" so the admin panel can see the sweep.
 */

import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function verify(secret: string, header: string | null): boolean {
  if (!header) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(header.trim(), "utf8");
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export const Route = createFileRoute("/api/public/run-recipes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const secret = process.env.CRON_SECRET;
        const apikey = request.headers.get("apikey");
        const legacy = request.headers.get("x-cron-secret");
        const okApi = Boolean(anon && apikey && apikey === anon);
        const okLegacy = Boolean(secret && legacy && verify(secret, legacy));
        if (!okApi && !okLegacy) return new Response("Unauthorized", { status: 401 });


        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { executeRecipeById } = await import("@/lib/recipes-runner.server");

        const sweepStart = new Date().toISOString();
        const { data: recipes, error } = await supabaseAdmin
          .from("adapter_recipes").select("id, name").order("updated_at", { ascending: true });
        if (error) return new Response(`List failed: ${error.message}`, { status: 500 });

        const results: Array<{ id: string; name: string; ok: boolean; inserted: number; note: string }> = [];
        for (const rec of recipes ?? []) {
          try {
            const r = await executeRecipeById(rec.id, 500);
            results.push({ id: rec.id, name: rec.name, ok: r.ok, inserted: r.inserted, note: r.note });
          } catch (e: any) {
            results.push({ id: rec.id, name: rec.name, ok: false, inserted: 0, note: `Threw: ${e.message}` });
          }
        }

        const totalInserted = results.reduce((s, x) => s + x.inserted, 0);
        const okCount = results.filter((x) => x.ok).length;
        const summary = `Swept ${results.length} recipes · ${okCount} ok · ${totalInserted} rows inserted`;

        await supabaseAdmin.from("ingestion_runs").insert({
          county_fips: "CRON",
          source: "CRON:run-recipes",
          status: okCount === results.length ? "OK" : okCount > 0 ? "PARTIAL" : "FAIL",
          rows_ingested: totalInserted,
          notes: summary,
          started_at: sweepStart,
          finished_at: new Date().toISOString(),
        });

        return Response.json({ ok: true, summary, results });
      },
    },
  },
});
