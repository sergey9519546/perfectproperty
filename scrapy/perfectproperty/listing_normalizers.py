"""Pure helpers shared by marketplace listing spiders.

Keep these functions independent from Scrapy so provider payload changes can be
covered with fast unit tests before a cloud crawl is scheduled.
"""

from datetime import date, timedelta
import hashlib
import re
from urllib.parse import urljoin


STATE_SLUGS = {"CA": "ca", "FL": "fl", "OH": "oh"}
STATE_NAMES = {"CA": "California", "FL": "Florida", "OH": "Ohio"}


def parse_number(value):
    if value is None:
        return None
    match = re.search(r"-?[\d,]+(?:\.\d+)?", str(value))
    if not match:
        return None
    number = float(match.group(0).replace(",", ""))
    return int(number) if number.is_integer() else number


def parse_address(value, fallback_state=None):
    """Split a public listing address without inventing missing fields."""
    text = re.sub(r"\s+", " ", str(value or "")).strip(" ,")
    text = re.sub(r"^property\s+at\s+", "", text, flags=re.IGNORECASE)
    match = re.match(
        r"^(?P<address>.+?),\s*(?P<city>[^,]+),\s*(?P<state>[A-Z]{2})\s+(?P<zip>\d{5})(?:-\d{4})?$",
        text,
        re.IGNORECASE,
    )
    if match:
        parts = match.groupdict()
        parts["state"] = parts["state"].upper()
        return parts
    return {
        "address": text or None,
        "city": None,
        "state": fallback_state,
        "zip": None,
    }


def relative_date(value, today=None):
    today = today or date.today()
    text = str(value or "").lower()
    if "minute" in text or "hour" in text or "today" in text or "just listed" in text:
        return today.isoformat()
    match = re.search(r"(\d+)\s+day", text)
    if match:
        return (today - timedelta(days=int(match.group(1)))).isoformat()
    return today.isoformat()


def stable_listing_id(provider, source_url, explicit_id=None):
    if explicit_id:
        return f"{provider.upper()}:{explicit_id}"
    digest = hashlib.sha256(source_url.encode("utf-8")).hexdigest()[:24]
    return f"{provider.upper()}:URL:{digest}"


def normalize_listing(
    *,
    provider,
    source_url,
    address,
    price,
    state,
    explicit_id=None,
    listed_text=None,
    status="ACTIVE",
    original_price=None,
    dom=None,
    deal_tags=None,
    metadata=None,
):
    if not source_url:
        return None
    source_url = urljoin(f"https://www.{provider.lower()}.com/", source_url)
    parsed_address = parse_address(address, fallback_state=state)
    list_price = parse_number(price)
    if not source_url or not parsed_address["address"] or not list_price or list_price <= 0:
        return None
    tags = sorted(set(tag for tag in (deal_tags or []) if tag))
    return {
        "_recipe": "listing",
        "source": provider.upper(),
        "source_listing_id": stable_listing_id(provider, source_url, explicit_id),
        "source_url": source_url,
        **parsed_address,
        "listed_at": relative_date(listed_text),
        "list_price": list_price,
        "original_price": parse_number(original_price),
        "status": status,
        "dom": parse_number(dom),
        "price_cuts": 1 if "price_cut" in tags else 0,
        "deal_tags": tags,
        "metadata": metadata or {},
    }
