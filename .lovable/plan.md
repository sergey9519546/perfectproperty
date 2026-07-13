
## The real problem (not what it looks like)

Today's DB tells a clearer story than "524 parcels missing sqft":

| Table | Rows | Meaning |
|---|---|---|
| `parcels` (LIVE) | 1,014 | Addresses we know about |
| `parcels` with sqft+year | 490 | Enough to underwrite |
| `sales` | 4,939 | Comps (good) |
| `distress_events` | **0** | **No reason any of these are deals** |
| `listings` | **0** | **No on-market signal either** |

Even the 490 "enriched" parcels are just houses with defaults for owner/vacancy/absentee — the score is math over assumptions, not over a real deal trigger. That's why the ranked list collapses to identical numbers.

**The fix isn't more sqft. It's giving each parcel a reason to be shown.**

## Role of each source (one job each — stop overlapping them)

```text
SCRAPY (discovery + signals)     realie enrichment (attributes)      ZYTE (transport)
────────────────────────────     ──────────────────────────────      ────────────────
- foreclosure filings            - sqft, year, beds/baths            - proxy + headless
- probate cases                  - owner name, mailing addr          - used silently by
- code violations                - assessed value, tax status          scrapy + arcgis
- tax delinquents                - last sale price / date              adapters when the
- absentee-owner rolls           - listing status (some markets)       county site blocks
- MLS scrapes / new listings                                           direct fetch
- county parcel drops (thin)     Called ONLY when a parcel has        
                                 a fresh trigger AND is missing       Never a "source"
Cheap. Volume. Nightly.          the fields underwriting needs.       on its own.
                                 Metered $/call — must be gated.
```

Rule: **Realie is the wallet. Scrapy is the funnel. Zyte is the pipe.** Never call Realie for a parcel without a trigger.

## Minimum data a parcel needs before it hits the map

1. `lat/lng` — pin
2. `address, city, state` — label
3. `living_sqft, year_built` — non-default underwrite
4. **At least one trigger in the last 180d** — the reason it's a deal:
   - distress event (foreclosure / probate / code violation / tax lien), OR
   - active listing priced below county median $/sqft, OR
   - recent absentee-owner + long tenure (>15y), OR
   - operator manual lookup

`listRankedParcels` already filters 1–3. It should also require 4. Anything else is noise on the map.

## The pipeline to build

```text
   ┌───────── Scrapy Cloud (nightly, per county) ─────────┐
   │  spider:foreclosure  → recipe:foreclosure            │
   │  spider:probate      → recipe:probate                │
   │  spider:codeviol     → recipe:code_violation         │
   │  spider:mls_new      → recipe:listing  (new)         │
   │  spider:parcel_drop  → recipe:parcel   (thin)        │
   └───────────────────────┬──────────────────────────────┘
                           │  HMAC webhook → /api/public/scrapy-ingest
                           ▼
              distress_events / listings / sales / parcels
                           │
                           ▼
              DB trigger: enqueue_enrichment()
                fires when a parcel gains a trigger
                AND is missing sqft/year/beds
                           │
                           ▼
                enrichment_queue (new table)
                  priority = signal_recency * county_weight
                  status: pending → inflight → done | failed
                           │
                           ▼
        cron: /api/public/run-realie-enrichment
          pulls top N (daily budget cap, e.g. 300)
          calls realieLookupAddress()
          upserts parcel, marks queue done
                           │
                           ▼
        cron: /api/public/rerun-underwrite (exists)
          re-scores touched parcels
                           │
                           ▼
                    parcel_scores
                           │
                           ▼
              Map + Deals (already filter to real inputs;
              add "has trigger" filter in same server fn)
```

## What to build, in order

**1. Kill the ghost rows in one migration**
   - Add `has_trigger` boolean column on `parcel_scores` (or compute in server fn via join).
   - Update `listRankedParcels` + `getCoverage` to require a trigger. Result: map goes from 490 → whatever has real signals (likely a small number until spiders run — this is correct).

**2. `enrichment_queue` table + trigger**
   ```
   enrichment_queue(
     parcel_id uuid PK,
     priority int,
     reason text,          -- 'foreclosure' | 'probate' | 'listing' | 'manual'
     status text,          -- pending|inflight|done|failed
     attempts int, last_error text,
     requested_at, completed_at
   )
   ```
   Trigger on `distress_events` insert + on `listings` insert: enqueue parent parcel if `parcels.living_sqft IS NULL OR year_built IS NULL`.

**3. `/api/public/run-realie-enrichment` (server route)**
   - HMAC-guarded like the other cron endpoints.
   - Pulls `LIMIT :budget` from queue ordered by priority.
   - Calls existing `realieLookupAddress`, upserts parcel row.
   - Marks queue done; failures increment attempts, back off at 3.
   - Emits `ingestion_runs` row `source = REALIE:enrichment`.
   - Wire pg_cron to hit it every 15 min with a daily cap column.

**4. Auto-rerun-underwrite**
   - After enrichment finishes a batch, POST to existing `/api/public/rerun-underwrite` for the touched parcel_ids.

**5. Spider inventory (parallel work in the scrapy repo)**
   - Current: only `smoke` exists. Nothing is discovering signals.
   - Highest-leverage first (matches the counties already in DB):
     - Miami-Dade (12086): Clerk foreclosure filings, probate court
     - Los Angeles (06037): LA County Recorder NOD/NOS, code enforcement
     - NYC boroughs (36061/36005/36081): ACRIS distress deeds, HPD violations, PLUTO parcels
     - SF (06075): Assessor sales, DBI complaints
   - One recipe per source; all push to the same webhook. This is what turns `distress_events` from 0 → real numbers.

**6. Small operator surface (admin only)**
   - Queue depth, daily Realie spend, last cron run, per-recipe row counts in last 24h.
   - Already have `admin.health.tsx` — add three cards.

## Cost math (why the gating matters)

If Realie is ~$0.05/call and we blindly enrich all 524 unenriched parcels: ~$26 once, then again every time Scrapy discovers a new address. With a trigger gate + a 300/day cap, cost stays predictable and every call is spent on a parcel that already has a reason to be a deal.

## What NOT to do

- Do not backfill Realie for the 524 unenriched parcels right now. They have no triggers — you'd pay to enrich random houses. Enrich them **after** a spider produces a signal for them.
- Do not add more `data_source` variants. Keep `LIVE` for real, `SCRAPY` for smoke-only until it's producing real recipes, then merge.
- Do not expand Zyte usage on its own — it's a transport, not a source.

## Deliverables for this turn

If you approve, I'll ship in this order:
1. Migration: `enrichment_queue` + triggers + `has_trigger` view/column.
2. `/api/public/run-realie-enrichment` route + wire to existing cron.
3. Update `listRankedParcels`/`getCoverage` to require a trigger.
4. Admin health cards for queue + Realie spend.
5. A `docs/pipeline.md` describing the spider recipes we still need in the Scrapy repo (that work happens there, not here).

Steps 1–4 are all in this repo. Step 5 is the checklist you take to the Scrapy project.
