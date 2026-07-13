# Perfect Property — Scrapy spider suite

Deploys to **Zyte Scrapy Cloud project `870105`**. Ships items to this app's
signed webhook (`/api/public/scrapy-ingest`) via the `LovableIngestPipeline`.

This directory is intentionally kept alongside the TanStack app so the item
shape stays in lockstep with `src/routes/api/public/scrapy-ingest.ts`. It is
**not** built by Vite — deploy it separately with `shub`.

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

| key                     | value |
| ----------------------- | ----- |
| `ZYTE_API_KEY`          | your Zyte API key |
| `LOVABLE_INGEST_URL`    | `https://perfectproperty.lovable.app/api/public/scrapy-ingest` |
| `LOVABLE_INGEST_SECRET` | matches `SCRAPY_INGEST_SECRET` on the Lovable side |
| `LOVABLE_RECIPE`        | default recipe (`foreclosure`, `probate`, …) |

Then schedule from the Zyte UI, from Lovable's `/admin/health` → **Zyte /
Scrapy Cloud** panel, or with `shub schedule 870105/<spider>`.

## Adding a spider

1. Drop `perfectproperty/spiders/<name>.py`.
2. Set `recipe = "<recipe>"` on the class (or emit `_recipe` per item for
   mixed spiders).
3. Yield dicts matching the recipe's field map in
   `src/routes/api/public/scrapy-ingest.ts`.
4. Test locally with the env vars above, then `shub deploy 870105`.
