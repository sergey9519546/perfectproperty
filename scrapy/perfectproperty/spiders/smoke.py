"""Smoke-test spider: emits one synthetic parcel and exits.

Use this to prove the ingest webhook + HMAC + Scrapy Cloud plumbing works
before wiring real county sources.

    shub schedule 870105/smoke
"""
import scrapy


class SmokeSpider(scrapy.Spider):
    name = "smoke"
    recipe = "parcel"
    start_urls = ["https://example.com/"]  # any 200 will do
    # smoke doesn't need Zyte API — bypass transparent mode
    custom_settings = {"ZYTE_API_TRANSPARENT_MODE": False}

    def parse(self, response):
        yield {
            "apn": "SMOKE-0001",
            "county_fips": "12086",  # Miami-Dade
            "address": "1 SMOKE TEST WAY",
            "city": "MIAMI",
            "state": "FL",
            "zip": "33101",
            "property_type": "SFR",
            "year_built": 1990,
            "living_sqft": 1500,
            "lot_sqft": 5000,
            "assessed_value": 250000,
        }
