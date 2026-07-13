/**
 * THE PERFECT PROPERTY FORMULA
 *
 * Pure functions. Given a parcel + its distress + comps, produce the full underwrite:
 * value ladder, offer curve, acquisition probability, exit velocity, skeptic verdict,
 * governor-tempered Perfect Score.
 *
 * These are the exact primitives Layer 2 (Valuation Brain) and Layer 3 (Formula)
 * are built from. Everything the machine promises rides on this file.
 */

export type Scope = "COSMETIC" | "FULL" | "EXPANDED";
export type Ring = 1 | 2 | 3;

export interface ParcelInput {
  living_sqft: number | null;
  lot_sqft: number | null;
  year_built: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  condition_grade: string | null; // A | B | C | D
  flood_zone: string | null;
  school_score: number | null;
  assessed_value: number | null;
  estimated_equity: number | null;
  owner_is_absentee: boolean;
  owner_since: string | null;
  is_listed: boolean;
  is_vacant: boolean;
  state: string;
}

export interface DistressInput {
  event_type: string;
  severity: number;
  amount: number | null;
  event_date: string;
  auction_date: string | null;
}

export interface MarketContext {
  median_ppsf: number; // renovated $/sqft in the micro-market
  ppsf_stddev: number;
  avg_dom_renovated: number; // days
  pending_ratio: number; // 0..1  (leading edge)
  momentum: number; // -1..1
}

// ---------------------------------------------------------------------------
// Value ladder — ARV at each renovation scope
// ---------------------------------------------------------------------------
export interface Comp {
  ppsf: number;
  distance_km?: number;
  sale_id?: string;
  address?: string | null;
  sold_at?: string;
  sale_price?: number;
  living_sqft?: number | null;
}

// Trimmed mean of comp $/sqft (drop hi/lo when >= 5 comps).
function trimmedMeanPpsf(comps: Comp[]): number | null {
  const vals = comps
    .map((c) => Number(c.ppsf))
    .filter((v) => Number.isFinite(v) && v > 20 && v < 4000)
    .sort((a, b) => a - b);
  if (vals.length < 3) return null;
  const cut = vals.length >= 5 ? 1 : 0;
  const kept = vals.slice(cut, vals.length - cut);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

export function computeValueLadder(p: ParcelInput, m: MarketContext, comps: Comp[] = []) {
  const sqft = p.living_sqft ?? 1200;
  const cond = conditionMultiplier(p.condition_grade);
  const loc = locationMultiplier(p);

  const compPpsf = trimmedMeanPpsf(comps);
  const marketPpsf = compPpsf ?? m.median_ppsf;
  const arvSource: "COMPS" | "HEURISTIC" = compPpsf != null ? "COMPS" : "HEURISTIC";

  // When comps are available, drop the conservative "market" fudge — comp mean IS the market.
  const asIsPpsf = marketPpsf * (compPpsf != null ? 0.72 : 0.62) * cond * loc;
  const cosmeticPpsf = marketPpsf * (compPpsf != null ? 0.98 : 0.92) * loc;
  const fullPpsf = marketPpsf * (compPpsf != null ? 1.06 : 1.02) * loc;
  const expandedPpsf = marketPpsf * (compPpsf != null ? 1.15 : 1.12) * loc;

  return {
    as_is_value: round(asIsPpsf * sqft),
    cosmetic_arv: round(cosmeticPpsf * sqft),
    full_reno_arv: round(fullPpsf * sqft),
    expanded_arv: round(expandedPpsf * sqft),
    market_ppsf: round(marketPpsf),
    arv_source: arvSource,
    comp_count: compPpsf != null ? comps.length : 0,
  };
}

function conditionMultiplier(c: string | null) {
  switch (c) {
    case "A":
      return 1.08;
    case "B":
      return 1.0;
    case "C":
      return 0.88;
    case "D":
      return 0.72;
    default:
      return 0.94;
  }
}
function locationMultiplier(p: ParcelInput) {
  const school = (p.school_score ?? 5) / 10; // 0..1
  const flood = p.flood_zone && ["AE", "VE", "A"].includes(p.flood_zone) ? -0.08 : 0;
  return 0.92 + school * 0.16 + flood;
}

// ---------------------------------------------------------------------------
// Renovation cost — per scope, per sqft, by state cost band
// ---------------------------------------------------------------------------
export function computeRenoCost(p: ParcelInput, scope: Scope): number {
  const sqft = p.living_sqft ?? 1200;
  const stateBand = ["CA"].includes(p.state) ? 1.35 : 1.0; // FL baseline
  const per: Record<Scope, number> = {
    COSMETIC: 22,
    FULL: 58,
    EXPANDED: 105,
  };
  const conditionMult = p.condition_grade === "D" ? 1.25 : p.condition_grade === "C" ? 1.1 : 1.0;
  return round(per[scope] * sqft * stateBand * conditionMult);
}

export function recommendedScope(p: ParcelInput): Scope {
  if (p.condition_grade === "D") return "FULL";
  if (p.condition_grade === "C") return "FULL";
  if ((p.living_sqft ?? 0) < 900 && (p.lot_sqft ?? 0) > 6000) return "EXPANDED";
  return "COSMETIC";
}

export function arvForScope(ladder: ReturnType<typeof computeValueLadder>, scope: Scope) {
  return scope === "COSMETIC"
    ? ladder.cosmetic_arv
    : scope === "FULL"
      ? ladder.full_reno_arv
      : ladder.expanded_arv;
}

// ---------------------------------------------------------------------------
// Acquisition gravity — probability the owner sells at the modeled offer
// ---------------------------------------------------------------------------
export function computeAcquisition(p: ParcelInput, distress: DistressInput[], asIs: number) {
  let base = p.is_listed ? 0.28 : 0.04;
  const flags: string[] = [];
  const discountFromAsIs: number[] = [0]; // start from as-is

  for (const d of distress) {
    switch (d.event_type) {
      case "FORECLOSURE_NOD":
        base += 0.32;
        discountFromAsIs.push(0.18);
        flags.push("Foreclosure NOD filed");
        break;
      case "AUCTION_SCHEDULED":
        base += 0.45;
        discountFromAsIs.push(0.28);
        flags.push("Auction scheduled");
        break;
      case "TAX_LIEN":
        base += 0.14;
        discountFromAsIs.push(0.09);
        break;
      case "PROBATE":
        base += 0.22;
        discountFromAsIs.push(0.14);
        break;
      case "CODE_VIOLATION":
        base += 0.09;
        discountFromAsIs.push(0.06);
        break;
      case "VACANCY":
        base += 0.11;
        discountFromAsIs.push(0.07);
        break;
    }
  }
  if (p.owner_is_absentee) base += 0.06;
  if (p.is_vacant) base += 0.05;

  const acquisition_probability = clamp(base, 0.02, 0.92);
  const discount = Math.max(...discountFromAsIs);
  const modeled_offer = round(asIs * (1 - discount) * (p.is_listed ? 0.94 : 0.86));
  return { acquisition_probability, modeled_offer, motivationFlags: flags };
}

// ---------------------------------------------------------------------------
// Exit velocity
// ---------------------------------------------------------------------------
export function computeExit(m: MarketContext) {
  const base = m.avg_dom_renovated;
  const adj = base * (1 - m.pending_ratio * 0.35) * (1 - m.momentum * 0.15);
  const exit_days = Math.max(14, Math.round(adj));
  const exit_confidence = clamp(0.55 + m.pending_ratio * 0.35 + m.momentum * 0.1, 0.4, 0.95);
  return { exit_days, exit_confidence };
}

// ---------------------------------------------------------------------------
// The Skeptic — hunts for what the market already knows
// ---------------------------------------------------------------------------
export function skepticVerdict(
  p: ParcelInput,
  distress: DistressInput[],
  grossProfit: number,
  arv: number,
) {
  const flags: string[] = [];
  if (p.flood_zone && ["AE", "VE", "A"].includes(p.flood_zone))
    flags.push("FEMA high-risk flood zone");
  if (p.condition_grade === "D") flags.push("Condition grade D — deep unknowns");
  if ((p.year_built ?? 2000) < 1955) flags.push("Pre-1955 build — hidden systems risk");
  const taxAmt = distress.find((d) => d.event_type === "TAX_LIEN")?.amount ?? 0;
  if (taxAmt > 25000) flags.push(`Tax lien of $${Math.round(taxAmt / 1000)}k must be cleared`);
  const marginPct = arv > 0 ? grossProfit / arv : 0;
  if (marginPct > 0.45)
    flags.push("Extreme apparent margin — market signal suggests hidden defect");
  return flags;
}

// ---------------------------------------------------------------------------
// The Governor — pull extreme scores toward realism by uncertainty
// ---------------------------------------------------------------------------
export function governor(rawScore: number, uncertainty: number) {
  // uncertainty 0..1 (higher = more shrinkage toward 50)
  return rawScore * (1 - uncertainty * 0.5) + 50 * (uncertainty * 0.5);
}

export function confidenceGrade(uncertainty: number, distressCount: number, isListed: boolean) {
  // more distress records + listing = more evidence -> higher grade
  const evidence = distressCount + (isListed ? 1 : 0);
  const score = (1 - uncertainty) * 60 + Math.min(evidence, 5) * 8;
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

// ---------------------------------------------------------------------------
// Full underwrite
// ---------------------------------------------------------------------------
export interface UnderwriteResult {
  as_is_value: number;
  cosmetic_arv: number;
  full_reno_arv: number;
  expanded_arv: number;
  market_ppsf: number;
  arv_source: "COMPS" | "HEURISTIC";
  comp_count: number;
  recommended_scope: Scope;
  reno_cost: number;
  carry_cost: number;
  selling_cost: number;
  modeled_offer: number;
  acquisition_probability: number;
  exit_days: number;
  exit_confidence: number;
  gross_profit: number;
  risk_adjusted_profit: number;
  perfect_score: number;
  confidence_grade: string;
  skeptic_flags: string[];
  motivation_flags: string[];
  ring: Ring;
  offer_curve: { offer: number; profit: number; probability: number }[];
  // ---- v12 valuation + risk + credit + gates (all optional for back-compat) ----
  arv_today?: number;
  arv_exit_p5?: number;
  arv_exit_p50?: number;
  arv_exit_p95?: number;
  lightgbm_divergence?: number;
  primary_rank?: number; // P(true_margin >= floor)
  retail_score?: number; // 0..100, geometric-mean of 4 factors
  survival_factor?: number; // clustered noisy-OR survival
  pd_credit?: number;
  pd_project?: number;
  pd_exit?: number;
  ead?: number;
  lgd?: number;
  expected_loss?: number;
  risk_adjusted_profit_credit?: number;
  raroc?: number;
  gate_status?: {
    passed: number[];
    map_glow: boolean;
    prophecy_ranking: boolean;
    institutional_credit: boolean;
    capital_allocation: boolean;
    public_performance_claim: boolean;
  };
}

import * as v11 from "./engine/v11";
import { quantileInterp } from './engine/v11';
import * as v12 from "./engine/v12";
import * as credit from "./engine/credit";

/**
 * v11 upgrade — the underwrite orchestrator now runs the canon:
 *
 *   1. Value ladder (comps → weighted median / heuristic fallback)
 *   2. Latent-factor Monte Carlo (0H.3, 0H.5): profit_p5/p50/p95, P(loss), CVaR
 *   3. Skeptic — clustered noisy-OR (0E.3.10)
 *   4. Governor + exceedance rank (0E.3.11 / 0H.10.4)
 *   5. Safe score — weighted geometric mean of unit factors (0H.10.5)
 *   6. Hard gates before promotion
 *
 * Legacy fields (gross_profit, risk_adjusted_profit, exit_days, perfect_score)
 * are preserved for existing callers.
 */
export function underwrite(
  p: ParcelInput,
  distress: DistressInput[],
  m: MarketContext,
  comps: Comp[] = [],
): UnderwriteResult {
  const ladder = computeValueLadder(p, m, comps);
  const scope = recommendedScope(p);
  const arv = arvForScope(ladder, scope);
  const reno = computeRenoCost(p, scope);

  const acq = computeAcquisition(p, distress, ladder.as_is_value);
  const exit = computeExit(m);

  const carry_cost = round(acq.modeled_offer * 0.11 * (exit.exit_days / 365) + 3800);
  const selling_cost = round(arv * 0.06);
  const gross_profit = round(arv - acq.modeled_offer - reno - carry_cost - selling_cost);
  const marginPct = arv > 0 ? gross_profit / arv : 0;

  // --- (2) Monte Carlo profit distribution ---------------------------------
  // Log-space ARV uncertainty; drift from market momentum as sign-safe monthly log.
  const compPpsfs = comps.map((c) => Number(c.ppsf)).filter((v) => Number.isFinite(v) && v > 0);
  const logPpsfs = compPpsfs.map((x) => Math.log(x));
  const meanLog = logPpsfs.length ? logPpsfs.reduce((a, b) => a + b, 0) / logPpsfs.length : 0;
  const sigmaLogDisp =
    logPpsfs.length > 1
      ? Math.sqrt(
          logPpsfs.map((x) => (x - meanLog) ** 2).reduce((a, b) => a + b, 0) /
            (logPpsfs.length - 1),
        )
      : 0.18;
  const nEff = Math.max(compPpsfs.length, 3);
  const sigma_arv_log = v11.sigmaArvLog({ sigmaLogDisp, nEff, sigmaSysLogBacktest: 0 });
  const monthlyDrift = Math.log(1 + m.momentum * 0.02); // ≈2%/yr scaled by momentum
  const drift_used = v11.conservativeDrift(
    { mu: monthlyDrift, sigma: 0.015 },
    m.pending_ratio * 2 - 1, // pending ratio as leading signal proxy in [-1,1]
  );
  // Rehab PERT band around the deterministic cost.
  const rehabL = reno * 0.85,
    rehabM = reno,
    rehabH = reno * 1.35;
  const mc = v11.runMonteCarlo({
    arv_today: arv,
    drift_used_monthly: drift_used,
    sigma_arv_log,
    purchase_price: acq.modeled_offer,
    rehab_scope: { L: rehabL, M: rehabM, H: rehabH },
    rehab_scope_next: { L: rehabM, M: rehabH, H: rehabH * 1.4 },
    p_jump: 0.15,
    sigma_rehab_log_exec: 0.12,
    hold_base_months: exit.exit_days / 30,
    sigma_hold_exec: 1.2,
    sigma_hold_market: 0.8,
    hold_floor_months: 1,
    carry_rate_annual: 0.11,
    fixed_carry: 3800,
    selling_cost_pct: 0.06,
    loan_cost_of: (base, hold) => base * 0.02 + base * 0.115 * (hold / 12),
    other_costs: 0,
    n_draws: 800,
    seed: Math.max(1, Math.floor(arv || 1)),
    return_draws: true,
  });

  // --- (3) Skeptic (clustered noisy-OR) -----------------------------------
  const defects: v11.DefectProb[] = [];
  if (p.flood_zone && ["AE", "VE", "A"].includes(p.flood_zone))
    defects.push({ cluster: "WATER", p: 0.4 });
  if (p.condition_grade === "D") defects.push({ cluster: "STRUCTURE", p: 0.45 });
  if ((p.year_built ?? 2000) < 1955) defects.push({ cluster: "STRUCTURE", p: 0.25 });
  const taxAmt = distress.find((d) => d.event_type === "TAX_LIEN")?.amount ?? 0;
  if (taxAmt > 25000) defects.push({ cluster: "LEGAL", p: Math.min(0.6, taxAmt / 100000) });
  if ((ladder.comp_count ?? 0) < 3) defects.push({ cluster: "DATA_QUALITY", p: 0.5 });
  const sigmaMarginPct = sigma_arv_log; // in log-price / margin space, close enough
  const suspZ = marginPct > 0.45 ? (marginPct - 0.3) / Math.max(sigmaMarginPct, 0.05) : 0;
  const F_surv = v11.skepticFactor(defects, suspZ);
  const skeptic_flags = buildSkepticFlags(p, distress, marginPct);

  // --- (4) Governor + exceedance rank ------------------------------------
  const marginGov = v11.governorMargin(
    marginPct,
    Math.max(sigma_arv_log, 0.05),
    m.momentum * 0.05, // crude "market-typical margin" prior
    0.12,
  );
  const F_profit = v11.exceedanceRank(marginGov.mu, marginGov.sigma, 0.03, 0.1);

  // --- (5) Safe score ------------------------------------------------------
  const confidence = v11.clip01(1 - sigma_arv_log / Math.log(2));
  const F_acq = v11.clip01(acq.acquisition_probability);
  const F_exit = v11.clip01(v11.exitFactor(exit.exit_days, 45));
  const F_conf = v11.clip01(confidence);
  const F_gov = v11.clip01(1 - Math.abs(marginPct - marginGov.mu) / 0.2);
  const scored = v11.safeScore(
    { F_profit, F_acq, F_exit, F_surv, F_conf, F_gov },
    { profit: 0.34, acq: 0.2, exit: 0.14, surv: 0.14, conf: 0.1, gov: 0.08 },
    {
      profit_p5: mc.profit_p5,
      loss_floor: -25_000,
      p_loss: mc.P_loss,
      loss_prob_ceiling: 0.6,
      confidence,
      confidence_floor: 0.15,
    },
  );

  const perfect_score = clamp(Math.round(scored.score), 0, 100);
  const risk_adjusted_profit = round(mc.expected_profit);
  const uncertainty = clamp(sigma_arv_log / Math.log(2), 0.1, 0.85);
  const grade = confidenceGrade(uncertainty, distress.length, p.is_listed);

  // ring=1 listed on market · ring=2 off-market · ring=3 predicted (NOD w/o auction)
  const prophecySignal = distress.some(
    (d) =>
      d.event_type === "FORECLOSURE_NOD" &&
      !distress.some((x) => x.event_type === "AUCTION_SCHEDULED"),
  );
  let ring: Ring = p.is_listed ? 1 : 2;
  if (!p.is_listed && prophecySignal) ring = 3;

  const offer_curve = [-0.08, -0.04, 0, 0.05, 0.1].map((delta) => {
    const offer = round(acq.modeled_offer * (1 + delta));
    const profit = round(arv - offer - reno - carry_cost - selling_cost);
    const probability = clamp(acq.acquisition_probability * (1 + delta * 3), 0.01, 0.98);
    return { offer, profit, probability: round2(probability) };
  });

  // --- (6) v12 layer: exit distribution, primary rank, retail score, survival --
  const draws = mc.draws?.profits ?? [];
  const arvExits = mc.draws?.arvExits ?? [];
  const cost_basis = acq.modeled_offer + reno;
  const primary_rank = draws.length ? v12.primaryRankFromMC(draws, cost_basis, 0.1) : 0;
  const v12Defects: v12.V12Defect[] = defects
    .filter((d) => d.cluster !== "DATA_QUALITY")
    .map((d) => ({ cluster: d.cluster as v12.V12RiskCluster, p: d.p }));
  const survival_factor = v12.survivalFactorV12(v12Defects, { WATER: 0.6, LEGAL: 0.5 });
  const retail_score = v12.retailScore({
    F1_margin_exceedance: primary_rank,
    F2_p_accept: acq.acquisition_probability,
    F3_p_sale_90d: v12.fExit90d(1 / Math.max(exit.exit_days, 1)),
    F4_survival: survival_factor,
  });
  const sortedExits = [...arvExits].sort((a, b) => a - b);
  const qExit = (pct: number) =>
    sortedExits.length
      ? quantileInterp(sortedExits, pct, sortedExits.length)
      : arv;
  const arv_today = arv;
  const arv_exit_p5 = qExit(0.05);
  const arv_exit_p50 = qExit(0.5);
  const arv_exit_p95 = qExit(0.95);
  const lightgbm_divergence = 0; // placeholder — no anchor model trained yet

  // --- (7) Credit layer -----------------------------------------------------
  const hazardFeatures: credit.HazardFeatures = {
    borrower_experience: 0.5,
    verified_liquidity_buffer: 0.4,
    rehab_complexity: scope === "EXPANDED" ? 0.8 : scope === "FULL" ? 0.5 : 0.2,
    market_stress: clamp(-m.momentum, -1, 1),
    lien_depth: taxAmt > 0 ? 0.6 : 0.2,
    prior_default: 0,
    draw_variance: 0.3,
    covenant_breach_flag: 0,
  };
  const monthsH = Math.max(3, Math.round(exit.exit_days / 30));
  const pd_credit = credit.pdCreditStationary(hazardFeatures, monthsH);
  const pd_project = clamp(pd_credit * 0.8, 0, 1);
  const pd_exit = clamp((1 - v12.fExit90d(1 / Math.max(exit.exit_days, 1))) * 0.5, 0, 1);
  const ead = credit.exposureAtDefault({
    outstanding_principal: acq.modeled_offer,
    approved_undrawn_rehab_available: reno,
    accrued_interest: acq.modeled_offer * 0.02,
    capitalized_fees: acq.modeled_offer * 0.01,
    extension_fees: 0,
    protective_advances: 0,
    expected_carry_to_resolution: carry_cost,
  });
  const lgd = credit.lgd(
    {
      ARV: arv,
      ARV_shock: -0.15,
      liquidation_haircut: 0.85,
      foreclosure_cost: 15_000,
      liquidation_carry_cost: carry_cost * 0.5,
      senior_claims: taxAmt,
      selling_cost: selling_cost,
      legal_workout_cost: 8_000,
    },
    ead,
  );
  const expected_loss = credit.expectedLoss(pd_credit, lgd, ead);
  const risk_adjusted_profit_credit = credit.riskAdjustedProfit({
    E_profit_no_default: mc.expected_profit,
    EL: expected_loss,
    capital_charge: ead * 0.02,
    liquidity_charge: ead * 0.005,
    servicing_and_workout_cost: 2500,
  });
  const raroc = risk_adjusted_profit_credit / Math.max(ead * 0.1, 1); // EC ≈ 10% of EAD stub

  // --- (8) Gates 0-8 --------------------------------------------------------
  const passed = new Set<number>();
  passed.add(0);
  passed.add(1); // seeded infra + entity resolution assumed live
  if (ladder.comp_count >= 3) passed.add(2);
  // Gate 3 (falsifier) not yet passed — locks Prophecy / institutional surfaces
  // Gates 4-8 remain locked pending business milestones
  const trust = v12.gate3TrustLock(passed);
  const gate_status = { passed: [...passed].sort((a, b) => a - b), ...trust };

  return {
    ...ladder,
    recommended_scope: scope,
    reno_cost: reno,
    carry_cost,
    selling_cost,
    modeled_offer: acq.modeled_offer,
    acquisition_probability: round2(acq.acquisition_probability),
    exit_days: exit.exit_days,
    exit_confidence: round2(exit.exit_confidence),
    gross_profit,
    risk_adjusted_profit,
    perfect_score,
    confidence_grade: grade,
    skeptic_flags: scored.rejected
      ? [`Rejected: ${scored.reason}`, ...skeptic_flags]
      : skeptic_flags,
    motivation_flags: acq.motivationFlags,
    ring: trust.prophecy_ranking ? ring : (Math.min(ring, 2) as Ring),
    offer_curve,
    // v12 outputs
    arv_today: round(arv_today),
    arv_exit_p5: round(arv_exit_p5),
    arv_exit_p50: round(arv_exit_p50),
    arv_exit_p95: round(arv_exit_p95),
    lightgbm_divergence,
    primary_rank: round2(primary_rank),
    retail_score: round2(retail_score),
    survival_factor: round2(survival_factor),
    pd_credit: round2(pd_credit),
    pd_project: round2(pd_project),
    pd_exit: round2(pd_exit),
    ead: round(ead),
    lgd: round2(lgd),
    expected_loss: round(expected_loss),
    risk_adjusted_profit_credit: round(risk_adjusted_profit_credit),
    raroc: round2(raroc),
    gate_status,
    // v11 diagnostics (typed as any to avoid breaking existing consumers)
    ...({
      mc_profit_p5: round(mc.profit_p5),
      mc_profit_p50: round(mc.profit_p50),
      mc_profit_p95: round(mc.profit_p95),
      mc_p_loss: round2(mc.P_loss),
      mc_cvar_loss: round(mc.cvar_loss_05),
      mc_dqr: mc.dqr != null ? round2(mc.dqr) : null,
      governor_kappa: round2(marginGov.kappa_model),
      exceedance_rank: round2(F_profit),
      sigma_arv_log: round2(sigma_arv_log),
      drift_used_monthly: round2(drift_used * 100) / 100,
    } as any),
  };
}

function buildSkepticFlags(p: ParcelInput, distress: DistressInput[], marginPct: number): string[] {
  const flags: string[] = [];
  if (p.flood_zone && ["AE", "VE", "A"].includes(p.flood_zone))
    flags.push("FEMA high-risk flood zone");
  if (p.condition_grade === "D") flags.push("Condition grade D — deep unknowns");
  if ((p.year_built ?? 2000) < 1955) flags.push("Pre-1955 build — hidden systems risk");
  const taxAmt = distress.find((d) => d.event_type === "TAX_LIEN")?.amount ?? 0;
  if (taxAmt > 25000) flags.push(`Tax lien of $${Math.round(taxAmt / 1000)}k must be cleared`);
  if (marginPct > 0.45)
    flags.push("Extreme apparent margin — market signal suggests hidden defect");
  return flags;
}

// ---------------------------------------------------------------------------
// Market context by county — normally learned from deed history.
// Seeded with realistic bands per FIPS.
// ---------------------------------------------------------------------------
export const MARKET_CONTEXT: Record<string, MarketContext> = {
  "06037": {
    median_ppsf: 620,
    ppsf_stddev: 140,
    avg_dom_renovated: 34,
    pending_ratio: 0.42,
    momentum: 0.08,
  }, // LA County
  "06073": {
    median_ppsf: 720,
    ppsf_stddev: 160,
    avg_dom_renovated: 31,
    pending_ratio: 0.48,
    momentum: 0.12,
  }, // San Diego
  "12086": {
    median_ppsf: 445,
    ppsf_stddev: 120,
    avg_dom_renovated: 52,
    pending_ratio: 0.38,
    momentum: -0.04,
  }, // Miami-Dade
  "12011": {
    median_ppsf: 385,
    ppsf_stddev: 95,
    avg_dom_renovated: 61,
    pending_ratio: 0.34,
    momentum: -0.09,
  }, // Broward
};

export const DEFAULT_MARKET_CONTEXT: MarketContext = {
  median_ppsf: 350,
  ppsf_stddev: 100,
  avg_dom_renovated: 55,
  pending_ratio: 0.35,
  momentum: 0,
};

export function marketContextForCounty(countyFips: string): MarketContext {
  return MARKET_CONTEXT[countyFips] ?? DEFAULT_MARKET_CONTEXT;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}
function round(x: number) {
  return Math.round(x);
}
function round2(x: number) {
  return Math.round(x * 100) / 100;
}
