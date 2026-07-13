# Zyte Scrapy Cloud — spider repo setup

Copy these into your Scrapy project (the one you `shub deploy 870105`), not into this Lovable repo.

## `requirements.txt`

```
scrapy>=2.11
scrapy-zyte-api>=0.16
zyte-spider-templates>=0.10
shub>=2.13
```

Install locally with:

```bash
pip install -r requirements.txt
```

## `scrapinghub.yml`

```yaml
project: 870105
requirements:
  file: requirements.txt
stacks:
  default: scrapy:2.11-20240501
```

## Settings (`settings.py`)

```python
DOWNLOAD_HANDLERS = {
    "http": "scrapy_zyte_api.ScrapyZyteAPIDownloadHandler",
    "https": "scrapy_zyte_api.ScrapyZyteAPIDownloadHandler",
}
DOWNLOADER_MIDDLEWARES = {"scrapy_zyte_api.ScrapyZyteAPIDownloaderMiddleware": 1000}
REQUEST_FINGERPRINTER_CLASS = "scrapy_zyte_api.ScrapyZyteAPIRequestFingerprinter"
TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"

ZYTE_API_KEY = os.environ["ZYTE_API_KEY"]  # set in Scrapy Cloud → Settings

ITEM_PIPELINES = {"pipelines.LovableIngestPipeline": 500}
```

## Scrapy Cloud → Spiders → Settings

```
ZYTE_API_KEY=<rotated key>
LOVABLE_INGEST_URL=https://perfectproperty.lovable.app/api/public/scrapy-ingest
LOVABLE_INGEST_SECRET=<matches SCRAPY_INGEST_SECRET in Lovable>
LOVABLE_RECIPE=foreclosure
```

`LovableIngestPipeline` source is in `docs/scrapy.md` in this repo — paste it into `pipelines.py`.

## Deploy

```bash
shub login    # API key from Zyte account
shub deploy 870105
```

Jobs appear in `/admin/health` under **Zyte / Scrapy Cloud** within ~30s.
