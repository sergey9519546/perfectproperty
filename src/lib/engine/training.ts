/**
 * Training Harness — v11 institutional layer
 *
 * Fits probability calibrators (Platt + isotonic) on realised outcomes and
 * emits the artefacts needed to score live traffic. The harness also
 * computes the standard backtest metrics that feed the promotion gates:
 * AUC (trapezoidal), Brier score, and per-decile calibration bins.
 */

import * as v11 from "./v11";

export interface TrainRow { raw_score: number; label: 0 | 1 }
export interface TrainedCalibrator {
  method: "platt" | "isotonic";
  predict: (raw: number) => number;
  brier: number;
  auc: number;
  bins: Array<{ n: number; p: number; o: number }>;
}

export function fitCalibrator(rows: TrainRow[], method: "platt" | "isotonic" = "platt"): TrainedCalibrator {
  if (rows.length < 10) throw new Error("training set too small (n<10)");
  const xs = rows.map((r) => r.raw_score);
  const ys = rows.map((r) => r.label);

  let predict: (x: number) => number;
  if (method === "platt") {
    predict = v11.plattCalibrate(xs, ys).predict;
  } else {
    predict = v11.isotonicFit(xs, ys);
  }

  const preds = xs.map(predict);

  // Brier score
  const brier = preds.reduce((s, p, i) => s + (p - ys[i]) ** 2, 0) / preds.length;

  // AUC via Mann-Whitney U (trapezoidal ROC equivalent).
  const auc = rocAuc(preds, ys);

  // Decile bins for calibration curve.
  const idx = preds.map((_, i) => i).sort((a, b) => preds[a] - preds[b]);
  const bins: Array<{ n: number; p: number; o: number }> = [];
  const nBins = 10;
  const step = Math.max(1, Math.floor(idx.length / nBins));
  for (let b = 0; b < nBins; b++) {
    const chunk = idx.slice(b * step, b === nBins - 1 ? idx.length : (b + 1) * step);
    if (chunk.length === 0) continue;
    const p = chunk.reduce((a, i) => a + preds[i], 0) / chunk.length;
    const o = chunk.reduce((a, i) => a + ys[i], 0) / chunk.length;
    bins.push({ n: chunk.length, p, o });
  }

  return { method, predict, brier, auc, bins };
}

function rocAuc(scores: number[], labels: number[]): number {
  const pos = scores.filter((_, i) => labels[i] === 1);
  const neg = scores.filter((_, i) => labels[i] === 0);
  if (pos.length === 0 || neg.length === 0) return 0.5;
  let wins = 0;
  for (const p of pos) for (const n of neg) {
    if (p > n) wins++;
    else if (p === n) wins += 0.5;
  }
  return wins / (pos.length * neg.length);
}

/** Convenience: emit the artefact your promotion-gate `calibration_bins` needs. */
export function backtestBins(rows: TrainRow[], calibrator: TrainedCalibrator): Array<{ n: number; p: number; o: number }> {
  const preds = rows.map((r) => calibrator.predict(r.raw_score));
  const idx = preds.map((_, i) => i).sort((a, b) => preds[a] - preds[b]);
  const nBins = 10;
  const step = Math.max(1, Math.floor(idx.length / nBins));
  const out: Array<{ n: number; p: number; o: number }> = [];
  for (let b = 0; b < nBins; b++) {
    const chunk = idx.slice(b * step, b === nBins - 1 ? idx.length : (b + 1) * step);
    if (chunk.length === 0) continue;
    const p = chunk.reduce((a, i) => a + preds[i], 0) / chunk.length;
    const o = chunk.reduce((a, i) => a + rows[i].label, 0) / chunk.length;
    out.push({ n: chunk.length, p, o });
  }
  return out;
}
