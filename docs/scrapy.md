# Hooking a Scrapy spider into this app

Zyte's Claude Code plugin (`claude /scrape ...`) generates a Scrapy project
with web-poet page objects. To push scraped items straight into this app's
database, drop this pipeline into your spider project — it batches items and
POSTs them to the signed `/api/public/scrapy-ingest` webhook.

## 1. Environment

Add to your local `.env` (never commit):

```bash
LOVABLE_INGEST_URL=https://<your-project-id>.lovable.app/api/public/scrapy-ingest
LOVABLE_INGEST_SECRET=<the SCRAPY_INGEST_SECRET you saved in Lovable>
```

## 2. Drop-in pipeline

`myproject/pipelines.py`:

```python
import hashlib, hmac, json, os
from urllib.request import Request, urlopen

class LovableIngestPipeline:
    def __init__(self):
        self.url    = os.environ["LOVABLE_INGEST_URL"]
        self.secret = os.environ["LOVABLE_INGEST_SECRET"].encode()
        self.batch  = []
        self.recipe = os.environ.get("LOVABLE_RECIPE", "foreclosure")
        self.batch_size = 100

    def process_item(self, item, spider):
        self.batch.append(dict(item))
        if len(self.batch) >= self.batch_size:
            self._flush(spider)
        return item

    def close_spider(self, spider):
        if self.batch: self._flush(spider)

    def _flush(self, spider):
        body = json.dumps({"recipe": self.recipe, "items": self.batch}).encode()
        sig  = hmac.new(self.secret, body, hashlib.sha256).hexdigest()
        req  = Request(self.url, data=body, method="POST",
                       headers={"content-type": "application/json", "x-signature": sig})
        with urlopen(req) as r:
            spider.logger.info("Lovable ingest %s: %s", r.status, r.read()[:200])
        self.batch = []
```

Enable it in `settings.py`:

```python
ITEM_PIPELINES = { "myproject.pipelines.LovableIngestPipeline": 900 }
```

## 3. Item shape

Send whatever the spider extracts, but include the keys the recipe expects.
See `src/routes/api/public/scrapy-ingest.ts` for the exact per-recipe
mapping.

| recipe            | required                                    | resolves to     |
| ----------------- | ------------------------------------------- | --------------- |
| `foreclosure`     | `county_fips` + `apn` (or `parcel_id`)      | distress_events |
| `probate`         | same                                        | distress_events |
| `code_violation`  | same                                        | distress_events |
| `sale`/`auction`  | `county_fips`, `sale_price`, `sold_at`      | sales           |
| `parcel`          | `county_fips`, `apn`, `address`             | parcels (upsert)|

## 4. Running

```bash
LOVABLE_RECIPE=foreclosure uv run scrapy crawl myspider
```

Watch the `/admin` panel — new rows appear in **Recent runs** under source
`SCRAPY:<recipe>`.
