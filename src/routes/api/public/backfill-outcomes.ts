/**
 * Backfill endpoint: recompute `prediction_outcomes` for every sale that
 * closed inside a user-supplied date range, then refresh the monitoring
 * snapshot so `/accuracy` and `/monitoring` update immediately.
 *
 * POST /api/public/backfill-outcomes
 *   headers: x-cron-secret: <CRON_SECRET>
 *   body:    { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD",
 *              "refresh_monitoring": true }
 *
 * Behavior:
 *  1. Loads sales whose `sold_at` is within [from, to].
 *  2. Deletes any existing `prediction_outcomes` for those parcels whose
 *     `actual_sold_at` is inside the same window (idempotent recompute).
 *  3. Recomputes outcomes from the current `parcel_scores` snapshot using
 *     the same profit + classification formula as the nightly ingest.
 *  4. Inserts the fresh rows.
 *  5. Optionally POSTs to `/api/public/run-monitoring` to refresh the
 *     portfolio metrics snapshot.
 *
 * Auth: `x-cron-secret` header, timing-safe compared against
 * process.env.CRON_SECRET.
 */

import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

function verify(secret: string, header: string | null): boolean {
  if (!header) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(header.trim(), "utf8");
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

function classify(actualProfit: number, predictedProfit: number): "WIN" | "LOSS" | "STUCK" {
  if (actualProfit <= 0) return "LOSS";
  if (predictedProfit > 0 && actualProfit >= predictedProfit * 0.75) return "WIN";
  return "STUCK";
}

const BodySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD"),
  refresh_monitoring: z.boolean().optional().default(true),
});

export const Route = createFileRoute("/api/public/backfill-outcomes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        const header = request.headers.get("x-cron-secret");
        if (!secret || !verify(secret, header)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch (e) {
          return new Response(`Invalid body: ${(e as Error).message}`, { status: 400 });
        }
        const { from, to, refresh_monitoring } = parsed;
        if (from > to) {
          return new Response("`from` must be <= `to`", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. Sales in window
        const { data: sales, error: slErr } = await supabaseAdmin
          .from("sales")
          .select("parcel_id, sale_price, sold_at")
          .not("parcel_id", "is", null)
          .not("sale_price", "is", null)
          .gte("sold_at", from)
          .lte("sold_at", to);
        if (slErr) return new Response(`Read sales failed: ${slErr.message}`, { status: 500 });

        const latestByParcel = new Map<string, { sale_price: number; sold_at: string }>();
        for (const s of sales ?? []) {
          if (!s.parcel_id) continue;
          const prev = latestByParcel.get(s.parcel_id);
          if (!prev || s.sold_at > prev.sold_at) {
            latestByParcel.set(s.parcel_id, {
              sale_price: Number(s.sale_price),
              sold_at: s.sold_at as string,
            });
          }
        }

        const parcelIds = Array.from(latestByParcel.keys());
        if (parcelIds.length === 0) {
          return Response.json({
            ok: true, from, to, sales_scanned: 0, deleted: 0, inserted: 0,
            reason: "no sales in window",
          });
        }

        // 2. Delete existing outcomes for those parcels within the window
        const { data: deletedRows, error: delErr } = await supabaseAdmin
          .from("prediction_outcomes")
          .delete()
          .in("parcel_id", parcelIds)
          .gte("actual_sold_at", from)
          .lte("actual_sold_at", to)
          .select("parcel_id");
        if (delErr) return new Response(`Delete failed: ${delErr.message}`, { status: 500 });

        // 3. Load current scores for these parcels
        const { data: scores, error: scErr } = await supabaseAdmin
          .from("parcel_scores")
          .select("parcel_id, computed_at, arv_today, gross_profit, modeled_offer, reno_cost, carry_cost, selling_cost")
          .in("parcel_id", parcelIds)
          .not("arv_today", "is", null)
          .not("gross_profit", "is", null);
        if (scErr) return new Response(`Read scores failed: ${scErr.message}`, { status: 500 });

        const scoreById = new Map((scores ?? []).map((s) => [s.parcel_id, s]));

        const rows: Array<{
          parcel_id: string;
          predicted_arv: number;
          predicted_profit: number;
          predicted_at: string;
          actual_sale_price: number;
          actual_profit: number;
          actual_sold_at: string;
          outcome: "WIN" | "LOSS" | "STUCK";
          error_pct: number | null;
        }> = [];

        let skippedNoScore = 0;
        for (const [parcel_id, sale] of latestByParcel) {
          const sc = scoreById.get(parcel_id);
          if (!sc) { skippedNoScore++; continue; }

          const predictedArv = Number(sc.arv_today);
          const predictedProfit = Number(sc.gross_profit);
          const modeledOffer = Number(sc.modeled_offer ?? 0);
          const renoCost = Number(sc.reno_cost ?? 0);
          const carryCost = Number(sc.carry_cost ?? 0);
          const sellingCost = Number(sc.selling_cost ?? sale.sale_price * 0.06);
          const actualProfit = sale.sale_price - modeledOffer - renoCost - carryCost - sellingCost;
          const errorPct = predictedArv > 0
            ? Math.abs(sale.sale_price - predictedArv) / predictedArv
            : null;

          rows.push({
            parcel_id,
            predicted_arv: predictedArv,
            predicted_profit: predictedProfit,
            predicted_at: sc.computed_at ?? new Date().toISOString(),
            actual_sale_price: sale.sale_price,
            actual_profit: Math.round(actualProfit),
            actual_sold_at: sale.sold_at,
            outcome: classify(actualProfit, predictedProfit),
            error_pct: errorPct != null ? Number((errorPct * 100).toFixed(2)) : null,
          });
        }

        let inserted = 0;
        if (rows.length > 0) {
          const { error: insErr } = await supabaseAdmin
            .from("prediction_outcomes")
            .insert(rows);
          if (insErr) return new Response(`Insert failed: ${insErr.message}`, { status: 500 });
          inserted = rows.length;
        }

        // 4. Refresh monitoring snapshot so /monitoring reflects the backfill
        let monitoring: unknown = null;
        if (refresh_monitoring) {
          try {
            const url = new URL(request.url);
            url.pathname = "/api/public/run-monitoring";
            const res = await fetch(url.toString(), {
              method: "POST",
              headers: { "x-cron-secret": secret, "content-type": "application/json" },
              body: "{}",
            });
            monitoring = res.ok
              ? await res.json().catch(() => ({ ok: true }))
              : { ok: false, status: res.status, body: await res.text().catch(() => "") };
          } catch (e) {
            monitoring = { ok: false, error: (e as Error).message };
          }
        }

        return Response.json({
          ok: true,
          from,
          to,
          sales_scanned: sales?.length ?? 0,
          parcels_in_window: parcelIds.length,
          deleted: deletedRows?.length ?? 0,
          inserted,
          skipped_no_score: skippedNoScore,
          wins: rows.filter((r) => r.outcome === "WIN").length,
          losses: rows.filter((r) => r.outcome === "LOSS").length,
          stuck: rows.filter((r) => r.outcome === "STUCK").length,
          monitoring,
        });
      },
    },
  },
});
