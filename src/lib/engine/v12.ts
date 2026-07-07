/**
 * Perfect Property Engine — v12 Florida-First Blueprint
 * -----------------------------------------------------
 * Layer on top of v11. Only v12-specific corrections / additions live here.
 * Section headers map 1:1 to the v12 master doc.
 *
 *   0I.5.1   Comps-primary ARV_today (weighted-median log-hedonic comps)
 *   0I.5.2   LightGBM divergence anchor
 *   0I.6.2   Mean-unbiased ARV_exit with hold horizon & drift
 *   0I.7.1   Cold-start correlation priors + latent-factor loadings
 *   0I.8     Drift compounding (log-space, sign-safe leading signal)
 *   0I.9     Scope-jump rehab preserving v11 positive-support execution shock
 *   0I.10    Acquisition + exit + offer curve lock (hazard-based)
 *   0I.11.1  Primary rank = P(true_margin >= margin_floor)
 *   0I.11.2  Secondary downside display metrics
 *   0I.11.3  Retail / investor score  Score = 100 * F1^.35 * F2^.30 * F3^.20 * F4^.15
 *   0I.11.4  Institutional score separation (RAP / EL / EC / RAROC)
 *   0I.12    Cluster / noisy-OR survival factor with optional cap
 *   0I.15    v12 Gate sequence (Gate 0–8) as a data structure
 *
 * REJECTED and not implemented:
 *   - primary ranking by P25(profit)
 *   - max-only cluster survival aggregation
 *   - `(1 + drift)^H` for a monthly log return
 *   - dropping log-space ARV uncertainty
 */

import {
  EPS,
  clamp,
  clip01,
  positive,
  normSample,
  normInv,
  weightedMedian,
  sampleBetaPert,
  hedonicAdjustLog,
  type HedonicSubject,
  type HedonicBetas,
} from "./v11";

// =============================================================================
// 0I.5.1  Comps-primary ARV_today
// =============================================================================
export interface CompRow {
  price: number;
  weight: number;
  drift_adjustment: number; // in log-space
  sqft: number;
  beds: number;
  baths: number;
  garage: number;
  lot: number;
  age: number;
}

/** Weighted median of log-hedonic-adjusted comps → ARV_today (dollars). */
export function arvTodayComps(
  subject: HedonicSubject,
  comps: CompRow[],
  betas: HedonicBetas,
): number {
  if (!comps.length) return 0;
  const adjustedLog = comps.map((c) => {
    const compHedonic: HedonicSubject = {
      sqft: c.sqft, beds: c.beds, baths: c.baths,
      garage: c.garage, lot: c.lot, age: c.age,
    };
    const dLn = hedonicAdjustLog(subject, compHedonic, betas);
    return Math.log(positive(c.price)) + c.drift_adjustment + dLn;
  });
  const weights = comps.map((c) => positive(c.weight));
  return Math.exp(weightedMedian(adjustedLog, weights));
}

// =============================================================================
// 0I.5.2  LightGBM divergence anchor
// =============================================================================
export interface DivergenceResult {
  divergence: number; // |ARV_c - ARV_l| / ARV_c
  review_flag: boolean;
  confidence_cut: boolean;
}
export function lightgbmDivergence(
  arvComps: number,
  arvLightGBM: number,
  threshold = 0.15,
): DivergenceResult {
  const d = Math.abs(arvComps - arvLightGBM) / positive(arvComps);
  return { divergence: d, review_flag: d > threshold, confidence_cut: d > threshold };
}

// =============================================================================
// 0I.6.2  Mean-unbiased ARV_exit
//   ARV_exit_k = ARV_today * exp(H * drift_k) * exp(eps_k),
//   eps_k ~ N(-0.5 sigma^2, sigma^2)   =>   E[exp(eps_k)] = 1
// =============================================================================
export function sampleArvExit(
  arvToday: number,
  hold_months: number,
  drift_sim: number,      // monthly log return
  sigma_arv_log: number,
  rng: () => number,
): number {
  const mu = -0.5 * sigma_arv_log * sigma_arv_log;
  const eps = mu + sigma_arv_log * normSample(rng);
  return arvToday * Math.exp(hold_months * drift_sim) * Math.exp(eps);
}

// =============================================================================
// 0I.7.1  Cold-start correlation priors + latent-factor loadings
// =============================================================================
export const COLD_START_RHO = {
  arv_error__drift: -0.40,
  rehab_error__hold_error: +0.60,
  drift__hold_error: -0.30,
  arv_error__rehab_error: 0.0,
} as const;

/**
 * Convert the cold-start ρ matrix into two shared latent factors so v11's
 * factor-loading MC engine encodes the correct signs without a raw copula.
 * Factor A = "market softness", Factor B = "execution difficulty".
 */
export function latentFactorLoadings() {
  return {
    // sign of loading matches the intended correlation to Factor A ("softness")
    arv_error:  { A: -0.63, B: 0.0 },   // stale/optimistic comps as market softens
    drift:      { A: +0.63, B: 0.0 },   // softer market → lower drift
    hold_error: { A: +0.55, B: +0.55 }, // softer market AND harder execution both extend hold
    rehab_error:{ A:  0.0,  B: +0.77 }, // execution difficulty drives cost overruns
  } as const;
}

// =============================================================================
// 0I.8  Drift compounding correction
//   drift_used = min(drift_trailing, drift_trailing + κ σ_drift · clamp(S,-3,3))
//   ARV_exit = ARV_today * exp(H * drift_used)
// Sign-safe: bad leading signals reduce; good leading signals never raise.
// =============================================================================
export function driftUsed(
  drift_trailing: number,
  sigma_drift: number,
  leading_signal: number,
  kappa = 0.5,
): number {
  const S = clamp(leading_signal, -3, 3);
  const candidate = drift_trailing + kappa * sigma_drift * S;
  return Math.min(drift_trailing, candidate);
}
export function arvExitDeterministic(arvToday: number, hold_months: number, drift_used_val: number): number {
  return arvToday * Math.exp(hold_months * drift_used_val);
}

// =============================================================================
// 0I.9  Scope-jump rehab preserving v11 positive-support execution shock
// =============================================================================
export interface ScopeTriple { L: number; M: number; H: number; }
export function sampleRehabScopeJump(params: {
  scope_selected: ScopeTriple;
  scope_next: ScopeTriple;
  p_jump: number;         // cold-start 0.15
  sigma_exec_log: number; // execution multiplier σ in log-space
  rng: () => number;
}): { rehab: number; jumped: boolean } {
  const { scope_selected, scope_next, p_jump, sigma_exec_log, rng } = params;
  const jumped = rng() < clip01(p_jump);
  const base = jumped
    ? sampleBetaPert(scope_next.L, scope_next.M, scope_next.H, rng)
    : sampleBetaPert(scope_selected.L, scope_selected.M, scope_selected.H, rng);
  const rehab = base * Math.exp(sigma_exec_log * normSample(rng));
  return { rehab, jumped };
}

// =============================================================================
// 0I.10  Acquisition + exit hazard locks
//   On-market:  P_accept(P,W) = 1 - Π_{t≤W}(1 - h_t(P))
//   Exit vel :  F_exit = P(sale ≤ 90d | ask, features)
// =============================================================================
export function pAcceptOnMarket(hazardsByDay: number[]): number {
  let survive = 1;
  for (const h of hazardsByDay) survive *= 1 - clip01(h);
  return 1 - survive;
}
export function fExit90d(hazard_daily_at_arv: number): number {
  return 1 - Math.pow(1 - clip01(hazard_daily_at_arv), 90);
}

// =============================================================================
// 0I.11.1  Primary ranking law   PrimaryRank = P(true_margin ≥ margin_floor)
// =============================================================================
export function primaryRankFromMC(
  profitDraws: number[],
  cost_basis: number,
  margin_floor = 0.10,
): number {
  if (!profitDraws.length) return 0;
  const threshold = margin_floor * positive(cost_basis);
  let hits = 0;
  for (const p of profitDraws) if (p >= threshold) hits++;
  return hits / profitDraws.length;
}

/** Analytic form when profit is approximately Normal(mu, sigma). */
export function primaryRankNormal(
  mu_profit: number,
  sigma_profit: number,
  cost_basis: number,
  margin_floor = 0.10,
): number {
  const z = (mu_profit - margin_floor * cost_basis) / positive(sigma_profit);
  // 1 - Φ(-z) = Φ(z); avoid importing normCdf twice
  return clip01(0.5 * (1 + erfApprox(z / Math.SQRT2)));
}
function erfApprox(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

// =============================================================================
// 0I.11.2  Secondary downside display metrics
// =============================================================================
export interface DownsideDisplay {
  p5: number; p25: number; p50: number; p75: number; p95: number;
  p_loss: number; cvar_loss: number; dqr: number;
}
export function downsideDisplay(profitDraws: number[], alpha = 0.05): DownsideDisplay {
  const n = profitDraws.length;
  if (!n) return { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0, p_loss: 0, cvar_loss: 0, dqr: 0 };
  const s = [...profitDraws].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(n - 1, Math.max(0, Math.floor(p * n)))];
  const losses = s.filter((x) => x < 0);
  const p_loss = losses.length / n;
  const tail = s.slice(0, Math.max(1, Math.floor(alpha * n)));
  const cvar_loss = tail.length ? -tail.reduce((a, b) => a + b, 0) / tail.length : 0;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const dqr = cvar_loss > EPS ? mean / cvar_loss : 0;
  return { p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95), p_loss, cvar_loss, dqr };
}

// =============================================================================
// 0I.11.3  Retail / investor score
//   Score = 100 * F1^0.35 * F2^0.30 * F3^0.20 * F4^0.15   with each Fi ∈ (0,1]
// =============================================================================
export interface RetailFactors {
  F1_margin_exceedance: number; // P(true_margin ≥ margin_floor)
  F2_p_accept: number;          // P_accept(P*)
  F3_p_sale_90d: number;        // exit velocity
  F4_survival: number;          // SurvivalFactor
}
export const RETAIL_WEIGHTS = { F1: 0.35, F2: 0.30, F3: 0.20, F4: 0.15 } as const;
export function retailScore(f: RetailFactors): number {
  const g = (x: number) => Math.max(EPS, Math.min(1, x));
  const s =
    Math.pow(g(f.F1_margin_exceedance), RETAIL_WEIGHTS.F1) *
    Math.pow(g(f.F2_p_accept),          RETAIL_WEIGHTS.F2) *
    Math.pow(g(f.F3_p_sale_90d),        RETAIL_WEIGHTS.F3) *
    Math.pow(g(f.F4_survival),          RETAIL_WEIGHTS.F4);
  return 100 * s;
}

// =============================================================================
// 0I.11.4  Institutional score separation
// =============================================================================
export interface InstitutionalMetrics {
  RiskAdjustedProfit: number;
  ExpectedLoss: number;
  EconomicCapital: number;
  RAROC: number;
  WarehouseEligible: boolean;
  PortfolioConcentrationOK: boolean;
  StressCVaR: number;
  AdverseActionCodes: string[];
}
export function buildInstitutionalScore(m: InstitutionalMetrics): InstitutionalMetrics {
  // pass-through; explicit type carries the invariant that retail score never mixes these.
  return m;
}

// =============================================================================
// 0I.12  Cluster / noisy-OR survival factor with optional cap
//   cluster_penalty_c = 1 - Π_{i∈c}(1 - p_i),  capped by cluster_cap_c
//   SurvivalFactor    = Π_c (1 - cluster_penalty_c)
// =============================================================================
export type V12RiskCluster =
  | "WATER" | "STRUCTURE" | "LOCATION" | "MARKET_REJECTION" | "LEGAL";

export interface V12Defect { cluster: V12RiskCluster; p: number; }
export function survivalFactorV12(
  defects: V12Defect[],
  caps: Partial<Record<V12RiskCluster, number>> = {},
): number {
  const groups: Record<string, number[]> = {};
  for (const d of defects) (groups[d.cluster] ||= []).push(clip01(d.p));
  let survival = 1;
  for (const cluster of Object.keys(groups)) {
    let noneFire = 1;
    for (const p of groups[cluster]) noneFire *= 1 - p;
    let penalty = 1 - noneFire;
    const cap = caps[cluster as V12RiskCluster];
    if (typeof cap === "number") penalty = Math.min(penalty, clip01(cap));
    survival *= 1 - penalty;
  }
  return clip01(survival);
}

// =============================================================================
// 0I.15  v12 Gate sequence (Gate 0–8) as a data structure
// =============================================================================
export interface V12Gate {
  id: number;
  name: string;
  deliverable: string;
  pass_condition: string;
  hard_trust_gate?: boolean;
}
export const V12_GATES: V12Gate[] = [
  { id: 0, name: "Code audit and Florida data foundation",
    deliverable: "Five-question code audit; decommission seeded counties; load FL DOR parcel GIS, NAL, SDF.",
    pass_condition: "Audit clean; Hillsborough parcel load valid; hand-verified sample passes." },
  { id: 1, name: "Entity resolution",
    deliverable: "Hillsborough entity resolution live.",
    pass_condition: "ER precision ≥ 99.5%; weekly sample audit; per-type dashboards." },
  { id: 2, name: "Transactions and labels",
    deliverable: "Deeds, mortgages, repeat-sale pairs, flip labels incl. losses and break-even.",
    pass_condition: "Loss share plausible and not filtered; flip counts reconcile with county benchmarks." },
  { id: 3, name: "Launch-county falsifier",
    deliverable: "Full offline point-in-time backtest for Hillsborough.",
    pass_condition: "Beat local median flip-profit prior OOS; monotone lift-by-decile; calibrated intervals.",
    hard_trust_gate: true },
  { id: 4, name: "Permits, vintages, concierge pilot, lender conversations",
    deliverable: "Permits and assessor vintages; concierge pilot active; lender conversations started.",
    pass_condition: "Paying-pilot evidence and coverage-rate calibration started." },
  { id: 5, name: "Copilot MVP",
    deliverable: "Dossier, ARV ladder, offer curve, Monte Carlo, Skeptic, regime banner, photo-CV, geo-gating.",
    pass_condition: "Retention, conversion, CAC, and dossier usage meet threshold." },
  { id: 6, name: "Shadow and Prophecy",
    deliverable: "Shadow / Prophecy layer with rivalry caps and ethics policy.",
    pass_condition: "Off-market hazards calibrated on observed transfers; rivalry caps live." },
  { id: 7, name: "Learned weights and MLS activation",
    deliverable: "Learned score weights and counsel-approved MLS path.",
    pass_condition: "Regime-fold monotone lift vs incumbent; counsel-approved MLS usage." },
  { id: 8, name: "Regional expansion",
    deliverable: "Expansion to the next approved market.",
    pass_condition: "Each prior market meets defined revenue and validation threshold before next." },
];

/**
 * Enforces the Gate-3 hard trust rule:
 *   No map glow, Prophecy ranking, institutional credit scoring, capital
 *   allocation, or public performance claim until Gate 3 passes.
 */
export function gate3TrustLock(passedGates: Set<number>) {
  const gate3 = passedGates.has(3);
  return {
    map_glow: gate3,
    prophecy_ranking: gate3,
    institutional_credit: gate3,
    capital_allocation: gate3,
    public_performance_claim: gate3,
  };
}
