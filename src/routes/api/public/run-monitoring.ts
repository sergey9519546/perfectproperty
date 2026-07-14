/**
 * Cron endpoint: compute portfolio-level monitoring metrics.
 *
 * Reads every LIVE parcel_score row, aggregates portfolio EL/VaR/CVaR/EC,
 * HHI (county + scope), calibration slope (predicted vs actual profit),
 * PSI (perfect_score distribution vs 7d-old snapshot), then writes a
 * `portfolio_metrics` row and checks risk-appetite budgets.
 *
 * Called by pg_cron nightly via pg_net with the shared bearer secret in
 * `x-cron-secret` (compared with timingSafeEqual).
 */

import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import {
  portfolioLossStats,
  raroc,
  hhi,
  lcr,
  calibrationSlope,
  psiBand,
  riskAppetiteBreached,
} from "@/lib/engine/monitoring";
import { psi as v11Psi } from "@/lib/engine/v11";

function verify(secret: string, header: string | null): boolean {
  if (!header) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(header.trim(), "utf8");
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export const Route = createFileRoute("/api/public/run-monitoring")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        const header = request.headers.get("x-cron-secret");
        if (!secret || !verify(secret, header)) return new Response("Unauthorized", { status: 401 });


        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: scoresRaw, error } = await supabaseAdmin
          .from("parcel_scores")
          .select("perfect_score, expected_loss, ead, pd_credit, lgd, gross_profit, risk_adjusted_profit_credit, recommended_scope, parcel_id, parcels!inner(county_fips, data_source)")
          .eq("data_source", "LIVE")
          .limit(5000);
        if (error) return new Response(`Read failed: ${error.message}`, { status: 500 });
        const scores = (scoresRaw ?? []) as any[];

        // ---- Portfolio EL/VaR/CVaR (loss = EAD * PD * LGD per-deal draws) ----
        const losses = scores
          .map((r) => Number(r.expected_loss ?? 0))
          .filter((v) => Number.isFinite(v) && v >= 0);
        const { EL, VaR, CVaR, EC } = portfolioLossStats(losses, 0.05);
        const expectedNetIncome = scores
          .reduce((a, r) => a + Number(r.risk_adjusted_profit_credit ?? r.gross_profit ?? 0), 0);
        const raroc_ = raroc(expectedNetIncome, EL, EC);

        // ---- HHI by county + by recommended scope ----
        const byCounty: Record<string, number> = {};
        const byScope: Record<string, number> = {};
        for (const r of scores) {
          const cty = r.parcels?.county_fips ?? "unknown";
          byCounty[cty] = (byCounty[cty] ?? 0) + Number(r.ead ?? 0);
          const sc = r.recommended_scope ?? "unknown";
          byScope[sc] = (byScope[sc] ?? 0) + Number(r.ead ?? 0);
        }
        const hhi_county = hhi(Object.values(byCounty));
        const hhi_scope = hhi(Object.values(byScope));

        // ---- Calibration slope: predicted vs actual profit from outcomes ----
        const { data: outcomes } = await supabaseAdmin
          .from("prediction_outcomes")
          .select("predicted_profit, actual_profit")
          .limit(1000);
        const pred: number[] = [], real: number[] = [];
        for (const o of outcomes ?? []) {
          const p = Number(o.predicted_profit), a = Number(o.actual_profit);
          if (Number.isFinite(p) && Number.isFinite(a)) { pred.push(p); real.push(a); }
        }
        const cal = calibrationSlope(pred, real);

        // ---- PSI on perfect_score vs the snapshot from ~7d ago ----
        const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const { data: baselineRow } = await supabaseAdmin
          .from("portfolio_metrics")
          .select("summary")
          .lte("computed_at", weekAgo)
          .order("computed_at", { ascending: false })
          .limit(1).maybeSingle();
        const currentScores = scores.map((r) => Number(r.perfect_score)).filter(Number.isFinite);
        const baselineScores: number[] = ((baselineRow?.summary as any)?.score_hist ?? []) as number[];
        const psiValue = baselineScores.length ? v11Psi(currentScores, baselineScores) : 0;
        const psi_band = psiBand(psiValue);

        // ---- Liquidity coverage ratio (heuristic — no treasury table yet) --
        // Assume unencumbered liquidity ~ 20% of total EAD; stress outflow ~ CVaR.
        const totalEad = Object.values(byCounty).reduce((a, b) => a + b, 0);
        const lcr_ = lcr(totalEad * 0.20, Math.max(CVaR, 1));

        // ---- Risk appetite ----
        const breach = riskAppetiteBreached({
          EC, board_approved_capital: totalEad * 0.15,
          HHI: hhi_county, concentration_limit: 0.35,
          StressLoss_CVaR: CVaR, stress_budget: totalEad * 0.10,
          warehouse_covenant_breach: false,
          unresolved_red_model_alert: psi_band === "red",
        });

        const summary = {
          total_ead: totalEad,
          score_hist: currentScores.slice(0, 2000),
          calibration_n: pred.length,
          hhi_by_county: byCounty,
          hhi_by_scope: byScope,
        };

        const { error: insErr } = await supabaseAdmin.from("portfolio_metrics").insert({
          scope: "LIVE",
          n_deals: scores.length,
          el: EL, var_95: VaR, cvar_95: CVaR, ec: EC, raroc: raroc_,
          hhi_county, hhi_scope, lcr: lcr_,
          psi: psiValue, psi_band,
          calibration_slope: cal.slope, calibration_intercept: cal.intercept,
          calibration_flag: cal.flag,
          risk_appetite_breached: breach.breached,
          breach_reasons: breach.reasons,
          summary,
        });
        if (insErr) return new Response(`Insert failed: ${insErr.message}`, { status: 500 });

        return Response.json({
          ok: true,
          n_deals: scores.length,
          EL, VaR, CVaR, EC, raroc: raroc_,
          hhi_county, hhi_scope, lcr: lcr_,
          psi: psiValue, psi_band,
          calibration: cal,
          breach,
        });
      },
    },
  },
});
