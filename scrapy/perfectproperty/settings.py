"""Scrapy settings for the Perfect Property spider suite.

Deployed to Zyte Scrapy Cloud project 870105. All secrets (ZYTE_API_KEY,
LOVABLE_INGEST_URL, LOVABLE_INGEST_SECRET, LOVABLE_RECIPE) are set in
Scrapy Cloud → Spiders → Settings, NOT committed here.
"""
import os

BOT_NAME = "perfectproperty"
SPIDER_MODULES = ["perfectproperty.spiders"]
NEWSPIDER_MODULE = "perfectproperty.spiders"

ROBOTSTXT_OBEY = False
CONCURRENT_REQUESTS = 8
DOWNLOAD_TIMEOUT = 45
RETRY_TIMES = 3
LOG_LEVEL = "INFO"

# --- Zyte API (smart proxy + JS rendering) ---------------------------------
ZYTE_API_KEY = os.environ.get("ZYTE_API_KEY", "")
DOWNLOAD_HANDLERS = {
    "http":  "scrapy_zyte_api.ScrapyZyteAPIDownloadHandler",
    "https": "scrapy_zyte_api.ScrapyZyteAPIDownloadHandler",
}
DOWNLOADER_MIDDLEWARES = {
    "scrapy_zyte_api.ScrapyZyteAPIDownloaderMiddleware": 1000,
}
REQUEST_FINGERPRINTER_CLASS = "scrapy_zyte_api.ScrapyZyteAPIRequestFingerprinter"
TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"
ZYTE_API_TRANSPARENT_MODE = True   # every request routed via Zyte

# --- Pipeline: push items to Lovable ingest webhook ------------------------
ITEM_PIPELINES = {
    "perfectproperty.pipelines.LovableIngestPipeline": 900,
}

FEED_EXPORT_ENCODING = "utf-8"
