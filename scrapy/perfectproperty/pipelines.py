"""Lovable ingest pipeline.

Batches scraped items and POSTs them to /api/public/scrapy-ingest with an
HMAC-SHA256 signature over the raw JSON body (header: x-signature).

Config (read from Scrapy settings first, falling back to env vars — so you
can set them either as project Spider Settings in the Zyte UI or as
per-job `job_settings`):
  LOVABLE_INGEST_URL     https://perfectproperty.lovable.app/api/public/scrapy-ingest
  LOVABLE_INGEST_SECRET  matches SCRAPY_INGEST_SECRET on the Lovable side
  LOVABLE_RECIPE         foreclosure | probate | code_violation | sale | auction | parcel
  LOVABLE_BATCH_SIZE     default 100
"""
import hashlib
import hmac
import json
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def _cfg(settings, key, default=None, required=False):
    val = settings.get(key)
    if val in (None, ""):
        val = os.environ.get(key, default)
    if required and not val:
        raise RuntimeError(f"LovableIngestPipeline: missing {key} (set as Spider Setting or env var)")
    return val


class LovableIngestPipeline:
    def __init__(self, url: str, secret: str, default_recipe: str, batch_size: int):
        self.url = url
        self.secret = secret.encode()
        self.default_recipe = default_recipe
        self.batch_size = batch_size
        # one batch per recipe so a spider can emit mixed items
        self.batches: dict[str, list] = {}

    @classmethod
    def from_crawler(cls, crawler):
        s = crawler.settings
        return cls(
            url=_cfg(s, "LOVABLE_INGEST_URL", required=True),
            secret=_cfg(s, "LOVABLE_INGEST_SECRET", required=True),
            default_recipe=_cfg(s, "LOVABLE_RECIPE", default="foreclosure"),
            batch_size=int(_cfg(s, "LOVABLE_BATCH_SIZE", default="100")),
        )

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
