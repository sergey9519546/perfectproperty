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
export function computeValueLadder(p: ParcelInput, m: MarketContext) {
  const sqft = p.living_sqft ?? 1200;
  const cond = conditionMultiplier(p.condition_grade);
  const loc = locationMultiplier(p);

  const asIsPpsf = m.median_ppsf * 0.62 * cond * loc;
  const cosmeticPpsf = m.median_ppsf * 0.92 * loc;
  const fullPpsf = m.median_ppsf * 1.02 * loc;
  const expandedPpsf = m.median_ppsf * 1.12 * loc;

  return {
    as_is_value: round(asIsPpsf * sqft),
    cosmetic_arv: round(cosmeticPpsf * sqft),
    full_reno_arv: round(fullPpsf * sqft),
    expanded_arv: round(expandedPpsf * sqft),
  };
}

function conditionMultiplier(c: string | null) {
  switch (c) {
    case "A": return 1.08;
    case "B": return 1.0;
    case "C": return 0.88;
    case "D": return 0.72;
    default: return 0.94;
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
  return scope === "COSMETIC" ? ladder.cosmetic_arv : scope === "FULL" ? ladder.full_reno_arv : ladder.expanded_arv;
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
        base += 0.32; discountFromAsIs.push(0.18);
        flags.push("Foreclosure NOD filed");
        break;
      case "AUCTION_SCHEDULED":
        base += 0.45; discountFromAsIs.push(0.28);
        flags.push("Auction scheduled");
        break;
      case "TAX_LIEN":
        base += 0.14; discountFromAsIs.push(0.09);
        break;
      case "PROBATE":
        base += 0.22; discountFromAsIs.push(0.14);
        break;
      case "CODE_VIOLATION":
        base += 0.09; discountFromAsIs.push(0.06);
        break;
      case "VACANCY":
        base += 0.11; discountFromAsIs.push(0.07);
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
export function skepticVerdict(p: ParcelInput, distress: DistressInput[], grossProfit: number, arv: number) {
  const flags: string[] = [];
  if (p.flood_zone && ["AE", "VE", "A"].includes(p.flood_zone)) flags.push("FEMA high-risk flood zone");
  if (p.condition_grade === "D") flags.push("Condition grade D — deep unknowns");
  if ((p.year_built ?? 2000) < 1955) flags.push("Pre-1955 build — hidden systems risk");
  const taxAmt = distress.find((d) => d.event_type === "TAX_LIEN")?.amount ?? 0;
  if (taxAmt > 25000) flags.push(`Tax lien of $${Math.round(taxAmt / 1000)}k must be cleared`);
  const marginPct = arv > 0 ? grossProfit / arv : 0;
  if (marginPct > 0.45) flags.push("Extreme apparent margin — market signal suggests hidden defect");
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
}

export function underwrite(
  p: ParcelInput,
  distress: DistressInput[],
  m: MarketContext,
): UnderwriteResult {
  const ladder = computeValueLadder(p, m);
  const scope = recommendedScope(p);
  const arv = arvForScope(ladder, scope);
  const reno = computeRenoCost(p, scope);

  const acq = computeAcquisition(p, distress, ladder.as_is_value);
  const exit = computeExit(m);

  const carry_cost = round(acq.modeled_offer * 0.11 * (exit.exit_days / 365) + 3800); // hard money + insurance + utils
  const selling_cost = round(arv * 0.06);
  const gross_profit = round(arv - acq.modeled_offer - reno - carry_cost - selling_cost);

  const risk_adjusted_profit = round(
    gross_profit * acq.acquisition_probability * exit.exit_confidence,
  );

  const skeptic = skepticVerdict(p, distress, gross_profit, arv);

  // Raw score: margin% weighted by acquisition & exit
  const marginPct = arv > 0 ? gross_profit / arv : 0;
  const raw = clamp(marginPct * 100, -20, 60) * 1.4 + acq.acquisition_probability * 30 +
    (1 - exit.exit_days / 180) * 20 - skeptic.length * 6;

  const uncertainty = clamp(0.15 + skeptic.length * 0.08 + (m.ppsf_stddev / (m.median_ppsf || 1)), 0.1, 0.85);
  const tempered = governor(raw, uncertainty);
  const perfect_score = clamp(Math.round(tempered), 0, 100);

  const grade = confidenceGrade(uncertainty, distress.length, p.is_listed);

  // Ring routing
  let ring: Ring = 1;
  if (!p.is_listed && distress.length > 0) ring = 2;
  const prophecySignal = distress.some((d) => d.event_type === "FORECLOSURE_NOD" && !distress.some((x) => x.event_type === "AUCTION_SCHEDULED"));
  if (!p.is_listed && prophecySignal) ring = 3;

  const offer_curve = [-0.08, -0.04, 0, 0.05, 0.1].map((delta) => {
    const offer = round(acq.modeled_offer * (1 + delta));
    const profit = round(arv - offer - reno - carry_cost - selling_cost);
    // probability curve: lower offer → lower probability
    const probability = clamp(acq.acquisition_probability * (1 + delta * 3), 0.01, 0.98);
    return { offer, profit, probability: round2(probability) };
  });

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
    skeptic_flags: skeptic,
    motivation_flags: acq.motivationFlags,
    ring,
    offer_curve,
  };
}

// ---------------------------------------------------------------------------
// Market context by county — normally learned from deed history.
// Seeded with realistic bands per FIPS.
// ---------------------------------------------------------------------------
export const MARKET_CONTEXT: Record<string, MarketContext> = {
  "06037": { median_ppsf: 620, ppsf_stddev: 140, avg_dom_renovated: 34, pending_ratio: 0.42, momentum: 0.08 }, // LA County
  "06073": { median_ppsf: 720, ppsf_stddev: 160, avg_dom_renovated: 31, pending_ratio: 0.48, momentum: 0.12 }, // San Diego
  "12086": { median_ppsf: 445, ppsf_stddev: 120, avg_dom_renovated: 52, pending_ratio: 0.38, momentum: -0.04 }, // Miami-Dade
  "12011": { median_ppsf: 385, ppsf_stddev: 95, avg_dom_renovated: 61, pending_ratio: 0.34, momentum: -0.09 }, // Broward
};

function clamp(x: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, x)); }
function round(x: number) { return Math.round(x); }
function round2(x: number) { return Math.round(x * 100) / 100; }
