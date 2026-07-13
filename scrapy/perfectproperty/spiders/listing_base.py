"""Shared controls for bounded, newest-first marketplace crawls."""

import scrapy

from perfectproperty.listing_normalizers import STATE_SLUGS


class ListingDealsSpider(scrapy.Spider):
    recipe = "listing"
    allowed_states = tuple(STATE_SLUGS)
    default_categories = ("newest",)
    state_priority = {"CA": 300, "FL": 200, "OH": 100}
    category_priority = {"newest": 50, "foreclosures": 30, "fsbo": 20, "fixer-upper": 20}

    custom_settings = {
        "ZYTE_API_TRANSPARENT_MODE": True,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 2,
        "DOWNLOAD_DELAY": 1.0,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 1.0,
        "AUTOTHROTTLE_MAX_DELAY": 15.0,
    }

    def __init__(self, states=None, categories=None, max_pages=None, max_items=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        requested_states = [part.strip().upper() for part in (states or "CA,FL,OH").split(",")]
        self.states = [state for state in requested_states if state in self.allowed_states]
        if not self.states:
            raise ValueError(f"states must contain one of: {', '.join(self.allowed_states)}")
        requested_categories = [part.strip().lower() for part in (categories or ",".join(self.default_categories)).split(",")]
        self.categories = [category for category in requested_categories if category in self.default_categories]
        if not self.categories:
            raise ValueError(f"categories must contain one of: {', '.join(self.default_categories)}")
        self.max_pages = max(1, min(int(max_pages or 20), 20))
        self.max_items = max(1, min(int(max_items or 10_000), 50_000))
        self.items_seen = 0
        self.listing_ids_seen = set()

    def start_requests(self):
        for state in self.states:
            for category in self.categories:
                yield self.page_request(state, category, 1)

    def page_request(self, state, category, page):
        return scrapy.Request(
            self.page_url(state, category, page),
            callback=self.parse_page,
            cb_kwargs={"state": state, "category": category, "page": page},
            priority=self.state_priority[state] + self.category_priority.get(category, 0) - page,
            meta={"zyte_api": {"browserHtml": True}},
        )

    def accept(self, item):
        if not item or self.items_seen >= self.max_items:
            return False
        listing_id = item["source_listing_id"]
        if listing_id in self.listing_ids_seen:
            return False
        self.listing_ids_seen.add(listing_id)
        self.items_seen += 1
        return True

    def should_continue(self, page, card_count):
        return card_count > 0 and page < self.max_pages and self.items_seen < self.max_items

    def page_url(self, state, category, page):
        raise NotImplementedError

    def parse_page(self, response, state, category, page):
        raise NotImplementedError
