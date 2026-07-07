# Short-Term-Rental Data — Strategic Fit

The uploaded references (Airbnb `StaysPdpSections` + `StaysSearch` SSR blob,
Booking `recommendationPlatform.propertyCards`, Vrbo SSR, AirDNA Rentalizer
shape with `revenue_lower`/`revenue_upper`) are all **income-side** data for
residential real estate. Perfect Property Engine is a **distress + valuation**
engine. They meet in three places that materially move the product.

## 1. STR-underperformer distress signal  ⭐ highest ROI

A parcel that IS an active Airbnb/Vrbo listing but has:
- occupancy trending down 3+ months, OR
- ADR cut > 15% vs. same season last year, OR
- review score < 4.2 with < 10 reviews in 12 months, OR
- de-listed after being active > 6 months

…is a **motivated seller**. Owner made an STR bet, it's losing money, they
carry a mortgage. This is a new `event_type` alongside `PROBATE`,
`FORECLOSURE`, `CODE_VIOLATION`, `TAX_LIEN`:

```
event_type: 'STR_UNDERPERFORMER'
severity: 2–4 based on how bad the trend is
details: { platform, listing_id, adr_trend, occ_trend, months_active }
```

Match to parcels via the address in the listing's SSR blob → existing
`match_parcel_debug()` pipeline. Zero new infrastructure.

## 2. STR revenue upside on every deal card  ⭐ product differentiator

For ANY parcel we surface, run an AirDNA-Rentalizer-style estimate:
`(lat, lng, bedrooms, bathrooms, accommodates) → { adr, occupancy, revenue_lower, revenue_upper }`.

We don't need the AirDNA API — we build it ourselves from scraped Airbnb
comps within ~2km: median ADR × median occupancy × 365 × confidence band.
Same math AirDNA runs.

Surface on `/deals` as an "STR exit" chip:
> Est. STR gross: **$62k–$81k/yr** (14 comps within 1.8km)
> Cap on ARV: **11.4%**

This transforms "here's a distressed parcel" into "here's a distressed
parcel with a $73k/yr exit story." That's the pitch to LPs and the reason
someone picks us over PropStream.

## 3. Regulation-risk wave detector  · defer

Cities banning/capping STRs (NYC LL18, Dallas SUP, most of Barcelona) force
sudden inventory sell-offs. Track listing-count deltas per zip; when a
market drops > 20% MoM, flag every parcel in that zip as
`event_type: 'STR_REGULATION_FORCED_SALE'`. Requires 3+ months of history
before it's actionable — build after (1) and (2) are landed.

## Data model diff

Two new tables, one materialized view, all keyed to existing `parcels.id`:

```sql
-- Every listing we've ever seen, by platform
create table public.str_listings (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid references public.parcels(id),
  platform text not null,        -- 'AIRBNB' | 'BOOKING' | 'VRBO'
  external_id text not null,
  url text,
  bedrooms int, bathrooms numeric, accommodates int,
  lat double precision, lng double precision,
  first_seen date, last_seen date,
  is_active boolean default true,
  raw jsonb,
  unique (platform, external_id)
);

-- Time series: one row per (listing, month)
create table public.str_metrics (
  listing_id uuid references public.str_listings(id) on delete cascade,
  month date not null,           -- first-of-month
  adr numeric,                   -- avg daily rate (USD)
  occupancy numeric,             -- 0..1
  revenue numeric,               -- adr * occupancy * days
  reviews_added int,
  review_score numeric,
  primary key (listing_id, month)
);

-- Rentalizer-style estimate per parcel, recomputed nightly
create materialized view public.parcel_str_estimate as
select parcel_id, comp_count,
       percentile_cont(0.5) within group (order by adr) as adr_p50,
       percentile_cont(0.5) within group (order by occupancy) as occ_p50,
       percentile_cont(0.25) within group (order by revenue) as rev_p25,
       percentile_cont(0.75) within group (order by revenue) as rev_p75
from ...;  -- 2km radius, last 6 months
```

## Build order (ranked by ROI-per-hour)

| # | Piece                                              | Hours | Delivers                                        |
|---|----------------------------------------------------|-------|-------------------------------------------------|
| 1 | `str_listings` + `str_metrics` schema, migration   |  0.5  | Foundation                                      |
| 2 | Airbnb SSR-blob parser recipe (three test cities)  |  2    | Real listing data flowing in                    |
| 3 | `parcel_str_estimate` matview + nightly refresh    |  1    | Revenue estimate available per parcel           |
| 4 | STR-upside chip on `/deals` deal cards             |  0.5  | User-visible differentiator                     |
| 5 | Underperformer detector → writes `distress_events` |  1.5  | New distress signal, lights up existing tiers   |
| 6 | Booking + Vrbo recipes                             |  2    | Cross-platform coverage                         |
| 7 | Regulation-wave detector                           |  2    | Needs 90 days of history first, defer           |

Total to a shippable "STR-aware /deals" experience: **~5.5 hrs of build**.

## What we're NOT doing

- Not paying AirDNA. Their Rentalizer output shape is public; we compute
  the same statistics from raw scraped comps.
- Not becoming an STR-management product. This is income data in service
  of acquisition scoring, not a Guesty competitor.
- Not scraping calendars at scale (cookie-gated, high anti-bot cost). We
  read the SSR blob, which already carries pricing + booked-status for
  the next ~90 days.
