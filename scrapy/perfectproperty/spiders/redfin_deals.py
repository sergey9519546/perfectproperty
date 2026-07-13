"""Newest, foreclosure, and fixer-upper listings from public Redfin pages."""

import re

from perfectproperty.listing_normalizers import STATE_NAMES, normalize_listing
from perfectproperty.spiders.listing_base import ListingDealsSpider


class RedfinDealsSpider(ListingDealsSpider):
    name = "redfin_deals"
    source_url = "https://www.redfin.com/"
    allowed_domains = ["redfin.com", "www.redfin.com"]
    default_categories = ("newest", "foreclosures", "fixer-upper")

    category_paths = {
        "newest": "newest-listings",
        "foreclosures": "foreclosures",
        "fixer-upper": "fixer-upper",
    }

    def page_url(self, state, category, page):
        base = f"https://www.redfin.com/state/{STATE_NAMES[state]}/{self.category_paths[category]}"
        return base if page == 1 else f"{base}/page-{page}"

    def parse_page(self, response, state, category, page):
        cards = response.css(
            "div.HomeCardContainer, div[data-rf-test-id='abp-homecard'], div.bp-Homecard"
        )
        for card in cards:
            href = card.css("a[href*='/home/']::attr(href)").get()
            address = (
                card.css(".bp-Homecard__Address::text").get()
                or card.css(".homeAddressV2::text").get()
                or card.css("a[href*='/home/']::attr(aria-label)").get()
            )
            price = (
                card.css(".bp-Homecard__Price--value::text").get()
                or card.css(".homecardV2Price::text").get()
            )
            text = " ".join(card.css("::text").getall())
            id_match = re.search(r"/home/(\d+)", href or "")
            lowered = text.lower()
            tags = [category.rstrip("s")]
            if "price drop" in lowered or "price cut" in lowered:
                tags.append("price_cut")
            item = normalize_listing(
                provider="redfin",
                source_url=response.urljoin(href or ""),
                explicit_id=id_match.group(1) if id_match else None,
                address=address,
                price=price,
                state=state,
                listed_text=text,
                status="ACTIVE",
                deal_tags=tags,
                metadata={"category": category, "result_page": page},
            )
            if self.accept(item):
                yield item

        if self.should_continue(page, len(cards)):
            yield self.page_request(state, category, page + 1)
