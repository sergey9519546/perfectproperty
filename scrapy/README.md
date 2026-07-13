# Perfect Property — Scrapy spider suite

Deploys to **Zyte Scrapy Cloud project `870105`**. Ships items to this app's
signed webhook (`/api/public/scrapy-ingest`) via the `LovableIngestPipeline`.

This directory is intentionally kept alongside the TanStack app so the item
shape stays in lockstep with `src/routes/api/public/scrapy-ingest.ts`. It is
**not** built by Vite — deploy it separately with `shub`.

## Production spiders

The structured spiders use official municipal open-data APIs and default to a
14-day lookback. Repeated runs are safe because every item carries a stable
`source_event_id` and the ingest webhook deduplicates it.

| Spider               | Official source                               | Recipe           |
| -------------------- | --------------------------------------------- | ---------------- |
| `la_ladbs_code`      | Los Angeles LADBS open code-enforcement cases | `code_violation` |
| `sf_dbi_complaints`  | San Francisco DBI active complaints           | `code_violation` |
| `nyc_hpd_violations` | NYC HPD open housing-code violations          | `code_violation` |
| `zillow_deals`       | Zillow newest + foreclosure + FSBO inventory  | `listing`        |
| `redfin_deals`       | Redfin newest + foreclosure + fixer inventory | `listing`        |

Municipal spider arguments: `-a lookback_days=30 -a max_items=100000`.

Marketplace spiders default to CA, FL, and OH, newest-first, with bounded
pagination. They use Zyte browser HTML because result cards are JavaScript
rendered and frequently reject direct datacenter requests.

```bash
scrapy crawl zillow_deals -a states=CA,FL,OH -a max_pages=20 -a max_items=10000
scrapy crawl redfin_deals -a states=CA,FL,OH -a max_pages=20 -a max_items=10000

# Faster recent-only sweep
scrapy crawl zillow_deals -a categories=newest -a max_pages=3
```

The crawlers intentionally stop at 20 result pages per state/category. Run
frequent newest-first jobs for freshness instead of attempting an unbounded
site-wide crawl. Stable Zillow/Redfin IDs make overlaps safe.

Apply `supabase/migrations/20260713200000_reliability_and_worker_security.sql`
and deploy the app webhook before scheduling either marketplace spider. The
migration adds stable listing IDs and retains unmatched listing leads until a
parcel record becomes available.

## Local dev

```bash
cd scrapy
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# .env (never commit)
export ZYTE_API_KEY=...
export LOVABLE_INGEST_URL=https://perfectproperty.lovable.app/api/public/scrapy-ingest
export LOVABLE_INGEST_SECRET=<SCRAPY_INGEST_SECRET from Lovable>
export LOVABLE_RECIPE=parcel

scrapy crawl smoke
scrapy crawl la_ladbs_code -a lookback_days=30
scrapy crawl sf_dbi_complaints
scrapy crawl nyc_hpd_violations
scrapy crawl zillow_deals -a states=CA,FL,OH -a categories=newest,foreclosures,fsbo
scrapy crawl redfin_deals -a states=CA,FL,OH -a categories=newest,foreclosures,fixer-upper
```

Expect a `lovable ingest 200 [parcel x1]: {"ok":true,...}` log line, and a
new row in the Lovable `/admin` **Recent runs** panel under `SCRAPY:parcel`.

## Deploy to Scrapy Cloud

```bash
pip install shub
shub login          # API key from https://app.zyte.com/o/settings/apikey
shub deploy 870105
```

Set these in **Scrapy Cloud → Spiders → Settings** (one time):

| key                     | value                                                          |
| ----------------------- | -------------------------------------------------------------- |
| `ZYTE_API_KEY`          | your Zyte API key                                              |
| `LOVABLE_INGEST_URL`    | `https://perfectproperty.lovable.app/api/public/scrapy-ingest` |
| `LOVABLE_INGEST_SECRET` | matches `SCRAPY_INGEST_SECRET` on the Lovable side             |
| `LOVABLE_RECIPE`        | default recipe (`foreclosure`, `probate`, …)                   |

Then schedule from the Zyte UI, from Lovable's `/admin/health` → **Zyte /
Scrapy Cloud** panel, or with `shub schedule 870105/<spider>`.

## Adding a spider

1. Drop `perfectproperty/spiders/<name>.py`.
2. Set `recipe = "<recipe>"` on the class (or emit `_recipe` per item for
   mixed spiders).
3. Yield dicts matching the recipe's field map in
   `src/routes/api/public/scrapy-ingest.ts`.
4. Test locally with the env vars above, then `shub deploy 870105`.
