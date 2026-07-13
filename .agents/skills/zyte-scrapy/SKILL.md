---
name: zyte-scrapy
description: How this project integrates with Zyte (Scrapy Cloud project 870105) — the ingest webhook contract, HMAC signing, recipe types, fallback fetcher, and admin job control. Load whenever the user mentions Zyte, Scrapy, spiders, scrapinghub, shub, or county data ingestion.
---

# Zyte / Scrapy integration

The engine ingests county distress data (foreclosures, probate, code violations, sales, parcels) through two Zyte surfaces:

1. **Scrapy Cloud → webhook push** — spiders POST scraped items to `/api/public/scrapy-ingest`.
2. **Zyte API extraction** — server-side fallback fetcher when a county portal geoblocks or anti-bots our direct call.

Both are gated on `ZYTE_API_KEY` (server secret). Scrapy Cloud project id defaults to `870105` (`ZYTE_PROJECT_ID` overrides).

## Webhook contract (`/api/public/scrapy-ingest`)

- **Auth**: HMAC-SHA256 over the raw request body using `SCRAPY_INGEST_SECRET`. Header: `x-scrapy-signature: sha256=<hex>`. Unsigned → `401 Invalid signature`.
- **Body**: `{ recipe: string, items: object[] }`. `recipe` ∈ `foreclosure | probate | code_violation | sale | auction | parcel`.
- **Routing**: writes to `distress_events` (foreclosure/probate/code_violation), `sales` (sale/auction), `parcels` (parcel). Every batch logs to `ingestion_runs` as `source = SCRAPY:<recipe>` — visible on `/admin`.
- Item shape matches the adapter output for that recipe. See `src/routes/api/public/scrapy-ingest.ts` for the exact schema.

## Spider-side setup (in the Scrapy repo, not this one)

Env / job settings in Scrapy Cloud → Spiders → Settings:

```
LOVABLE_INGEST_URL=https://perfectproperty.lovable.app/api/public/scrapy-ingest
LOVABLE_INGEST_SECRET=<same value as SCRAPY_INGEST_SECRET here>
LOVABLE_RECIPE=foreclosure   # or per-spider
```

Pipeline: `LovableIngestPipeline` (see `docs/scrapy.md`) batches items and POSTs with the HMAC header.

## Zyte fallback fetcher (server-side)

- `src/lib/zyte.server.ts` exports `zyteFetch()` and `zyteFetchLike()` (fetch-shaped wrapper).
- Used by `src/lib/adapters/arcgis.ts` and `src/lib/ingest-preflight.ts`: if a direct GIS request fails/times out, we retry through Zyte before tripping the circuit breaker. Note appears as `"OK via zyte (direct: <err>)"` in `source_health.last_error`.
- `browser: true` uses Zyte's headless browser for JS-gated portals.
- Auth: HTTP Basic, `ZYTE_API_KEY` as username, empty password.

## Scrapy Cloud job control

`src/lib/zyte.functions.ts` exposes admin-only server fns:
- `getZyteStatus` → last 15 jobs (`scrapyCloudListJobs`)
- `scheduleZyteJob({ spider, recipe })` → POST to `app.zyte.com/api/run.json`; passes `LOVABLE_RECIPE` via `job_settings`

Rendered by `ZytePanel` in `src/routes/admin.health.tsx`.

## Rules

- **Never** import `zyte.server.ts` at module scope of a `*.functions.ts` file — dynamic-import inside the handler only (server-only enforcement).
- **Never** log or return `ZYTE_API_KEY` or the Basic auth header.
- **Do not** add a spider-side dependency on our Supabase schema — the webhook is the only contract.
- Prefer the fallback fetcher over widening breaker thresholds; a portal that only responds via Zyte is a normal steady state, not a degraded one.
- When a new recipe is added, update the webhook schema, the router switch, and this skill in the same PR.

## Key files

- `src/lib/zyte.server.ts` — extraction + Scrapy Cloud API
- `src/lib/zyte.functions.ts` — admin server fns
- `src/routes/api/public/scrapy-ingest.ts` — webhook
- `src/routes/admin.health.tsx` — `ZytePanel`
- `src/lib/adapters/arcgis.ts`, `src/lib/ingest-preflight.ts` — fallback call sites
- `docs/scrapy.md` — spider-side pipeline reference
