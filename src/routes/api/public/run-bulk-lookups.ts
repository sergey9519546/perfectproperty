/**
 * Cron endpoint: process a batch of pending bulk-lookup items.
 * Auth: shared secret `CRON_SECRET` in `x-cron-secret` header, compared
 * with timingSafeEqual. The publishable/anon key is NOT accepted — it
 * ships in the client bundle and is not a secret.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { processBulkLookupBatch } from "@/lib/bulk-lookup.functions";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("x-cron-secret");
  if (!secret || !header) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(header.trim(), "utf8");
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
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
