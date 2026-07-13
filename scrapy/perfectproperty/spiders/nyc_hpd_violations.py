"""NYC HPD open Housing Maintenance Code violations."""

from perfectproperty.normalizers import normalize_nyc_hpd

from .socrata_base import SocrataSpider


class NycHpdViolationsSpider(SocrataSpider):
    name = "nyc_hpd_violations"
    recipe = "code_violation"
    source_url = "https://data.cityofnewyork.us/resource/wvxf-dwi5.json"
    dataset_url = source_url
    date_field = "inspectiondate"
    where = "violationstatus = 'Open'"

    def normalize(self, row: dict):
        return normalize_nyc_hpd(row)
