
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.scrape_target_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_kind text NOT NULL,
  spider text NOT NULL,
  url_template text NOT NULL,
  applies_to_states text[],
  applies_to_fips text[],
  needs_zyte boolean NOT NULL DEFAULT false,
  cadence_hours integer NOT NULL DEFAULT 24,
  priority_boost numeric NOT NULL DEFAULT 0,
  requests_per_min integer NOT NULL DEFAULT 30,
  concurrent_requests integer NOT NULL DEFAULT 4,
  daily_request_cap integer NOT NULL DEFAULT 5000,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, spider, url_template)
);

GRANT SELECT ON public.scrape_target_templates TO authenticated;
GRANT ALL ON public.scrape_target_templates TO service_role;

ALTER TABLE public.scrape_target_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_read" ON public.scrape_target_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "templates_admin_write" ON public.scrape_target_templates
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "templates_service_write" ON public.scrape_target_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_scrape_target_templates_updated
  BEFORE UPDATE ON public.scrape_target_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

INSERT INTO public.scrape_target_templates
  (source_kind, spider, url_template, applies_to_fips, applies_to_states, needs_zyte, cadence_hours, priority_boost, notes)
VALUES
  ('foreclosure', 'miamidade_clerk_foreclosure',
   'https://www2.miamidadeclerk.gov/officialrecords/StandardSearch.aspx?county={fips}',
   ARRAY['12086'], NULL, true, 12, 20, 'Miami-Dade Clerk foreclosure calendar'),
  ('probate', 'miamidade_probate',
   'https://www2.miamidadeclerk.gov/probate/search.aspx?county={fips}',
   ARRAY['12086'], NULL, true, 24, 15, 'Miami-Dade probate court'),
  ('foreclosure', 'broward_clerk_foreclosure',
   'https://officialrecords.broward.org/AcclaimWeb/search/SearchTypeName?county={fips}',
   ARRAY['12011'], NULL, true, 12, 20, 'Broward Clerk foreclosure filings'),
  ('foreclosure', 'la_recorder_nod',
   'https://www.lavote.gov/home/recorder/document-recording?county={fips}',
   ARRAY['06037'], NULL, true, 12, 20, 'LA County Recorder NOD/NOS'),
  ('code_violation', 'la_ladbs_code',
   'https://www.ladbsservices2.lacity.org/OnlineServices/CodeEnforcement/?county={fips}',
   ARRAY['06037'], NULL, true, 24, 10, 'LA Building & Safety code enforcement'),
  ('foreclosure', 'sd_recorder_foreclosure',
   'https://arcc.sdcounty.ca.gov/services/recorder-clerk?county={fips}',
   ARRAY['06073'], NULL, true, 24, 15, 'San Diego County Recorder'),
  ('sale', 'sf_assessor_sales',
   'https://sfassessor.org/property-information/property-sales?county={fips}',
   ARRAY['06075'], NULL, true, 24, 10, 'SF Assessor sales'),
  ('code_violation', 'sf_dbi_complaints',
   'https://dbiweb02.sfgov.org/dbipts/?county={fips}',
   ARRAY['06075'], NULL, true, 24, 10, 'SF DBI complaints'),
  ('foreclosure', 'nyc_acris_distress',
   'https://a836-acris.nyc.gov/CP/LookUp/Index?borough={fips}',
   ARRAY['36005','36047','36061','36081','36085'], NULL, true, 12, 20, 'ACRIS distress deeds per borough'),
  ('code_violation', 'nyc_hpd_violations',
   'https://hpdonline.nyc.gov/hpdonline/?borough={fips}',
   ARRAY['36005','36047','36061','36081','36085'], NULL, true, 24, 10, 'HPD violations per borough'),
  ('parcel', 'nyc_pluto',
   'https://www.nyc.gov/site/planning/data-maps/open-data/dwn-pluto-mappluto.page?borough={fips}',
   ARRAY['36005','36047','36061','36081','36085'], NULL, false, 720, 5, 'Annual PLUTO parcel drop'),
  ('foreclosure', 'cook_clerk_foreclosure',
   'https://www.cookcountyclerkil.gov/service/foreclosure-records?county={fips}',
   ARRAY['17031'], NULL, true, 24, 15, 'Cook County Clerk foreclosure'),
  ('listing', 'generic_zillow_fsbo',
   'zillow://fsbo/{fips}', NULL, NULL, true, 24, 0, 'Generic Zillow FSBO discovery per county'),
  ('parcel', 'generic_county_gis',
   'arcgis://parcels/{fips}', NULL, NULL, false, 168, 0, 'Generic ArcGIS parcel discovery — resolved by adapter');

CREATE OR REPLACE FUNCTION public.seed_scrape_targets_from_templates(_only_fips text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  WITH ins AS (
    INSERT INTO public.scrape_targets (
      county_fips, source_kind, spider, url_or_query,
      cadence_hours, priority, needs_zyte,
      requests_per_min, concurrent_requests, daily_request_cap
    )
    SELECT
      c.fips,
      t.source_kind,
      t.spider,
      replace(replace(t.url_template, '{fips}', c.fips), '{state}', c.state),
      t.cadence_hours,
      t.priority_boost,
      t.needs_zyte,
      t.requests_per_min,
      t.concurrent_requests,
      t.daily_request_cap
    FROM public.scrape_target_templates t
    JOIN public.counties c ON
      (t.applies_to_fips IS NULL OR c.fips = ANY(t.applies_to_fips))
      AND (t.applies_to_states IS NULL OR c.state = ANY(t.applies_to_states))
    WHERE t.enabled = true
      AND (_only_fips IS NULL OR c.fips = _only_fips)
    ON CONFLICT (county_fips, source_kind, url_or_query) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO n FROM ins;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.tg_counties_seed_targets()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_scrape_targets_from_templates(NEW.fips);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS counties_seed_targets ON public.counties;
CREATE TRIGGER counties_seed_targets
  AFTER INSERT ON public.counties
  FOR EACH ROW EXECUTE FUNCTION public.tg_counties_seed_targets();

SELECT public.seed_scrape_targets_from_templates(NULL);

DO $$
BEGIN
  PERFORM cron.unschedule('seed-scrape-targets-nightly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'seed-scrape-targets-nightly',
  '30 3 * * *',
  $$ SELECT public.seed_scrape_targets_from_templates(NULL); $$
);
