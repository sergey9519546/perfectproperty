/**
 * Cron endpoint: run parcel ingest across every configured county source,
 * one after another, and then re-score. Idempotent — upserts by (county_fips, apn).
 *
 * Auth: shared secret `CRON_SECRET` in `x-cron-secret` header, compared with
 * timingSafeEqual. Query params:
 *   ?per_county=N  (default 5000, max 25000)
 *   ?score=1       (default 1 — run scoreAll after ingest)
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { COUNTY_SOURCES } from "@/lib/adapters/sources";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("x-cron-secret");
  if (!secret || !header) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(header.trim(), "utf8");
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export const Route = createFileRoute("/api/public/ingest-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const url = new URL(request.url);
        const perCounty = Math.min(25000, Math.max(100, Number(url.searchParams.get("per_county") ?? 5000)));
        const doScore = url.searchParams.get("score") !== "0";

        // Import server-only helpers inside the handler.
        const { ingestCountyCore, scoreAllCore } = await import("@/lib/ingest-core");

        const results: Array<{ fips: string; name: string; fetched: number; inserted: number; status: string; note: string }> = [];
        for (const src of COUNTY_SOURCES) {
          if (!src.parcels) continue;
          try {
            const r = await ingestCountyCore({ county_fips: src.fips, max_parcels: perCounty, enrich_flood: true });
            results.push(r);
          } catch (e: any) {
            results.push({ fips: src.fips, name: src.name, fetched: 0, inserted: 0, status: "FAIL", note: String(e?.message ?? e).slice(0, 300) });
          }
        }

        let scored: { scored: number; comps_backed: number } | null = null;
        if (doScore) {
          try { scored = await scoreAllCore(); } catch (e: any) {
            scored = { scored: 0, comps_backed: 0 };
          }
        }

        return new Response(JSON.stringify({ ok: true, counties: results.length, per_county: perCounty, results, scored }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
