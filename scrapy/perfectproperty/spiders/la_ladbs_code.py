"""Los Angeles LADBS open code-enforcement cases."""

from perfectproperty.normalizers import normalize_ladbs

from .socrata_base import SocrataSpider


class LaLadbsCodeSpider(SocrataSpider):
    name = "la_ladbs_code"
    recipe = "code_violation"
    source_url = "https://data.lacity.org/resource/u82d-eh7z.json"
    dataset_url = source_url
    date_field = "adddttm"
    where = "stat = 'O'"

    def normalize(self, row: dict):
        return normalize_ladbs(row)
