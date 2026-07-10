## Goal

Make parcels work end-to-end: add Realie as a live parcel/comps source, harden the existing ingest → score → dossier pipeline, and fix the bugs I find along the way.

## What Realie will do for us

Realie (`https://app.realie.ai/api`, `REALIE_API_KEY` already stored) gives us four endpoints we actually need:

| Endpoint | Uses in our app |
|---|---|
| `GET /public/property/address` | Single-address lookup for the "Add parcel" flow and dossier refresh |
| `GET /public/property/parcelId` | Refresh a known parcel by APN when county GIS data is stale |
| `GET /public/property/location` (lat/lng) | Discover neighboring parcels in a ring around a subject |
| `GET /public/premium/comparables` | Comps for ARV — replaces empty results from `pick_comps` when the local `sales` table is thin |

CLI (`realie lookup ...`) is not usable in production — the Cloudflare Worker runtime has no `child_process`. We call the HTTP API server-side instead.

## Plan

### 1. New Realie adapter — `src/lib/adapters/realie.ts`

Thin fetch wrapper:
- `realieLookupAddress({ address, state, unit? })`
- `realieLookupParcelId({ parcelId, state, county })`
- `realieLocationSearch({ lat, lng, radius, limit })`
- `realieComparables({ lat, lng, beds_min, beds_max, sqft_min, sqft_max, months_back })`

Each function reads `process.env.REALIE_API_KEY` inside the call (not at module scope — Worker env is per-request), attaches `Authorization: Bearer …`, throws typed errors on non-2xx, and normalizes the response into the shapes our engine already consumes (`ParcelInput`, comps rows with `{ ppsf, distance_km, sale_price, living_sqft, sold_at, address }`).

Register `REALIE` in `SourceKind` and add a `provider: "REALIE"` branch alongside ARCGIS/SOCRATA in `sources.ts` for counties where we prefer Realie over the county GIS (e.g. Travis TX where no ArcGIS is wired).

### 2. Server functions — `src/lib/parcels.functions.ts`

Add two new server fns next to the existing `listRankedParcels` / `getDossier`:

- `lookupParcelByAddress({ address, state, city?, county_fips? })`
  - Hits Realie address lookup, upserts into `parcels` (using existing `match_parcel` RPC to dedupe against county+APN or normalized address), runs the underwrite pipeline, upserts `parcel_scores`, appends a `decision_audit` row (same chain as `rerunUnderwrite`), returns `{ parcel_id, perfect_score }`.
- `refreshDossierFromRealie({ parcel_id })`
  - Re-hits Realie by APN (or by address if APN missing), updates parcel + score in place. Same audit append.

Both go through the existing `underwrite()` engine — no engine changes for correctness, only for the input-source path.

### 3. Comps fallback in the engine path

In `underwrite.functions.ts` (`rerunUnderwrite`) and `ingest.functions.ts` scoring path: if `pick_comps` RPC returns fewer than 3 rows AND the parcel has lat/lng, call `realieComparables()` and merge results into the `compsClean` array before passing to `underwrite()`. This directly kills the empty-ARV / `arv_source = "MODEL"` cases we see today.

### 4. Bug sweep on the parcels pipeline

I'll audit and fix in one batch:

- `src/lib/ingest.functions.ts` — verify all `Number(...)` coercions guard against `NaN` before insert; verify the `parcel_scores` upsert includes every v12 column we added (some new fields may be dropped silently), and ensure `data_source: "LIVE"` never gets stamped on failed underwrites.
- `src/lib/parcels.functions.ts` `listRankedParcels` — the `parcels!inner(...)` join with `.eq("parcels.county_fips", …)` is correct, but confirm the `min_score`/`min_profit`/`max_offer` filters don't shadow the ORDER BY (they don't, but I'll double-check the query builder call order).
- `src/lib/parcels.functions.ts` `getDossier` — currently errors when `parcel_scores` row is missing (`.single()` throws). Switch to `.maybeSingle()` and let the UI render "not scored yet" instead of a 500.
- `src/components/DossierPanel.tsx` — guard the new V12/Credit/Gates blocks against `null` score.
- `src/routes/deals.tsx` `StressPanel` — ARV fallback currently uses `r.risk_adjusted_profit` when scope is missing, which is a category error (RAP is not an ARV). Fall back to `full_reno_arv || cosmetic_arv || as_is_value` instead.
- Confirm `src/routes/api/public/scrapy-ingest.ts` still writes the v12 columns; if not, wire the same shape as `rerunUnderwrite`.

### 5. UI — one small addition on `src/routes/deals.tsx`

An "Add by address" input above the table:
- Calls `lookupParcelByAddress`
- On success, invalidates the list query and opens the dossier for the new `parcel_id`
- Shows the Realie error verbatim on failure (no PII in it)

No other UI redesign — the existing dossier / stress panel / monitoring stays.

### 6. Verification (after build mode)

- `tsgo` typecheck.
- `stack_modern--invoke-server-function` on `lookupParcelByAddress` with a known Austin TX address; check that a `parcels` row + `parcel_scores` row + `decision_audit` row appear.
- `psql -c "select count(*) from parcel_scores where arv_source='COMPS'"` before/after to confirm the comps-fallback lifts coverage.
- Load `/deals`, open the new parcel's dossier, screenshot via Playwright to confirm the V12/Credit/Gates blocks render with real numbers.

## Not doing

- Not touching the underwriting math, gate logic, monitoring cron, or `parcel_scores` schema.
- Not shelling out to the `realie` CLI (would fail in production).
- Not adding a batch Realie backfill job in this pass — one-address-at-a-time + comps fallback first; batch later if you want it.

## Notes for the technical reviewer

- Realie's REST base is `https://app.realie.ai/api`, endpoints under `/public/property/*` and `/public/premium/comparables`. Auth is a bearer token in the `Authorization` header.
- `REALIE_API_KEY` must be read inside handlers, not at module top-level — Worker env injection is per-request.
- Realie calls happen only from server functions and `_authenticated` loaders; the key is never exposed to the client.
