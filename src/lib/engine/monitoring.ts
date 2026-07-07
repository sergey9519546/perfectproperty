/**
 * Perfect Property Engine — Production monitoring (0G.9, 0G.12, 0G.17)
 * PSI bands, bin-weighted calibration, calibration slope/intercept,
 * quarantine rule, HHI, LCR, portfolio EL/VaR/CVaR/EC/RAROC.
 */
import { EPS, clip01, positive } from "./v11";

// =============================================================================
// 0G.9.1  PSI bands
// =============================================================================
export type PsiBand = "green" | "yellow" | "orange" | "red";
export function psiBand(psi: number): PsiBand {
  if (psi < 0.1) return "green";
  if (psi < 0.2) return "yellow";
  if (psi < 0.3) return "orange";
  return "red";
}

// =============================================================================
// 0G.9.2  Bin-weighted calibration error   Σ (n_b/N) (p_b - o_b)^2
// =============================================================================
export interface CalibrationBin { n: number; p_mean: number; o_rate: number; }
export function binWeightedCalibrationError(bins: CalibrationBin[]): number {
  const N = bins.reduce((a, b) => a + b.n, 0);
  if (N === 0) return 0;
  let err = 0;
  for (const b of bins) err += (b.n / N) * Math.pow(b.p_mean - b.o_rate, 2);
  return err;
}
/** Calibration slope for continuous outcomes.  cov(pred, real) / var(pred). */
export function calibrationSlope(pred: number[], real: number[]): { slope: number; intercept: number; flag: boolean } {
  const n = pred.length;
  if (n < 2) return { slope: 1, intercept: 0, flag: false };
  const mp = pred.reduce((a, b) => a + b, 0) / n;
  const mr = real.reduce((a, b) => a + b, 0) / n;
  let cov = 0, varp = 0;
  for (let i = 0; i < n; i++) { cov += (pred[i] - mp) * (real[i] - mr); varp += Math.pow(pred[i] - mp, 2); }
  const slope = cov / Math.max(varp, EPS);
  const intercept = mr - slope * mp;
  return { slope, intercept, flag: Math.abs(slope - 1) > 0.2 };
}

// =============================================================================
// 0G.9.3  Feature lineage quarantine rule
// =============================================================================
export interface FeatureRow {
  feature_id?: string;
  source?: string;
  as_of_date?: string | Date;
  transform_version?: string;
  model_version?: string;
  lineage_hash?: string;
}
export type ModelStatus = "OK" | "QUARANTINE";
export function lineageQuarantine(rows: FeatureRow[]): ModelStatus {
  const need: (keyof FeatureRow)[] = ["feature_id", "source", "as_of_date", "transform_version", "model_version", "lineage_hash"];
  for (const r of rows) for (const k of need) if (!r[k]) return "QUARANTINE";
  return "OK";
}
export function isFeatureStale(as_of_ts: number, now: number, max_age_ms: number): boolean {
  return now - as_of_ts > max_age_ms;
}

// =============================================================================
// 0G.12  Portfolio loss statistics (loss = positive amount)
// =============================================================================
export function portfolioLossStats(lossDraws: number[], alpha = 0.05) {
  const n = lossDraws.length;
  if (!n) return { EL: 0, VaR: 0, CVaR: 0, EC: 0 };
  const s = [...lossDraws].sort((a, b) => a - b);
  const EL = s.reduce((a, b) => a + b, 0) / n;
  const cutIdx = Math.min(n - 1, Math.floor((1 - alpha) * n));
  const VaR = s[cutIdx];
  const tail = s.slice(cutIdx);
  const CVaR = tail.reduce((a, b) => a + b, 0) / Math.max(tail.length, 1);
  return { EL, VaR, CVaR, EC: Math.max(0, CVaR - EL) };
}
export function raroc(expectedNetIncome: number, EL: number, EC: number): number {
  return (expectedNetIncome - EL) / Math.max(EC, EPS);
}

// =============================================================================
// 0G.11  Liquidity coverage ratio
// =============================================================================
export function lcr(unencumbered_liquidity: number, projected_net_cash_outflow_under_stress: number): number {
  return unencumbered_liquidity / Math.max(projected_net_cash_outflow_under_stress, EPS);
}

// =============================================================================
// 0G.17  Herfindahl-Hirschman concentration
// =============================================================================
export function hhi(exposuresBySegment: number[]): number {
  const total = exposuresBySegment.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return exposuresBySegment.reduce((a, e) => a + Math.pow(e / total, 2), 0);
}

// =============================================================================
// Risk appetite check (0G.17)
// =============================================================================
export interface RiskAppetiteInputs {
  EC: number; board_approved_capital: number;
  HHI: number; concentration_limit: number;
  StressLoss_CVaR: number; stress_budget: number;
  warehouse_covenant_breach: boolean;
  unresolved_red_model_alert: boolean;
}
export function riskAppetiteBreached(r: RiskAppetiteInputs): { breached: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (r.EC > r.board_approved_capital) reasons.push("EC>capital");
  if (r.HHI > r.concentration_limit) reasons.push("HHI>limit");
  if (r.StressLoss_CVaR > r.stress_budget) reasons.push("CVaR>budget");
  if (r.warehouse_covenant_breach) reasons.push("covenant_breach");
  if (r.unresolved_red_model_alert) reasons.push("red_model_alert");
  return { breached: reasons.length > 0, reasons };
}

// Utility re-exports so callers don't need to import from v11 for common ops.
export { EPS, clip01, positive };
