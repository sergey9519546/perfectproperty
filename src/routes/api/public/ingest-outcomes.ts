/**
 * Cron endpoint: ingest newly-closed sales as prediction_outcomes.
 *
 * For each parcel with a `parcel_scores` row and a `sales` row whose
 * `sold_at` is AFTER the score was computed, and that does not already
 * have a `prediction_outcomes` row, insert one. Actual profit is estimated
 * from the closed sale price minus the modeled offer + reno + carry + sell
 * costs. Outcome is WIN if actual >= 75% of predicted profit, LOSS if
 * actual <= 0, otherwise STUCK.
 *
 * Called nightly by pg_cron. Auth: `x-cron-secret` header, timing-safe
 * compare against process.env.CRON_SECRET.
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

function classify(actualProfit: number, predictedProfit: number): "WIN" | "LOSS" | "STUCK" {
  if (actualProfit <= 0) return "LOSS";
  if (predictedProfit > 0 && actualProfit >= predictedProfit * 0.75) return "WIN";
  return "STUCK";
}

export const Route = createFileRoute("/api/public/ingest-outcomes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        const header = request.headers.get("x-cron-secret");
        if (!secret || !verify(secret, header)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Existing outcomes → skip these parcels
        const { data: existing, error: exErr } = await supabaseAdmin
          .from("prediction_outcomes")
          .select("parcel_id");
        if (exErr) return new Response(`Read outcomes failed: ${exErr.message}`, { status: 500 });
        const already = new Set((existing ?? []).map((r) => r.parcel_id));

        // Candidate scores
        const { data: scores, error: scErr } = await supabaseAdmin
          .from("parcel_scores")
          .select("parcel_id, computed_at, arv_today, gross_profit, modeled_offer, reno_cost, carry_cost, selling_cost")
          .not("arv_today", "is", null)
          .not("gross_profit", "is", null);
        if (scErr) return new Response(`Read scores failed: ${scErr.message}`, { status: 500 });

        const candidateIds = (scores ?? [])
          .filter((s) => !already.has(s.parcel_id))
          .map((s) => s.parcel_id);

        if (candidateIds.length === 0) {
          return Response.json({ ok: true, inserted: 0, scanned: 0, reason: "no candidates" });
        }

        // Matching sales for those parcels
        const { data: sales, error: slErr } = await supabaseAdmin
          .from("sales")
          .select("parcel_id, sale_price, sold_at")
          .in("parcel_id", candidateIds)
          .not("sale_price", "is", null)
          .not("sold_at", "is", null);
        if (slErr) return new Response(`Read sales failed: ${slErr.message}`, { status: 500 });

        // Newest sale per parcel
        const latestByParcel = new Map<string, { sale_price: number; sold_at: string }>();
        for (const s of sales ?? []) {
          if (!s.parcel_id) continue;
          const prev = latestByParcel.get(s.parcel_id);
          if (!prev || s.sold_at > prev.sold_at) {
            latestByParcel.set(s.parcel_id, { sale_price: Number(s.sale_price), sold_at: s.sold_at });
          }
        }

        const scoreById = new Map((scores ?? []).map((s) => [s.parcel_id, s]));
        const rows: Array<Record<string, unknown>> = [];

        for (const [parcel_id, sale] of latestByParcel) {
          const sc = scoreById.get(parcel_id);
          if (!sc) continue;
          // Only count sales that closed after we scored the parcel.
          if (sc.computed_at && new Date(sale.sold_at) < new Date(sc.computed_at)) continue;

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

        if (rows.length === 0) {
          return Response.json({ ok: true, inserted: 0, scanned: candidateIds.length });
        }

        const { error: insErr } = await supabaseAdmin
          .from("prediction_outcomes")
          .insert(rows);
        if (insErr) return new Response(`Insert failed: ${insErr.message}`, { status: 500 });

        return Response.json({
          ok: true,
          inserted: rows.length,
          scanned: candidateIds.length,
          wins: rows.filter((r) => r.outcome === "WIN").length,
          losses: rows.filter((r) => r.outcome === "LOSS").length,
          stuck: rows.filter((r) => r.outcome === "STUCK").length,
        });
      },
    },
  },
});
