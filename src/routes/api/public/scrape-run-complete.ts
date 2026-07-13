/**
 * Orchestrator: Scrapy posts a run summary after each spider job.
 *
 * Auth: HMAC-SHA256 (hex) header `x-signature` over raw body, keyed with
 * SCRAPY_INGEST_SECRET.
 *
 * Body: {
 *   target_id?: string;    // uuid — omit only for ad-hoc runs
 *   spider: string;
 *   county_fips?: string;
 *   source_kind?: string;
 *   requests_made: number;
 *   items_scraped: number;
 *   triggers_produced: number;   // rows that produced a distress_event / listing
 *   blocks_encountered: number;  // 429/403/captcha count
 *   cost_usd: number;            // Zyte spend
 *   used_zyte: boolean;
 *   status: "ok" | "blocked" | "error";
 *   error?: string;
 * }
 *
 * Side effects:
 *  - Insert scrape_runs row.
 *  - On success: reset target.penalty=0, stamp last_success_at.
 *  - On blocked/error: increment penalty (capped at 6).
 */

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const Body = z.object({
  target_id: z.string().uuid().optional(),
  spider: z.string().min(1),
  county_fips: z.string().optional(),
  source_kind: z.string().optional(),
  requests_made: z.number().int().min(0).default(0),
  items_scraped: z.number().int().min(0).default(0),
  triggers_produced: z.number().int().min(0).default(0),
  blocks_encountered: z.number().int().min(0).default(0),
  cost_usd: z.number().min(0).default(0),
  used_zyte: z.boolean().default(false),
  status: z.enum(["ok", "blocked", "error"]),
  error: z.string().max(500).optional(),
});

function verify(secret: string, raw: string, header: string | null): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(header.trim(), "utf8");
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export const Route = createFileRoute("/api/public/scrape-run-complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SCRAPY_INGEST_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });
        const raw = await request.text();
        if (!verify(secret, raw, request.headers.get("x-signature"))) {
          return new Response("Invalid signature", { status: 401 });
        }
        let body;
        try { body = Body.parse(JSON.parse(raw)); }
        catch (e: any) { return new Response(`Bad payload: ${e.message}`, { status: 400 }); }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nowIso = new Date().toISOString();

        await supabaseAdmin.from("scrape_runs").insert({
          target_id: body.target_id ?? null,
          spider: body.spider,
          county_fips: body.county_fips ?? null,
          source_kind: body.source_kind ?? null,
          started_at: nowIso,
          finished_at: nowIso,
          requests_made: body.requests_made,
          items_scraped: body.items_scraped,
          triggers_produced: body.triggers_produced,
          blocks_encountered: body.blocks_encountered,
          cost_usd: body.cost_usd,
          used_zyte: body.used_zyte,
          status: body.status,
          error: body.error ?? null,
        } as any);

        if (body.target_id) {
          if (body.status === "ok") {
            await supabaseAdmin.from("scrape_targets")
              .update({ penalty: 0, last_success_at: nowIso, last_error: null })
              .eq("id", body.target_id);
          } else {
            const { data: t } = await supabaseAdmin.from("scrape_targets")
              .select("penalty").eq("id", body.target_id).maybeSingle();
            const nextPenalty = Math.min(6, Number((t as any)?.penalty ?? 0) + 1);
            await supabaseAdmin.from("scrape_targets")
              .update({ penalty: nextPenalty, last_error: body.error ?? body.status })
              .eq("id", body.target_id);
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
