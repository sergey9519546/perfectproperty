"""San Francisco DBI active complaints across all divisions."""

from perfectproperty.normalizers import normalize_sf_dbi

from .socrata_base import SocrataSpider


class SfDbiComplaintsSpider(SocrataSpider):
    name = "sf_dbi_complaints"
    recipe = "code_violation"
    source_url = "https://data.sfgov.org/resource/gm2e-bten.json"
    dataset_url = source_url
    date_field = "date_filed"
    where = "status = 'Active'"

    def normalize(self, row: dict):
        return normalize_sf_dbi(row)
