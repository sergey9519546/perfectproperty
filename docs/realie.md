# Realie data and credit strategy

Realie is the authoritative enrichment source for public-record property facts.
It is not the discovery feed for active deals. Scrapy/Zillow/Redfin provide
fresh listings and distress triggers; Realie fills in the property, ownership,
valuation, transfer, debt, and location record after a parcel becomes relevant.

## Data retained from a property response

Every successful response is stored as a complete JSON snapshot in
`realie_property_snapshots`. The normal parcel columns are only a working
projection; the snapshot prevents useful provider fields from being discarded
as the application schema evolves.

| Category             | Useful fields                                                                                                                                                   | Primary use                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Identity and address | Realie parcel ID, APN, full/street/unit address, city, county, state, ZIP                                                                                       | Stable matching and deduplication                          |
| Physical property    | building/land area, beds, baths, stories, year built, construction, foundation, roof, wall, basement, garage, fireplace, pool, building count, residential flag | Rehab scope and valuation                                  |
| Ownership            | owner name, mailing address, residential/commercial/parcel counts, ownership start date                                                                         | Absentee/corporate/multi-property-owner signals            |
| Land and zoning      | legal description, subdivision, zoning, block, lot, acres, frontage                                                                                             | Expansion and redevelopment feasibility                    |
| Assessment and tax   | assessed land/building/total values, assessment history, tax amount/year                                                                                        | Basis, tax pressure, and quality checks                    |
| AVM and market value | model/market value and confidence range                                                                                                                         | A secondary valuation anchor, never a substitute for comps |
| Transfers            | recording/transfer dates, prices, document data, grantors/grantees, transfer history                                                                            | Ownership history and deed normalization                   |
| Mortgage and liens   | lender, balances, lien count, LTV, equity                                                                                                                       | Seller motivation and finance risk                         |
| Foreclosure/distress | status/code, case and filing dates, auction date                                                                                                                | Distress signals and urgency                               |
| Geography            | county FIPS, census/neighborhood identifiers, latitude/longitude, point/polygon geometry                                                                        | County routing, map placement, and spatial matching        |

Realie is not treated as authoritative for current listing status, price cuts,
schools, flood risk, vacancy, or physical condition. Those continue to come
from marketplace spiders, public agencies, FEMA, and inspection/user evidence.

Official references: [property schema](https://docs.realie.ai/api-reference/property-data-schema),
[address lookup](https://docs.realie.ai/api-reference/property/address-lookup),
[property search](https://docs.realie.ai/api-reference/property/property-search),
[location search](https://docs.realie.ai/api-reference/property/location-search), and
[premium comparables](https://docs.realie.ai/api-reference/premium/premium-comparables-search).

## Request waterfall

Realie prices the API by request, so a response containing many safely matched
properties is more credit-efficient than one request per address.

1. Reuse an unexpired raw property snapshot.
2. Stop on an unexpired negative-cache entry for the normalized lookup.
3. Cluster queued parcels that already have coordinates and use location search,
   within Realie's radius and 100-result limits.
4. Use bounded property search as an exact-address fallback when the input has
   a city but no county. Broad first-page city results are not assumed complete.
5. Use single-address lookup only for unmatched records with valid address
   components. A city is never sent to that endpoint without its county.
6. Store the full response once, update the normalized parcel projection, and
   score the completed batch once. Background enrichment never requests paid
   premium comparables.

There is no documented multi-address endpoint. For state- or nationwide bulk
acquisition, use Realie's [bulk licensing](https://docs.realie.ai/bulk-data)
instead of attempting to page the metered API across the country.

## Budget and cache controls

`orchestrator_config` owns the runtime controls:

| Setting                          | Default | Meaning                                       |
| -------------------------------- | ------: | --------------------------------------------- |
| `realie_daily_call_limit`        |     100 | Hard UTC-day cap across endpoints and retries |
| `realie_interactive_reserve`     |      20 | Credits protected from background workers     |
| `realie_property_cache_ttl_days` |      90 | Full property snapshot freshness window       |
| `realie_comp_cache_ttl_days`     |      21 | Premium comparable response freshness window  |
| `realie_negative_cache_ttl_days` |      30 | No-match suppression window                   |

`reserve_realie_call` atomically reserves a credit immediately before every
HTTP attempt, including retries. Once the background allowance is spent, the
worker returns untouched work to `pending`; it does not burn retry attempts.
`realie_usage_daily` is the authoritative request ledger shown in admin health.

Premium comparables are cache-first and only fetched by an explicit interactive
underwrite. Scheduled underwriting can reuse a valid cached response but cannot
create a paid premium request.

## Deployment order

Apply migrations in filename order before deploying code that references the
new caches and RPCs:

1. `20260713200000_reliability_and_worker_security.sql`
2. `20260713210000_realie_credit_optimization.sql`
3. Deploy the application with `REALIE_API_KEY`, Supabase service credentials,
   and `CRON_SECRET` configured.

The second migration installs the 15-minute queue schedule using the existing
Lovable production URL and the `cron_secret` stored in Supabase Vault.
