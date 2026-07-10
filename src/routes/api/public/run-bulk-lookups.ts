/**
 * Cron endpoint: process a batch of pending bulk-lookup items.
 * Auth: Supabase anon key via `apikey` header (canonical pg_cron pattern),
 * with legacy `x-cron-secret` still accepted for backward compatibility.
 */
import { createFileRoute } from "@tanstack/react-router";
import { processBulkLookupBatch } from "@/lib/bulk-lookup.functions";

function authorized(request: Request): boolean {
  const apikey = request.headers.get("apikey");
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (apikey && anon && apikey === anon) return true;
  const legacy = request.headers.get("x-cron-secret");
  const secret = process.env.CRON_SECRET;
  if (legacy && secret && legacy === secret) return true;
  return false;
}

export const Route = createFileRoute("/api/public/run-bulk-lookups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        const url = new URL(request.url);
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 30)));
        try {
          const r = await processBulkLookupBatch(limit);
          return new Response(JSON.stringify({ ok: true, ...r }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
