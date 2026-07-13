"""Newest, foreclosure, and FSBO listings from public Zillow result pages."""

import re

from perfectproperty.listing_normalizers import STATE_SLUGS, normalize_listing
from perfectproperty.spiders.listing_base import ListingDealsSpider


class ZillowDealsSpider(ListingDealsSpider):
    name = "zillow_deals"
    source_url = "https://www.zillow.com/"
    allowed_domains = ["zillow.com", "www.zillow.com"]
    default_categories = ("newest", "foreclosures", "fsbo")

    def page_url(self, state, category, page):
        base = f"https://www.zillow.com/{STATE_SLUGS[state]}/{category}/"
        return base if page == 1 else f"{base}{page}_p/"

    def parse_page(self, response, state, category, page):
        cards = response.css("article[data-test='property-card']")
        for card in cards:
            href = card.css("a[data-test='property-card-link']::attr(href)").get()
            address = (
                card.css("address::text").get()
                or card.css("[data-test='property-card-addr']::text").get()
            )
            price = card.css("[data-test='property-card-price']::text").get()
            text = " ".join(card.css("::text").getall())
            zpid_match = re.search(r"/(\d+)_zpid", href or "")
            tags = [category.rstrip("s")]
            lowered = text.lower()
            if "price cut" in lowered:
                tags.append("price_cut")
            if "coming soon" in lowered:
                tags.append("coming_soon")
            item = normalize_listing(
                provider="zillow",
                source_url=response.urljoin(href or ""),
                explicit_id=zpid_match.group(1) if zpid_match else None,
                address=address,
                price=price,
                state=state,
                listed_text=text,
                status="COMING_SOON" if "coming soon" in lowered else "ACTIVE",
                deal_tags=tags,
                metadata={"category": category, "result_page": page},
            )
            if self.accept(item):
                yield item

        if self.should_continue(page, len(cards)):
            yield self.page_request(state, category, page + 1)
