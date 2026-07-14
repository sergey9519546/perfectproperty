import { describe, it, expect } from "vitest";
import * as v11 from "./v11";
import * as credit from "./credit";
import * as v12 from "./v12";
import * as monitoring from "./monitoring";
import {
  underwrite,
  computeValueLadder,
  computeRenoCost,
  computeAcquisition,
  computeExit,
  MARKET_CONTEXT,
} from "../engine";

const EPS = 1e-9;

describe("Statistical primitives vs known references", () => {
  it("normCdf matches scipy.stats.norm.cdf (Abramowitz-Stegun)", () => {
    const cases: [number, number][] = [
      [0, 0.5],
      [1, 0.8413447460685429],
      [-1, 0.15865525393145707],
      [1.96, 0.9750021048517795],
      [2, 0.9772498680518208],
      [-2, 0.022750131948179195],
      [3, 0.9986501019683699],
    ];
    for (const [x, expected] of cases) {
      expect(v11.normCdf(x)).toBeCloseTo(expected, 6);
    }
  });

  it("normInv round-trips normCdf", () => {
    // Round-trip tolerance of 4 places: Abramowitz-Stegun 7.1.26 is accurate to
    // ~1e-7 in CDF, but the steep inverse in the tails amplifies to ~1.5e-5 at |z|=3.
    for (const x of [-2, -1, 0, 0.5, 1, 2]) {
      expect(v11.normInv(v11.normCdf(x))).toBeCloseTo(x, 5);
    }
    expect(v11.normInv(v11.normCdf(-3))).toBeCloseTo(-3, 4);
    expect(v11.normInv(v11.normCdf(3))).toBeCloseTo(3, 4);
    expect(v11.normInv(0.975)).toBeCloseTo(1.959963984540054, 5);
    expect(v11.normInv(0.025)).toBeCloseTo(-1.959963984540054, 5);
  });

  it("quantileInterp is type-7 (numpy/R default)", () => {
    const s = Array.from({ length: 100 }, (_, i) => i); // 0..99
    expect(v11.quantileInterp(s, 0.05)).toBeCloseTo(4.95, 6);
    expect(v11.quantileInterp(s, 0.5)).toBeCloseTo(49.5, 6);
    expect(v11.quantileInterp(s, 0.95)).toBeCloseTo(94.05, 6);
  });

  it("weightedMedian interpolates even-N splits", () => {
    expect(v11.weightedMedian([10, 20], [1, 1])).toBeCloseTo(15, 9);
    expect(v11.weightedMedian([1, 2, 3, 4], [1, 1, 1, 1])).toBeCloseTo(2.5, 9);
    // Uniform odd-N still picks the middle element
    expect(v11.weightedMedian([1, 2, 3, 4, 5], [1, 1, 1, 1, 1])).toBeCloseTo(3, 9);
    // Weighting skews toward heavy bucket
    expect(v11.weightedMedian([1, 2, 3, 4, 5], [10, 1, 1, 1, 1])).toBeCloseTo(1, 9);
  });
});

describe("div_safe preserves sign", () => {
  it("matches a true division including negative divisors", () => {
    expect(v11.div_safe(1, 2)).toBeCloseTo(0.5, 9);
    expect(v11.div_safe(1, -2)).toBeCloseTo(-0.5, 9);
    expect(v11.div_safe(-1, 2)).toBeCloseTo(-0.5, 9);
    expect(v11.div_safe(-1, -2)).toBeCloseTo(0.5, 9);
    // zero divisor returns a large finite magnitude, NOT NaN
    expect(Number.isFinite(v11.div_safe(1, 0))).toBe(true);
  });
});

describe("Linear algebra / Bayesian primitives", () => {
  it("governorMargin is standard inverse-variance weighting", () => {
    const vm = 0.09, vv = 0.0025;
    const r = v11.governorMargin(0.15, 0.05, 0.10, 0.30);
    // kappa_model = vm / (vm + vv)
    expect(r.kappa_model).toBeCloseTo(vm / (vm + vv), 9);
    // posterior mean is the inverse-variance weighted average
    const wModel = 1 / vv, wMarket = 1 / vm;
    const muExpected = (0.15 * wModel + 0.10 * wMarket) / (wModel + wMarket);
    expect(r.mu).toBeCloseTo(muExpected, 9);
    // posterior variance = 1 / (1/vv + 1/vm)
    expect(r.sigma).toBeCloseTo(Math.sqrt(1 / (wModel + wMarket)), 9);
  });

  it("bayesDrift matches inverse-variance fusion of two gaussians", () => {
    const prior = { mu: 0.1, sigma: 0.04 };
    const trailing = { mu: 0.12, sigma: 0.02 };
    const r = v11.bayesDrift(prior, trailing);
    const wp = 1 / (prior.sigma ** 2), wt = 1 / (trailing.sigma ** 2);
    expect(r.mu).toBeCloseTo((prior.mu * wp + trailing.mu * wt) / (wp + wt), 9);
    expect(r.sigma).toBeCloseTo(Math.sqrt(1 / (wp + wt)), 9);
  });

  it("conservativeDrift never raises above the posterior mean", () => {
    const post = { mu: 0.1, sigma: 0.02 };
    for (const ls of [-3, -1, 0, 1, 3]) {
      const d = v11.conservativeDrift(post, ls, 0.5);
      expect(d).toBeLessThanOrEqual(post.mu + 1e-12);
    }
  });
});

describe("Monte Carlo engine", () => {
  const baseMC = {
    arv_today: 300000,
    drift_used_monthly: 0.002,
    sigma_arv_log: 0.15,
    purchase_price: 200000,
    rehab_scope: { L: 40000, M: 50000, H: 70000 },
    p_jump: 0.15,
    sigma_rehab_log_exec: 0.12,
    hold_base_months: 4,
    sigma_hold_exec: 1.2,
    sigma_hold_market: 0.8,
    hold_floor_months: 1,
    carry_rate_annual: 0.11,
    fixed_carry: 3800,
    selling_cost_pct: 0.06,
    loan_cost_of: (b: number, h: number) => b * 0.02 + b * 0.115 * (h / 12),
    other_costs: 0,
    n_draws: 800,
  };

  it("is reproducible for a fixed seed", () => {
    const a = v11.runMonteCarlo({ ...baseMC, seed: 12345 });
    const b = v11.runMonteCarlo({ ...baseMC, seed: 12345 });
    expect(a.profit_p5).toBe(b.profit_p5);
    expect(a.profit_p50).toBe(b.profit_p50);
    expect(a.profit_p95).toBe(b.profit_p95);
    expect(a.P_loss).toBe(b.P_loss);
    expect(a.expected_profit).toBe(b.expected_profit);
  });

  it("summary stats are internally consistent", () => {
    const mc = v11.runMonteCarlo({ ...baseMC, seed: 7, return_draws: true });
    const draws = mc.draws!.profits;
    const mean = draws.reduce((s, x) => s + x, 0) / draws.length;
    expect(mc.expected_profit).toBeCloseTo(mean, 0); // raw mean (unrounded in engine)
    const sorted = [...draws].sort((a, b) => a - b);
    expect(mc.profit_p50).toBeCloseTo(v11.quantileInterp(sorted, 0.5), 1);
    // monotonic quantile ordering
    expect(mc.profit_p5).toBeLessThanOrEqual(mc.profit_p50);
    expect(mc.profit_p50).toBeLessThanOrEqual(mc.profit_p95);
    // P_loss equals empirical fraction of negative draws
    const fracNeg = draws.filter((d) => d < 0).length / draws.length;
    expect(mc.P_loss).toBeCloseTo(fracNeg, 6);
    // all finite
    for (const v of [mc.profit_p5, mc.profit_p50, mc.profit_p95, mc.expected_profit, mc.cvar_loss_05]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("CVaR is a mean of the tail and non-negative", () => {
    const mc = v11.runMonteCarlo({ ...baseMC, seed: 99 });
    expect(mc.cvar_loss_05).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(mc.cvar_loss_05)).toBe(true);
  });
});

describe("Credit layer", () => {
  it("periodHazard baseline (all-zero features) = 1/(1+e^5)", () => {
    const p = credit.periodHazard({
      borrower_experience: 0, verified_liquidity_buffer: 0, rehab_complexity: 0,
      market_stress: 0, lien_depth: 0, prior_default: 0, draw_variance: 0, covenant_breach_flag: 0,
    });
    expect(p).toBeCloseTo(1 / (1 + Math.exp(5)), 9);
  });

  it("pdCreditStationary = 1 - (1-h)^H for a stationary hazard", () => {
    const zeroFeat = {
      borrower_experience: 0, verified_liquidity_buffer: 0, rehab_complexity: 0,
      market_stress: 0, lien_depth: 0, prior_default: 0, draw_variance: 0, covenant_breach_flag: 0,
    };
    const h = credit.periodHazard(zeroFeat); // = 1/(1+e^5) for the alpha=-5 default
    const pd = credit.pdCreditStationary(zeroFeat, 12);
    expect(pd).toBeCloseTo(1 - Math.pow(1 - h, 12), 6);
  });

  it("LGD is bounded in [0,1] and EL = PD*LGD*EAD", () => {
    const lgd = credit.lgd(
      {
        ARV: 300000, ARV_shock: -0.15, liquidation_haircut: 0.85,
        foreclosure_cost: 15000, liquidation_carry_cost: 5000,
        senior_claims: 0, selling_cost: 18000, legal_workout_cost: 8000,
      },
      200000,
    );
    expect(lgd).toBeGreaterThanOrEqual(0);
    expect(lgd).toBeLessThanOrEqual(1);
    const el = credit.expectedLoss(0.2, lgd, 200000);
    expect(el).toBeCloseTo(0.2 * lgd * 200000, 6);
  });

  it("EAD is the sum of its seven components", () => {
    const ead = credit.exposureAtDefault({
      outstanding_principal: 100000, approved_undrawn_rehab_available: 50000,
      accrued_interest: 2000, capitalized_fees: 1000, extension_fees: 0,
      protective_advances: 0, expected_carry_to_resolution: 3800,
    });
    expect(ead).toBe(100000 + 50000 + 2000 + 1000 + 0 + 0 + 3800);
  });
});

describe("PSI (population stability index)", () => {
  it("is zero for identical distributions", () => {
    expect(v11.psi([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBeCloseTo(0, 9);
  });
  it("is symmetric under swapping expected/actual", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const b = [2, 2, 2, 4, 4, 4, 6, 6, 8, 10];
    expect(v11.psi(a, b)).toBeCloseTo(v11.psi(b, a), 9);
  });
  it("is non-negative (proper divergence)", () => {
    const a = [1, 1, 1, 1, 1, 9, 9, 9, 9, 9];
    const b = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    expect(v11.psi(a, b)).toBeGreaterThanOrEqual(0);
  });
});

describe("Safe score (weighted geometric mean)", () => {
  const w = { profit: 0.34, acq: 0.2, exit: 0.14, surv: 0.14, conf: 0.1, gov: 0.08 };
  it("equals 100 when all factors = 1", () => {
    const f = { F_profit: 1, F_acq: 1, F_exit: 1, F_surv: 1, F_conf: 1, F_gov: 1 };
    const r = v11.safeScore(f, w, {
      profit_p5: -1e9, loss_floor: -1e9, p_loss: 0, loss_prob_ceiling: 1, confidence: 1, confidence_floor: 0,
    });
    expect(r.rejected).toBe(false);
    if (!r.rejected) expect(r.score).toBeCloseTo(100, 6);
  });
  it("equals 50 when all factors = 0.5", () => {
    const f = { F_profit: 0.5, F_acq: 0.5, F_exit: 0.5, F_surv: 0.5, F_conf: 0.5, F_gov: 0.5 };
    const r = v11.safeScore(f, w, {
      profit_p5: -1e9, loss_floor: -1e9, p_loss: 0, loss_prob_ceiling: 1, confidence: 1, confidence_floor: 0,
    });
    if (!r.rejected) expect(r.score).toBeCloseTo(50, 6);
  });
  it("rejects when profit_p5 is below the loss floor", () => {
    const f = { F_profit: 1, F_acq: 1, F_exit: 1, F_surv: 1, F_conf: 1, F_gov: 1 };
    const r = v11.safeScore(f, w, {
      profit_p5: -100000, loss_floor: -25000, p_loss: 0, loss_prob_ceiling: 1, confidence: 1, confidence_floor: 0,
    });
    expect(r.rejected).toBe(true);
  });
  it("rejects when P(loss) exceeds the ceiling", () => {
    const f = { F_profit: 1, F_acq: 1, F_exit: 1, F_surv: 1, F_conf: 1, F_gov: 1 };
    const r = v11.safeScore(f, w, {
      profit_p5: -1e9, loss_floor: -1e9, p_loss: 0.9, loss_prob_ceiling: 0.6, confidence: 1, confidence_floor: 0,
    });
    expect(r.rejected).toBe(true);
  });
});

describe("Skeptic & survival noisy-OR", () => {
  it("single certain defect drives survival to ~0", () => {
    const s = v11.skepticFactor([{ cluster: "WATER", p: 1 }]);
    expect(s).toBeCloseTo(EPS, 6);
  });
  it("no defects -> survival 1", () => {
    expect(v11.skepticFactor([])).toBeCloseTo(1, 9);
  });
  it("same-cluster defects combine via independent failure", () => {
    const s = v11.skepticFactor([{ cluster: "WATER", p: 0.5 }, { cluster: "WATER", p: 0.3 }]);
    // 1 - (1-0.5)*(1-0.3) = 0.65 cluster penalty -> survival 0.35
    expect(s).toBeCloseTo(0.35, 9);
  });
  it("v12.survivalFactorV12 mirrors the same product form", () => {
    expect(v12.survivalFactorV12([{ cluster: "WATER", p: 0.5 }])).toBeCloseTo(0.5, 9);
    expect(v12.survivalFactorV12([])).toBeCloseTo(1, 9);
  });
});

describe("Retail score", () => {
  it("weights sum to 1 and all-1 yields 100", () => {
    const wsum = v12.RETAIL_WEIGHTS.F1 + v12.RETAIL_WEIGHTS.F2 + v12.RETAIL_WEIGHTS.F3 + v12.RETAIL_WEIGHTS.F4;
    expect(wsum).toBeCloseTo(1, 9);
    const s = v12.retailScore({ F1_margin_exceedance: 1, F2_p_accept: 1, F3_p_sale_90d: 1, F4_survival: 1 });
    expect(s).toBeCloseTo(100, 6);
  });
  it("all-0.5 yields 50", () => {
    const s = v12.retailScore({ F1_margin_exceedance: 0.5, F2_p_accept: 0.5, F3_p_sale_90d: 0.5, F4_survival: 0.5 });
    expect(s).toBeCloseTo(50, 6);
  });
});

describe("Monitoring primitives", () => {
  it("hhi: single segment = 1, two equal = 0.5", () => {
    expect(monitoring.hhi([100])).toBeCloseTo(1, 9);
    expect(monitoring.hhi([50, 50])).toBeCloseTo(0.5, 9);
  });
  it("portfolioLossStats VaR/CVaR/EC are internally consistent", () => {
    const losses = Array.from({ length: 10 }, (_, i) => i * 10); // 0..90
    const r = monitoring.portfolioLossStats(losses, 0.05);
    expect(r.EL).toBeCloseTo(45, 6);
    expect(r.VaR).toBeCloseTo(90, 6); // ceil(0.95*10)-1 = 9 -> sorted[9]=90
    expect(r.CVaR).toBeCloseTo(90, 6); // tail = [90]
    expect(r.EC).toBeCloseTo(45, 6);
  });
  it("calibrationSlope of perfect prediction is (1,0)", () => {
    const pred = [0, 0.25, 0.5, 0.75, 1];
    const real = [0, 0.25, 0.5, 0.75, 1];
    const r = monitoring.calibrationSlope(pred, real);
    expect(r.slope).toBeCloseTo(1, 6);
    expect(r.intercept).toBeCloseTo(0, 6);
  });
  it("calibrationError is 0 when predicted matches observed", () => {
    const bins = [{ n: 100, p: 0.3, o: 0.3 }];
    expect(v11.calibrationError(bins, 100)).toBeCloseTo(0, 9);
    const bins2 = [{ n: 100, p: 0.3, o: 0.4 }];
    expect(v11.calibrationError(bins2, 100)).toBeCloseTo(0.01, 9);
  });
});

describe("Full underwrite pipeline invariants", () => {
  const parcel = {
    living_sqft: 1500,
    lot_sqft: 6000,
    year_built: 1960,
    bedrooms: 3,
    bathrooms: 2,
    condition_grade: "C",
    flood_zone: null,
    school_score: 6,
    assessed_value: null,
    estimated_equity: null,
    owner_is_absentee: true,
    owner_since: null,
    is_listed: false,
    is_vacant: false,
    state: "FL",
  } as any;
  const distress = [
    { event_type: "FORECLOSURE_NOD", severity: 0.5, amount: null, event_date: "2026-01-01", auction_date: null },
  ] as any;
  const market = MARKET_CONTEXT["12086"]; // Miami-Dade
  const comps = [{ ppsf: 430 }, { ppsf: 450 }, { ppsf: 440 }, { ppsf: 460 }, { ppsf: 420 }] as any;

  it("produces a fully-valid result on a realistic parcel", () => {
    const r = underwrite(parcel, distress, market, comps);
    expect(Number.isFinite(r.perfect_score)).toBe(true);
    expect(r.perfect_score).toBeGreaterThanOrEqual(0);
    expect(r.perfect_score).toBeLessThanOrEqual(100);
    expect(r.acquisition_probability).toBeGreaterThanOrEqual(0);
    expect(r.acquisition_probability).toBeLessThanOrEqual(1);
    for (const k of ["pd_credit", "pd_project", "pd_exit", "lgd", "mc_p_loss"] as const) {
      expect((r as any)[k]).toBeGreaterThanOrEqual(0);
      expect((r as any)[k]).toBeLessThanOrEqual(1);
    }
    expect(Number.isFinite(r.gross_profit)).toBe(true);
    expect(Number.isFinite(r.raroc)).toBe(true);
    expect(Number.isFinite(r.expected_loss)).toBe(true);
    expect(r.expected_loss).toBeGreaterThanOrEqual(0);
    for (const v of [r.as_is_value, r.cosmetic_arv, r.full_reno_arv, r.expanded_arv, r.arv_exit_p5, r.arv_exit_p50, r.arv_exit_p95]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(r.arv_exit_p5!).toBeLessThanOrEqual(r.arv_exit_p50!);
    expect(r.arv_exit_p50!).toBeLessThanOrEqual(r.arv_exit_p95!);
  });

  it("handles the no-comps heuristic fallback without NaN", () => {
    const r = underwrite(parcel, distress, market, []);
    expect(Number.isFinite(r.as_is_value)).toBe(true);
    expect(r.as_is_value).toBeGreaterThan(0);
    expect(Number.isFinite(r.perfect_score)).toBe(true);
  });

  it("flags flood + condition-D deals and still returns finite scores", () => {
    const risky = { ...parcel, flood_zone: "AE", condition_grade: "D" } as any;
    const r = underwrite(risky, distress, market, comps);
    expect(r.skeptic_flags.length).toBeGreaterThan(0);
    expect(Number.isFinite(r.perfect_score)).toBe(true);
  });
});

describe("Value ladder & reno cost sanity", () => {
  const m = MARKET_CONTEXT["12086"];
  it("as-is is below cosmetic which is below full which is below expanded", () => {
    const p = { living_sqft: 1500, condition_grade: "C", flood_zone: null, school_score: 6, state: "FL" } as any;
    const l = computeValueLadder(p, m, []);
    expect(l.as_is_value).toBeLessThan(l.cosmetic_arv);
    expect(l.cosmetic_arv).toBeLessThan(l.full_reno_arv);
    expect(l.full_reno_arv).toBeLessThan(l.expanded_arv);
  });
  it("reno cost scales with sqft and is larger for EXPANDED", () => {
    const p = { living_sqft: 1500, condition_grade: "C", state: "FL" } as any;
    const cosmetic = computeRenoCost(p, "COSMETIC");
    const full = computeRenoCost(p, "FULL");
    const expanded = computeRenoCost(p, "EXPANDED");
    expect(cosmetic).toBeLessThan(full);
    expect(full).toBeLessThan(expanded);
  });
});

describe("Acquisition & exit velocity bounds", () => {
  it("acquisition probability stays in [0.02, 0.92]", () => {
    const p = { is_listed: true, owner_is_absentee: false, is_vacant: false } as any;
    const d = [
      { event_type: "FORECLOSURE_NOD", severity: 1, amount: null, event_date: "", auction_date: null },
      { event_type: "AUCTION_SCHEDULED", severity: 1, amount: null, event_date: "", auction_date: null },
      { event_type: "TAX_LIEN", severity: 1, amount: 50000, event_date: "", auction_date: null },
      { event_type: "PROBATE", severity: 1, amount: null, event_date: "", auction_date: null },
      { event_type: "CODE_VIOLATION", severity: 1, amount: null, event_date: "", auction_date: null },
      { event_type: "VACANCY", severity: 1, amount: null, event_date: "", auction_date: null },
    ] as any;
    const r = computeAcquisition(p, d, 100000);
    expect(r.acquisition_probability).toBeGreaterThanOrEqual(0.02);
    expect(r.acquisition_probability).toBeLessThanOrEqual(0.92);
    expect(Number.isFinite(r.modeled_offer)).toBe(true);
  });
  it("exit confidence is clamped to [0.4, 0.95]", () => {
    const m = { avg_dom_renovated: 30, pending_ratio: 1, momentum: 1 } as any;
    const e = computeExit(m);
    expect(e.exit_confidence).toBeLessThanOrEqual(0.95);
    expect(e.exit_confidence).toBeGreaterThanOrEqual(0.4);
    expect(e.exit_days).toBeGreaterThanOrEqual(14);
  });
});
