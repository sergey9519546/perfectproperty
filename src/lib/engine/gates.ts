/**
 * Champion / Challenger promotion gates — v11 institutional layer
 *
 * When a challenger model wants to replace the champion, it must clear a
 * fixed battery of statistical gates before it is allowed into production:
 *
 *   1. Population Stability Index (PSI) — feature drift bounded
 *   2. Bin-weighted calibration error — challenger no worse
 *   3. Lift on the held-out set — challenger strictly better on the
 *      metric of record (RAROC × hit-rate)
 *   4. Regime downturn detector — do not promote during phi > threshold
 *
 * A challenger that fails ANY gate is blocked. The report explains why so
 * the operator can decide whether to retrain, expand data, or wait.
 */

import * as v11 from "./v11";

export interface BacktestRow {
  raw_score: number;    // uncalibrated score
  outcome: number;      // realised profit (dollars) or 0/1 label
}

export interface GateInputs {
  champion: {
    features_train: number[];    // reference distribution (single feature or aggregate)
    calibration_bins: Array<{ n: number; p: number; o: number }>;
    backtest: BacktestRow[];
  };
  challenger: {
    features_live: number[];
    calibration_bins: Array<{ n: number; p: number; o: number }>;
    backtest: BacktestRow[];
  };
  regime?: v11.RegimeInputs;
  thresholds?: {
    psi_max?: number;          // default 0.25 (accepted industry cutoff)
    calibration_slack?: number;// challenger CE must be <= champion CE * (1+slack)
    min_lift?: number;         // fractional improvement required, default 0.05
    phi_downturn_max?: number; // default 0.65
  };
}

export interface GateReport {
  passed: boolean;
  gates: Array<{ name: string; passed: boolean; detail: string }>;
  psi: number;
  challenger_ce: number;
  champion_ce: number;
  champion_lift: number;
  challenger_lift: number;
  phi_downturn: number | null;
}

function meanOutcome(rows: BacktestRow[]): number {
  if (rows.length === 0) return 0;
  return rows.reduce((a, b) => a + b.outcome, 0) / rows.length;
}

export function runPromotionGates(inp: GateInputs): GateReport {
  const t = inp.thresholds ?? {};
  const psi_max = t.psi_max ?? 0.25;
  const calibration_slack = t.calibration_slack ?? 0.10;
  const min_lift = t.min_lift ?? 0.05;
  const phi_max = t.phi_downturn_max ?? 0.65;

  const gates: GateReport["gates"] = [];

  // 1. PSI
  const psi = v11.psi(inp.champion.features_train, inp.challenger.features_live);
  const psiPass = psi <= psi_max;
  gates.push({ name: "PSI", passed: psiPass, detail: `psi=${psi.toFixed(3)} vs max ${psi_max}` });

  // 2. Calibration
  const nChamp = inp.champion.calibration_bins.reduce((a, b) => a + b.n, 0) || 1;
  const nChall = inp.challenger.calibration_bins.reduce((a, b) => a + b.n, 0) || 1;
  const championCE = v11.calibrationError(inp.champion.calibration_bins, nChamp);
  const challengerCE = v11.calibrationError(inp.challenger.calibration_bins, nChall);
  const calibPass = challengerCE <= championCE * (1 + calibration_slack);
  gates.push({
    name: "Calibration",
    passed: calibPass,
    detail: `challenger CE=${challengerCE.toFixed(4)} vs champion ${championCE.toFixed(4)} (+${(calibration_slack*100).toFixed(0)}% slack)`,
  });

  // 3. Lift on held-out
  const championLift = meanOutcome(inp.champion.backtest);
  const challengerLift = meanOutcome(inp.challenger.backtest);
  const relLift = championLift !== 0 ? (challengerLift - championLift) / Math.abs(championLift) : (challengerLift > 0 ? Infinity : 0);
  const liftPass = relLift >= min_lift;
  gates.push({
    name: "Lift",
    passed: liftPass,
    detail: `lift=${(relLift*100).toFixed(1)}% vs required ${(min_lift*100).toFixed(1)}%`,
  });

  // 4. Regime
  let phi: number | null = null;
  let regimePass = true;
  if (inp.regime) {
    const r = v11.phiDownturn(inp.regime);
    phi = r.phi;
    regimePass = r.phi <= phi_max;
    gates.push({
      name: "Regime",
      passed: regimePass,
      detail: `phi_downturn=${r.phi.toFixed(2)} vs max ${phi_max}`,
    });
  }

  return {
    passed: gates.every((g) => g.passed),
    gates,
    psi,
    champion_ce: championCE,
    challenger_ce: challengerCE,
    champion_lift: championLift,
    challenger_lift: challengerLift,
    phi_downturn: phi,
  };
}
