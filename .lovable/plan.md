# Scrapy/Zyte orchestration + Realie contract + provenance UI

Three coordinated workstreams. Everything below is additive to the trigger-based pipeline already shipped (`enrichment_queue`, `parcels_with_active_trigger`, `/api/public/run-realie-enrichment`).

---

## 1) Scrapy/Zyte orchestration (funnel side)

**Goal:** maximize *triggered parcels/day* under a fixed Zyte budget without banging any single county too hard.

### Priority model (per-spider, per-target)

A single `scrape_targets` table drives every spider. Rows are (county_fips, source_kind, url_or_query, priority, cadence). Priority is computed daily:

```
priority = w1 * trigger_yield_30d          -- distress+listing events last 30 days per 1k requests
         + w2 * conversion_to_realie       -- % of scraped rows that end up enriching a parcel
         + w3 * deal_score_lift            -- avg parcel_scores.overall for parcels this source found
         - w4 * cost_per_trigger_usd       -- Zyte spend / trigger delivered
         - w5 * staleness_penalty          -- hours since last successful crawl
```

Weights live in `orchestrator_config` (single row, editable in admin). Nightly job recomputes priority; scheduler pulls top-N per tick.

### Rate-limit + budget controls

Enforced at the orchestrator, not per-spider:

- **Per-host token bucket** (Redis or Postgres advisory lock): `requests_per_min` and `concurrent_requests` per hostname. Default 30/min, 4 concurrent.
- **Per-county daily cap**: max requests/day, prevents one county monopolizing.
- **Zyte daily $ cap**: hard stop when spend crosses threshold; scheduler skips Zyte-flagged targets and falls back to direct fetch for that day.
- **Backoff on signal**: 429/403/captcha increments `source_health.penalty`; target skipped for `2^penalty * 15min`. Cleared on first success.
- **Zyte only when needed**: target row has `needs_zyte: bool`. Spiders try direct first; on block, mark `needs_zyte=true` and re-queue.

### Coverage-first scheduling

Every tick the scheduler picks jobs in this order:
1. Counties with 0 triggers in last 7 days (cold coverage) — floor of 20% of budget.
2. Highest `priority` targets (hot coverage).
3. Refresh cadence sweeps (weekly for stale sources).

Result surfaced on admin dashboard: coverage matrix (county x source_kind) with color = days-since-trigger.

### New tables (this repo)

- `scrape_targets` — the queue Scrapy pulls from via `/api/public/next-scrape-targets`.
- `scrape_runs` — one row per spider execution, records cost, requests, triggers produced, blocks.
- `orchestrator_config` — single-row weights + caps.

Scrapy pulls targets via signed request, posts results to the existing ingestion webhook, and posts run stats to `/api/public/scrape-run-complete`.

---

## 2) Realie input data contract

Realie is called only when a parcel has a trigger AND we're missing underwriting inputs. To make re-underwrite reliable, define the exact required output shape.

### Required fields (Realie must return, else mark `insufficient`)

| Field | Type | Purpose in underwrite | Min freshness | Min confidence |
|---|---|---|---|---|
| `living_sqft` | int | ARV, comp matching | assessor within 24 mo | 0.8 |
| `year_built` | int | condition curve | any age | 0.9 |
| `beds` | int | comp filter | 24 mo | 0.7 |
| `baths` | numeric(3,1) | comp filter | 24 mo | 0.7 |
| `lot_sqft` | int | ARV bump | 24 mo | 0.7 |
| `assessed_value` | numeric | fallback ARV floor | 12 mo | 0.8 |
| `last_sale_price` | numeric | equity math | any | 0.9 |
| `last_sale_date` | date | equity/tenure | any | 0.9 |
| `owner_name` | text | absentee flag | 12 mo | 0.7 |
| `owner_mailing_address` | text | absentee flag | 12 mo | 0.7 |
| `property_type` | enum | SFR gate | any | 0.9 |
| `lat`, `lng` | float | comps, map | any | 0.95 |

### Optional (boost score if present)

`hoa_fee`, `taxes_annual`, `zoning`, `last_permit_date`, `condition_grade`.

### Contract wrapper (what Realie writes into `parcels` + provenance)

Every enrichment response is validated by Zod against:

```ts
RealieResponse = {
  fields: Record<FieldName, { value: unknown; confidence: number; source: string; observed_at: string }>,
  provider_request_id: string,
  cost_usd: number,
}
```

Rules:
- Reject the whole response if any **required** field is missing or below its `min_confidence` — mark queue row `insufficient`, no partial writes.
- Merge policy: field is overwritten only if `incoming.confidence > existing.confidence` OR `incoming.observed_at` is newer by >90 days.
- After merge, re-underwrite is auto-triggered via existing `/api/public/rerun-underwrite`.

### Freshness policy

Each field carries `observed_at`. Underwriter downgrades score when any input is >18 months old. Parcels with >3 stale required fields go back on `enrichment_queue` at low priority.

---

## 3) Per-field provenance + confidence UI

Users need to see *why* a deal scores what it does.

### Data model

New table `field_provenance`:
- `parcel_id`, `field_name`, `value`, `confidence` (0–1), `source` (e.g. `REALIE`, `SCRAPY:miamidade_foreclosure`, `COUNTY_ASSESSOR`), `provider_request_id`, `observed_at`, `written_at`.
- One row per (parcel, field, source). Latest-per-field is the "live" value.

Writes:
- Realie enrichment worker writes one row per field.
- Scrapy ingestion webhook writes provenance for every field it sets.
- Underwriter reads latest-per-field to build `parcel_scores`, and stamps `parcel_scores.inputs_provenance` (jsonb) with `{field: {source, confidence, observed_at}}` — snapshot at score time.

### Score confidence

`parcel_scores.score_confidence` = weighted product of the confidence of the fields that actually drove the score (ARV inputs weighted highest). Stored alongside `overall`.

### UI: Deal drawer → "Why this score" tab

On the parcel detail drawer, add a section with:

```text
Score  82   Confidence  0.71  (Medium)
────────────────────────────────────────
ARV $412k    from: living_sqft, comps(6)
  living_sqft   1,840   ● 0.90   REALIE      2026-06
  year_built    1968    ● 0.95   ASSESSOR    2025-11
  beds/baths    3 / 2   ● 0.80   REALIE      2026-06
Equity $180k from: last_sale + assessed
  last_sale     $232k   ● 0.95   DEED        2019-04
Trigger       Foreclosure filed 2026-05-02
  source: SCRAPY:miamidade_foreclosure  ● 1.00
────────────────────────────────────────
Stale fields: none.   [Refresh from Realie]
```

Confidence dot color: green ≥0.85, amber 0.65–0.84, red <0.65. Clicking any row opens a small popover with the full history of that field (all provenance rows, newest first).

### Homepage / list

- Add a confidence pill next to each deal score.
- Coverage strip shows: `524 triggered · avg confidence 0.78 · 42 stale`.

---

## Technical rollout

Order minimizes blocked steps:

1. **Migration**: `scrape_targets`, `scrape_runs`, `orchestrator_config`, `field_provenance` (all with GRANTs + RLS + `service_role` full access; `authenticated` read on `field_provenance` for the UI).
2. **Server functions**: `getFieldProvenance(parcelId)`, `getCoverageMatrix()`, `getOrchestratorStats()`.
3. **Public routes**:
   - `GET /api/public/next-scrape-targets` — HMAC signed, returns N targets respecting budget/rate.
   - `POST /api/public/scrape-run-complete` — records `scrape_runs` row, updates `source_health`.
   - Extend the existing ingestion webhook to also write `field_provenance` for every field.
   - Extend `/api/public/run-realie-enrichment` to enforce the Zod contract above and write per-field provenance.
4. **Underwriter** (`src/lib/parcels.functions.ts`): read latest-per-field, compute `score_confidence`, stamp `inputs_provenance`.
5. **UI**:
   - Deal drawer "Why this score" tab.
   - Confidence pill on parcel list + map popup.
   - `/admin/health` — add coverage matrix + orchestrator budget widget.
6. **Nightly cron**: `recompute-scrape-priorities` (SQL only, `pg_cron`).

### Non-goals (this plan)

- No Scrapy repo code — that stays in the external project; this plan defines only the contracts it must speak.
- No change to trigger definition (still distress event or listing within 180 days).
- No new auth surface — provenance is public-readable at the same level as `parcel_scores`.
