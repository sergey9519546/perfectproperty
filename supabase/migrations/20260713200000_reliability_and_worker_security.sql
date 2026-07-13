-- Reliability primitives for background workers. These functions are callable
-- only by the service role and execute inside a single database transaction.

ALTER TABLE public.ingestion_runs
  ALTER COLUMN county_fips DROP NOT NULL;

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
