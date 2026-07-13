# Data pipeline

Three sources, one job each. Don't mix them up.

```text
SCRAPY (discovery + signals)     REALIE (attributes)                 ZYTE (transport)
────────────────────────────     ──────────────────                  ────────────────
Spiders scrape county portals    Cache-first, batched enrichment:    Anti-bot proxy + headless
and marketplaces for reasons     physical facts, owner, tax/AVM,     browser. Used by marketplace
a parcel is a deal: distress,    transfers, liens, foreclosure,      spiders and blocked public
probate, code violations, tax    and geometry. Metered per HTTP      sources. It is transport,
liens, and fresh listings.       request with an atomic daily cap.   never a data source itself.

The funnel.                                                          The pipe.
```

## Minimum data to show a parcel on the map

1. `lat, lng`
2. `address, city, state`
3. `living_sqft, year_built` (so underwriting isn't defaults)
4. **A trigger in the last 180 days** — a distress event OR active listing.

Enforced in `listRankedParcels` and `getCoverage` via the SQL function
`parcels_with_active_trigger(_days int)`.

## Enrichment queue

Table `public.enrichment_queue`:

| column       | meaning                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `parcel_id`  | PK → parcels.id (CASCADE)                                                                          |
| `priority`   | int; higher runs first (foreclosure 300, probate 250, code_violation 200, listing 180, manual 100) |
| `reason`     | `foreclosure` / `probate` / `code_violation` / `tax_lien` / `listing` / `manual`                   |
| `status`     | `pending` → `inflight` → `done` \| `failed`                                                        |
| `attempts`   | worker gives up at 3                                                                               |
| `last_error` | last exception message                                                                             |

Two AFTER-INSERT triggers auto-enqueue:

- `distress_events_enqueue` (any distress event)
- `listings_enqueue` (any new listing)

Both only enqueue if the parent parcel is missing `living_sqft` OR
`year_built`. Realie is skipped when we already have the attributes.

## Cron worker

`POST /api/public/run-realie-enrichment` (scheduled every 15 min)

Body: `{ "batch": 25 }` (default 25, max 100). Auth: `CRON_SECRET` in the
`x-cron-secret` header, matching the other cron endpoints.

Per call: atomically claims top pending items ordered by priority and request
time, reuses snapshots/negative cache, clusters coordinate-bearing parcels for
location searches, falls back to a single-address lookup only for unmatched
records, and scores once after the batch. A budget-exhausted item returns to
`pending` without consuming a queue attempt. Emits one `ingestion_runs` row per
county with source `REALIE:enrichment`.

The default hard cap is 100 actual HTTP attempts per UTC day, with 20 reserved
for interactive work. Retries also consume reservations. Change
`orchestrator_config.realie_daily_call_limit` and
`realie_interactive_reserve` instead of estimating cost from the cron batch
size. See [Realie data and credit strategy](./realie.md).

## Admin visibility

`/admin/health` shows:

- Enrichment pipeline card: pending / inflight / done / failed / total,
  plus a chip per reason showing how many are still in flight for that
  trigger type.
- "Enriched (24h)" and "last run" — read directly off
  `ingestion_runs` where `source = 'REALIE:enrichment'`.
- Actual requests today, remaining daily credits, retries, and endpoint totals
  from `realie_usage_daily`.

## Scrapy coverage

Production spiders now cover LA LADBS, San Francisco DBI, NYC HPD, Zillow,
and Redfin. Marketplace crawls prioritize CA, FL, and OH. County-specific
foreclosure, probate, recorder, tax-lien, sale, and parcel spiders remain the
next coverage work; see `scrapy/README.md` for the current runnable inventory.

Each spider posts to `LOVABLE_INGEST_URL` with HMAC-SHA256 signature over
the raw body using `LOVABLE_INGEST_SECRET`. See `docs/scrapy.md` for the
pipeline reference.

Until at least one of these lands, the map correctly shows zero deals —
that's the pipeline working as designed (no trigger = not a deal), not a
bug.
