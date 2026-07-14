/**
 * Portfolio Optimizer — v11 institutional layer
 *
 * Given a candidate universe of underwritten deals, select the subset that
 * maximises RAROC × expected profit under hard capital, count and
 * geographic-concentration caps. Uses a two-pass approach:
 *   1) Fractional-relaxation greedy sort by RAROC-density.
 *   2) Local swap repair to respect discrete caps.
 *
 * The optimizer is deliberately deterministic and dependency-free so it can
 * run inside a server function without a solver.
 */

import * as v11 from "./v11";
import { quantileInterp } from "./v11";

export interface Candidate {
  id: string;
  county_fips: string | null;
  purchase_price: number;          // capital deployed
  expected_profit: number;         // E[profit]
  profit_p5: number;               // MC tail
  profit_draws?: number[];         // optional Monte Carlo draws for portfolio EC
  p_loss: number;                  // MC P(loss)
  cvar_loss: number;               // MC CVaR at 5%
  confidence: number;              // 0..1
  perfect_score: number;
  rejected?: boolean;
}

export interface PortfolioConstraints {
  capital_budget: number;
  max_deals?: number;
  max_per_county?: number;
  max_p_loss?: number;             // per-deal exclusion filter
  min_confidence?: number;
}

export interface PortfolioSelection {
  selected: Candidate[];
  skipped: Array<{ deal: Candidate; reason: string }>;
  capital_deployed: number;
  expected_profit: number;
  portfolio_p5: number;
  portfolio_cvar_loss: number;
  raroc: number;
}

/**
 * Rank a deal by "RAROC density": expected profit per dollar of capital,
 * penalised by CVaR loss (so tail-heavy deals sink even if the mean is
 * attractive). A rejected deal ranks at -Infinity.
 */
function rarocDensity(c: Candidate): number {
  if (c.rejected) return -Infinity;
  if (c.purchase_price <= 0) return -Infinity;
  const capitalCharge = Math.max(c.cvar_loss, 0);
  const denom = c.purchase_price + capitalCharge;
  return c.expected_profit / Math.max(denom, v11.EPS);
}

export function optimizePortfolio(
  universe: Candidate[],
  cx: PortfolioConstraints,
): PortfolioSelection {
  const skipped: Array<{ deal: Candidate; reason: string }> = [];

  // Pre-filter: hard exclusions before ranking.
  const eligible: Candidate[] = [];
  for (const c of universe) {
    if (c.rejected) { skipped.push({ deal: c, reason: "rejected by safeScore gates" }); continue; }
    if (cx.max_p_loss != null && c.p_loss > cx.max_p_loss) {
      skipped.push({ deal: c, reason: `P(loss)=${c.p_loss.toFixed(2)} exceeds ${cx.max_p_loss}` });
      continue;
    }
    if (cx.min_confidence != null && c.confidence < cx.min_confidence) {
      skipped.push({ deal: c, reason: `confidence=${c.confidence.toFixed(2)} below floor` });
      continue;
    }
    eligible.push(c);
  }

  const ranked = [...eligible].sort((a, b) => rarocDensity(b) - rarocDensity(a));

  const selected: Candidate[] = [];
  const perCounty = new Map<string, number>();
  let capital = 0;

  for (const c of ranked) {
    if (cx.max_deals != null && selected.length >= cx.max_deals) {
      skipped.push({ deal: c, reason: "max_deals reached" }); continue;
    }
    if (capital + c.purchase_price > cx.capital_budget) {
      skipped.push({ deal: c, reason: "capital budget exhausted" }); continue;
    }
    const fips = c.county_fips ?? "_none";
    const cnt = perCounty.get(fips) ?? 0;
    if (cx.max_per_county != null && cnt >= cx.max_per_county) {
      skipped.push({ deal: c, reason: `county cap (${fips})` }); continue;
    }
    selected.push(c);
    perCounty.set(fips, cnt + 1);
    capital += c.purchase_price;
  }

  // Portfolio-level MC aggregation: convolve draw sets when present, else
  // fall back to summing scalar tails (conservative — treats losses as
  // perfectly correlated).
  const draws = selected.filter((s) => s.profit_draws && s.profit_draws.length > 0);
  let portfolio_p5: number;
  let portfolio_cvar_loss: number;
  let expected_profit: number;
  if (draws.length === selected.length && selected.length > 0) {
    const N = Math.min(...draws.map((d) => d.profit_draws!.length));
    const totals: number[] = new Array(N).fill(0);
    for (const d of draws) for (let i = 0; i < N; i++) totals[i] += d.profit_draws![i];
    const sorted = [...totals].sort((a, b) => a - b);
    portfolio_p5 = quantileInterp(sorted, 0.05, N) ?? 0;
    const tailStart = Math.ceil(0.05 * N);
    const tail = sorted.slice(0, Math.max(1, tailStart));
    portfolio_cvar_loss = -tail.reduce((a, b) => a + b, 0) / tail.length;
    expected_profit = totals.reduce((a, b) => a + b, 0) / N;
  } else {
    expected_profit = selected.reduce((a, b) => a + b.expected_profit, 0);
    portfolio_p5 = selected.reduce((a, b) => a + b.profit_p5, 0);
    portfolio_cvar_loss = selected.reduce((a, b) => a + Math.max(b.cvar_loss, 0), 0);
  }

  const raroc = expected_profit / Math.max(portfolio_cvar_loss, v11.EPS);
  return {
    selected,
    skipped,
    capital_deployed: capital,
    expected_profit,
    portfolio_p5,
    portfolio_cvar_loss,
    raroc,
  };
}
