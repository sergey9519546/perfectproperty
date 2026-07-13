
-- ============ scrape_targets ============
CREATE TABLE public.scrape_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  county_fips text NOT NULL,
  source_kind text NOT NULL, -- foreclosure | probate | code_violation | tax_lien | listing | absentee_roll | sale
  spider text NOT NULL,
  url_or_query text NOT NULL,
  cadence_hours integer NOT NULL DEFAULT 24,
  priority numeric NOT NULL DEFAULT 0,
  needs_zyte boolean NOT NULL DEFAULT false,
  requests_per_min integer NOT NULL DEFAULT 30,
  concurrent_requests integer NOT NULL DEFAULT 4,
  daily_request_cap integer NOT NULL DEFAULT 5000,
  penalty integer NOT NULL DEFAULT 0,
  paused boolean NOT NULL DEFAULT false,
  last_scheduled_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  -- rolling metrics (updated by nightly recompute)
  trigger_yield_30d numeric NOT NULL DEFAULT 0,
  conversion_to_realie numeric NOT NULL DEFAULT 0,
  deal_score_lift numeric NOT NULL DEFAULT 0,
  cost_per_trigger_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (county_fips, source_kind, url_or_query)
);
GRANT SELECT ON public.scrape_targets TO anon, authenticated;
GRANT ALL ON public.scrape_targets TO service_role;
ALTER TABLE public.scrape_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_scrape_targets" ON public.scrape_targets FOR SELECT USING (true);
CREATE POLICY "service_write_scrape_targets" ON public.scrape_targets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX scrape_targets_priority_idx ON public.scrape_targets (paused, priority DESC, last_scheduled_at NULLS FIRST);
CREATE INDEX scrape_targets_county_idx ON public.scrape_targets (county_fips, source_kind);

-- ============ scrape_runs ============
CREATE TABLE public.scrape_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid REFERENCES public.scrape_targets(id) ON DELETE SET NULL,
  spider text NOT NULL,
  county_fips text,
  source_kind text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  requests_made integer NOT NULL DEFAULT 0,
  items_scraped integer NOT NULL DEFAULT 0,
  triggers_produced integer NOT NULL DEFAULT 0,
  blocks_encountered integer NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  used_zyte boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'running', -- running | ok | blocked | error
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.scrape_runs TO authenticated;
GRANT ALL ON public.scrape_runs TO service_role;
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_scrape_runs" ON public.scrape_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_scrape_runs" ON public.scrape_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX scrape_runs_started_idx ON public.scrape_runs (started_at DESC);
CREATE INDEX scrape_runs_target_idx ON public.scrape_runs (target_id, started_at DESC);

-- ============ orchestrator_config (single row) ============
CREATE TABLE public.orchestrator_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  w_trigger_yield numeric NOT NULL DEFAULT 3.0,
  w_conversion numeric NOT NULL DEFAULT 2.0,
  w_score_lift numeric NOT NULL DEFAULT 1.5,
  w_cost_penalty numeric NOT NULL DEFAULT 2.5,
  w_staleness numeric NOT NULL DEFAULT 0.5,
  zyte_daily_budget_usd numeric NOT NULL DEFAULT 25.0,
  realie_daily_budget_usd numeric NOT NULL DEFAULT 15.0,
  cold_coverage_reserve_pct numeric NOT NULL DEFAULT 20.0,
  max_targets_per_tick integer NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.orchestrator_config (id) VALUES (1);
GRANT SELECT ON public.orchestrator_config TO authenticated;
GRANT ALL ON public.orchestrator_config TO service_role;
ALTER TABLE public.orchestrator_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_orch_config" ON public.orchestrator_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_write_orch_config" ON public.orchestrator_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service_all_orch_config" ON public.orchestrator_config FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============ field_provenance ============
CREATE TABLE public.field_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id uuid NOT NULL REFERENCES public.parcels(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  value jsonb,
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source text NOT NULL, -- e.g. REALIE, SCRAPY:miamidade_foreclosure, COUNTY_ASSESSOR, DEED
  provider_request_id text,
  observed_at timestamptz,
  written_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parcel_id, field_name, source)
);
GRANT SELECT ON public.field_provenance TO anon, authenticated;
GRANT ALL ON public.field_provenance TO service_role;
ALTER TABLE public.field_provenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_field_provenance" ON public.field_provenance FOR SELECT USING (true);
CREATE POLICY "service_write_field_provenance" ON public.field_provenance FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX field_provenance_parcel_idx ON public.field_provenance (parcel_id, field_name, written_at DESC);

-- ============ extend parcel_scores ============
ALTER TABLE public.parcel_scores
  ADD COLUMN IF NOT EXISTS score_confidence numeric,
  ADD COLUMN IF NOT EXISTS inputs_provenance jsonb;

-- ============ nightly recompute of scrape priorities ============
CREATE OR REPLACE FUNCTION public.recompute_scrape_priorities()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.orchestrator_config%ROWTYPE;
  n integer;
BEGIN
  SELECT * INTO cfg FROM public.orchestrator_config WHERE id = 1;

  WITH stats AS (
    SELECT
      t.id,
      COALESCE(SUM(r.triggers_produced) FILTER (WHERE r.started_at >= now() - interval '30 days'), 0)::numeric
        / NULLIF(SUM(r.requests_made) FILTER (WHERE r.started_at >= now() - interval '30 days'), 0) * 1000.0 AS yield_30d,
      COALESCE(SUM(r.cost_usd) FILTER (WHERE r.started_at >= now() - interval '30 days'), 0)
        / NULLIF(SUM(r.triggers_produced) FILTER (WHERE r.started_at >= now() - interval '30 days'), 0) AS cpt,
      EXTRACT(EPOCH FROM (now() - COALESCE(MAX(r.finished_at), now() - interval '365 days'))) / 3600.0 AS hours_stale
    FROM public.scrape_targets t
    LEFT JOIN public.scrape_runs r ON r.target_id = t.id
    GROUP BY t.id
  )
  UPDATE public.scrape_targets t
  SET trigger_yield_30d = COALESCE(s.yield_30d, 0),
      cost_per_trigger_usd = COALESCE(s.cpt, 0),
      priority =
        cfg.w_trigger_yield * COALESCE(s.yield_30d, 0)
        + cfg.w_conversion * t.conversion_to_realie
        + cfg.w_score_lift * t.deal_score_lift
        - cfg.w_cost_penalty * COALESCE(s.cpt, 0)
        - cfg.w_staleness * LEAST(COALESCE(s.hours_stale, 0) / 24.0, 30.0),
      updated_at = now()
  FROM stats s
  WHERE s.id = t.id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.recompute_scrape_priorities() TO service_role;

-- schedule nightly at 03:15 UTC
SELECT cron.schedule(
  'recompute-scrape-priorities',
  '15 3 * * *',
  $$ SELECT public.recompute_scrape_priorities(); $$
);
