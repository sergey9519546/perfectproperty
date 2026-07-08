# Next 10 Steps

The v12 / credit / monitoring / warehouse modules exist as pure math libraries but nothing in the app calls them yet. These tasks wire them into the pipeline, the DB, and the UI in dependency order.

## Backend / engine wiring

1. **Wire v12 valuation into `src/lib/engine.ts`**
   Replace the v11 ARV path with `arvTodayComps` + `sampleArvExit`, plumb `driftUsed` and `lightgbmDivergence`, and expose the new fields (`arv_today`, `arv_exit_p5/p50/p95`, `drift_used`, `divergence`) on the underwrite result.

2. **Enforce Gate 0–8 staging (`gate3TrustLock`)**
   Add a `gate_status` object to every underwrite return; block map glow / Prophecy ranking / institutional scoring behind the gate flags. Central helper `computeGates(deal, dataQuality)`.

3. **Monte-Carlo risk block**
   Run `primaryRankFromMC`, `downsideDisplay` (P5/P50/P95, P(loss), CVaR), `retailScore`, and `survivalFactorV12` inside `engine.ts` and persist the summary on the deal row.

4. **Credit layer per deal**
   Compute `PDSplit`, `EAD`, `LGD`, `EL`, `RAP` in `engine.ts` using `HAZARD_COEFS_DEFAULT` seeded from deal features; store on the deal.

5. **DB migration for new columns + `decision_audit` table**
   Add columns for v12 valuation, gate status, MC risk, and credit outputs to `deals`. Create `decision_audit` (hash-chained via `appendDecision`) with proper `GRANT`s and RLS.

## Server functions / jobs

6. **`underwrite.functions.ts` server fn**
   New `createServerFn` that takes a `deal_id`, runs the full v12 + credit pipeline, writes results, and appends a `decision_audit` row. Called from the deal page and from batch jobs.

7. **Portfolio + monitoring nightly job**
   Cron route under `src/routes/api/public/run-monitoring.ts` (bearer-secret, same pattern as `run-recipes.ts`) that computes `portfolioLossStats`, `hhi`, `lcr`, PSI, calibration, and `riskAppetiteBreached`, writing to a new `portfolio_metrics` table.

## UI surfaces

8. **Dossier panel: risk + credit tabs**
   Extend `src/components/DossierPanel.tsx` with tabs for Valuation (P5/P50/P95, divergence), Risk (primary rank, CVaR, survival), Credit (PD split, EL, RAP), and Gates (which of 0–8 passed).

9. **Admin monitoring dashboard**
   New route `src/routes/monitoring.tsx` rendering the latest `portfolio_metrics` row: PSI bands, calibration slope, HHI, LCR, EL/VaR/CVaR/EC/RAROC, risk-appetite breach reasons.

10. **Stress-test panel on deals page**
    In `src/routes/deals.tsx`, add a scenarios selector (base / -15% ARV / rate+200bps / hold+3mo) using `stressedDeal` and `portfolioStressLossMean`; show per-deal `EProfit` delta and portfolio loss.

## Technical notes

- Tasks 1–4 are all inside `engine.ts` and share a single return-shape refactor; do them in one pass to avoid churning callers twice.
- Task 5 must land before 6/7 or the writes fail.
- Task 6 is the only new server-fn; tasks 8–10 read what it wrote (no direct engine calls from components).
- All new tables need `GRANT`s + RLS per project rules; `decision_audit` is service-role write, authenticated read-own.

Confirm this ordering (or tell me which of the 10 to drop / reorder) and I'll start with tasks 1–5 as one batch.