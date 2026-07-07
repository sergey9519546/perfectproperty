/**
 * Perfect Property Engine — Credit-risk layer (v10 / 0G.5, stress 0G.7)
 * Split-event PD, EAD, LGD, EL, RAP, and stressed deal outcomes.
 */
import { clamp, clip01, positive, EPS } from "./v11";

// =============================================================================
// 0G.5.1  Event taxonomy — three separate PDs, only PD_credit feeds EL.
// =============================================================================
export interface PDSplit {
  PD_credit: number;   // borrower/loan default within H
  PD_project: number;  // rehab/project materially impaired within H
  PD_exit: number;     // exit fails within liquidity horizon H
}

// =============================================================================
// 0G.5.2  Discrete-time credit-default hazard   PD = 1 - Π(1 - h_t)
// =============================================================================
export const HAZARD_COEFS_DEFAULT = {
  alpha: -5.0,
  borrower_experience: -0.35,
  verified_liquidity_buffer: -0.60,
  rehab_complexity: +0.45,
  market_stress: +0.75,
  lien_depth: +0.30,
  prior_default: +1.20,
  draw_variance: +0.25,
  covenant_breach_flag: +1.50,
} as const;

export interface HazardFeatures {
  borrower_experience: number;
  verified_liquidity_buffer: number;
  rehab_complexity: number;
  market_stress: number;
  lien_depth: number;
  prior_default: number;
  draw_variance: number;
  covenant_breach_flag: number;
}
export type HazardCoefs = typeof HAZARD_COEFS_DEFAULT;

export function periodHazard(x: HazardFeatures, c: HazardCoefs = HAZARD_COEFS_DEFAULT): number {
  const z =
    c.alpha +
    c.borrower_experience * x.borrower_experience +
    c.verified_liquidity_buffer * x.verified_liquidity_buffer +
    c.rehab_complexity * x.rehab_complexity +
    c.market_stress * x.market_stress +
    c.lien_depth * x.lien_depth +
    c.prior_default * x.prior_default +
    c.draw_variance * x.draw_variance +
    c.covenant_breach_flag * x.covenant_breach_flag;
  return 1 / (1 + Math.exp(-z));
}
export function pdCreditFromHazards(hazards: number[]): number {
  let survive = 1;
  for (const h of hazards) survive *= 1 - clip01(h);
  return 1 - survive;
}
export function pdCreditStationary(x: HazardFeatures, H: number, c?: HazardCoefs): number {
  return pdCreditFromHazards(Array(H).fill(periodHazard(x, c)));
}

// =============================================================================
// 0G.5.3  Exposure at default
// =============================================================================
export interface EADParts {
  outstanding_principal: number;
  approved_undrawn_rehab_available: number;
  accrued_interest: number;
  capitalized_fees: number;
  extension_fees: number;
  protective_advances: number;
  expected_carry_to_resolution: number;
}
export function exposureAtDefault(p: EADParts): number {
  return (
    p.outstanding_principal +
    p.approved_undrawn_rehab_available +
    p.accrued_interest +
    p.capitalized_fees +
    p.extension_fees +
    p.protective_advances +
    p.expected_carry_to_resolution
  );
}

// =============================================================================
// 0G.5.4  Net recovery and LGD (clamped)
// =============================================================================
export interface NetRecoveryInputs {
  ARV: number;
  ARV_shock: number;              // e.g. -0.15 for -15%
  liquidation_haircut: number;    // e.g. 0.85
  foreclosure_cost: number;
  liquidation_carry_cost: number;
  senior_claims: number;
  selling_cost: number;
  legal_workout_cost: number;
}
export function liquidationValue(n: Pick<NetRecoveryInputs, "ARV" | "ARV_shock" | "liquidation_haircut">): number {
  return n.ARV * (1 + n.ARV_shock) * n.liquidation_haircut;
}
export function netRecovery(n: NetRecoveryInputs): number {
  return (
    liquidationValue(n) -
    n.foreclosure_cost -
    n.liquidation_carry_cost -
    n.senior_claims -
    n.selling_cost -
    n.legal_workout_cost
  );
}
export function lgd(n: NetRecoveryInputs, EAD: number): number {
  return clamp(1 - netRecovery(n) / Math.max(EAD, EPS), 0, 1);
}

// =============================================================================
// 0G.5.5  Expected loss & risk-adjusted profit
// =============================================================================
export function expectedLoss(pd_credit: number, lgd_val: number, ead: number): number {
  return clip01(pd_credit) * clip01(lgd_val) * positive(ead);
}
export function riskAdjustedProfit(inputs: {
  E_profit_no_default: number;
  EL: number;
  capital_charge: number;
  liquidity_charge: number;
  servicing_and_workout_cost: number;
}): number {
  return (
    inputs.E_profit_no_default -
    inputs.EL -
    inputs.capital_charge -
    inputs.liquidity_charge -
    inputs.servicing_and_workout_cost
  );
}

// =============================================================================
// 0G.7  Stress-test engine
// =============================================================================
export interface StressScenario {
  ARV_shock: number;
  rehab_multiplier: number;
  hold_months_additive: number;
  hold_multiplier: number;
  rate_shock: number;
  PD_multiplier: number;
  LGD_multiplier: number;
  financing_available: boolean;
  warehouse_haircut: number;
  insurance_cost_shock: number;
  liquidity_exit_shock: number;
}
export interface DealBase {
  ARV: number;
  P: number;
  R: number;
  H_base: number;
  base_rate: number;
  base_insurance: number;
  base_selling_cost: number;
  base_loan_cost_per_month: number;
  base_carry_cost_per_month: number;
  EAD: number;
  PD_credit: number;
  LGD: number;
  E_profit_base: number;
}
export interface StressedOutcome {
  H_stress: number;
  Profit: number;
  PD_stress: number;
  LGD_stress: number;
  EProfit: number;
  eligible: boolean;
}
export function stressedDeal(d: DealBase, s: StressScenario): StressedOutcome {
  const H_stress = (d.H_base + s.hold_months_additive) * s.hold_multiplier;
  const carry = (d.base_carry_cost_per_month + d.base_insurance * (1 + s.insurance_cost_shock)) * H_stress;
  const loan  = d.base_loan_cost_per_month * (1 + s.rate_shock) * H_stress;
  const selling = d.base_selling_cost * (1 + s.liquidity_exit_shock);
  const Profit = d.ARV * (1 + s.ARV_shock) - d.P - d.R * s.rehab_multiplier - carry - selling - loan;
  const PD_stress  = clamp(d.PD_credit * s.PD_multiplier, 0, 1);
  const LGD_stress = clamp(d.LGD * s.LGD_multiplier, 0, 1);
  const EProfit = (1 - PD_stress) * Profit - PD_stress * LGD_stress * d.EAD;
  return { H_stress, Profit, PD_stress, LGD_stress, EProfit, eligible: s.financing_available };
}
export function portfolioStressLossMean(deals: DealBase[], x: number[], scenario: StressScenario): number {
  let loss = 0;
  for (let j = 0; j < deals.length; j++) {
    const s = stressedDeal(deals[j], scenario);
    loss += x[j] * (deals[j].E_profit_base - s.EProfit);
  }
  return loss;
}
