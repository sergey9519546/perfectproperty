## Why the map looks clustered — diagnosis

I checked the parcels table. The **only reason data is concentrated in LA, NYC, and SF** is that the ingestion pipeline is hardcoded to those 4 counties:

```
LA County (06037)  → 304 LIVE parcels
NYC PLUTO (36061)  → 250 LIVE
Bronx (36005)      → 247 LIVE
San Francisco      → 210 LIVE
Queens (36081)     → 3 LIVE
+ 4 FIXTURE counties (fake demo data)
```

Root causes:
1. **`src/lib/adapters/sources.ts` hardcodes 4 counties** (LA, SF, NYC PLUTO, Chicago). Every other US county has zero coverage by design.
2. **Per-run cap of ~300 parcels** in `ingestCounty` (max 2000). NYC PLUTO alone has ~860,000 lots — we're pulling 0.03%.
3. **Realie is used only for one-off address lookups** (`lookupParcelByAddress` + `bulk_lookup_items`), never for bulk expansion.
4. **Zyte + Scrapy secrets are set** (`ZYTE_API_KEY`, `SCRAPY_INGEST_SECRET`) and the adapter-recipe system works, but the only real recipe in DB is a demo (`books.toscrape`) and one Miami-Dade foreclosure calendar that targets `distress_events`, not `parcels`. Nothing is scraping parcels via Zyte/Scrapy.
5. **Firecrawl is not wired at all** — no connector, no adapter.

So the answer to "why can't it use the scrape tools": the tools exist, they're just not pointed at any real parcel sources yet.

---

## Plan to broaden coverage

### Phase 1 — Turn on more free public GIS (fastest, no scraping)
Add ArcGIS/Socrata sources for the top 30–50 US counties by transaction volume. Every one below has a documented open endpoint and needs only a new entry in `COUNTY_SOURCES`:

- **FL**: Miami-Dade (12086), Broward (12011), Palm Beach (12099), Orange/Orlando (12095), Hillsborough/Tampa (12057), Duval/Jacksonville (12031)
- **TX**: Harris/Houston (48201), Dallas (48113), Tarrant/Fort Worth (48439), Bexar/San Antonio (48029), Travis/Austin (48453)
- **AZ**: Maricopa/Phoenix (04013), Pima/Tucson (04019)
- **GA**: Fulton/Atlanta (13121), DeKalb (13089), Gwinnett (13135)
- **NC**: Mecklenburg/Charlotte (37119), Wake/Raleigh (37183)
- **CA**: Orange (06059), San Diego (06073), Riverside (06065), San Bernardino (06071), Sacramento (06067)
- **NY**: Nassau (36059), Suffolk (36103), Westchester (36119)
- **NV**: Clark/Vegas (32003)
- **CO**: Denver (08031), Arapahoe (08005)
- **WA**: King/Seattle (53033)
- **OH**: Franklin/Columbus (39049), Cuyahoga/Cleveland (39035)

Each entry is ~10 lines. I'll add them in batches and verify each returns rows.

### Phase 2 — Actually pull the full county, not 300 rows
- Bump `max_parcels` default from 300 → 5,000 and add pagination in `fetchParcelsFromSocrata` (currently one-shot; Socrata paginates at 50k/req).
- Add a nightly `ingest-all` cron under `/api/public/` gated by `CRON_SECRET` that rotates through counties and pulls ~5k/night each.

### Phase 3 — Bulk Realie enrichment for uncovered ZIPs
For counties WITHOUT a public GIS endpoint (rural, small metros), use Realie's bulk search to seed parcels by ZIP or city. Add a `seedFromRealie(county_fips, zips[])` admin fn.

### Phase 4 — Zyte/Scrapy for the hard counties
The recipe engine is already built. Add 3–5 real recipes targeting counties that only publish parcel data on HTML pages (many TX and rural counties). Example targets:
- Bexar County (TX) property search — HTML pagination, needs Zyte browser
- Wayne County (MI, Detroit) treasurer tax list — code violations feeder
- Cook County (IL) recorder — distress feeder for existing Chicago parcels

### Phase 5 — Firecrawl for structured extraction (optional)
Add the Firecrawl connector. Use `formats: [{ type: 'json', schema }]` to extract parcel records from county HTML pages where writing hand-tuned CSS selectors is fragile. This replaces or supplements Phase 4 recipes with LLM-driven extraction.

---

## Recommendation & choice

The 80/20 win is **Phase 1 + Phase 2** — adds coverage across the top 30 US counties within a few hours, no scraping needed. Phases 3–5 are for filling gaps after that.

**Which do you want me to do first?**
- **A) Just Phase 1** (add ~30 counties to `sources.ts`, run one ingest per county, verify data on the map).
- **B) Phase 1 + 2** (broad coverage + nightly pull-more cron for full county depth).
- **C) All phases** (also wire Realie bulk seed, add Zyte parcel recipes, connect Firecrawl).
- **D) Something else** — tell me which counties/regions you care about most and I'll prioritize.