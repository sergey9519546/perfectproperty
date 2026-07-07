## Recommendation

Do both, in this order — they're small and complementary:

1. Build a **schema-discovery wizard** inside `/admin` that extends the probe backbone you already have. Covers ~80% of county HTML sources without ever leaving Lovable.
2. Add a signed **Scrapy Cloud ingest webhook** so when a source is too gnarly (auction.com, heavy JS, login-walled recorders), you run Zyte's plugin locally, deploy the spider to Scrapy Cloud, and the items land straight in this database.

You get the fast wins in-app and a permanent escape hatch for the hard 20%.

---

## Part 1 · In-app scrape wizard (`/admin` → "Discover schema")

Extends the probe backbone (`probe_cache`, `probeFetch`, cheerio). No Scrapy, no Python — pure TS in the Worker.

**Wizard flow (mirrors Zyte's `/scrape` UX):**

```text
1. Enter URL                      → probeUrl(auto)              (already built)
2. Discover repeating containers  → find selectors w/ ≥N siblings
3. Propose schema                 → for each container, list candidate
                                    fields with sample values
4. Approve schema                 → pick which fields to keep,
                                    rename, mark type (text/date/$/url)
5. Save as adapter_recipe row     → { name, url_pattern, container_sel,
                                      fields[], target_table }
6. Run recipe                     → fetch → extract → upsert into
                                    distress_events / parcels
```

**New pieces**

- Migration: `adapter_recipes` (name, target_table, url_pattern, container_selector, fields jsonb, created_at). RLS: authenticated read/write.
- `src/lib/discovery.server.ts` — cheerio-based detector:
  - Finds candidate list containers (`<tr>`, `<li>`, `<article>`, `.result`, etc.) where ≥5 siblings share the same tag/class signature.
  - For each container, harvests text runs, links, dates, dollars, and normalized field names.
- `src/lib/recipes.functions.ts`:
  - `discoverSchema({ url })` → runs on a probed URL, returns candidate schemas ranked by confidence.
  - `saveRecipe(recipe)` / `listRecipes()` / `runRecipe({ id })` → fetches (through probe tiers), extracts, and upserts into the recipe's `target_table` (distress_events for foreclosure/probate/code-enforcement; sales for auction results).
- `/admin` UI: "Discover schema" button on any probed URL → schema editor drawer → save → shows up in a "Saved recipes" list with **Run now** buttons that log to `ingestion_runs`.

**What it handles well**

Static HTML lists — foreclosure calendars, probate dockets, code-enforcement rolls, sheriff-sale schedules. Anything Cheerio can parse.

**What it explicitly does not do**

JS-only rendered pages beyond what Zyte's `browser` tier already handles. ASP.NET WebForms with `__VIEWSTATE` POST chains. Login-walled sites.

---

## Part 2 · Scrapy Cloud ingest webhook

For everything Part 1 can't reach, you run Zyte's plugin locally against your Scrapy Cloud account. Spiders POST items here.

**New pieces**

- Secret: `SCRAPY_INGEST_SECRET` (HMAC-SHA256 shared secret).
- `src/routes/api/public/scrapy-ingest.ts`:
  - `POST` only, verifies `x-signature` header using `timingSafeEqual` before parsing.
  - Body schema: `{ recipe: "foreclosure" | "probate" | "auction" | "code_violation" | "sale" | "parcel", items: [...] }`.
  - Dispatches each recipe to a validator + upsert in `distress_events` / `sales` / `parcels`, keyed by `(county_fips, apn)` or `(source_url, source_id)` for de-dupe.
  - Every batch logged to `ingestion_runs` with `source = "SCRAPY:<recipe>"`.
- Small `scripts/scrapy-item-pipeline.py` snippet in a new `docs/scrapy.md` — drop-in Scrapy `ItemPipeline` that batches items and POSTs to the webhook with the correct HMAC. Anyone who runs `claude /scrape ...` locally can paste this into their generated project.
- `/admin` shows the webhook URL + a "Copy" button and the last 10 Scrapy-sourced ingestion runs.

**Security**

`/api/public/*` bypasses auth on published sites, so signature verification is mandatory. Bad signature → `401`, no side effects.

---

## Deliverables checklist

- [ ] Migration: `adapter_recipes` table + grants + RLS
- [ ] `discovery.server.ts` — repeating-container detector
- [ ] `recipes.functions.ts` — `discoverSchema` / `saveRecipe` / `listRecipes` / `runRecipe`
- [ ] `/admin` UI: "Discover schema" drawer + "Saved recipes" list
- [ ] Secret request: `SCRAPY_INGEST_SECRET`
- [ ] `api/public/scrapy-ingest.ts` webhook with HMAC verify + per-recipe upsert
- [ ] `docs/scrapy.md` with drop-in Scrapy pipeline snippet
- [ ] Admin panel shows webhook URL + recent Scrapy runs

## Not doing

- Installing the Zyte Claude Code plugin into this app (it's a local CLI tool for Python Scrapy projects — incompatible with the Worker runtime).
- Running Scrapy spiders inside Lovable (no Python; Cloudflare Workers can't host them).
- Scheduled/cron runs of recipes (existing `ingestAll` button covers manual runs; cron can be added later once the recipe library is proven).
