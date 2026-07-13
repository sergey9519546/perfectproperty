import unittest
from datetime import date

from perfectproperty.listing_normalizers import normalize_listing, parse_address, relative_date
from perfectproperty.normalizers import normalize_ladbs, normalize_nyc_hpd, normalize_sf_dbi


class SpiderNormalizationTests(unittest.TestCase):
    def test_marketplace_listing(self):
        item = normalize_listing(
            provider="zillow",
            source_url="https://www.zillow.com/homedetails/example/123_zpid/",
            explicit_id="123",
            address="10 Main St, Cleveland, OH 44113",
            price="$149,900",
            state="OH",
            listed_text="2 days ago",
            deal_tags=["newest", "price_cut"],
        )
        self.assertEqual(item["source_listing_id"], "ZILLOW:123")
        self.assertEqual(item["list_price"], 149900)
        self.assertEqual(item["city"], "Cleveland")
        self.assertEqual(item["price_cuts"], 1)

    def test_listing_date_and_address_helpers(self):
        self.assertEqual(relative_date("3 days ago", date(2026, 7, 13)), "2026-07-10")
        self.assertEqual(parse_address("1 Ocean Dr, Miami, FL 33139")["zip"], "33139")

    def test_ladbs_case(self):
        item = normalize_ladbs(
            {
                "apno": "119009",
                "stno": "1015",
                "predir": "S",
                "stname": "LA BREA",
                "suffix": "AVE",
                "zip": "90019-",
                "adddttm": "2026-07-01T00:00:00.000",
                "prclid": "132B181   800",
                "stat": "O",
            }
        )
        self.assertEqual(item["source_event_id"], "LADBS:119009")
        self.assertEqual(item["address"], "1015 S LA BREA AVE")
        self.assertEqual(item["county_fips"], "06037")

    def test_sf_complaint(self):
        item = normalize_sf_dbi(
            {
                "complaint_number": "202600001",
                "date_filed": "2026-07-01T00:00:00.000",
                "parcel_number": "3730069",
                "street_number": "56",
                "street_name": "Rausch",
                "street_suffix": "St",
                "status": "Active",
                "complaint_description": "Unsafe exterior stair",
            }
        )
        self.assertEqual(item["apn"], "3730069")
        self.assertEqual(item["severity"], 4)
        self.assertEqual(item["source_event_id"], "SFDBI:202600001")

    def test_nyc_bbl_and_severity(self):
        item = normalize_nyc_hpd(
            {
                "violationid": "10081311",
                "boroid": "3",
                "block": "3031",
                "lot": "15",
                "housenumber": "22 FRONT",
                "streetname": "STAGG STREET",
                "zip": "11206",
                "class": "C",
                "inspectiondate": "2026-07-01T00:00:00.000",
            }
        )
        self.assertEqual(item["county_fips"], "36047")
        self.assertEqual(item["apn"], "3030310015")
        self.assertEqual(item["severity"], 5)
        self.assertEqual(item["source_event_id"], "NYCHPD:10081311")


if __name__ == "__main__":
    unittest.main()
