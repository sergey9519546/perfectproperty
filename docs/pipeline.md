# Data pipeline

Three sources, one job each. Don't mix them up.

```text
SCRAPY (discovery + signals)     REALIE (attributes)                 ZYTE (transport)
────────────────────────────     ──────────────────                  ────────────────
Nightly spiders scrape county    Per-address enrichment: sqft,       Anti-bot proxy + headless
portals for the reasons a        year, beds, baths, owner,           browser. Used silently by
parcel is a deal: foreclosure    assessed value, last sale.          Scrapy adapters and by our
filings, probate, code           $/call — never called for a         own ArcGIS adapter when
violations, tax liens, new       parcel without a trigger.           the county site blocks
listings. Also thin parcel                                           direct fetch. NEVER a data
drops. Cheap. Volume.            The wallet.                         source on its own.

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

| column        | meaning                                                     |
|---------------|-------------------------------------------------------------|
| `parcel_id`   | PK → parcels.id (CASCADE)                                   |
| `priority`    | int; higher runs first (foreclosure 300, probate 250, code_violation 200, listing 180, manual 100) |
| `reason`      | `foreclosure` / `probate` / `code_violation` / `tax_lien` / `listing` / `manual` |
| `status`      | `pending` → `inflight` → `done` \| `failed`                 |
| `attempts`    | worker gives up at 3                                        |
| `last_error`  | last exception message                                      |

Two AFTER-INSERT triggers auto-enqueue:
- `distress_events_enqueue` (any distress event)
- `listings_enqueue` (any new listing)

Both only enqueue if the parent parcel is missing `living_sqft` OR
`year_built`. Realie is skipped when we already have the attributes.

## Cron worker

`POST /api/public/run-realie-enrichment`  (scheduled every 15 min)

Body: `{ "batch": 25 }` (default 25, max 100). Auth: Supabase anon key in
`apikey` header (matches the other cron endpoints).

Per call: pulls top N pending items ordered by priority + requested_at,
marks them `inflight`, calls `lookupParcelByAddressCore` (which upserts
the parcel and re-runs underwriting), then marks each `done` or bumps
`attempts`/`failed`. Emits one `ingestion_runs` row per county with
source `REALIE:enrichment`.

Cap: 25 items × every 15 min = ~2,400 Realie calls / day worst case.
Adjust batch size on the schedule if you want a tighter cap.

## Admin visibility

`/admin/health` shows:
- Enrichment pipeline card: pending / inflight / done / failed / total,
  plus a chip per reason showing how many are still in flight for that
  trigger type.
- "Enriched (24h)" and "last run" — read directly off
  `ingestion_runs` where `source = 'REALIE:enrichment'`.

## What still needs to happen in the Scrapy repo

The webhook `/api/public/scrapy-ingest` is live and already accepts
recipes `foreclosure | probate | code_violation | sale | parcel`. Only
`smoke` exists on the Scrapy side right now. Real spiders to add, in
descending leverage order (matches the counties we already have parcels
for):

| County (FIPS)          | Source                                              | Recipe          |
|------------------------|-----------------------------------------------------|-----------------|
| Miami-Dade (12086)     | Clerk of Court — foreclosure filings                | foreclosure     |
| Miami-Dade (12086)     | Probate court public records                        | probate         |
| Los Angeles (06037)    | LA County Recorder — NOD / NOS                      | foreclosure     |
| Los Angeles (06037)    | LA Building & Safety — code enforcement             | code_violation  |
| NYC (36061/36005/36081)| ACRIS — distress deeds                              | foreclosure     |
| NYC (36061/36005/36081)| HPD violations                                      | code_violation  |
| NYC (36061/36005/36081)| PLUTO parcel drop (annual)                          | parcel          |
| San Francisco (06075)  | Assessor sales                                      | sale            |
| San Francisco (06075)  | DBI complaints                                      | code_violation  |

Each spider posts to `LOVABLE_INGEST_URL` with HMAC-SHA256 signature over
the raw body using `LOVABLE_INGEST_SECRET`. See `docs/scrapy.md` for the
pipeline reference.

Until at least one of these lands, the map correctly shows zero deals —
that's the pipeline working as designed (no trigger = not a deal), not a
bug.
