-- Reliability primitives for background workers. These functions are callable
-- only by the service role and execute inside a single database transaction.

ALTER TABLE public.ingestion_runs
  ALTER COLUMN county_fips DROP NOT NULL;

ALTER TABLE public.distress_events
  ADD COLUMN IF NOT EXISTS source_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS distress_source_event_idx
  ON public.distress_events (data_source, source_event_id);

-- Marketplace crawls must retain unmatched leads until the county parcel feed
-- catches up. Stable provider IDs make repeated newest-first runs idempotent.
ALTER TABLE public.listings
  ALTER COLUMN parcel_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_listing_id text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip text,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS listings_source_listing_idx
  ON public.listings (data_source, source_listing_id);

UPDATE public.scrape_target_templates
SET enabled = false,
    notes = 'Replaced by one state-level zillow_deals job to avoid duplicate county crawls',
    updated_at = now()
WHERE spider = 'generic_zillow_fsbo';

-- These spiders cover the three priority states in one bounded job. They are
-- scheduled at the spider level rather than expanded once per county target.
INSERT INTO public.scrape_target_templates
  (source_kind, spider, url_template, applies_to_states, needs_zyte,
   cadence_hours, priority_boost, requests_per_min, concurrent_requests,
   daily_request_cap, enabled, notes)
VALUES
  ('listing', 'zillow_deals', 'https://www.zillow.com/{state}/newest/',
   ARRAY['CA','FL','OH'], true, 2, 100, 12, 2, 1500, false,
   'State-level spider; schedule once with states=CA,FL,OH to avoid duplicate county expansion'),
  ('listing', 'redfin_deals', 'https://www.redfin.com/state/{state}/newest-listings',
   ARRAY['CA','FL','OH'], true, 4, 80, 12, 2, 1500, false,
   'State-level spider; schedule once with states=CA,FL,OH to avoid duplicate county expansion')
ON CONFLICT (source_kind, spider, url_template) DO UPDATE
SET cadence_hours = EXCLUDED.cadence_hours,
    priority_boost = EXCLUDED.priority_boost,
    requests_per_min = EXCLUDED.requests_per_min,
    concurrent_requests = EXCLUDED.concurrent_requests,
    daily_request_cap = EXCLUDED.daily_request_cap,
    enabled = EXCLUDED.enabled,
    notes = EXCLUDED.notes,
    updated_at = now();

-- Replace brittle portal search pages with their official structured feeds.
UPDATE public.scrape_target_templates
SET url_template = 'https://data.lacity.org/resource/u82d-eh7z.json',
    needs_zyte = false,
    updated_at = now()
WHERE spider = 'la_ladbs_code';

UPDATE public.scrape_target_templates
SET url_template = 'https://data.sfgov.org/resource/gm2e-bten.json',
    needs_zyte = false,
    updated_at = now()
WHERE spider = 'sf_dbi_complaints';

UPDATE public.scrape_target_templates
SET url_template = 'https://data.cityofnewyork.us/resource/wvxf-dwi5.json',
    needs_zyte = false,
    updated_at = now()
WHERE spider = 'nyc_hpd_violations';

UPDATE public.scrape_targets
SET url_or_query = CASE spider
      WHEN 'la_ladbs_code' THEN 'https://data.lacity.org/resource/u82d-eh7z.json'
      WHEN 'sf_dbi_complaints' THEN 'https://data.sfgov.org/resource/gm2e-bten.json'
      WHEN 'nyc_hpd_violations' THEN 'https://data.cityofnewyork.us/resource/wvxf-dwi5.json'
    END,
    needs_zyte = false,
    updated_at = now()
WHERE spider IN ('la_ladbs_code', 'sf_dbi_complaints', 'nyc_hpd_violations');

-- Unknown provider values must remain unknown instead of inheriting synthetic
-- defaults that later look like verified underwriting inputs.
ALTER TABLE public.parcels
  ALTER COLUMN property_type DROP NOT NULL,
  ALTER COLUMN property_type DROP DEFAULT,
  ALTER COLUMN owner_is_absentee DROP NOT NULL,
  ALTER COLUMN owner_is_absentee DROP DEFAULT,
  ALTER COLUMN owner_is_corporate DROP NOT NULL,
  ALTER COLUMN owner_is_corporate DROP DEFAULT,
  ALTER COLUMN is_listed DROP NOT NULL,
  ALTER COLUMN is_listed DROP DEFAULT,
  ALTER COLUMN is_vacant DROP NOT NULL,
  ALTER COLUMN is_vacant DROP DEFAULT;

CREATE INDEX IF NOT EXISTS ingestion_runs_county_started_idx
  ON public.ingestion_runs (county_fips, started_at DESC);

CREATE OR REPLACE FUNCTION public.claim_enrichment_queue(p_limit integer DEFAULT 25)
RETURNS TABLE(parcel_id uuid, reason text, priority integer, attempts integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- A crashed worker must not strand work forever.
  UPDATE public.enrichment_queue
  SET status = 'pending', started_at = NULL
  WHERE status = 'inflight'
    AND started_at < now() - interval '30 minutes';

  RETURN QUERY
  WITH candidates AS (
    SELECT q.parcel_id
    FROM public.enrichment_queue q
    WHERE q.status = 'pending' AND q.attempts < 3
    ORDER BY q.priority DESC, q.requested_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
  )
  UPDATE public.enrichment_queue q
  SET status = 'inflight', started_at = now()
  FROM candidates c
  WHERE q.parcel_id = c.parcel_id
  RETURNING q.parcel_id, q.reason, q.priority, q.attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_enrichment_queue(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_enrichment_queue(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.replace_live_parcel_scores(p_scores jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  inserted_count integer;
BEGIN
  IF jsonb_typeof(p_scores) <> 'array' THEN
    RAISE EXCEPTION 'replace_live_parcel_scores expects a JSON array';
  END IF;

  DELETE FROM public.parcel_scores WHERE data_source = 'LIVE';

  INSERT INTO public.parcel_scores
  SELECT *
  FROM jsonb_populate_recordset(NULL::public.parcel_scores, p_scores);

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_live_parcel_scores(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_live_parcel_scores(jsonb) TO service_role;

-- The application is an invite/role-based internal tool. Authentication alone
-- is not authorization: only users provisioned in user_roles may read data.
CREATE OR REPLACE FUNCTION private.can_use_app()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid()) AND role IN ('admin', 'user')
  );
$$;

REVOKE ALL ON FUNCTION private.can_use_app() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_use_app() TO authenticated, service_role;

REVOKE SELECT ON public.counties, public.parcels, public.deeds,
  public.distress_events, public.listings, public.parcel_scores,
  public.prediction_outcomes, public.ingestion_runs, public.sales,
  public.portfolio_metrics, public.field_provenance, public.scrape_targets
FROM anon;

DROP POLICY IF EXISTS counties_read ON public.counties;
CREATE POLICY counties_read ON public.counties FOR SELECT TO authenticated
  USING ((SELECT private.can_use_app()));
DROP POLICY IF EXISTS parcels_read ON public.parcels;
CREATE POLICY parcels_read ON public.parcels FOR SELECT TO authenticated
  USING ((SELECT private.can_use_app()));
DROP POLICY IF EXISTS deeds_read ON public.deeds;
CREATE POLICY deeds_read ON public.deeds FOR SELECT TO authenticated
  USING ((SELECT private.can_use_app()));
DROP POLICY IF EXISTS distress_read ON public.distress_events;
CREATE POLICY distress_read ON public.distress_events FOR SELECT TO authenticated
  USING ((SELECT private.can_use_app()));
DROP POLICY IF EXISTS listings_read ON public.listings;
CREATE POLICY listings_read ON public.listings FOR SELECT TO authenticated
  USING ((SELECT private.can_use_app()));
DROP POLICY IF EXISTS scores_read ON public.parcel_scores;
CREATE POLICY scores_read ON public.parcel_scores FOR SELECT TO authenticated
  USING ((SELECT private.can_use_app()));
DROP POLICY IF EXISTS outcomes_read ON public.prediction_outcomes;
CREATE POLICY outcomes_read ON public.prediction_outcomes FOR SELECT TO authenticated
  USING ((SELECT private.can_use_app()));
DROP POLICY IF EXISTS sales_read ON public.sales;
CREATE POLICY sales_read ON public.sales FOR SELECT TO authenticated
  USING ((SELECT private.can_use_app()));
DROP POLICY IF EXISTS runs_read ON public.ingestion_runs;
CREATE POLICY runs_read ON public.ingestion_runs FOR SELECT TO authenticated
  USING ((SELECT private.can_use_app()));

DROP POLICY IF EXISTS "Portfolio metrics are public read" ON public.portfolio_metrics;
DROP POLICY IF EXISTS portfolio_metrics_public_read ON public.portfolio_metrics;
DROP POLICY IF EXISTS portfolio_metrics_read ON public.portfolio_metrics;
CREATE POLICY portfolio_metrics_read ON public.portfolio_metrics FOR SELECT TO authenticated
  USING ((SELECT private.can_use_app()));

DROP POLICY IF EXISTS public_read_field_provenance ON public.field_provenance;
CREATE POLICY app_read_field_provenance ON public.field_provenance FOR SELECT TO authenticated
  USING ((SELECT private.can_use_app()));

DROP POLICY IF EXISTS public_read_scrape_targets ON public.scrape_targets;
CREATE POLICY admin_read_scrape_targets ON public.scrape_targets FOR SELECT TO authenticated
  USING ((SELECT private.has_role((SELECT auth.uid()), 'admin'::public.app_role)));

DROP POLICY IF EXISTS decision_audit_read ON public.decision_audit;
CREATE POLICY decision_audit_read ON public.decision_audit FOR SELECT TO authenticated
  USING ((SELECT private.has_role((SELECT auth.uid()), 'admin'::public.app_role)));

DROP POLICY IF EXISTS "authenticated can read jobs" ON public.bulk_lookup_jobs;
DROP POLICY IF EXISTS "authenticated can insert jobs" ON public.bulk_lookup_jobs;
CREATE POLICY bulk_jobs_admin ON public.bulk_lookup_jobs FOR ALL TO authenticated
  USING ((SELECT private.has_role((SELECT auth.uid()), 'admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role((SELECT auth.uid()), 'admin'::public.app_role)));

DROP POLICY IF EXISTS "authenticated can read items" ON public.bulk_lookup_items;
DROP POLICY IF EXISTS "authenticated can insert items" ON public.bulk_lookup_items;
CREATE POLICY bulk_items_admin ON public.bulk_lookup_items FOR ALL TO authenticated
  USING ((SELECT private.has_role((SELECT auth.uid()), 'admin'::public.app_role)))
  WITH CHECK ((SELECT private.has_role((SELECT auth.uid()), 'admin'::public.app_role)));
