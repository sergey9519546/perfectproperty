"""Shared pagination and lookback handling for official Socrata datasets."""

from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import scrapy


class SocrataSpider(scrapy.Spider):
    """Base spider for a single public Socrata dataset.

    Subclasses provide ``dataset_url``, ``date_field`` and ``normalize``.
    The API is public and already returns structured JSON, so routing these
    requests through the browser/proxy tier only adds cost and failure modes.
    """

    dataset_url: str
    date_field: str
    where: str | None = None
    page_size = 1000
    default_lookback_days = 14

    custom_settings = {
        "ZYTE_API_TRANSPARENT_MODE": False,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 2,
        "DOWNLOAD_DELAY": 0.25,
    }

    def __init__(self, lookback_days=None, max_items=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lookback_days = max(1, min(int(lookback_days or self.default_lookback_days), 365))
        self.max_items = max(1, min(int(max_items or 50_000), 250_000))

    def start_requests(self):
        since = datetime.now(timezone.utc) - timedelta(days=self.lookback_days)
        since_text = since.strftime("%Y-%m-%dT00:00:00.000")
        filters = [f"{self.date_field} >= '{since_text}'"]
        if self.where:
            filters.append(f"({self.where})")
        yield self._request(offset=0, where=" AND ".join(filters))

    def _request(self, offset: int, where: str):
        remaining = self.max_items - offset
        limit = min(self.page_size, remaining)
        query = urlencode(
            {
                "$limit": limit,
                "$offset": offset,
                "$order": f"{self.date_field} ASC",
                "$where": where,
            }
        )
        return scrapy.Request(
            f"{self.dataset_url}?{query}",
            callback=self.parse_page,
            cb_kwargs={"offset": offset, "where": where, "limit": limit},
            headers={"Accept": "application/json"},
        )

    def parse_page(self, response, offset: int, where: str, limit: int):
        rows = response.json()
        if not isinstance(rows, list):
            raise ValueError(f"Socrata returned {type(rows).__name__}, expected a JSON array")

        for row in rows:
            normalized = self.normalize(row)
            if normalized:
                yield normalized

        next_offset = offset + len(rows)
        if len(rows) == limit and next_offset < self.max_items:
            yield self._request(offset=next_offset, where=where)

    def normalize(self, row: dict):
        raise NotImplementedError
