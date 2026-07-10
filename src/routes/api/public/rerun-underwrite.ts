/**
 * Cron endpoint: re-run underwrite for LIVE parcels whose latest score is
 * stale (older than N days) or has no ARV source (heuristic-only). Batched
 * so a single invocation stays bounded; run frequently to catch up.
 *
 * Auth: Supabase anon key via `apikey` header, or legacy `x-cron-secret`.
 * Query params: ?limit=N (default 50, max 200), ?days=D (default 7).
 */
import { createFileRoute } from "@tanstack/react-router";
import { rerunUnderwriteCore } from "@/lib/underwrite-core";

function authorized(request: Request): boolean {
  const apikey = request.headers.get("apikey");
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (apikey && anon && apikey === anon) return true;
  const legacy = request.headers.get("x-cron-secret");
  const secret = process.env.CRON_SECRET;
  return Boolean(legacy && secret && legacy === secret);
}

export const Route = createFileRoute("/api/public/rerun-underwrite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const url = new URL(request.url);
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
        const days = Math.max(0, Number(url.searchParams.get("days") ?? 7));

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const staleBefore = new Date(Date.now() - days * 86400_000).toISOString();

        // Candidates: LIVE scores with no arv_source, OR older than `days`.
        const { data: rows, error } = await supabaseAdmin
          .from("parcel_scores")
          .select("parcel_id, computed_at, arv_source, data_source")
          .eq("data_source", "LIVE")
          .or(`arv_source.is.null,computed_at.lt.${staleBefore}`)
          .order("computed_at", { ascending: true, nullsFirst: true })
          .limit(limit);
        if (error) return new Response(`List failed: ${error.message}`, { status: 500 });

        let ok = 0, fail = 0;
        const errors: Array<{ parcel_id: string; error: string }> = [];
        for (const r of rows ?? []) {
          try {
            await rerunUnderwriteCore(r.parcel_id as string);
            ok++;
          } catch (e: any) {
            fail++;
            errors.push({ parcel_id: r.parcel_id as string, error: String(e?.message ?? e).slice(0, 300) });
          }
        }
        return new Response(JSON.stringify({ ok: true, processed: rows?.length ?? 0, succeeded: ok, failed: fail, errors: errors.slice(0, 20) }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
