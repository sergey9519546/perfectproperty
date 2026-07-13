"""Lovable ingest pipeline.

Batches scraped items and POSTs them to /api/public/scrapy-ingest with an
HMAC-SHA256 signature over the raw JSON body (header: x-signature).

Env vars (set in Scrapy Cloud → Spiders → Settings):
  LOVABLE_INGEST_URL    e.g. https://perfectproperty.lovable.app/api/public/scrapy-ingest
  LOVABLE_INGEST_SECRET matches SCRAPY_INGEST_SECRET on the Lovable side
  LOVABLE_RECIPE        foreclosure | probate | code_violation | sale | auction | parcel
                        (a spider may override via `custom_settings` or item['_recipe'])
"""
import hashlib
import hmac
import json
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


class LovableIngestPipeline:
    def __init__(self):
        self.url = os.environ["LOVABLE_INGEST_URL"]
        self.secret = os.environ["LOVABLE_INGEST_SECRET"].encode()
        self.default_recipe = os.environ.get("LOVABLE_RECIPE", "foreclosure")
        self.batch_size = int(os.environ.get("LOVABLE_BATCH_SIZE", "100"))
        # one batch per recipe so a spider can emit mixed items
        self.batches: dict[str, list] = {}

    def process_item(self, item, spider):
        d = dict(item)
        recipe = d.pop("_recipe", None) or getattr(spider, "recipe", None) or self.default_recipe
        self.batches.setdefault(recipe, []).append(d)
        if len(self.batches[recipe]) >= self.batch_size:
            self._flush(spider, recipe)
        return item

    def close_spider(self, spider):
        for recipe in list(self.batches):
            if self.batches[recipe]:
                self._flush(spider, recipe)

    def _flush(self, spider, recipe: str):
        items = self.batches[recipe]
        self.batches[recipe] = []
        body = json.dumps({"recipe": recipe, "items": items}).encode()
        sig = hmac.new(self.secret, body, hashlib.sha256).hexdigest()
        req = Request(
            self.url,
            data=body,
            method="POST",
            headers={"content-type": "application/json", "x-signature": sig},
        )
        try:
            with urlopen(req, timeout=30) as r:
                spider.logger.info(
                    "lovable ingest %s [%s x%d]: %s",
                    r.status, recipe, len(items), r.read()[:300].decode("utf-8", "replace"),
                )
        except HTTPError as e:
            spider.logger.error(
                "lovable ingest FAILED %s [%s x%d]: %s",
                e.code, recipe, len(items), e.read()[:500].decode("utf-8", "replace"),
            )
        except URLError as e:
            spider.logger.error("lovable ingest URLError [%s x%d]: %s", recipe, len(items), e)
