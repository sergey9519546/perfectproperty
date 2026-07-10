/**
 * Cron endpoint: process a batch of pending bulk-lookup items.
 * Wire pg_cron to POST here hourly overnight (see docs/scrapy.md).
 * Auth: shared secret via `x-cron-secret` header (matches existing pattern).
 */
import { createFileRoute } from "@tanstack/react-router";
import { processBulkLookupBatch } from "@/lib/bulk-lookup.functions";

export const Route = createFileRoute("/api/public/run-bulk-lookups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret");
        if (!secret || secret !== process.env.CRON_SECRET) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
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
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
