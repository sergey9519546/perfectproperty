"""Pure municipal row normalizers, kept independent from Scrapy for testing."""


COUNTY_BY_BORO = {
    "1": "36061",
    "2": "36005",
    "3": "36047",
    "4": "36081",
    "5": "36085",
}

CITY_BY_BORO = {
    "1": "New York",
    "2": "Bronx",
    "3": "Brooklyn",
    "4": "Queens",
    "5": "Staten Island",
}


def date_only(value):
    if not value:
        return None
    return str(value)[:10]


def clean_parts(*values):
    return " ".join(str(value).strip() for value in values if value and str(value).strip())


def normalize_ladbs(row: dict):
    address = clean_parts(
        row.get("stno"),
        row.get("stsub"),
        row.get("predir"),
        row.get("stname"),
        row.get("suffix"),
        row.get("postdir"),
    )
    event_date = date_only(row.get("adddttm"))
    case_number = row.get("apno")
    if not address or not event_date or not case_number:
        return None
    return {
        "source_event_id": f"LADBS:{case_number}",
        "county_fips": "06037",
        "apn": clean_parts(row.get("prclid")).replace(" ", "") or None,
        "address": address,
        "city": "Los Angeles",
        "zip": clean_parts(row.get("zip")).rstrip("-") or None,
        "event_type": "CODE_VIOLATION",
        "event_date": event_date,
        "severity": 3,
        "case_number": case_number,
        "case_type": row.get("aptype"),
        "district": row.get("apname"),
        "status": row.get("stat"),
    }


def normalize_sf_dbi(row: dict):
    complaint_number = row.get("complaint_number")
    event_date = date_only(row.get("date_filed"))
    address = clean_parts(
        row.get("street_number"), row.get("street_name"), row.get("street_suffix")
    )
    if not complaint_number or not event_date or not address:
        return None
    description = clean_parts(row.get("complaint_description"))
    severity = 4 if any(
        word in description.lower() for word in ("unsafe", "hazard", "collapse", "fire")
    ) else 3
    return {
        "source_event_id": f"SFDBI:{complaint_number}",
        "county_fips": "06075",
        "apn": clean_parts(row.get("parcel_number")) or None,
        "address": address,
        "city": "San Francisco",
        "zip": row.get("zip_code"),
        "event_type": "CODE_VIOLATION",
        "event_date": event_date,
        "severity": severity,
        "complaint_number": complaint_number,
        "description": description or None,
        "receiving_division": row.get("receiving_division"),
        "assigned_division": row.get("assigned_division"),
        "status": row.get("status"),
    }


def normalize_nyc_hpd(row: dict):
    boro = str(row.get("boroid") or "").strip()
    county_fips = COUNTY_BY_BORO.get(boro)
    block = str(row.get("block") or "").strip()
    lot = str(row.get("lot") or "").strip()
    violation_id = row.get("violationid")
    event_date = date_only(row.get("inspectiondate") or row.get("novissueddate"))
    address = clean_parts(row.get("housenumber"), row.get("streetname"))
    if not county_fips or not block or not lot or not violation_id or not event_date or not address:
        return None
    violation_class = str(row.get("class") or "").upper()
    return {
        "source_event_id": f"NYCHPD:{violation_id}",
        "county_fips": county_fips,
        "apn": f"{boro}{block.zfill(5)}{lot.zfill(4)}",
        "address": address,
        "city": CITY_BY_BORO[boro],
        "zip": row.get("zip"),
        "event_type": "CODE_VIOLATION",
        "event_date": event_date,
        "severity": {"A": 1, "B": 3, "C": 5, "I": 2}.get(violation_class, 2),
        "violation_id": str(violation_id),
        "violation_class": violation_class or None,
        "description": row.get("novdescription"),
        "current_status": row.get("currentstatus"),
        "inspection_date": date_only(row.get("inspectiondate")),
        "notice_issued_date": date_only(row.get("novissueddate")),
    }

