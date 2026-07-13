/**
 * Perfect Property Engine — v11 Mathematical Canon
 * -------------------------------------------------
 * Faithful TypeScript implementation of the formulas defined in the master
 * spec (v11 Simulation / Prophecy / Accuracy / Guardrails Merge).
 *
 * Section headers map 1:1 to the spec so audits are trivial:
 *   0H.10.1  safe primitives
 *   0E.3.1   comp pre-filter (MAD)
 *   0E.3.2   distance / time / similarity / boundary weights
 *   0H.10.2  degenerate comp guard
 *   0E.3.3   log-hedonic comp adjustment
 *   0E.3.4   ARV point + conformal log-space interval
 *   0H.10.3  log-space ARV uncertainty
 *   0E.3.5   bimodality / dual value ladders
 *   0E.3.6   sign-safe conservative drift + Bayesian posterior
 *   0E.3.7   PERT rehab + non-crossing enforcement
 *   0H.4     scope-jump + positive-support execution shock
 *   0E.3.8   acquisition probability (competing-risk hazards)
 *   0E.3.9   Cox exit velocity
 *   0E.3.10  clustered noisy-OR survival / Skeptic
 *   0E.3.11  inverse-variance Governor + exceedance rank
 *   0H.10.4  governor posterior variance
 *   0H.3     latent-factor Monte Carlo
 *   0H.5     profit draw (P5/P50/P95, CVaR, DQR)
 *   0H.6     stress scenarios (clipped PD/LGD)
 *   0H.7     portfolio loss (positive-loss convention)
 *   0H.10.5  safe score composition (weighted geometric mean)
 *   0H.10.6  credit formulas (NetRecovery, LGD, EL, RAP)
 *   0H.10.7  capital formulas (EL, VaR, CVaR, EC, RAROC)
 *   0H.8     Prophecy pre-distress label + hazard
 *   0H.9.1   isotonic / Platt calibration
 *   0H.9.4   regime downturn detector
 *   0H.9.5   PSI + bin-weighted calibration error
 *
 * REJECTED as written by the spec and NOT implemented:
 *   - log-dollar safe score
 *   - dollar-scale sigma_ARV inside the lognormal MC engine
 *   - unclipped stress PD/LGD
 *   - portfolio loss defined as profit
 *   - calibration_error = Sum(p-o)^2 / n_b
 */

// =============================================================================
// 0H.10.1  Safe primitives
// =============================================================================
export const EPS = 1e-9;

export const ln_safe = (x: number) => Math.log(Math.max(x, EPS));
export const sqrt_safe = (v: number) => Math.sqrt(Math.max(v, 0));
// Sign-preserving: clamp denom in the SAME direction as b so div_safe(1, -2) = -0.5, not +0.5.
export const div_safe = (a: number, b: number) =>
  a / (b === 0 ? EPS : b >= 0 ? Math.max(b, EPS) : Math.min(b, -EPS));
export const clip01 = (p: number) => Math.min(1, Math.max(0, p));
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const positive = (x: number) => Math.max(x, EPS);

// Standard normal cdf (Abramowitz–Stegun 7.1.26)
export function normCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}
// Standard normal inverse (Beasley-Springer/Moro)
export function normInv(p: number): number {
  const q = clamp(p, 1e-12, 1 - 1e-12);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
             1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
             6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
             -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
             3.754408661907416];
  const plow = 0.02425, phigh = 1 - plow;
  let x: number;
  if (q < plow) {
    const u = Math.sqrt(-2 * Math.log(q));
    x = (((((c[0]*u+c[1])*u+c[2])*u+c[3])*u+c[4])*u+c[5]) /
        ((((d[0]*u+d[1])*u+d[2])*u+d[3])*u+1);
  } else if (q <= phigh) {
    const u = q - 0.5, r = u * u;
    x = (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*u /
        (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    const u = Math.sqrt(-2 * Math.log(1 - q));
    x = -(((((c[0]*u+c[1])*u+c[2])*u+c[3])*u+c[4])*u+c[5]) /
        ((((d[0]*u+d[1])*u+d[2])*u+d[3])*u+1);
  }
  return x;
}
// Seeded RNG so simulations are reproducible per parcel.
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}
export function normSample(rng: () => number): number {
  // Box–Muller
  const u = Math.max(rng(), EPS), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// =============================================================================
// 0E.3.1  Comp pre-filter (raw MAD; single-scaled)
// =============================================================================
export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}

// Type-7 quantile (linear interpolation, default in numpy/R/Excel).
// Replaces the old floor((p*n)) convention that was systematically 0.5&ndash;1 draw high.
// h = (n-1)*p;     result = sorted[&lfloor;h&rfloor;] + (h&minus;&lfloor;h&rfloor;)*(sorted[&lceil;h&rceil;]-sorted[&lfloor;h&rfloor;])
export function quantileInterp(sorted: number[], p: number, n: number = sorted.length): number {
  if (!n) return 0;
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}
export function madFilterIndices(adjPrice: number[], threshold = 3): number[] {
  if (adjPrice.length === 0) return [];
  const med = median(adjPrice);
  const madRaw = median(adjPrice.map((x) => Math.abs(x - med)));
  if (madRaw === 0) return adjPrice.map((_, i) => i); // duplicates dominate → keep all
  return adjPrice
    .map((x, i) => ({ i, z: (0.67448975 * (x - med)) / madRaw }))
    .filter((r) => Math.abs(r.z) <= threshold)
    .map((r) => r.i);
}

// =============================================================================
// 0E.3.2  Distance / time / similarity / boundary weights
// =============================================================================
export interface CompWeightInputs {
  distance_mi: number;
  age_days: number;
  adj_ln_price_gap: number; // |ln(adj_price_i) - ln(median)|
  same_school_zone?: boolean;
  same_highway_side?: boolean;
  same_flood_class?: boolean;
  same_hazard_class?: boolean;
}
export function compWeight(w: CompWeightInputs): number {
  const wDist = Math.exp(-Math.LN2 * w.distance_mi / 0.5);          // half-weight @ 0.5mi
  const wTime = Math.exp(-Math.LN2 * w.age_days / 90);              // half-weight @ 90d
  const wSim  = Math.max(0, 1 - Math.abs(w.adj_ln_price_gap) / 0.25);
  const wBound = (w.same_school_zone === false ? 0.50 : 1)
               * (w.same_highway_side === false ? 0.60 : 1)
               * (w.same_flood_class === false ? 0.70 : 1)
               * (w.same_hazard_class === false ? 0.70 : 1);
  return wDist * wTime * wSim * wBound;
}
export function effectiveN(weights: number[]): number {
  const s1 = weights.reduce((a, b) => a + b, 0);
  const s2 = weights.reduce((a, b) => a + b * b, 0);
  return s2 > 0 ? (s1 * s1) / s2 : 0;
}

// =============================================================================
// 0H.10.2  Degenerate comp guard
// =============================================================================
export function degenerateGuard(weights: number[], tier: 1 | 2 | 3 = 1):
  { ok: true } | { ok: false; reason: string } {
  const nEff = effectiveN(weights);
  if (nEff < 3) return { ok: false, reason: `n_eff=${nEff.toFixed(2)} < 3` };
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW < 0.5 && tier === 3) return { ok: false, reason: `sum(w)=${sumW.toFixed(2)} < 0.5 for tier 3` };
  return { ok: true };
}

// =============================================================================
// 0E.3.3  Log-hedonic comp adjustment
// =============================================================================
export interface HedonicSubject { sqft: number; beds: number; baths: number; garage: number; lot: number; age: number; }
export interface HedonicBetas {
  bed: number; bath: number; garage: number; age: number;
  // sqft & lot use log-transformed levels (linear coefficient on the log)
  ln_sqft: number; ln_lot: number;
}
export function hedonicAdjustLog(
  compLogPrice: number,
  comp: HedonicSubject,
  subject: HedonicSubject,
  b: HedonicBetas,
  driftTerm = 0,
  boundaryPenaltyLog = 0,
): number {
  return compLogPrice
    + b.ln_sqft * (Math.log(positive(subject.sqft)) - Math.log(positive(comp.sqft)))
    + b.ln_lot  * (Math.log(positive(subject.lot))  - Math.log(positive(comp.lot)))
    + b.bed     * (subject.beds - comp.beds)
    + b.bath    * (subject.baths - comp.baths)
    + b.garage  * (subject.garage - comp.garage)
    + b.age     * (subject.age - comp.age)
    + boundaryPenaltyLog
    + driftTerm;
}

// =============================================================================
// 0E.3.4  ARV point (weighted median) + split-conformal log-space interval
// =============================================================================
export function weightedMedian(values: number[], weights: number[]): number {
  // Return the weight-carrying median; for even-N splits, linearly interpolate
  // between the two straddling values (was picking lower, now unbiased).
  const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const W = weights.reduce((a, b) => a + b, 0);
  if (W <= 0) return values.length ? values[0] : 0;
  let acc = 0;
  for (let k = 0; k < idx.length; k++) {
    const w = weights[idx[k]];
    if (w <= 0) continue;
    acc += w;
    // If we have straddled the 50% mark exactly AND have a next value,
    // interpolate between the current and the next.
    if (acc === W / 2 && k + 1 < idx.length) {
      return 0.5 * (values[idx[k]] + values[idx[k + 1]]);
    }
    if (acc >= W / 2) return values[idx[k]];
  }
  return values[idx[idx.length - 1]];
}
export function conformalLogInterval(
  arvPoint: number,
  calibrationAbsLogResiduals: number[],
  alpha = 0.20, // 80% interval
): { lower: number; upper: number; q_log: number } {
  const m = calibrationAbsLogResiduals.length;
  if (m === 0) return { lower: arvPoint, upper: arvPoint, q_log: 0 };
  const k = Math.ceil((m + 1) * (1 - alpha));
  const sorted = [...calibrationAbsLogResiduals].sort((a, b) => a - b);
  const q = sorted[Math.min(k - 1, m - 1)];
  return { lower: arvPoint * Math.exp(-q), upper: arvPoint * Math.exp(q), q_log: q };
}

// =============================================================================
// 0H.10.3  Log-space ARV uncertainty
// =============================================================================
export function sigmaArvLog(params: {
  sigmaLogDisp: number;   // dispersion of ln(adj_price) across kept comps
  nEff: number;
  sigmaSysLogBacktest: number; // may be 0 for cold-start markets
}): number {
  const sigmaSys = Math.max(params.sigmaSysLogBacktest, 0.08); // cold-start floor
  const v = (params.sigmaLogDisp * params.sigmaLogDisp) / Math.max(params.nEff, 1)
          + sigmaSys * sigmaSys;
  return sqrt_safe(v);
}

// =============================================================================
// 0E.3.6  Sign-safe conservative drift + Bayesian posterior
// =============================================================================
export function bayesDrift(prior: { mu: number; sigma: number }, trailing: { mu: number; sigma: number }) {
  const wp = 1 / (prior.sigma * prior.sigma);
  const wt = 1 / (trailing.sigma * trailing.sigma);
  const mu = (prior.mu * wp + trailing.mu * wt) / (wp + wt);
  const sigma = Math.sqrt(1 / (wp + wt));
  return { mu, sigma };
}
export function conservativeDrift(
  post: { mu: number; sigma: number },
  leadingSignal: number, // pre-clamped z composite
  kappa = 0.5,
): number {
  const LS = clamp(leadingSignal, -3, 3);
  const candidate = post.mu + kappa * post.sigma * LS;
  return Math.min(post.mu, candidate); // rejects multiplicative sign flip
}

// =============================================================================
// 0E.3.7  PERT rehab (non-crossing enforced) + 0H.4 scope-jump / execution shock
// =============================================================================
export function pertSummary(L_hat: number, M_hat: number, H_hat: number) {
  const sorted = [L_hat, M_hat, H_hat].sort((a, b) => a - b);
  const [L, M, H] = sorted;
  return { L, M, H, mean: (L + 4 * M + H) / 6, sd: (H - L) / 6 };
}
// Beta-PERT sampler (Vose formulation), positive-support.
export function sampleBetaPert(L: number, M: number, H: number, rng: () => number, lambda = 4): number {
  if (H <= L) return M;
  const alpha = 1 + lambda * (M - L) / (H - L);
  const beta  = 1 + lambda * (H - M) / (H - L);
  // Beta(alpha,beta) via two gammas (Marsaglia-Tsang)
  const a = sampleGamma(alpha, rng);
  const b = sampleGamma(beta, rng);
  const x = a / (a + b);
  return L + x * (H - L);
}
function sampleGamma(shape: number, rng: () => number): number {
  if (shape < 1) return sampleGamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = normSample(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
export function sampleRehab(params: {
  scope: { L: number; M: number; H: number };
  scopeNext?: { L: number; M: number; H: number };
  pJump: number;               // Bernoulli scope-jump prob (0.15 prior)
  sigmaLogExec: number;        // multiplicative execution shock
  rng: () => number;
  zExec?: number;              // pre-drawn shared execution factor
}): number {
  const j = params.rng() < params.pJump && params.scopeNext ? 1 : 0;
  const from = j ? params.scopeNext! : params.scope;
  const base = sampleBetaPert(from.L, from.M, from.H, params.rng);
  const zExec = params.zExec ?? normSample(params.rng);
  return base * Math.exp(params.sigmaLogExec * zExec);
}

// =============================================================================
// 0E.3.9  Cox exit velocity — median hold from baseline hazard
// =============================================================================
export function coxMedianHoldDays(baseline_H0_at_t50: number, betaX: number): number {
  // Solve H_0(t50) = ln(2) * exp(-beta X)  →  interpolate on baseline table.
  // Caller supplies H_0(t) baseline; here we take the target value.
  const target = Math.LN2 * Math.exp(-betaX);
  // If caller gave H_0 evaluated at their guess for t50, we return the input as-is.
  return baseline_H0_at_t50 > 0 ? target / baseline_H0_at_t50 * 30 : 30;
}
export function exitFactor(medianHoldDays: number, tauExitDays = 30): number {
  return Math.exp(-medianHoldDays / tauExitDays);
}
// Fallback sampler when Cox baseline is unavailable.
export function sampleHoldMonthsFallback(params: {
  base: number; sigmaExec: number; sigmaMarket: number;
  zExec: number; zMarket: number; floor?: number;
}): number {
  return Math.max(
    params.floor ?? 0.5,
    params.base + params.sigmaExec * params.zExec - params.sigmaMarket * params.zMarket,
  );
}

// =============================================================================
// 0E.3.10  Clustered noisy-OR Skeptic
// =============================================================================
export type RiskCluster = "WATER" | "STRUCTURE" | "LOCATION" | "MARKET_REJECTION" | "LEGAL" | "DATA_QUALITY";
export interface DefectProb { cluster: RiskCluster; p: number; }
export function skepticFactor(defects: DefectProb[], suspiciousMarginZ = 0, lambda = 0.35): number {
  const byCluster = new Map<RiskCluster, number[]>();
  for (const d of defects) {
    if (!byCluster.has(d.cluster)) byCluster.set(d.cluster, []);
    byCluster.get(d.cluster)!.push(clip01(d.p));
  }
  let S_base = 1;
  for (const ps of byCluster.values()) {
    const clusterPenalty = 1 - ps.reduce((acc, p) => acc * (1 - p), 1);
    S_base *= (1 - clusterPenalty);
  }
  const zMargin = Math.max(0, suspiciousMarginZ);
  return clamp(S_base * Math.exp(-lambda * zMargin), EPS, 1);
}

// =============================================================================
// 0E.3.11 / 0H.10.4  Governor + exceedance rank
// =============================================================================
export function governorMargin(mu_model: number, sigma_model: number, mu_market: number, sigma_market: number) {
  const vm = Math.max(sigma_market * sigma_market, 1e-6);
  const vv = Math.max(sigma_model * sigma_model, 1e-6);
  const kappa_model = clamp(vm / (vm + vv), 0, 1);
  const mu = kappa_model * mu_model + (1 - kappa_model) * mu_market;
  const sigma = Math.sqrt(1 / (1 / vv + 1 / vm));
  return { mu, sigma, kappa_model };
}
export function exceedanceRank(mu_governed: number, sigma_posterior: number, sigma_execution: number, margin_floor: number) {
  const sigma_rank = Math.sqrt(sigma_posterior * sigma_posterior + sigma_execution * sigma_execution);
  return 1 - normCdf((margin_floor - mu_governed) / Math.max(sigma_rank, EPS));
}

// =============================================================================
// 0H.3 / 0H.5  Latent-factor Monte Carlo + profit draw
// =============================================================================
export interface MCInputs {
  arv_today: number;
  drift_used_monthly: number;   // log units, sign-safe
  sigma_arv_log: number;
  purchase_price: number;
  rehab_scope: { L: number; M: number; H: number };
  rehab_scope_next?: { L: number; M: number; H: number };
  p_jump: number;
  sigma_rehab_log_exec: number;
  hold_base_months: number;
  sigma_hold_exec: number;
  sigma_hold_market: number;
  hold_floor_months: number;
  carry_rate_annual: number;    // e.g. 0.11
  fixed_carry: number;          // insurance/utils lump
  selling_cost_pct: number;     // e.g. 0.06
  loan_cost_of: (loanBase: number, holdMonths: number) => number;
  other_costs: number;
  n_draws: number;
  seed?: number;
}
export interface MCResults {
  P_loss: number;
  profit_p5: number; profit_p50: number; profit_p95: number;
  expected_profit: number;
  cvar_loss_05: number;
  dqr: number | null;
  arv_exit_p50: number;
  hold_p50_months: number;
  rehab_p50: number;
  /** Raw per-draw arrays. Populated only when `return_draws` is set. */
  draws?: { profits: number[]; arvExits: number[]; holds: number[]; rehabs: number[] };
}
export function runMonteCarlo(m: MCInputs & { return_draws?: boolean }): MCResults {
  const rng = makeRng(m.seed ?? 1);
  const profits: number[] = new Array(m.n_draws);
  const arvExits: number[] = new Array(m.n_draws);
  const holds: number[] = new Array(m.n_draws);
  const rehabs: number[] = new Array(m.n_draws);
  for (let k = 0; k < m.n_draws; k++) {
    const Zm = normSample(rng);
    const Ze = normSample(rng);
    const holdMonths = sampleHoldMonthsFallback({
      base: m.hold_base_months, sigmaExec: m.sigma_hold_exec, sigmaMarket: m.sigma_hold_market,
      zExec: Ze, zMarket: Zm, floor: m.hold_floor_months,
    });
    // Exit-date ARV — spec 0H.3.2
    const arvExit = m.arv_today
      * Math.exp(holdMonths * m.drift_used_monthly)
      * Math.exp(m.sigma_arv_log * Zm);
    const rehab = sampleRehab({
      scope: m.rehab_scope, scopeNext: m.rehab_scope_next,
      pJump: m.p_jump, sigmaLogExec: m.sigma_rehab_log_exec,
      rng, zExec: Ze,
    });
    const carry = m.purchase_price * m.carry_rate_annual * (holdMonths / 12) + m.fixed_carry;
    const selling = arvExit * m.selling_cost_pct;
    const loan = m.loan_cost_of(m.purchase_price + rehab, holdMonths);
    const profit = arvExit - m.purchase_price - rehab - carry - selling - loan - m.other_costs;
    profits[k] = profit; arvExits[k] = arvExit; holds[k] = holdMonths; rehabs[k] = rehab;
  }
  const sorted = [...profits].sort((a, b) => a - b);
  const q = (p: number) => quantileInterp(sorted, p);  // type-7 interpolated (was floor bias)
  const meanProfit = profits.reduce((a, b) => a + b, 0) / profits.length;
  const P_loss = profits.filter((p) => p < 0).length / profits.length;
  const tail = sorted.filter((p) => p <= q(0.05));
  const cvar_loss = tail.length ? -tail.reduce((a, b) => a + b, 0) / tail.length : 0;
  return {
    P_loss,
    profit_p5: q(0.05), profit_p50: q(0.50), profit_p95: q(0.95),
    expected_profit: meanProfit,
    cvar_loss_05: Math.max(0, cvar_loss),
    dqr: cvar_loss > EPS ? meanProfit / cvar_loss : null,
    arv_exit_p50: median(arvExits),
    hold_p50_months: median(holds),
    rehab_p50: median(rehabs),
    ...(m.return_draws ? { draws: { profits, arvExits, holds, rehabs } } : {}),
  };
}


// =============================================================================
// 0H.10.5  Safe score composition — weighted geometric mean of unit factors
// =============================================================================
export interface ScoreFactors {
  F_profit: number; F_acq: number; F_exit: number; F_surv: number;
  F_conf: number; F_gov: number;
}
export interface ScoreWeights {
  profit: number; acq: number; exit: number; surv: number; conf: number; gov: number;
}
export interface HardGates {
  profit_p5: number; loss_floor: number;
  p_loss: number; loss_prob_ceiling: number;
  confidence: number; confidence_floor: number;
  er_confidence?: number; er_floor?: number;
  legal_block?: boolean;
}
export function safeScore(f: ScoreFactors, wIn: ScoreWeights, gates: HardGates):
  { score: number; rejected: false } | { score: 0; rejected: true; reason: string } {
  if (gates.legal_block) return { score: 0, rejected: true, reason: "legal/compliance block" };
  if (gates.profit_p5 < gates.loss_floor) return { score: 0, rejected: true, reason: "profit_p5 below floor" };
  if (gates.p_loss > gates.loss_prob_ceiling) return { score: 0, rejected: true, reason: "P(loss) above ceiling" };
  if (gates.confidence < gates.confidence_floor) return { score: 0, rejected: true, reason: "confidence below floor" };
  if (gates.er_confidence != null && gates.er_floor != null && gates.er_confidence < gates.er_floor)
    return { score: 0, rejected: true, reason: "entity-resolution confidence below floor" };

  const wsum = wIn.profit + wIn.acq + wIn.exit + wIn.surv + wIn.conf + wIn.gov;
  const w = {
    profit: wIn.profit / wsum, acq: wIn.acq / wsum, exit: wIn.exit / wsum,
    surv: wIn.surv / wsum, conf: wIn.conf / wsum, gov: wIn.gov / wsum,
  };
  const s = 100 * Math.exp(
      w.profit * ln_safe(f.F_profit) + w.acq * ln_safe(f.F_acq) + w.exit * ln_safe(f.F_exit)
    + w.surv * ln_safe(f.F_surv) + w.conf * ln_safe(f.F_conf) + w.gov * ln_safe(f.F_gov)
  );
  return { score: clamp(s, 0, 100), rejected: false };
}

// =============================================================================
// 0H.10.6  Credit formulas
// =============================================================================
export interface CreditInputs {
  liquidation_value: number;
  foreclosure_cost: number;
  liquidation_carry_cost: number;
  senior_claims: number;
  ead: number;
  pd_credit: number;
}
export function creditLossMetrics(c: CreditInputs) {
  const netRecovery = c.liquidation_value - c.foreclosure_cost - c.liquidation_carry_cost - c.senior_claims;
  const lgd = clamp(1 - netRecovery / Math.max(c.ead, EPS), 0, 1);
  const el = c.pd_credit * lgd * c.ead;
  return { net_recovery: netRecovery, lgd, el };
}
export function riskAdjustedProfit(e_profit_no_default: number, el: number, capital_charge: number, liquidity_charge: number) {
  return e_profit_no_default - el - capital_charge - liquidity_charge;
}

// =============================================================================
// 0H.10.7  Capital formulas (positive-loss convention)
// =============================================================================
export function portfolioCapital(pnlDraws: number[], alpha = 0.05, expectedNetIncomeExclEL: number, addOns: number[] = []) {
  const losses = pnlDraws.map((pnl) => Math.max(0, -pnl)).map((l, i) => l + (addOns[i] ?? 0));
  const sortedL = [...losses].sort((a, b) => a - b);
  const el = losses.reduce((a, b) => a + b, 0) / losses.length;
  const varIdx = Math.max(0, Math.ceil((1 - alpha) * sortedL.length) - 1);
  const varA = sortedL[varIdx];
  const tail = losses.filter((l) => l >= varA);
  const cvar = tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : varA;
  const ec = Math.max(0, cvar - el);
  const raroc = (expectedNetIncomeExclEL - el) / Math.max(ec, EPS);
  return { el, var_alpha: varA, cvar_alpha: cvar, ec, raroc };
}

// =============================================================================
// 0H.6  Stress simulation (clipped PD/LGD)
// =============================================================================
export interface StressShock {
  arv_return: number;         // e.g. -0.20
  rehab_multiplier: number;   // e.g. 1.30
  hold_additive_months?: number;
  hold_multiplier?: number;
  pd_multiplier: number;
  lgd_multiplier: number;
  financing_available?: boolean;
}
export function stressExpectedProfit(base: {
  profit_success: number; pd: number; lgd: number; ead: number;
}, s: StressShock) {
  const pdS = clamp(base.pd * s.pd_multiplier, 0, 1);
  const lgdS = clamp(base.lgd * s.lgd_multiplier, 0, 1);
  const eligible = s.financing_available !== false;
  const success = eligible ? base.profit_success : 0; // funding-gap path
  return (1 - pdS) * success - pdS * lgdS * base.ead;
}

// =============================================================================
// 0H.8  Prophecy — pre-distress 90-day filing hazard
// =============================================================================
export function prophecy90dHazard(baseline_H_90d: number, betaX: number): number {
  // P(filing ≤ 90d | X) = 1 - S(90d)^exp(betaX), with S(90d) = exp(-H_0(90))
  const S0 = Math.exp(-baseline_H_90d);
  return clip01(1 - Math.pow(S0, Math.exp(betaX)));
}

// =============================================================================
// 0H.9.1  Isotonic / Platt calibration
// =============================================================================
export function plattCalibrate(rawScores: number[], y: number[], lr = 0.1, iters = 200):
  { a: number; b: number; predict: (raw: number) => number } {
  let a = 1, b = 0;
  for (let it = 0; it < iters; it++) {
    let gA = 0, gB = 0;
    for (let i = 0; i < rawScores.length; i++) {
      const z = a * rawScores[i] + b;
      const p = 1 / (1 + Math.exp(-z));
      gA += (p - y[i]) * rawScores[i];
      gB += (p - y[i]);
    }
    a -= (lr * gA) / rawScores.length;
    b -= (lr * gB) / rawScores.length;
  }
  return { a, b, predict: (raw) => 1 / (1 + Math.exp(-(a * raw + b))) };
}
// Pool-Adjacent-Violators isotonic regression (monotone increasing).
export function isotonicFit(xs: number[], ys: number[]): (x: number) => number {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const x = idx.map((i) => xs[i]);
  const y = idx.map((i) => ys[i]);
  const w = new Array(y.length).fill(1);
  const v = [...y];
  let i = 0;
  while (i < v.length - 1) {
    if (v[i] > v[i + 1]) {
      const nw = w[i] + w[i + 1];
      const nv = (v[i] * w[i] + v[i + 1] * w[i + 1]) / nw;
      v.splice(i, 2, nv); w.splice(i, 2, nw); x.splice(i + 1, 1);
      if (i > 0) i--;
    } else i++;
  }
  return (q: number) => {
    if (q <= x[0]) return v[0];
    if (q >= x[x.length - 1]) return v[v.length - 1];
    let lo = 0, hi = x.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] <= q) lo = m; else hi = m; }
    const t = (q - x[lo]) / Math.max(x[hi] - x[lo], EPS);
    return v[lo] + t * (v[hi] - v[lo]);
  };
}

// =============================================================================
// 0H.9.4  Regime downturn detector
// =============================================================================
export interface RegimeInputs {
  z_delta_dom_3mo: number;
  z_delta_inv_3mo: number;
  z_delta_pending_active_3mo: number;
  z_delta_price_cut_freq_3mo: number;
  w_dom?: number; w_inv?: number; w_pa?: number; w_cut?: number;
}
export function phiDownturn(r: RegimeInputs, ema_prior = 0): { M: number; phi: number; ema: number } {
  const M = (r.w_dom ?? 1) * r.z_delta_dom_3mo
          + (r.w_inv ?? 1) * r.z_delta_inv_3mo
          - (r.w_pa ?? 1) * r.z_delta_pending_active_3mo
          + (r.w_cut ?? 1) * r.z_delta_price_cut_freq_3mo;
  const ema = 0.5 * ema_prior + 0.5 * M;
  const phi = 1 / (1 + Math.exp(-ema));
  return { M, phi, ema };
}

// =============================================================================
// 0H.9.5  PSI + bin-weighted calibration error
// =============================================================================
export function psi(expected: number[], actual: number[], bins = 10): number {
  const all = [...expected, ...actual].sort((a, b) => a - b);
  const cuts: number[] = [];
  for (let i = 1; i < bins; i++) cuts.push(all[Math.floor((i / bins) * all.length)]);
  const bucket = (arr: number[]) => {
    const counts = new Array(bins).fill(0);
    for (const v of arr) {
      let b = 0;
      while (b < cuts.length && v > cuts[b]) b++;
      counts[b]++;
    }
    return counts.map((c) => Math.max(c / arr.length, 1e-6));
  };
  const e = bucket(expected), a = bucket(actual);
  return e.reduce((s, ei, i) => s + (a[i] - ei) * Math.log(a[i] / ei), 0);
}
export function calibrationError(bins: Array<{ n: number; p: number; o: number }>, N: number): number {
  return bins.reduce((s, b) => s + (b.n / N) * (b.p - b.o) * (b.p - b.o), 0);
}
