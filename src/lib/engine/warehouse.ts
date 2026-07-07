/**
 * Perfect Property Engine — Warehouse financing, exposure graph, audit log.
 * Sections 0G.11, 0G.13, 0G.16.
 */
import { EPS, positive } from "./v11";

// =============================================================================
// 0G.11  Advance rate + borrowing-base eligibility
// =============================================================================
export interface AdvanceRateInputs {
  base_advance: number;
  metro_factor: number;
  property_type_factor: number;
  credit_factor: number;
  collateral_stage_factor: number;
  documentation_quality_factor: number;
}
export function advanceRate(a: AdvanceRateInputs): number {
  return a.base_advance
    * a.metro_factor
    * a.property_type_factor
    * a.credit_factor
    * a.collateral_stage_factor
    * a.documentation_quality_factor;
}
export function eligibleBorrowing(inputs: {
  advance_rate: number; ARV: number;
  LTC: number; P: number; R: number;
  policy_cap: number;
}): number {
  return Math.min(
    inputs.advance_rate * inputs.ARV,
    inputs.LTC * (inputs.P + inputs.R),
    inputs.policy_cap,
  );
}
export function stressedAdvanceRate(base: number, haircut_shock: number): number {
  return base * (1 - haircut_shock);
}

// =============================================================================
// 0G.16  Borrower / connected-entity exposure aggregation
// =============================================================================
export interface DealExposure { deal_id: string; borrower_id: string; connected_entity_id?: string; EAD: number; x: number; }
export function borrowerEAD(deals: DealExposure[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of deals) out[d.borrower_id] = (out[d.borrower_id] ?? 0) + d.x * d.EAD;
  return out;
}
export function entityEAD(deals: DealExposure[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of deals) {
    const key = d.connected_entity_id ?? d.borrower_id;
    out[key] = (out[key] ?? 0) + d.x * d.EAD;
  }
  return out;
}
/** Recurrence penalty when a prior outcome was a loss. */
export function recurrenceLimit(base_limit: number, prior_outcome_loss: boolean, recurrence_penalty = 0.5): number {
  return prior_outcome_loss ? base_limit * recurrence_penalty : base_limit;
}

// =============================================================================
// 0G.13  Immutable audit log — hash chain
//   H_n = hash(H_{n-1} || D_n)
// =============================================================================
async function sha256Hex(text: string): Promise<string> {
  // Web Crypto is available in the Worker runtime and modern browsers.
  const enc = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export interface DecisionRecord {
  decision_id: string;
  timestamp: string;
  model_version: string;
  policy_version: string;
  feature_hashes: string[];
  input_snapshot: unknown;
  output_snapshot: unknown;
  reason_codes: string[];
  user_id: string;
  compliance_flags: string[];
}
export interface ChainedRecord extends DecisionRecord { previous_hash: string; hash: string; }

export async function appendDecision(prev_hash: string, d: DecisionRecord): Promise<ChainedRecord> {
  const payload = prev_hash + JSON.stringify(d);
  const hash = await sha256Hex(payload);
  return { ...d, previous_hash: prev_hash, hash };
}
export async function verifyChain(chain: ChainedRecord[]): Promise<{ ok: true } | { ok: false; brokenAt: number }> {
  let prev = chain[0]?.previous_hash ?? "GENESIS";
  for (let n = 0; n < chain.length; n++) {
    const rec = chain[n];
    const { previous_hash, hash, ...d } = rec;
    if (previous_hash !== prev) return { ok: false, brokenAt: n };
    const recomputed = await sha256Hex(previous_hash + JSON.stringify(d));
    if (recomputed !== hash) return { ok: false, brokenAt: n };
    prev = hash;
  }
  return { ok: true };
}

// =============================================================================
// 0G.15  Vendor SLA breach detector
// =============================================================================
export interface VendorSLA {
  null_max: number; match_min: number; max_lag_ms: number; expected_schema_version: string;
}
export interface VendorSample {
  null_rate: number; match_rate: number; freshness_lag_ms: number;
  schema_version: string; changed_required_field: boolean;
}
export function vendorBreached(sla: VendorSLA, sample: VendorSample): { breached: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (sample.changed_required_field) reasons.push("schema_change");
  if (sample.null_rate > sla.null_max) reasons.push("null_rate");
  if (sample.match_rate < sla.match_min) reasons.push("match_rate");
  if (sample.freshness_lag_ms > sla.max_lag_ms) reasons.push("freshness");
  if (sample.schema_version !== sla.expected_schema_version) reasons.push("schema_version");
  return { breached: reasons.length > 0, reasons };
}

// Suppress unused warning for shared safe primitives
export { EPS, positive };
